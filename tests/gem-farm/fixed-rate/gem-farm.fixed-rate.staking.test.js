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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = __importStar(require("chai"));
const chai_as_promised_1 = __importDefault(require("chai-as-promised"));
const gem_farm_tester_1 = require("../gem-farm.tester");
const anchor_1 = require("@project-serum/anchor");
const types_1 = require("../../../sdk/src/gem-common/types");
const gem_farm_client_1 = require("../../../sdk/src/gem-farm.client");
const gem_bank_client_1 = require("../../../sdk/src/gem-bank.client");
const web3_js_1 = require("@solana/web3.js");
const metaplex_1 = require("../../../sdk/src/gem-common/metaplex");
const util_1 = require("../../../sdk/src/gem-common/util");
chai_1.default.use(chai_as_promised_1.default);
const shortFixedConfig = {
    schedule: {
        baseRate: (0, types_1.toBN)(3),
        tier1: null,
        tier2: null,
        tier3: null,
        denominator: (0, types_1.toBN)(1),
    },
    amount: new anchor_1.BN(30000),
    durationSec: new anchor_1.BN(5), //5s only
};
describe('staking (fixed rate)', () => {
    let gf = new gem_farm_tester_1.GemFarmTester();
    beforeEach('preps accs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.prepAccounts(5000000000, gf.randomInt(1, 3), gf.randomInt(1, 3));
        yield gf.callInitFarm(gem_farm_tester_1.defaultFarmConfig, gem_farm_client_1.RewardType.Fixed);
        yield gf.prepGemRarities();
        yield gf.callInitFarmer(gf.farmer1Identity);
        yield gf.callInitFarmer(gf.farmer2Identity);
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
        yield gf.callAuthorize();
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
    }));
    it('stakes -> accrues -> claims (multi farmer)', () => __awaiter(void 0, void 0, void 0, function* () {
        // ----------------- stake + accrue
        yield gf.stakeAndVerify(gf.farmer1Identity);
        yield gf.stakeAndVerify(gf.farmer2Identity);
        yield (0, util_1.pause)(6000);
        //manually refresh to update accrued rewards for each farmer
        yield gf.callRefreshFarmer(gf.farmer1Identity);
        yield gf.callRefreshFarmer(gf.farmer2Identity);
        //verify counts
        yield gf.verifyStakedGemsAndFarmers(2);
        //verify funds
        yield gf.verifyAccruedRewardsFixed(30);
        //verify timings
        yield gf.verifyFarmerFixedRewardTimings(gf.farmer1Identity, false);
        yield gf.verifyFarmerFixedRewardTimings(gf.farmer2Identity, false);
        // ----------------- claim
        yield gf.callClaimRewards(gf.farmer1Identity);
        yield gf.callClaimRewards(gf.farmer2Identity);
        yield gf.verifyClaimedReward(gf.farmer1Identity);
        yield gf.verifyClaimedReward(gf.farmer2Identity);
    }));
    it('stakes -> accrues -> unstakes (twice) -> claims (multi farmer)', () => __awaiter(void 0, void 0, void 0, function* () {
        // ----------------- stake + accrue
        yield gf.stakeAndVerify(gf.farmer1Identity);
        yield gf.stakeAndVerify(gf.farmer2Identity);
        //verify timings
        yield gf.verifyFarmerFixedRewardTimings(gf.farmer1Identity, true);
        yield gf.verifyFarmerFixedRewardTimings(gf.farmer2Identity, true);
        yield (0, util_1.pause)(6000);
        // ----------------- unstake once
        yield gf.unstakeOnceAndVerify(gf.farmer1Identity);
        yield gf.unstakeOnceAndVerify(gf.farmer2Identity);
        // verify counts
        yield gf.verifyStakedGemsAndFarmers(0, 0, 0);
        // ----------------- unstake twice (to pass cooldown)
        yield gf.unstakeTwiceAndVerify(gf.farmer1Identity);
        yield gf.unstakeTwiceAndVerify(gf.farmer2Identity);
        //verify counts
        yield gf.verifyStakedGemsAndFarmers(0, 0, 0);
        //verify funds
        yield gf.verifyAccruedRewardsFixed(30);
        // ----------------- claim
        yield gf.callClaimRewards(gf.farmer1Identity);
        yield gf.callClaimRewards(gf.farmer2Identity);
        const farmer1ClaimedOld = yield gf.verifyClaimedReward(gf.farmer1Identity);
        const farmer2ClaimedOld = yield gf.verifyClaimedReward(gf.farmer2Identity);
        // since the farmers are now UNstaked, we can verify no further rewards can be claimed,
        // despite the farm continuing to be active
        yield (0, util_1.pause)(1000); //time for farm as a whole to continue forward
        yield gf.callClaimRewards(gf.farmer1Identity);
        yield gf.callClaimRewards(gf.farmer2Identity);
        const farmer1ClaimedNew = yield gf.verifyClaimedReward(gf.farmer1Identity);
        const farmer2ClaimedNew = yield gf.verifyClaimedReward(gf.farmer2Identity);
        (0, chai_1.assert)(farmer1ClaimedNew.eq(farmer1ClaimedOld));
        (0, chai_1.assert)(farmer2ClaimedNew.eq(farmer2ClaimedOld));
    }));
    it('voids reserved amount after farmers unstake', () => __awaiter(void 0, void 0, void 0, function* () {
        let totalReserve = gf.calcTotalGemRarity().total.mul((0, types_1.toBN)(30));
        //both stake
        yield gf.stakeAndVerify(gf.farmer1Identity);
        yield gf.stakeAndVerify(gf.farmer2Identity);
        yield gf.verifyFixedReward(totalReserve); //full reserve in place
        //accrue some time
        yield (0, util_1.pause)(1000);
        //both unstake
        yield gf.unstakeOnceAndVerify(gf.farmer1Identity);
        yield gf.unstakeOnceAndVerify(gf.farmer2Identity);
        const reward = yield gf.verifyFixedReward();
        (0, chai_1.assert)(reward.reservedAmount.lt(totalReserve)); //less than full, since some accrued
        (0, chai_1.assert)(reward.reservedAmount.gt(0));
        //we still need to refresh the farmers to void the rewards (remember fixed only updates when farmer passed)
        yield gf.callRefreshFarmer(gf.farmer1Identity);
        yield gf.callRefreshFarmer(gf.farmer2Identity);
        yield gf.verifyFixedReward(0); //finally reserve is empty
    }));
    it('rolls the farmer forward after expiry', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.mintMoreRewards(60000);
        //we need to reset funding schedule to a shorter one
        yield gf.callFundReward(undefined, shortFixedConfig);
        const times = yield gf.verifyTimes();
        (0, chai_1.assert)(times.durationSec.eq((0, types_1.toBN)(5)));
        //stake + exhaust the schedule
        yield gf.stakeAndVerify(gf.farmer1Identity);
        yield (0, util_1.pause)(5000);
        const originalStakedTs = (yield gf.verifyFarmerReward(gf.farmer1Identity))
            .fixedRate.beginStakingTs;
        //need to refresh the farmer to push them into graduation
        yield gf.callRefreshFarmer(gf.farmer1Identity);
        //we'll know we've succeeded when reserved funds are 0
        yield gf.verifyFixedReward(0);
        //we want the timestamp to be preserved
        const newStakedTs = (yield gf.verifyFarmerReward(gf.farmer1Identity))
            .fixedRate.beginStakingTs;
        (0, chai_1.assert)(originalStakedTs.eq(newStakedTs));
        //now let's throw in another reward
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        //refresh the farmer to get them in
        yield gf.callRefreshFarmer(gf.farmer1Identity);
        //expect them to be "rolled" - ie on the new schedule, but with old TS
        const fixed = (yield gf.verifyFarmerReward(gf.farmer1Identity)).fixedRate;
        (0, chai_1.assert)(fixed.beginStakingTs.eq(originalStakedTs));
        (0, chai_1.assert)(fixed.beginStakingTs.lt(fixed.beginScheduleTs));
        (0, chai_1.assert)(fixed.promisedDuration.gte((0, types_1.toBN)(90)));
    }));
    //todo ideally needs a variable rate counterpart (less concerning tho)
    it('flash deposits a gem', () => __awaiter(void 0, void 0, void 0, function* () {
        //get the gems back, we'll need them for 2 separate deposits
        yield gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);
        const initialDeposit = new anchor_1.BN(1); //drop 1 existing gem, need to lock the vault
        yield gf.callDeposit(initialDeposit, gf.farmer1Identity);
        //stake to lock the vault
        const { farmer, vault } = yield gf.callStake(gf.farmer1Identity);
        let vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq(initialDeposit));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq(initialDeposit.mul((0, types_1.toBN)(gf.gem1PerGemRarity))));
        chai_1.assert.isTrue(vaultAcc.locked);
        let farmAcc = yield gf.fetchFarm();
        (0, chai_1.assert)(farmAcc.stakedFarmerCount.eq(new anchor_1.BN(1)));
        (0, chai_1.assert)(farmAcc.gemsStaked.eq(initialDeposit));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq(initialDeposit.mul((0, types_1.toBN)(gf.gem1PerGemRarity))));
        let farmerAcc = (yield gf.fetchFarmerAcc(farmer));
        (0, chai_1.assert)(farmerAcc.gemsStaked.eq(initialDeposit));
        (0, chai_1.assert)(farmerAcc.rarityPointsStaked.eq(initialDeposit.mul((0, types_1.toBN)(gf.gem1PerGemRarity))));
        const oldEndTs = farmerAcc.minStakingEndsTs;
        const originalBeginStakingTs = farmerAcc[gf.reward].fixedRate.beginStakingTs;
        const originalBeginScheduleTs = farmerAcc[gf.reward].fixedRate.beginScheduleTs;
        const originalDuration = farmerAcc[gf.reward].fixedRate.promisedDuration;
        //wait for 1 sec so that flash deposit staking time is recorded as different
        yield (0, util_1.pause)(1000);
        //flash deposit after vault locked
        const flashDeposit = new anchor_1.BN(1);
        yield gf.callFlashDeposit(flashDeposit, gf.farmer1Identity);
        // await printStructs('FLASH DEPOSITS');
        let newGems = initialDeposit.add(flashDeposit);
        let newRarity = initialDeposit
            .add(flashDeposit)
            .mul((0, types_1.toBN)(gf.gem1PerGemRarity));
        vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq(newGems));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq(newRarity));
        chai_1.assert.isTrue(vaultAcc.locked);
        farmAcc = yield gf.fetchFarm();
        (0, chai_1.assert)(farmAcc.stakedFarmerCount.eq(new anchor_1.BN(1)));
        (0, chai_1.assert)(farmAcc.gemsStaked.eq(newGems));
        (0, chai_1.assert)(farmAcc.rarityPointsStaked.eq(newRarity));
        farmerAcc = (yield gf.fetchFarmerAcc(farmer));
        (0, chai_1.assert)(farmerAcc.gemsStaked.eq(newGems));
        (0, chai_1.assert)(farmerAcc.rarityPointsStaked.eq(newRarity));
        //flash deposits resets staking time, which means it should be higher
        (0, chai_1.assert)(farmerAcc.minStakingEndsTs.gt(oldEndTs));
        //check to make sure schedule renewed, but original staking TS preserved
        const newBeginStakingTs = farmerAcc[gf.reward].fixedRate.beginStakingTs;
        const newBeginScheduleTs = farmerAcc[gf.reward].fixedRate.beginScheduleTs;
        const newDuration = farmerAcc[gf.reward].fixedRate.promisedDuration;
        (0, chai_1.assert)(originalBeginStakingTs.eq(newBeginStakingTs));
        (0, chai_1.assert)(originalBeginScheduleTs.lt(newBeginScheduleTs));
        (0, chai_1.assert)(originalDuration.gt(newDuration)); //since less time left on schedule
    }));
    it('flash deposits a gem (whitelisted mint)', () => __awaiter(void 0, void 0, void 0, function* () {
        //get the gems back, we'll need them for 2 separate deposits
        yield gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);
        const initialDeposit = new anchor_1.BN(1); //drop 1 existing gem, need to lock the vault
        yield gf.callDeposit(initialDeposit, gf.farmer1Identity);
        const { vault } = yield gf.callStake(gf.farmer1Identity);
        //whitelist mint
        const { whitelistProof } = yield gf.callAddToBankWhitelist(gf.gem1.tokenMint, gem_bank_client_1.WhitelistType.Mint);
        //flash deposit after vault locked
        const flashDeposit = new anchor_1.BN(1);
        yield gf.callFlashDeposit(flashDeposit, gf.farmer1Identity, whitelistProof);
        //this is enough to verify it worked
        const vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq(initialDeposit.add(flashDeposit)));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq(initialDeposit.add(flashDeposit).mul((0, types_1.toBN)(gf.gem1PerGemRarity))));
        chai_1.assert.isTrue(vaultAcc.locked);
    }));
    it('flash deposits a gem (whitelisted creator)', () => __awaiter(void 0, void 0, void 0, function* () {
        //get the gems back, we'll need them for 2 separate deposits
        yield gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);
        const initialDeposit = new anchor_1.BN(1); //drop 1 existing gem, need to lock the vault
        yield gf.callDeposit(initialDeposit, gf.farmer1Identity);
        const { vault } = yield gf.callStake(gf.farmer1Identity);
        //whitelist creator
        const gemMetadata = yield (0, metaplex_1.createMetadata)(gf.conn, gf.nw.wallet, gf.gem1.tokenMint);
        const { whitelistProof } = yield gf.callAddToBankWhitelist(gf.nw.wallet.publicKey, gem_bank_client_1.WhitelistType.Creator);
        //flash deposit after vault locked
        const flashDeposit = new anchor_1.BN(1);
        yield gf.callFlashDeposit(flashDeposit, gf.farmer1Identity, web3_js_1.PublicKey.default, gemMetadata, whitelistProof);
        //this is enough to verify it worked
        const vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq(initialDeposit.add(flashDeposit)));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq(initialDeposit.add(flashDeposit).mul((0, types_1.toBN)(gf.gem1PerGemRarity))));
        chai_1.assert.isTrue(vaultAcc.locked);
    }));
});
