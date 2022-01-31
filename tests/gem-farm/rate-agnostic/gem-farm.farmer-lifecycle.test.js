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
const anchor_1 = require("@project-serum/anchor");
const chai_1 = __importStar(require("chai"));
const chai_as_promised_1 = __importDefault(require("chai-as-promised"));
const gem_farm_tester_1 = require("../gem-farm.tester");
const web3_js_1 = require("@solana/web3.js");
const util_1 = require("../../../sdk/src/gem-common/util");
chai_1.default.use(chai_as_promised_1.default);
const farmConfig = {
    minStakingPeriodSec: new anchor_1.BN(2),
    cooldownPeriodSec: new anchor_1.BN(2),
    unstakingFeeLamp: new anchor_1.BN(web3_js_1.LAMPORTS_PER_SOL),
};
describe('farmer lifecycle (unstaked -> staked -> cooldown)', () => {
    let gf = new gem_farm_tester_1.GemFarmTester();
    beforeEach('preps accs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.prepAccounts(10000);
        yield gf.callInitFarm(farmConfig);
        yield gf.callInitFarmer(gf.farmer1Identity);
    }));
    it('moves through farmer lifecycle', () => __awaiter(void 0, void 0, void 0, function* () {
        //deposit some gems into the vault
        yield gf.callDeposit(gf.gem1Amount, gf.farmer1Identity);
        //stake
        const { farmer, vault } = yield gf.callStake(gf.farmer1Identity);
        //unstaking fails, since min period not passed
        yield (0, chai_1.expect)(gf.callUnstake(gf.farmer1Identity)).to.be.rejectedWith('0x156');
        yield (0, util_1.pause)(3000);
        //begin cooldown
        yield gf.callUnstake(gf.farmer1Identity);
        //withdrawal fails, since cooldown period not passed
        yield (0, chai_1.expect)(gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity)).to.be.rejectedWith('0x140');
        yield (0, util_1.pause)(3000);
        //run again to unlock vault
        yield gf.callUnstake(gf.farmer1Identity);
        //this time works
        yield gf.callWithdraw(gf.gem1Amount, gf.farmer1Identity);
        const farmAcc = yield gf.fetchFarm();
        console.log(farmAcc.gemsStaked);
        console.log(farmAcc.rarityPointsStaked);
        (0, chai_1.assert)(farmAcc.stakedFarmerCount.eq(new anchor_1.BN(0)));
        (0, chai_1.assert)(farmAcc.gemsStaked.eq(new anchor_1.BN(0)));
        (0, chai_1.assert)(farmAcc.rarityPointsStaked.eq(new anchor_1.BN(0)));
        const vaultAcc = yield gf.fetchVaultAcc(vault);
        chai_1.assert.isFalse(vaultAcc.locked);
        const farmerAcc = yield gf.fetchFarmerAcc(farmer);
        (0, chai_1.assert)(farmerAcc.gemsStaked.eq(new anchor_1.BN(0)));
        (0, chai_1.assert)(farmerAcc.rarityPointsStaked.eq(new anchor_1.BN(0)));
    }));
});
