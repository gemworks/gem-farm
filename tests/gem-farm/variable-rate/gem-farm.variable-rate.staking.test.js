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
const util_1 = require("../../../sdk/src/gem-common/util");
chai_1.default.use(chai_as_promised_1.default);
describe('staking (variable rate)', () => {
    let gf = new gem_farm_tester_1.GemFarmTester();
    beforeEach('preps accs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.prepAccounts(5000000000, gf.randomInt(1, 3), gf.randomInt(1, 3));
        yield gf.callInitFarm(gem_farm_tester_1.defaultFarmConfig);
        yield gf.prepGemRarities();
        yield gf.callInitFarmer(gf.farmer1Identity);
        yield gf.callInitFarmer(gf.farmer2Identity);
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        yield gf.callDeposit(gf.gem2Amount, gf.farmer2Identity);
        yield gf.callAuthorize();
        yield gf.callFundReward(gem_farm_tester_1.defaultVariableConfig); //begin funding for 100s
    }));
    it('stakes -> accrues -> claims (multi farmer)', () => __awaiter(void 0, void 0, void 0, function* () {
        // ----------------- stake + accrue
        yield gf.stakeAndVerify(gf.farmer1Identity);
        yield gf.stakeAndVerify(gf.farmer2Identity);
        yield (0, util_1.pause)(5000); //pause for 5s = accrue 5% of funding
        //manually refresh to update accrued rewards for each farmer
        yield gf.callRefreshFarmer(gf.farmer1Identity);
        yield gf.callRefreshFarmer(gf.farmer2Identity);
        //verify counts
        yield gf.verifyStakedGemsAndFarmers(2);
        //verify funds
        //in theory floor 500, but sometimes it's off by 1-2 due to timing
        yield gf.verifyAccruedRewardsVariable(490);
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
        yield (0, util_1.pause)(5000); //pause for 5s = accrue 5% of funding
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
        //in theory floor 500, but sometimes it's off by 1-2 due to timing
        yield gf.verifyAccruedRewardsVariable(490);
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
});
