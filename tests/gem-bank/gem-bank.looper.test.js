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
const anchor = __importStar(require("@project-serum/anchor"));
const anchor_1 = require("@project-serum/anchor");
const gem_bank_client_1 = require("../../sdk/src/gem-bank.client");
const web3_js_1 = require("@solana/web3.js");
const chai_1 = require("chai");
const node_wallet_1 = require("../../sdk/src/gem-common/node-wallet");
/*
 * The purpose of this test is to:
 * 1) create A LOT of concurrent deposits -> make sure the program can handle
 * 2) test finding & deserializing appropriate PDA state accounts
 */
describe('looper', () => {
    const _provider = anchor.Provider.env();
    const gb = new gem_bank_client_1.GemBankClient(_provider.connection, _provider.wallet);
    const nw = new node_wallet_1.NodeWallet(_provider.connection, _provider.wallet);
    const nVaults = 10;
    const nGemsPerVault = 5;
    const bank = web3_js_1.Keypair.generate();
    const bankManager = nw.wallet.publicKey;
    let vaults = [];
    function prepVault() {
        return __awaiter(this, void 0, void 0, function* () {
            const vaultOwner = yield nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
            const { vault, vaultAuth } = yield gb.initVault(bank.publicKey, vaultOwner, vaultOwner, vaultOwner.publicKey, 'test_vault');
            vaults.push({
                vault,
                vaultOwner,
                vaultAuth,
                gemBoxes: [],
            });
        });
    }
    function prepGemDeposit(vault) {
        return __awaiter(this, void 0, void 0, function* () {
            //many gems, different amounts, but same owner (who also owns the vault)
            const { gemAmount, gem } = yield prepGem(vault.vaultOwner);
            const { gemBox } = yield gb.depositGem(bank.publicKey, vault.vault, vault.vaultOwner, gemAmount, gem.tokenMint, gem.tokenAcc);
            vault.gemBoxes.push({
                gem,
                gemBox,
                gemAmount,
            });
        });
    }
    function prepGemWithdrawal(vault, gemIdx) {
        return __awaiter(this, void 0, void 0, function* () {
            const g = vault.gemBoxes[gemIdx];
            yield gb.withdrawGem(bank.publicKey, vault.vault, vault.vaultOwner, g.gemAmount, g.gem.tokenMint, vault.vaultOwner.publicKey //the receiver = owner of gemDest, NOT gemDest itself
            );
        });
    }
    function prepGem(owner) {
        return __awaiter(this, void 0, void 0, function* () {
            const gemAmount = new anchor_1.BN(10); //here intentionally using 10
            const gemOwner = owner !== null && owner !== void 0 ? owner : (yield nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL));
            const gem = yield nw.createMintAndFundATA(gemOwner.publicKey, gemAmount);
            return { gemAmount, gemOwner, gem };
        });
    }
    function depositLooper() {
        return __awaiter(this, void 0, void 0, function* () {
            //bank
            yield gb.initBank(bank, bankManager, bankManager);
            console.log('bank started');
            //vaults
            const vaultPromises = [];
            for (let i = 0; i < nVaults; i++) {
                vaultPromises.push(prepVault());
            }
            yield Promise.all(vaultPromises);
            console.log('vaults created');
            //gems
            const gemPromises = [];
            vaults.forEach((v) => {
                for (let i = 0; i < nGemsPerVault; i++) {
                    gemPromises.push(prepGemDeposit(v));
                }
            });
            yield Promise.all(gemPromises);
            console.log('gems deposited');
        });
    }
    function withdrawalLooper() {
        return __awaiter(this, void 0, void 0, function* () {
            const promises = [];
            vaults.forEach((v) => {
                for (let i = 0; i < nGemsPerVault; i++) {
                    promises.push(prepGemWithdrawal(v, i));
                }
            });
            yield Promise.all(promises);
            console.log('gems withdrawn');
        });
    }
    it('creates A LOT of PDAs & fetches them correctly', () => __awaiter(void 0, void 0, void 0, function* () {
        yield depositLooper();
        // --------------------------------------- w/o constraints
        let bankPDAs = yield gb.fetchAllBankPDAs();
        let vaultPDAs = yield gb.fetchAllVaultPDAs();
        let gdrPDAs = yield gb.fetchAllGdrPDAs();
        //verify correct # of accounts found
        chai_1.assert.equal(bankPDAs.length, 1);
        chai_1.assert.equal(vaultPDAs.length, nVaults);
        chai_1.assert.equal(gdrPDAs.length, nVaults * nGemsPerVault);
        //verify correct # of accounts stored
        let bankAcc = yield gb.fetchBankAcc(bank.publicKey);
        (0, chai_1.assert)(bankAcc.vaultCount.eq(new anchor_1.BN(nVaults)));
        for (const v of vaults) {
            const vaultAcc = yield gb.fetchVaultAcc(v.vault);
            (0, chai_1.assert)(vaultAcc.gemBoxCount.eq(new anchor_1.BN(nGemsPerVault)));
            (0, chai_1.assert)(vaultAcc.gemCount.eq(new anchor_1.BN(nGemsPerVault).mul(new anchor_1.BN(10))));
            (0, chai_1.assert)(vaultAcc.rarityPoints.eq(new anchor_1.BN(nGemsPerVault).mul(new anchor_1.BN(10))));
        }
        // --------------------------------------- w/ constraints
        bankPDAs = yield gb.fetchAllBankPDAs(bankManager);
        vaultPDAs = yield gb.fetchAllVaultPDAs(bank.publicKey);
        //verify correct # of accounts found
        chai_1.assert.equal(bankPDAs.length, 1);
        chai_1.assert.equal(vaultPDAs.length, nVaults);
        for (const v of vaults) {
            const gdrPDAsByVault = yield gb.fetchAllGdrPDAs(v.vault);
            chai_1.assert.equal(gdrPDAsByVault.length, nGemsPerVault);
        }
    }));
    it('reduces PDA count after closure', () => __awaiter(void 0, void 0, void 0, function* () {
        yield withdrawalLooper();
        const gdrPDAs = yield gb.fetchAllGdrPDAs();
        //verify correct # of accounts found
        chai_1.assert.equal(gdrPDAs.length, 0); //reduced after closure
        //verify correct # of accounts stored
        for (const v of vaults) {
            const vaultAcc = yield gb.fetchVaultAcc(v.vault);
            (0, chai_1.assert)(vaultAcc.gemBoxCount.eq(new anchor_1.BN(0))); //reduced after closure
            (0, chai_1.assert)(vaultAcc.gemCount.eq(new anchor_1.BN(0)));
            (0, chai_1.assert)(vaultAcc.rarityPoints.eq(new anchor_1.BN(0)));
        }
    }));
});
