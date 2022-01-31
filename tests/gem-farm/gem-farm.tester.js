"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GemFarmTester = exports.defaultFixedConfig = exports.defaultVariableConfig = exports.defaultFarmConfig = exports.PRECISION = void 0;
const web3_js_1 = require("@solana/web3.js");
const types_1 = require("../../sdk/src/gem-common/types");
const anchor = __importStar(require("@project-serum/anchor"));
const anchor_1 = require("@project-serum/anchor");
const gem_farm_client_1 = require("../../sdk/src/gem-farm.client");
const chai_1 = require("chai");
const node_wallet_1 = require("../../sdk/src/gem-common/node-wallet");
// --------------------------------------- configs
exports.PRECISION = Math.pow(10, 15);
exports.defaultFarmConfig = {
    minStakingPeriodSec: new anchor_1.BN(0),
    cooldownPeriodSec: new anchor_1.BN(0),
    unstakingFeeLamp: new anchor_1.BN(web3_js_1.LAMPORTS_PER_SOL),
};
exports.defaultVariableConfig = {
    amount: new anchor_1.BN(10000),
    durationSec: new anchor_1.BN(100), //at rate 100/s
};
exports.defaultFixedConfig = {
    schedule: {
        //total 30 per gem
        baseRate: (0, types_1.toBN)(3),
        tier1: {
            rewardRate: (0, types_1.toBN)(5),
            requiredTenure: (0, types_1.toBN)(2),
        },
        tier2: {
            rewardRate: (0, types_1.toBN)(7),
            requiredTenure: (0, types_1.toBN)(4),
        },
        //leaving this one at 0 so that it's easy to test how much accrued over first 6s
        tier3: {
            rewardRate: (0, types_1.toBN)(0),
            requiredTenure: (0, types_1.toBN)(6),
        },
        denominator: (0, types_1.toBN)(1),
    },
    amount: new anchor_1.BN(30000),
    durationSec: new anchor_1.BN(100),
};
// --------------------------------------- tester class
class GemFarmTester extends gem_farm_client_1.GemFarmClient {
    constructor() {
        super(anchor.Provider.env().connection, anchor.Provider.env().wallet);
        //rewards + funder
        this.reward = 'rewardA';
        this.nw = new node_wallet_1.NodeWallet(anchor.Provider.env().connection, anchor.Provider.env().wallet);
        this.funder = this.nw.wallet.payer;
    }
    prepAccounts(initialFundingAmount, gem1PerGemRarity = 1, gem2PerGemRarity = 1, reward) {
        return __awaiter(this, void 0, void 0, function* () {
            reward = Math.random() < 0.5 ? 'rewardA' : 'rewardB';
            console.log('running tests for', reward);
            this.bank = web3_js_1.Keypair.generate();
            this.farm = web3_js_1.Keypair.generate();
            this.farmManager = yield this.nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
            this.farmer1Identity = yield this.nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
            [this.farmer1Vault] = yield this.findVaultPDA(this.bank.publicKey, this.farmer1Identity.publicKey);
            this.farmer2Identity = yield this.nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
            [this.farmer2Vault] = yield this.findVaultPDA(this.bank.publicKey, this.farmer2Identity.publicKey);
            if (reward)
                this.reward = reward;
            this.rewardMint = yield this.nw.createMint(0);
            this.rewardSource = yield this.nw.createAndFundATA(this.rewardMint, this.funder.publicKey, (0, types_1.toBN)(initialFundingAmount));
            this.rewardSecondMint = yield this.nw.createMint(0);
            //gem 1
            ({ gemAmount: this.gem1Amount, gem: this.gem1 } = yield this.prepGem(this.farmer1Identity));
            this.gem1PerGemRarity = gem1PerGemRarity;
            //gem 2
            ({ gemAmount: this.gem2Amount, gem: this.gem2 } = yield this.prepGem(this.farmer2Identity));
            this.gem2PerGemRarity = gem2PerGemRarity;
        });
    }
    randomInt(min, max) {
        // min and max included
        return Math.floor(Math.random() * (max - min + 1) + min);
    }
    prepGem(owner) {
        return __awaiter(this, void 0, void 0, function* () {
            const gemAmount = new anchor_1.BN(100 + Math.ceil(Math.random() * 100)); //min 100
            const gemOwner = owner !== null && owner !== void 0 ? owner : (yield this.nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL));
            const gem = yield this.nw.createMintAndFundATA(gemOwner.publicKey, gemAmount);
            return { gemAmount, gemOwner, gem };
        });
    }
    prepGemRarities() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.gem1PerGemRarity > 1 || this.gem2PerGemRarity > 1) {
                yield this.setGemRarities(this.gem1PerGemRarity, this.gem2PerGemRarity);
            }
        });
    }
    // --------------------------------------- getters
    fetchFarm() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.fetchFarmAcc(this.farm.publicKey);
        });
    }
    fetchTreasuryBal() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.fetchTreasuryBalance(this.farm.publicKey);
        });
    }
    // --------------------------------------- callers
    // ----------------- core
    callInitFarm(farmConfig, rewardType) {
        return __awaiter(this, void 0, void 0, function* () {
            const isRewardA = this.reward === 'rewardA';
            return this.initFarm(this.farm, this.farmManager, this.farmManager, this.bank, isRewardA ? this.rewardMint.publicKey : this.rewardSecondMint.publicKey, rewardType !== null && rewardType !== void 0 ? rewardType : gem_farm_client_1.RewardType.Variable, isRewardA ? this.rewardSecondMint.publicKey : this.rewardMint.publicKey, rewardType !== null && rewardType !== void 0 ? rewardType : gem_farm_client_1.RewardType.Variable, farmConfig);
        });
    }
    callUpdateFarm(farmConfig, newManager) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.updateFarm(this.farm.publicKey, this.farmManager, farmConfig, newManager);
        });
    }
    callPayout(destination, lamports) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.payoutFromTreasury(this.farm.publicKey, this.farmManager, destination, (0, types_1.toBN)(lamports));
        });
    }
    callAddToBankWhitelist(addressToWhitelist, whitelistType) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.addToBankWhitelist(this.farm.publicKey, this.farmManager, addressToWhitelist, whitelistType);
        });
    }
    callRemoveFromBankWhitelist(addressToRemove) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.removeFromBankWhitelist(this.farm.publicKey, this.farmManager, addressToRemove);
        });
    }
    // ----------------- farmer
    callInitFarmer(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.initFarmer(this.farm.publicKey, identity, identity);
        });
    }
    callStake(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.stake(this.farm.publicKey, identity);
        });
    }
    callUnstake(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.unstake(this.farm.publicKey, identity);
        });
    }
    callDeposit(gems, identity) {
        return __awaiter(this, void 0, void 0, function* () {
            const isFarmer1 = identity.publicKey.toBase58() ===
                this.farmer1Identity.publicKey.toBase58();
            return this.depositGem(this.bank.publicKey, isFarmer1 ? this.farmer1Vault : this.farmer2Vault, identity, (0, types_1.toBN)(gems), isFarmer1 ? this.gem1.tokenMint : this.gem2.tokenMint, isFarmer1 ? this.gem1.tokenAcc : this.gem2.tokenAcc);
        });
    }
    callWithdraw(gems, identity) {
        return __awaiter(this, void 0, void 0, function* () {
            const isFarmer1 = identity.publicKey.toBase58() ===
                this.farmer1Identity.publicKey.toBase58();
            return this.withdrawGem(this.bank.publicKey, isFarmer1 ? this.farmer1Vault : this.farmer2Vault, identity, (0, types_1.toBN)(gems), isFarmer1 ? this.gem1.tokenMint : this.gem2.tokenMint, identity.publicKey);
        });
    }
    callClaimRewards(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            const isRewardA = this.reward === 'rewardA';
            return this.claim(this.farm.publicKey, identity, isRewardA ? this.rewardMint.publicKey : this.rewardSecondMint.publicKey, isRewardA ? this.rewardSecondMint.publicKey : this.rewardMint.publicKey);
        });
    }
    callFlashDeposit(gems, identity, mintProof, metadata, creatorProof) {
        return __awaiter(this, void 0, void 0, function* () {
            const isFarmer1 = identity.publicKey.toBase58() ===
                this.farmer1Identity.publicKey.toBase58();
            return this.flashDeposit(this.farm.publicKey, identity, (0, types_1.toBN)(gems), isFarmer1 ? this.gem1.tokenMint : this.gem2.tokenMint, isFarmer1 ? this.gem1.tokenAcc : this.gem2.tokenAcc, mintProof, metadata, creatorProof);
        });
    }
    callRefreshFarmer(identity, reenroll) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.refreshFarmer(this.farm.publicKey, identity, reenroll);
        });
    }
    // ----------------- funder
    callAuthorize() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.authorizeFunder(this.farm.publicKey, this.farmManager, this.funder.publicKey);
        });
    }
    callDeauthorize() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.deauthorizeFunder(this.farm.publicKey, this.farmManager, this.funder.publicKey);
        });
    }
    // ----------------- rewards
    callFundReward(varConfig, fixedConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.fundReward(this.farm.publicKey, this.rewardMint.publicKey, this.funder, this.rewardSource, varConfig, fixedConfig);
        });
    }
    callCancelReward() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.cancelReward(this.farm.publicKey, this.farmManager, this.rewardMint.publicKey, this.funder.publicKey);
        });
    }
    callLockReward() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.lockReward(this.farm.publicKey, this.farmManager, this.rewardMint.publicKey);
        });
    }
    // --------------------------------------- rarities
    callAddRaritiesToBank(rarityConfigs) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.addRaritiesToBank(this.farm.publicKey, this.farmManager, rarityConfigs);
        });
    }
    setGemRarities(gem1PerGemRarity = 1, gem2PerGemRarity = 1) {
        return __awaiter(this, void 0, void 0, function* () {
            const configs = [
                {
                    mint: this.gem1.tokenMint,
                    rarityPoints: gem1PerGemRarity,
                },
                {
                    mint: this.gem2.tokenMint,
                    rarityPoints: gem2PerGemRarity,
                },
            ];
            yield this.callAddRaritiesToBank(configs);
        });
    }
    // --------------------------------------- verifiers
    // ----------------- funding
    verifyFunds(funded, refunded, accrued) {
        return __awaiter(this, void 0, void 0, function* () {
            let farmAcc = (yield this.fetchFarm());
            let funds = farmAcc[this.reward].funds;
            if (funded || funded === 0) {
                (0, chai_1.assert)(funds.totalFunded.eq((0, types_1.toBN)(funded)));
            }
            if (refunded || refunded === 0) {
                (0, chai_1.assert)(funds.totalRefunded.eq((0, types_1.toBN)(refunded)));
            }
            if (accrued || accrued === 0) {
                (0, chai_1.assert)(funds.totalAccruedToStakers.eq((0, types_1.toBN)(accrued)));
            }
            return funds;
        });
    }
    verifyTimes(duration, rewardEnd, lockEnd) {
        return __awaiter(this, void 0, void 0, function* () {
            let farmAcc = (yield this.fetchFarm());
            let times = farmAcc[this.reward].times;
            if (duration || duration === 0) {
                (0, chai_1.assert)(times.durationSec.eq((0, types_1.toBN)(duration)));
            }
            if (rewardEnd || rewardEnd === 0) {
                (0, chai_1.assert)(times.rewardEndTs.eq((0, types_1.toBN)(rewardEnd)));
            }
            if (lockEnd || lockEnd === 0) {
                (0, chai_1.assert)(times.lockEndTs.eq((0, types_1.toBN)(lockEnd)));
            }
            return times;
        });
    }
    verifyVariableReward(rewardRate, lastUpdated, accruedRewardPerRarityPoint) {
        return __awaiter(this, void 0, void 0, function* () {
            let farmAcc = (yield this.fetchFarm());
            let reward = farmAcc[this.reward].variableRate;
            if (rewardRate || rewardRate === 0) {
                (0, chai_1.assert)(reward.rewardRate.n.div((0, types_1.toBN)(exports.PRECISION)).eq((0, types_1.toBN)(rewardRate)));
            }
            if (lastUpdated || lastUpdated === 0) {
                (0, chai_1.assert)(reward.rewardLastUpdatedTs.eq((0, types_1.toBN)(lastUpdated)));
            }
            if (accruedRewardPerRarityPoint || accruedRewardPerRarityPoint === 0) {
                (0, chai_1.assert)(reward.accruedRewardPerRarityPoint.n
                    .div((0, types_1.toBN)(exports.PRECISION))
                    .eq((0, types_1.toBN)(accruedRewardPerRarityPoint)));
            }
            return reward;
        });
    }
    verifyFixedReward(reservedAmount) {
        return __awaiter(this, void 0, void 0, function* () {
            let farmAcc = (yield this.fetchFarm());
            let reward = farmAcc[this.reward].fixedRate;
            // console.log('reserved is', reward.reservedAmount.toNumber());
            // console.log('expected is', toBN(reservedAmount).toNumber());
            if (reservedAmount || reservedAmount === 0) {
                (0, chai_1.assert)(reward.reservedAmount.eq((0, types_1.toBN)(reservedAmount)));
            }
            return reward;
        });
    }
    verifyPotContains(pot, amount, sign) {
        return __awaiter(this, void 0, void 0, function* () {
            const rewardsPotAcc = yield this.fetchTokenAcc(this.rewardMint.publicKey, pot);
            switch (sign) {
                case 'lt':
                    (0, chai_1.assert)(rewardsPotAcc.amount.lt((0, types_1.toBN)(amount)));
                    break;
                default:
                    (0, chai_1.assert)(rewardsPotAcc.amount.eq((0, types_1.toBN)(amount)));
            }
            return rewardsPotAcc;
        });
    }
    verifyFunderAccContains(amount, sign) {
        return __awaiter(this, void 0, void 0, function* () {
            const sourceAcc = yield this.fetchTokenAcc(this.rewardMint.publicKey, this.rewardSource);
            switch (sign) {
                case 'gt':
                    (0, chai_1.assert)(sourceAcc.amount.gt((0, types_1.toBN)(amount)));
                    break;
                default:
                    (0, chai_1.assert)(sourceAcc.amount.eq((0, types_1.toBN)(amount)));
            }
            return sourceAcc;
        });
    }
    // ----------------- staking
    calcTotalGems(gem1Amount, gem2Amount) {
        return (0, types_1.toBN)(gem1Amount !== null && gem1Amount !== void 0 ? gem1Amount : this.gem1Amount).add((0, types_1.toBN)(gem2Amount !== null && gem2Amount !== void 0 ? gem2Amount : this.gem2Amount));
    }
    calcTotalGemRarity(gem1Amount, gem2Amount) {
        const gem1 = (0, types_1.toBN)(gem1Amount !== null && gem1Amount !== void 0 ? gem1Amount : this.gem1Amount).mul((0, types_1.toBN)(this.gem1PerGemRarity));
        const gem2 = (0, types_1.toBN)(gem2Amount !== null && gem2Amount !== void 0 ? gem2Amount : this.gem2Amount).mul((0, types_1.toBN)(this.gem2PerGemRarity));
        const total = gem1.add(gem2);
        // console.log(
        //   'rarities are: (gem1, gem2, total): ',
        //   gem1.toNumber(),
        //   gem2.toNumber(),
        //   total.toNumber()
        // );
        return { gem1, gem2, total };
    }
    verifyStakedGemsAndFarmers(farmers, gem1Amount, gem2Amount) {
        return __awaiter(this, void 0, void 0, function* () {
            let farmAcc = yield this.fetchFarm();
            (0, chai_1.assert)(farmAcc.stakedFarmerCount.eq((0, types_1.toBN)(farmers)));
            (0, chai_1.assert)(farmAcc.gemsStaked.eq(this.calcTotalGems(gem1Amount, gem2Amount)));
            (0, chai_1.assert)(farmAcc.rarityPointsStaked.eq(this.calcTotalGemRarity(gem1Amount, gem2Amount).total));
            return farmAcc;
        });
    }
    verifyFarmerReward(identity, paidOutReward, accruedReward, lastRecordedAccruedRewardPerRarityPoint, beginStakingTs, beginScheduleTs, lastUpdatedTs, promisedDuration) {
        return __awaiter(this, void 0, void 0, function* () {
            const [farmer] = yield this.findFarmerPDA(this.farm.publicKey, identity.publicKey);
            const farmerAcc = (yield this.fetchFarmerAcc(farmer));
            const reward = farmerAcc[this.reward];
            if (paidOutReward || paidOutReward === 0) {
                (0, chai_1.assert)(reward.paidOutReward.eq((0, types_1.toBN)(paidOutReward)));
            }
            if (accruedReward || accruedReward === 0) {
                (0, chai_1.assert)(reward.accruedReward.eq((0, types_1.toBN)(accruedReward)));
            }
            if (lastRecordedAccruedRewardPerRarityPoint ||
                lastRecordedAccruedRewardPerRarityPoint === 0) {
                (0, chai_1.assert)(reward.variableRate.lastRecordedAccruedRewardPerRarityPoint.n
                    .div((0, types_1.toBN)(exports.PRECISION))
                    .eq((0, types_1.toBN)(lastRecordedAccruedRewardPerRarityPoint)));
            }
            if (beginStakingTs || beginStakingTs === 0) {
                (0, chai_1.assert)(reward.fixedRate.beginStakingTs.eq((0, types_1.toBN)(beginStakingTs)));
            }
            if (beginScheduleTs || beginScheduleTs === 0) {
                (0, chai_1.assert)(reward.fixedRate.beginScheduleTs.eq((0, types_1.toBN)(beginScheduleTs)));
            }
            if (lastUpdatedTs || lastUpdatedTs === 0) {
                (0, chai_1.assert)(reward.fixedRate.lastUpdatedTs.eq((0, types_1.toBN)(lastUpdatedTs)));
            }
            if (promisedDuration || promisedDuration === 0) {
                (0, chai_1.assert)(reward.fixedRate.promisedDuration.eq((0, types_1.toBN)(promisedDuration)));
            }
            return reward;
        });
    }
    verifyClaimedReward(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            const rewardDest = yield this.findATA(this.rewardMint.publicKey, identity.publicKey);
            const rewardDestAcc = yield this.fetchTokenAcc(this.rewardMint.publicKey, rewardDest);
            //verify that
            //1)paid out = what's in the wallet
            //2)accrued = what's in the wallet
            yield this.verifyFarmerReward(identity, rewardDestAcc.amount, rewardDestAcc.amount);
            return rewardDestAcc.amount;
        });
    }
    // assumes that both farmers have been staked for the same length of time
    // tried also adding upper bound, but it breaks if f1/f2 ratio is tiny (makes tests non-deterministic)
    verifyAccruedRewardsVariable(minExpectedFarmAccrued) {
        return __awaiter(this, void 0, void 0, function* () {
            //fetch farmer 1
            const farmer1Reward = yield this.verifyFarmerReward(this.farmer1Identity);
            const farmer1Accrued = farmer1Reward.accruedReward;
            //fetch farmer 2
            const farmer2Reward = yield this.verifyFarmerReward(this.farmer2Identity);
            const farmer2Accrued = farmer2Reward.accruedReward;
            const { gem1: gem1Rarity, gem2: gem2Rarity } = this.calcTotalGemRarity();
            //verify farmer 1
            const farmer1Ratio = gem1Rarity.toNumber() / (gem1Rarity.toNumber() + gem2Rarity.toNumber());
            // console.log('farmer 1 ratio:', farmer1Ratio.toString());
            // console.log(
            //   'accrued for farmer 1 and 2:',
            //   farmer1Accrued.toString(),
            //   farmer2Accrued.toString()
            // );
            // console.log(
            //   'accrued total for the farm:',
            //   stringifyPKsAndBNs(await this.verifyFunds())
            // );
            (0, chai_1.assert)(farmer1Accrued.gte(new anchor_1.BN(farmer1Ratio * minExpectedFarmAccrued)));
            //verify farmer 2
            const farmer2Ratio = 1 - farmer1Ratio;
            (0, chai_1.assert)(farmer2Accrued.gte(new anchor_1.BN(farmer2Ratio * minExpectedFarmAccrued)));
            // ideally would love to do farmer1accrued + farmer2accrued,
            // but that only works when both farmers unstake, and stop accruing
            // (that's coz we update them sequentially, one by one)
            const funds = yield this.verifyFunds(10000, 0);
            (0, chai_1.assert)(funds.totalAccruedToStakers.gte((0, types_1.toBN)(minExpectedFarmAccrued)));
            return [farmer1Reward, farmer2Reward];
        });
    }
    verifyAccruedRewardsFixed(perRarityPoint) {
        return __awaiter(this, void 0, void 0, function* () {
            const { gem1: gem1Rarity, gem2: gem2Rarity, total, } = this.calcTotalGemRarity();
            //farmer 1
            const farmer1Reward = yield this.verifyFarmerReward(this.farmer1Identity);
            (0, chai_1.assert)(farmer1Reward.accruedReward.eq(gem1Rarity.mul((0, types_1.toBN)(perRarityPoint))));
            //farmer 2
            const farmer2Reward = yield this.verifyFarmerReward(this.farmer2Identity);
            (0, chai_1.assert)(farmer2Reward.accruedReward.eq(gem2Rarity.mul((0, types_1.toBN)(perRarityPoint))));
            const funds = yield this.verifyFunds();
            (0, chai_1.assert)(funds.totalAccruedToStakers.gte((0, types_1.toBN)(perRarityPoint).mul(total)));
            return [farmer1Reward, farmer2Reward];
        });
    }
    verifyFarmerFixedRewardTimings(identity, atStaking) {
        return __awaiter(this, void 0, void 0, function* () {
            let fixed = (yield this.verifyFarmerReward(identity)).fixedRate;
            const tenSecAgo = +new Date() / 1000 - 10;
            //all TS within 10 sec
            (0, chai_1.assert)(fixed.beginStakingTs.gt((0, types_1.toBN)(tenSecAgo)));
            (0, chai_1.assert)(fixed.beginScheduleTs.gt((0, types_1.toBN)(tenSecAgo)));
            //it will be equal if ran right after staking, it will be above if ran later
            if (atStaking) {
                (0, chai_1.assert)(fixed.lastUpdatedTs.eq(fixed.beginStakingTs));
            }
            else {
                (0, chai_1.assert)(fixed.lastUpdatedTs.gt(fixed.beginStakingTs));
            }
            //staking TS = schedule TS
            (0, chai_1.assert)(fixed.beginStakingTs.eq(fixed.beginScheduleTs));
            //duration close to 100
            (0, chai_1.assert)(fixed.promisedDuration.gt((0, types_1.toBN)(90)));
            (0, chai_1.assert)(fixed.promisedDuration.lte((0, types_1.toBN)(100)));
        });
    }
    stakeAndVerify(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            const { farmer } = yield this.callStake(identity);
            let vaultAcc = yield this.fetchVaultAcc(identity === this.farmer1Identity ? this.farmer1Vault : this.farmer2Vault);
            chai_1.assert.isTrue(vaultAcc.locked);
            let farmerAcc = yield this.fetchFarmerAcc(farmer);
            (0, chai_1.assert)(farmerAcc.gemsStaked.eq(identity === this.farmer1Identity ? this.gem1Amount : this.gem2Amount));
            const { gem1: gem1Rarity, gem2: gem2Rarity } = this.calcTotalGemRarity();
            (0, chai_1.assert)(farmerAcc.rarityPointsStaked.eq(identity === this.farmer1Identity ? gem1Rarity : gem2Rarity));
            return farmerAcc;
        });
    }
    unstakeOnceAndVerify(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            const { farmer, vault } = yield this.callUnstake(identity);
            const vaultAcc = yield this.fetchVaultAcc(vault);
            chai_1.assert.isTrue(vaultAcc.locked);
            const farmerAcc = yield this.fetchFarmerAcc(farmer);
            (0, chai_1.assert)(farmerAcc.gemsStaked.eq(new anchor_1.BN(0)));
            (0, chai_1.assert)(farmerAcc.rarityPointsStaked.eq(new anchor_1.BN(0)));
            return farmerAcc;
        });
    }
    unstakeTwiceAndVerify(identity) {
        return __awaiter(this, void 0, void 0, function* () {
            const { farmer, vault } = yield this.callUnstake(identity);
            const vaultAcc = yield this.fetchVaultAcc(vault);
            chai_1.assert.isFalse(vaultAcc.locked);
            const farmerAcc = yield this.fetchFarmerAcc(farmer);
            (0, chai_1.assert)(farmerAcc.gemsStaked.eq(new anchor_1.BN(0)));
            (0, chai_1.assert)(farmerAcc.rarityPointsStaked.eq(new anchor_1.BN(0)));
            return farmerAcc;
        });
    }
    // --------------------------------------- extras
    printStructs(state) {
        return __awaiter(this, void 0, void 0, function* () {
            const farmAcc = yield this.fetchFarmAcc(this.farm.publicKey);
            console.log(`// --------------------------------------- ${state}`);
            console.log('// --------------------------------------- farm');
            console.log((0, types_1.stringifyPKsAndBNs)(farmAcc));
            const [farmer1] = yield this.findFarmerPDA(this.farm.publicKey, this.farmer1Identity.publicKey);
            const farmer1Acc = yield this.fetchFarmerAcc(farmer1);
            console.log('// --------------------------------------- farmer 1');
            console.log((0, types_1.stringifyPKsAndBNs)(farmer1Acc));
            const [farmer2] = yield this.findFarmerPDA(this.farm.publicKey, this.farmer2Identity.publicKey);
            try {
                const farmer2Acc = yield this.fetchFarmerAcc(farmer2);
                console.log('// --------------------------------------- farmer 2');
                console.log((0, types_1.stringifyPKsAndBNs)(farmer2Acc));
            }
            catch (e) { }
        });
    }
    mintMoreRewards(amount) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.rewardMint.mintTo(this.rewardSource, this.funder, [], amount);
        });
    }
}
exports.GemFarmTester = GemFarmTester;
