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
const gem_farm_client_1 = require("../../../sdk/src/gem-farm.client");
const util_1 = require("../../../sdk/src/gem-common/util");
chai_1.default.use(chai_as_promised_1.default);
describe('funding (fixed rate)', () => {
    let gf = new gem_farm_tester_1.GemFarmTester();
    let totalGems;
    beforeEach('preps accs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.prepAccounts(30000, gf.randomInt(1, 3), gf.randomInt(1, 3));
        yield gf.callInitFarm(gem_farm_tester_1.defaultFarmConfig, gem_farm_client_1.RewardType.Fixed);
        yield gf.callInitFarmer(gf.farmer1Identity);
        yield gf.callAuthorize();
        totalGems = gf.calcTotalGems();
    }));
    it('funds a new reward', () => __awaiter(void 0, void 0, void 0, function* () {
        const { pot } = yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(30000, 0, 0);
        //times
        const times = yield gf.verifyTimes(100);
        (0, chai_1.assert)(times.rewardEndTs.gt(new anchor_1.BN(0)));
        //fixed reward
        yield gf.verifyFixedReward(0);
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 30000);
    }));
    it('funds -> locks', () => __awaiter(void 0, void 0, void 0, function* () {
        const { pot } = yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        yield gf.callLockReward();
        // ----------------- tests
        //funds
        yield gf.verifyFunds(30000, 0, 0);
        //times
        const times = yield gf.verifyTimes(100);
        (0, chai_1.assert)(times.lockEndTs.eq(times.rewardEndTs));
        //fixed reward
        yield gf.verifyFixedReward(0);
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 30000);
        //once locked, funding/cancellation ixs should fail
        yield (0, chai_1.expect)(gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig)).to.be.rejectedWith('0x155');
        yield (0, chai_1.expect)(gf.callCancelReward()).to.be.rejectedWith('0x155');
    }));
    it('funds -> cancels (no stakers)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        let oldEndTs = (yield gf.verifyTimes()).rewardEndTs;
        const { pot } = yield gf.callCancelReward();
        // ----------------- tests
        //funds
        yield gf.verifyFunds(30000, 30000, 0);
        //times
        const times = yield gf.verifyTimes();
        (0, chai_1.assert)(times.durationSec.toNumber() < 10); //since cancelled
        (0, chai_1.assert)(times.rewardEndTs.lt(oldEndTs));
        //fixed reward
        yield gf.verifyFixedReward(0);
        //token accounts
        yield gf.verifyFunderAccContains(30000);
        yield gf.verifyPotContains(pot, 0);
    }));
    it('funds -> gets stakers -> cancels', () => __awaiter(void 0, void 0, void 0, function* () {
        //need to fund first, or there won't be a config to assign to stakers
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        //prep
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        //make sure the right amount reserved
        yield gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());
        const { pot } = yield gf.callCancelReward();
        //the same amount should still be reserved
        yield gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());
        // ----------------- tests
        //funds
        yield gf.verifyFunds(30000, 30000 - 30 * gf.gem1Amount.toNumber(), 0);
        //times
        const times = yield gf.verifyTimes();
        (0, chai_1.assert)(times.durationSec.toNumber() < 10); //since cancelled
        //fixed reward - reserve goes down since now it's accrued
        yield gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());
        //token accounts
        yield gf.verifyFunderAccContains(30000 - 30 * gf.gem1Amount.toNumber());
        yield gf.verifyPotContains(pot, 30 * gf.gem1Amount.toNumber());
    }));
    it('funds -> gets stakers -> waits -> cancels', () => __awaiter(void 0, void 0, void 0, function* () {
        //need to fund first, or there won't be a config to assign to stakers
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        //prep
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        //make sure the right amount reserved
        yield gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());
        yield (0, util_1.pause)(6000); //wait till fully accrues
        const { pot } = yield gf.callCancelReward();
        //the same amount should still be reserved
        yield gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());
        yield gf.callRefreshFarmer(gf.farmer1Identity);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(30000, 30000 - 30 * gf.gem1Amount.toNumber(), 30 * gf.gem1Amount.toNumber());
        //times
        const times = yield gf.verifyTimes();
        (0, chai_1.assert)(times.durationSec.toNumber() < 10); //since cancelled
        //fixed reward - reserve goes down since now it's accrued
        yield gf.verifyFixedReward(0);
        //token accounts
        yield gf.verifyFunderAccContains(30000 - 30 * gf.gem1Amount.toNumber());
        yield gf.verifyPotContains(pot, 30 * gf.gem1Amount.toNumber());
    }));
    it('funds -> immediately funds again (thus merging 2 rewards)', () => __awaiter(void 0, void 0, void 0, function* () {
        //prep
        yield gf.mintMoreRewards(30000);
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        const oldEndTs = (yield gf.verifyTimes()).rewardEndTs;
        yield (0, util_1.pause)(1000); //to create a difference in timestamps we're testing below
        const { pot } = yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(60000, 0, 0);
        //times
        const times = yield gf.verifyTimes(100);
        (0, chai_1.assert)(times.rewardEndTs.gt(oldEndTs));
        //fixed reward
        yield gf.verifyFixedReward(0);
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 60000);
    }));
    it('funds -> cancels -> funds again', () => __awaiter(void 0, void 0, void 0, function* () {
        //prep
        yield gf.mintMoreRewards(30000);
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        yield gf.callCancelReward();
        const { pot } = yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(60000, 30000, 0);
        //times
        yield gf.verifyTimes(100);
        //fixed reward
        yield gf.verifyFixedReward(0);
        //token accounts
        yield gf.verifyFunderAccContains(30000);
        yield gf.verifyPotContains(pot, 30000);
    }));
    it('funds -> gets stakers -> waits -> cancels -> funds again', () => __awaiter(void 0, void 0, void 0, function* () {
        //need to fund first, or there won't be a config to assign to stakers
        yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        //prep
        yield gf.mintMoreRewards(30000);
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        //make sure the right amount reserved
        yield gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());
        yield (0, util_1.pause)(6000); //wait till fully accrues
        yield gf.callCancelReward();
        //the same amount should still be reserved
        yield gf.verifyFixedReward(30 * gf.gem1Amount.toNumber());
        yield gf.callRefreshFarmer(gf.farmer1Identity);
        const { pot } = yield gf.callFundReward(undefined, gem_farm_tester_1.defaultFixedConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(60000, 30000 - 30 * gf.gem1Amount.toNumber(), 30 * gf.gem1Amount.toNumber());
        //times
        yield gf.verifyTimes(100);
        //fixed reward - reserve goes down since now it's accrued
        yield gf.verifyFixedReward(0);
        //token accounts
        yield gf.verifyFunderAccContains(30000 - 30 * gf.gem1Amount.toNumber());
        yield gf.verifyPotContains(pot, 30000 + 30 * gf.gem1Amount.toNumber());
    }));
});
