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
const web3_js_1 = require("@solana/web3.js");
const gem_farm_client_1 = require("../../../sdk/src/gem-farm.client");
const gem_bank_client_1 = require("../../../sdk/src/gem-bank.client");
chai_1.default.use(chai_as_promised_1.default);
const updatedFarmConfig = {
    minStakingPeriodSec: new anchor_1.BN(0),
    cooldownPeriodSec: new anchor_1.BN(0),
    unstakingFeeLamp: new anchor_1.BN(web3_js_1.LAMPORTS_PER_SOL / 2),
};
const creator = new web3_js_1.PublicKey('75ErM1QcGjHiPMX7oLsf9meQdGSUs4ZrwS2X8tBpsZhA');
describe('misc', () => {
    let gf = new gem_farm_tester_1.GemFarmTester();
    before('preps accs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.prepAccounts(45000);
    }));
    it('inits the farm', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.callInitFarm(gem_farm_tester_1.defaultFarmConfig, gem_farm_client_1.RewardType.Fixed);
        const farmAcc = (yield gf.fetchFarm());
        chai_1.assert.equal(farmAcc.bank.toBase58(), gf.bank.publicKey.toBase58());
        chai_1.assert.equal(farmAcc[gf.reward].rewardMint.toBase58(), gf.rewardMint.publicKey.toBase58());
        let bal = yield gf.getBalance(gem_farm_client_1.feeAccount);
        (0, chai_1.assert)(bal > 0); //can't check exact amount coz depends on order of tests
    }));
    it('updates the farm', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.callUpdateFarm(updatedFarmConfig);
        const farmAcc = yield gf.fetchFarm();
        chai_1.assert.equal(farmAcc.config.unstakingFeeLamp.toNumber(), web3_js_1.LAMPORTS_PER_SOL / 2);
    }));
    it('fails to double init an existing farm', () => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, chai_1.expect)(gf.callInitFarm(gem_farm_tester_1.defaultFarmConfig, gem_farm_client_1.RewardType.Fixed)).to.be.rejectedWith('0x0'); //account in use
    }));
    // --------------------------------------- farmer
    it('inits farmer', () => __awaiter(void 0, void 0, void 0, function* () {
        //farmer 1
        let { farmer } = yield gf.callInitFarmer(gf.farmer1Identity);
        const farmerAcc = yield gf.fetchFarmerAcc(farmer);
        chai_1.assert.equal(farmerAcc.farm.toBase58(), gf.farm.publicKey.toBase58());
        //farmer 2
        yield gf.callInitFarmer(gf.farmer2Identity);
    }));
    it('refreshes farmer (signed)', () => __awaiter(void 0, void 0, void 0, function* () {
        //as long as it succeeds - test's ok
        yield gf.callRefreshFarmer(gf.farmer1Identity, false);
    }));
    it('FAILS to refresh farmer (signed)', () => __awaiter(void 0, void 0, void 0, function* () {
        //w/o reenrolling we're calling the normal one
        yield gf.callRefreshFarmer(gf.farmer1Identity.publicKey);
        //now we're calling the signed one, and this should fail
        yield (0, chai_1.expect)(gf.callRefreshFarmer(gf.farmer1Identity.publicKey, false)).to.be.rejectedWith('Signature verification failed');
    }));
    // --------------------------------------- whitelisting
    it('whitelists a creator', () => __awaiter(void 0, void 0, void 0, function* () {
        let { whitelistProof } = yield gf.callAddToBankWhitelist(creator, gem_bank_client_1.WhitelistType.Creator);
        const proofAcc = yield gf.fetchWhitelistProofAcc(whitelistProof);
        chai_1.assert.equal(proofAcc.whitelistedAddress.toBase58(), creator.toBase58());
        chai_1.assert.equal(proofAcc.whitelistType, gem_bank_client_1.WhitelistType.Creator);
    }));
    it('removes a whitelisted creator', () => __awaiter(void 0, void 0, void 0, function* () {
        let { whitelistProof } = yield gf.callRemoveFromBankWhitelist(creator);
        yield (0, chai_1.expect)(gf.fetchWhitelistProofAcc(whitelistProof)).to.be.rejectedWith('Account does not exist');
    }));
    // --------------------------------------- authorization
    it('authorizes funder', () => __awaiter(void 0, void 0, void 0, function* () {
        const { authorizationProof } = yield gf.callAuthorize();
        const authorizationProofAcc = yield gf.fetchAuthorizationProofAcc(authorizationProof);
        chai_1.assert.equal(authorizationProofAcc.authorizedFunder.toBase58, gf.funder.publicKey.toBase58);
        // testing idempotency - should NOT throw an error
        yield gf.callAuthorize();
    }));
    it('deauthorizes funder', () => __awaiter(void 0, void 0, void 0, function* () {
        const { authorizationProof } = yield gf.callDeauthorize();
        yield (0, chai_1.expect)(gf.fetchAuthorizationProofAcc(authorizationProof)).to.be.rejectedWith('Account does not exist');
        //funding should not be possible now
        yield (0, chai_1.expect)(gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig)).to.be.rejectedWith('The given account is not owned by the executing program');
        //second should fail (not idempotent)
        yield (0, chai_1.expect)(gf.callDeauthorize()).to.be.rejectedWith('The given account is not owned by the executing program');
    }));
    // --------------------------------------- treasury payout
    it('pays out from treasury', () => __awaiter(void 0, void 0, void 0, function* () {
        // unstake to accrue payout fees that will go into treasury
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        yield gf.callUnstake(gf.farmer1Identity);
        const destination = yield gf.nw.createFundedWallet(0);
        yield gf.callPayout(destination.publicKey, new anchor_1.BN(web3_js_1.LAMPORTS_PER_SOL / 2));
        const balance = yield gf.getBalance(destination.publicKey);
        chai_1.assert.equal(balance, web3_js_1.LAMPORTS_PER_SOL / 2);
    }));
});
