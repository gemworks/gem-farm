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
const web3_js_1 = require("@solana/web3.js");
const types_1 = require("../../../sdk/src/gem-common/types");
chai_1.default.use(chai_as_promised_1.default);
describe('rarities', () => {
    let gf = new gem_farm_tester_1.GemFarmTester();
    beforeEach('preps accs', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.prepAccounts(10000);
        yield gf.callInitFarm(gem_farm_tester_1.defaultFarmConfig);
        yield gf.callInitFarmer(gf.farmer1Identity);
    }));
    it('records single rarity via MultipleRarities call', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gf.setGemRarities(10);
        const [rarityAddr] = yield gf.findRarityPDA(gf.bank.publicKey, gf.gem1.tokenMint);
        const rarityAcc = yield gf.fetchRarity(rarityAddr);
        chai_1.assert.equal(rarityAcc.points, 10);
    }));
    it('records multiple rarities', () => __awaiter(void 0, void 0, void 0, function* () {
        const configs = [];
        const rarityAddresses = [];
        //(!) EMPIRICAL TESTING SHOWED CAN'T GO ABOVE 7, TX SIZE BECOMES TOO BIG
        for (let i = 0; i < 7; i++) {
            const mint = web3_js_1.Keypair.generate().publicKey;
            const [rarityAddr] = yield gf.findRarityPDA(gf.bank.publicKey, mint);
            configs.push({
                mint,
                rarityPoints: 10,
            });
            rarityAddresses.push(rarityAddr);
        }
        yield gf.callAddRaritiesToBank(configs);
        const results = yield Promise.all(rarityAddresses.map((a) => gf.fetchRarity(a)));
        results.forEach((r) => chai_1.assert.equal(r.points, 10));
    }));
    it('correctly counts rarity points during deposits/withdrawals', () => __awaiter(void 0, void 0, void 0, function* () {
        //add rarities for gem1 mint
        yield gf.setGemRarities(15);
        //deposit
        yield gf.callDeposit(20, gf.farmer1Identity);
        const farm = yield gf.fetchFarm();
        const [vault] = yield gf.findVaultPDA(farm.bank, gf.farmer1Identity.publicKey);
        let vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq((0, types_1.toBN)(20)));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq((0, types_1.toBN)(20).mul((0, types_1.toBN)(15))));
        //withdraw some but not all
        yield gf.callWithdraw(15, gf.farmer1Identity);
        vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq((0, types_1.toBN)(5)));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq((0, types_1.toBN)(5).mul((0, types_1.toBN)(15))));
        //add some more (now total 25)
        yield gf.callDeposit(20, gf.farmer1Identity);
        vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq((0, types_1.toBN)(25)));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq((0, types_1.toBN)(25).mul((0, types_1.toBN)(15))));
        //withdraw all
        yield gf.callWithdraw(25, gf.farmer1Identity);
        vaultAcc = yield gf.fetchVaultAcc(vault);
        (0, chai_1.assert)(vaultAcc.gemCount.eq((0, types_1.toBN)(0)));
        (0, chai_1.assert)(vaultAcc.rarityPoints.eq((0, types_1.toBN)(0)));
    }));
});
