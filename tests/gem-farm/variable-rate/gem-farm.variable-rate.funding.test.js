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
const util_1 = require("../../../sdk/src/gem-common/util");
chai_1.default.use(chai_as_promised_1.default);
const fastConfig = {
    amount: new anchor_1.BN(10000),
    durationSec: new anchor_1.BN(2),
};
describe('funding (variable rate)', () => {
    let gf = new gem_farm_tester_1.GemFarmTester();
    beforeEach('preps accs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.prepAccounts(10000, gf.randomInt(1, 3), gf.randomInt(1, 3));
        yield gf.callInitFarm(gem_farm_tester_1.defaultFarmConfig);
        yield gf.callInitFarmer(gf.farmer1Identity);
        yield gf.callAuthorize();
    }));
    it('funds a new reward', () => __awaiter(void 0, void 0, void 0, function* () {
        const { pot } = yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(10000, 0, 0);
        //times
        const times = yield gf.verifyTimes(100);
        (0, chai_1.assert)(times.rewardEndTs.gt(new anchor_1.BN(0)));
        //variable reward
        const reward = yield gf.verifyVariableReward(100);
        (0, chai_1.assert)(reward.rewardLastUpdatedTs.gt(new anchor_1.BN(0)));
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 10000);
    }));
    it('funds -> locks', () => __awaiter(void 0, void 0, void 0, function* () {
        const { pot } = yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        yield gf.callLockReward();
        // ----------------- tests
        //funds
        yield gf.verifyFunds(10000, 0, 0);
        //times
        const times = yield gf.verifyTimes(100);
        (0, chai_1.assert)(times.lockEndTs.eq(times.rewardEndTs));
        //variable reward
        yield gf.verifyVariableReward(100);
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 10000);
        //once locked, funding/cancellation ixs should fail
        yield (0, chai_1.expect)(gf.callFundReward(gem_farm_tester_1.defaultVariableConfig)).to.be.rejectedWith('0x155');
        yield (0, chai_1.expect)(gf.callCancelReward()).to.be.rejectedWith('0x155');
    }));
    it('funds -> cancels (no stakers)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        let oldEndTs = (yield gf.verifyTimes()).rewardEndTs;
        const { pot } = yield gf.callCancelReward();
        // ----------------- tests
        //funds
        yield gf.verifyFunds(10000, 10000, 0);
        //times
        const times = yield gf.verifyTimes();
        (0, chai_1.assert)(times.durationSec.lt(new anchor_1.BN(5))); //leaving a few sec wiggle room
        (0, chai_1.assert)(times.rewardEndTs.lt(oldEndTs));
        //variable reward
        const reward = yield gf.verifyVariableReward(0); //after cancellation goes to 0
        (0, chai_1.assert)(reward.rewardLastUpdatedTs.gt(new anchor_1.BN(0)));
        //token accounts
        yield gf.verifyFunderAccContains(10000);
        yield gf.verifyPotContains(pot, 0);
    }));
    it('funds -> cancels (early stakers = fully accrues)', () => __awaiter(void 0, void 0, void 0, function* () {
        //prep
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        yield gf.callFundReward(fastConfig);
        yield gf.verifyVariableReward(5000);
        yield (0, util_1.pause)(2000); //wait till fully accrues
        const { pot } = yield gf.callCancelReward();
        // ----------------- tests
        //funds
        yield gf.verifyFunds(10000, 0, 10000);
        //times
        yield gf.verifyTimes(2); //since we exhausted the reward, duration doesn't change
        //variable reward
        yield gf.verifyVariableReward(0); //after cancellation goes to 0
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 10000);
    }));
    it('funds -> cancels (late stakers = partially accrues)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.callFundReward(fastConfig);
        yield gf.verifyVariableReward(5000);
        //add late stakers (1s naturally passes since last call)
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        yield (0, util_1.pause)(2000); //wait till fully accrues
        const { pot } = yield gf.callCancelReward();
        // ----------------- tests
        //funds - expect about 50% refunded / 50% accrued
        const funds = yield gf.verifyFunds(10000);
        (0, chai_1.assert)(funds.totalRefunded.gt(new anchor_1.BN(4000)));
        (0, chai_1.assert)(funds.totalRefunded.lt(new anchor_1.BN(6000)));
        (0, chai_1.assert)(funds.totalAccruedToStakers.gt(new anchor_1.BN(4000)));
        (0, chai_1.assert)(funds.totalAccruedToStakers.lt(new anchor_1.BN(6000)));
        //times
        yield gf.verifyTimes(2); //since we exhausted the reward, duration doesn't change
        //variable reward
        yield gf.verifyVariableReward(0); //after cancellation goes to 0
        //token accounts
        yield gf.verifyFunderAccContains(4000, 'gt');
        yield gf.verifyPotContains(pot, 6000, 'lt');
    }));
    it('funds -> immediately funds again (thus merging 2 rewards)', () => __awaiter(void 0, void 0, void 0, function* () {
        //prep
        yield gf.mintMoreRewards(10000);
        yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        const oldEndTs = (yield gf.verifyTimes()).rewardEndTs;
        const oldUpdateTs = (yield gf.verifyVariableReward()).rewardLastUpdatedTs;
        yield (0, util_1.pause)(1000); //to create a difference in timestamps we're testing below
        const { pot } = yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(20000, 0, 0);
        //times
        const times = yield gf.verifyTimes(100);
        (0, chai_1.assert)(times.rewardEndTs.gt(oldEndTs));
        //variable reward
        const reward = yield gf.verifyVariableReward(200); //up to 200 after 2 fundings
        (0, chai_1.assert)(reward.rewardLastUpdatedTs.gt(oldUpdateTs));
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 20000);
    }));
    it('funds -> exhausts -> funds again', () => __awaiter(void 0, void 0, void 0, function* () {
        //prep
        yield gf.mintMoreRewards(10000);
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        yield gf.callFundReward(fastConfig);
        yield (0, util_1.pause)(2000); //exhaust the previous one
        const { pot } = yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(20000, 0, 10000);
        //times
        yield gf.verifyTimes(100);
        //variable reward
        yield gf.verifyVariableReward(100); //100 from second reward only
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 20000);
    }));
    it('funds -> cancels -> funds again', () => __awaiter(void 0, void 0, void 0, function* () {
        //prep
        yield gf.mintMoreRewards(10000);
        yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        yield gf.callCancelReward();
        const { pot } = yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(20000, 10000, 0);
        //times
        yield gf.verifyTimes(100);
        //variable reward
        yield gf.verifyVariableReward(100); //back to 100 after going to 0 on cancellation
        //token accounts
        yield gf.verifyFunderAccContains(10000);
        yield gf.verifyPotContains(pot, 10000);
    }));
    it('funds -> exhausts -> cancels -> funds again', () => __awaiter(void 0, void 0, void 0, function* () {
        //prep
        yield gf.mintMoreRewards(10000);
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callStake(gf.farmer1Identity);
        yield gf.callFundReward(fastConfig);
        yield (0, util_1.pause)(2000); //exhaust the previous one
        yield gf.callCancelReward(); //should be mute, since all rewards accrued
        const { pot } = yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig);
        // ----------------- tests
        //funds
        yield gf.verifyFunds(20000, 0, 10000);
        //times
        yield gf.verifyTimes(100);
        //variable reward
        yield gf.verifyVariableReward(100); //back to 100 after going to 0 on cancellation
        //token accounts
        yield gf.verifyFunderAccContains(0);
        yield gf.verifyPotContains(pot, 20000);
    }));
});
