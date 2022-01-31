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
const anchor = __importStar(require("@project-serum/anchor"));
const anchor_1 = require("@project-serum/anchor");
const web3_js_1 = require("@solana/web3.js");
const chai_1 = __importStar(require("chai"));
const chai_as_promised_1 = __importDefault(require("chai-as-promised"));
const types_1 = require("../../sdk/src/gem-common/types");
const gem_bank_client_1 = require("../../sdk/src/gem-bank.client");
const mocha_1 = require("mocha");
const metaplex_1 = require("../../sdk/src/gem-common/metaplex");
const node_wallet_1 = require("../../sdk/src/gem-common/node-wallet");
chai_1.default.use(chai_as_promised_1.default);
(0, mocha_1.describe)('gem bank', () => {
    const _provider = anchor.Provider.env();
    const gb = new gem_bank_client_1.GemBankClient(_provider.connection, _provider.wallet);
    const nw = new node_wallet_1.NodeWallet(_provider.connection, _provider.wallet);
    // --------------------------------------- bank + vault
    //global state
    let randomWallet; //used to test bad transactions with wrong account passed in
    const bank = web3_js_1.Keypair.generate();
    let bankManager;
    let vaultCreator;
    let vaultOwner;
    let vault;
    function printBankVaultState() {
        console.log('randomWallet', randomWallet.publicKey.toBase58());
        console.log('bank', bank.publicKey.toBase58());
        console.log('manager', bankManager.publicKey.toBase58());
        console.log('vaultCreator', vaultCreator.publicKey.toBase58());
        console.log('vaultOwner', vaultOwner.publicKey.toBase58());
        console.log('vault', vault.toBase58());
    }
    before('configures accounts', () => __awaiter(void 0, void 0, void 0, function* () {
        randomWallet = yield nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
        bankManager = yield nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
        vaultCreator = yield nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
        vaultOwner = yield nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL);
    }));
    it('inits bank', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gb.initBank(bank, bankManager, bankManager);
        const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
        chai_1.assert.equal(bankAcc.bankManager.toBase58(), bankManager.publicKey.toBase58());
        (0, chai_1.assert)(bankAcc.vaultCount.eq(new anchor_1.BN(0)));
    }));
    it('inits vault', () => __awaiter(void 0, void 0, void 0, function* () {
        //intentionally setting creator as owner, so that we can change later
        ({ vault } = yield gb.initVault(bank.publicKey, vaultCreator, vaultCreator, vaultCreator.publicKey, 'test_vault'));
        const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
        (0, chai_1.assert)(bankAcc.vaultCount.eq(new anchor_1.BN(1)));
        const vaultAcc = yield gb.fetchVaultAcc(vault);
        (0, chai_1.expect)(vaultAcc.name).to.deep.include.members((0, types_1.stringToBytes)('test_vault'));
        chai_1.assert.equal(vaultAcc.bank.toBase58, bank.publicKey.toBase58);
        chai_1.assert.equal(vaultAcc.owner.toBase58, vaultCreator.publicKey.toBase58);
        chai_1.assert.equal(vaultAcc.creator.toBase58, vaultCreator.publicKey.toBase58);
    }));
    it('updates bank manager', () => __awaiter(void 0, void 0, void 0, function* () {
        const newManager = web3_js_1.Keypair.generate();
        yield gb.updateBankManager(bank.publicKey, bankManager, newManager.publicKey);
        const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
        chai_1.assert.equal(bankAcc.bankManager.toBase58, newManager.publicKey.toBase58);
        //reset back
        yield gb.updateBankManager(bank.publicKey, newManager, bankManager.publicKey);
    }));
    it('FAILS to update bank manager w/ wrong existing manager', () => __awaiter(void 0, void 0, void 0, function* () {
        const newManager = web3_js_1.Keypair.generate();
        yield (0, chai_1.expect)(gb.updateBankManager(bank.publicKey, randomWallet, newManager.publicKey)).to.be.rejectedWith('has_one');
    }));
    it('updates vault owner', () => __awaiter(void 0, void 0, void 0, function* () {
        yield gb.updateVaultOwner(bank.publicKey, vault, vaultCreator, vaultOwner.publicKey);
        const vaultAcc = yield gb.fetchVaultAcc(vault);
        chai_1.assert.equal(vaultAcc.owner.toBase58, vaultOwner.publicKey.toBase58);
    }));
    it('FAILS to update vault owner w/ wrong existing owner', () => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, chai_1.expect)(gb.updateVaultOwner(bank.publicKey, vault, randomWallet, vaultOwner.publicKey)).to.be.rejectedWith('has_one');
    }));
    // --------------------------------------- gem boxes
    (0, mocha_1.describe)('gem operations', () => {
        //global state
        let gemAmount;
        let gem;
        let gemBox;
        let GDR;
        function printGemBoxState() {
            console.log('amount', gemAmount.toString());
            console.log('gem', (0, types_1.stringifyPKsAndBNs)(gem));
            console.log('gemBox', gemBox.toBase58());
            console.log('GDR', GDR.toBase58());
        }
        function prepDeposit(owner, mintProof, metadata, creatorProof) {
            return __awaiter(this, void 0, void 0, function* () {
                return gb.depositGem(bank.publicKey, vault, owner, gemAmount, gem.tokenMint, gem.tokenAcc, mintProof, metadata, creatorProof);
            });
        }
        function prepWithdrawal(owner, receiver, gemAmount) {
            return __awaiter(this, void 0, void 0, function* () {
                return gb.withdrawGem(bank.publicKey, vault, owner, gemAmount, gem.tokenMint, receiver);
            });
        }
        function prepGem(owner) {
            return __awaiter(this, void 0, void 0, function* () {
                const gemAmount = new anchor_1.BN(1 + Math.ceil(Math.random() * 100)); //min 2
                const gemOwner = owner !== null && owner !== void 0 ? owner : (yield nw.createFundedWallet(100 * web3_js_1.LAMPORTS_PER_SOL));
                const gem = yield nw.createMintAndFundATA(gemOwner.publicKey, gemAmount);
                return { gemAmount, gemOwner, gem };
            });
        }
        beforeEach('creates a fresh gem', () => __awaiter(void 0, void 0, void 0, function* () {
            //many gems, different amounts, but same owner (who also owns the vault)
            ({ gemAmount, gem } = yield prepGem(vaultOwner));
        }));
        it('deposits gem', () => __awaiter(void 0, void 0, void 0, function* () {
            let vaultAuth;
            ({ vaultAuth, gemBox, GDR } = yield prepDeposit(vaultOwner));
            const vaultAcc = yield gb.fetchVaultAcc(vault);
            (0, chai_1.assert)(vaultAcc.gemBoxCount.eq(new anchor_1.BN(1)));
            (0, chai_1.assert)(vaultAcc.gemCount.eq(gemAmount));
            (0, chai_1.assert)(vaultAcc.rarityPoints.eq(gemAmount));
            const gemBoxAcc = yield gb.fetchGemAcc(gem.tokenMint, gemBox);
            (0, chai_1.assert)(gemBoxAcc.amount.eq(gemAmount));
            chai_1.assert.equal(gemBoxAcc.mint.toBase58(), gem.tokenMint.toBase58());
            chai_1.assert.equal(gemBoxAcc.owner.toBase58(), vaultAuth.toBase58());
            const GDRAcc = yield gb.fetchGDRAcc(GDR);
            chai_1.assert.equal(GDRAcc.vault.toBase58(), vault.toBase58());
            chai_1.assert.equal(GDRAcc.gemBoxAddress.toBase58(), gemBox.toBase58());
            chai_1.assert.equal(GDRAcc.gemMint.toBase58(), gem.tokenMint.toBase58());
            (0, chai_1.assert)(GDRAcc.gemCount.eq(gemAmount));
        }));
        it('FAILS to deposit gem w/ wrong owner', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, chai_1.expect)(prepDeposit(randomWallet)).to.be.rejectedWith('has_one');
        }));
        it('withdraws gem to existing ATA', () => __awaiter(void 0, void 0, void 0, function* () {
            ({ gemBox, GDR } = yield prepDeposit(vaultOwner)); //make a fresh deposit
            const vaultAcc = yield gb.fetchVaultAcc(vault);
            const oldBoxCount = vaultAcc.gemBoxCount;
            const oldGemCount = vaultAcc.gemCount;
            yield prepWithdrawal(vaultOwner, gem.owner, gemAmount);
            const vaultAcc2 = yield gb.fetchVaultAcc(vault);
            (0, chai_1.assert)(vaultAcc2.gemBoxCount.eq(oldBoxCount.sub(new anchor_1.BN(1))));
            (0, chai_1.assert)(vaultAcc2.gemCount.eq(oldGemCount.sub(gemAmount)));
            (0, chai_1.assert)(vaultAcc2.rarityPoints.eq(oldGemCount.sub(gemAmount)));
            const gemAcc = yield gb.fetchGemAcc(gem.tokenMint, gem.tokenAcc);
            (0, chai_1.assert)(gemAcc.amount.eq(gemAmount));
            //these accounts are expected to close on emptying the gem box
            yield (0, chai_1.expect)(gb.fetchGemAcc(gem.tokenMint, gemBox)).to.be.rejectedWith('Failed to find account');
            yield (0, chai_1.expect)(gb.fetchGDRAcc(GDR)).to.be.rejectedWith('Account does not exist');
        }));
        it('withdraws gem to existing ATA (but does not empty)', () => __awaiter(void 0, void 0, void 0, function* () {
            const smallerAmount = gemAmount.sub(new anchor_1.BN(1));
            ({ gemBox, GDR } = yield prepDeposit(vaultOwner)); //make a fresh deposit
            yield prepWithdrawal(vaultOwner, gem.owner, smallerAmount);
            const gemAcc = yield gb.fetchGemAcc(gem.tokenMint, gem.tokenAcc);
            (0, chai_1.assert)(gemAcc.amount.eq(smallerAmount));
            const gemBoxAcc = yield gb.fetchGemAcc(gem.tokenMint, gemBox);
            (0, chai_1.assert)(gemBoxAcc.amount.eq(new anchor_1.BN(1)));
            const GDRAcc = yield gb.fetchGDRAcc(GDR);
            (0, chai_1.assert)(GDRAcc.gemCount.eq(new anchor_1.BN(1)));
        }));
        it('withdraws gem to missing ATA', () => __awaiter(void 0, void 0, void 0, function* () {
            ({ gemBox, GDR } = yield prepDeposit(vaultOwner)); //make a fresh deposit
            const missingATA = yield gb.findATA(gem.tokenMint, randomWallet.publicKey);
            yield prepWithdrawal(vaultOwner, randomWallet.publicKey, gemAmount);
            const gemAcc = yield gb.fetchGemAcc(gem.tokenMint, missingATA);
            (0, chai_1.assert)(gemAcc.amount.eq(gemAmount));
            //these accounts are expected to close on emptying the gem box
            yield (0, chai_1.expect)(gb.fetchGemAcc(gem.tokenMint, gemBox)).to.be.rejectedWith('Failed to find account');
            yield (0, chai_1.expect)(gb.fetchGDRAcc(GDR)).to.be.rejectedWith('Account does not exist');
        }));
        it('FAILS to withdraw gem w/ wrong owner', () => __awaiter(void 0, void 0, void 0, function* () {
            yield prepDeposit(vaultOwner); //make a fresh deposit
            yield (0, chai_1.expect)(prepWithdrawal(randomWallet, gem.owner, gemAmount)).to.be.rejectedWith('has_one');
        }));
        // --------------------------------------- vault lock
        function prepLock(vaultLocked) {
            return __awaiter(this, void 0, void 0, function* () {
                return gb.setVaultLock(bank.publicKey, vault, bankManager, vaultLocked);
            });
        }
        it('un/locks vault successfully', () => __awaiter(void 0, void 0, void 0, function* () {
            //lock the vault
            yield prepLock(true);
            let vaultAcc = yield gb.fetchVaultAcc(vault);
            chai_1.assert.equal(vaultAcc.locked, true);
            //deposit should fail
            yield (0, chai_1.expect)(prepDeposit(vaultOwner)).to.be.rejectedWith('0x140');
            //unlock the vault
            yield prepLock(false);
            vaultAcc = yield gb.fetchVaultAcc(vault);
            chai_1.assert.equal(vaultAcc.locked, false);
            //make a real deposit, we need this to try to withdraw later
            yield prepDeposit(vaultOwner);
            //lock the vault
            yield prepLock(true);
            //withdraw should fail
            yield (0, chai_1.expect)(prepWithdrawal(vaultOwner, gem.owner, gemAmount)).to.be.rejectedWith('0x140');
            //finally unlock the vault
            yield prepLock(false);
            //should be able to withdraw
            yield prepWithdrawal(vaultOwner, gem.owner, gemAmount);
        }));
        // --------------------------------------- bank flags
        function prepFlags(manager, flags) {
            return __awaiter(this, void 0, void 0, function* () {
                return gb.setBankFlags(bank.publicKey, manager, flags);
            });
        }
        it('sets bank flags', () => __awaiter(void 0, void 0, void 0, function* () {
            //freeze vaults
            yield prepFlags(bankManager, gem_bank_client_1.BankFlags.FreezeVaults);
            const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
            chai_1.assert.equal(bankAcc.flags, gem_bank_client_1.BankFlags.FreezeVaults);
            yield (0, chai_1.expect)(gb.updateVaultOwner(bank.publicKey, vault, vaultOwner, vaultCreator.publicKey)).to.be.rejectedWith('0x140');
            yield (0, chai_1.expect)(prepLock(true)).to.be.rejectedWith('0x140');
            yield (0, chai_1.expect)(prepDeposit(vaultOwner)).to.be.rejectedWith('0x140');
            //remove flags to be able to do a real deposit - else can't withdraw
            yield prepFlags(bankManager, 0);
            yield prepDeposit(vaultOwner);
            //freeze vaults again
            yield prepFlags(bankManager, gem_bank_client_1.BankFlags.FreezeVaults);
            yield (0, chai_1.expect)(prepWithdrawal(vaultOwner, gem.owner, gemAmount)).to.be.rejectedWith('0x140');
            //unfreeze vault in the end
            yield prepFlags(bankManager, 0);
        }));
        it('FAILS to set bank flags w/ wrong manager', () => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, chai_1.expect)(prepFlags(randomWallet, gem_bank_client_1.BankFlags.FreezeVaults)).to.be.rejectedWith('has_one');
        }));
        // --------------------------------------- whitelists
        (0, mocha_1.describe)('whitelists', () => {
            function prepAddToWhitelist(addr, type) {
                return __awaiter(this, void 0, void 0, function* () {
                    return gb.addToWhitelist(bank.publicKey, bankManager, addr, type);
                });
            }
            function prepRemoveFromWhitelist(addr) {
                return __awaiter(this, void 0, void 0, function* () {
                    return gb.removeFromWhitelist(bank.publicKey, bankManager, addr);
                });
            }
            function whitelistMint(whitelistedMint) {
                return __awaiter(this, void 0, void 0, function* () {
                    const { whitelistProof } = yield prepAddToWhitelist(whitelistedMint, gem_bank_client_1.WhitelistType.Mint);
                    return { whitelistedMint, whitelistProof };
                });
            }
            function whitelistCreator(whitelistedCreator) {
                return __awaiter(this, void 0, void 0, function* () {
                    const { whitelistProof } = yield prepAddToWhitelist(whitelistedCreator, gem_bank_client_1.WhitelistType.Creator);
                    return { whitelistedCreator, whitelistProof };
                });
            }
            function assertWhitelistClean() {
                return __awaiter(this, void 0, void 0, function* () {
                    const pdas = yield gb.fetchAllWhitelistProofPDAs();
                    chai_1.assert.equal(pdas.length, 0);
                    const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
                    chai_1.assert.equal(bankAcc.whitelistedMints, 0);
                    chai_1.assert.equal(bankAcc.whitelistedCreators, 0);
                });
            }
            beforeEach('checks whitelists are clean', () => __awaiter(void 0, void 0, void 0, function* () {
                yield assertWhitelistClean();
            }));
            // --------------- successes
            it('adds/removes mint from whitelist', () => __awaiter(void 0, void 0, void 0, function* () {
                const { whitelistedMint, whitelistProof } = yield whitelistMint(gem.tokenMint);
                const proofAcc = yield gb.fetchWhitelistProofAcc(whitelistProof);
                chai_1.assert.equal(proofAcc.whitelistType, gem_bank_client_1.WhitelistType.Mint);
                chai_1.assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
                chai_1.assert.equal(proofAcc.whitelistedAddress.toBase58(), whitelistedMint.toBase58());
                yield prepRemoveFromWhitelist(whitelistedMint);
                yield (0, chai_1.expect)(gb.fetchWhitelistProofAcc(whitelistProof)).to.be.rejectedWith('Account does not exist');
            }));
            it('adds/removes creator from whitelist', () => __awaiter(void 0, void 0, void 0, function* () {
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(randomWallet.publicKey);
                const proofAcc = yield gb.fetchWhitelistProofAcc(whitelistProof);
                chai_1.assert.equal(proofAcc.whitelistType, gem_bank_client_1.WhitelistType.Creator);
                chai_1.assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
                chai_1.assert.equal(proofAcc.whitelistedAddress.toBase58(), whitelistedCreator.toBase58());
                yield prepRemoveFromWhitelist(whitelistedCreator);
                yield (0, chai_1.expect)(gb.fetchWhitelistProofAcc(whitelistProof)).to.be.rejectedWith('Account does not exist');
            }));
            it('tries to whitelist same mint twice', () => __awaiter(void 0, void 0, void 0, function* () {
                yield whitelistMint(gem.tokenMint);
                const { whitelistedMint } = yield whitelistMint(gem.tokenMint);
                const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
                chai_1.assert.equal(bankAcc.whitelistedMints, 1);
                yield prepRemoveFromWhitelist(whitelistedMint);
            }));
            it('tries to whitelist same creator twice', () => __awaiter(void 0, void 0, void 0, function* () {
                yield whitelistCreator(randomWallet.publicKey);
                const { whitelistedCreator } = yield whitelistCreator(randomWallet.publicKey);
                const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
                chai_1.assert.equal(bankAcc.whitelistedCreators, 1);
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            it('changes whitelist from mint to creator', () => __awaiter(void 0, void 0, void 0, function* () {
                yield whitelistMint(randomWallet.publicKey);
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(randomWallet.publicKey);
                const proofAcc = yield gb.fetchWhitelistProofAcc(whitelistProof);
                chai_1.assert.equal(proofAcc.whitelistType, gem_bank_client_1.WhitelistType.Creator);
                chai_1.assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
                chai_1.assert.equal(proofAcc.whitelistedAddress.toBase58(), whitelistedCreator.toBase58());
                const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
                chai_1.assert.equal(bankAcc.whitelistedCreators, 1);
                chai_1.assert.equal(bankAcc.whitelistedMints, 0);
                yield prepRemoveFromWhitelist(whitelistedCreator);
                yield (0, chai_1.expect)(gb.fetchWhitelistProofAcc(whitelistProof)).to.be.rejectedWith('Account does not exist');
            }));
            // unlikely to be ever needed, but protocol supports this
            it('sets both mint and creator whitelists for same pk', () => __awaiter(void 0, void 0, void 0, function* () {
                const { whitelistProof } = yield gb.addToWhitelist(bank.publicKey, bankManager, randomWallet.publicKey, 3);
                const proofAcc = yield gb.fetchWhitelistProofAcc(whitelistProof);
                chai_1.assert.equal(proofAcc.whitelistType, 3);
                chai_1.assert.equal(proofAcc.bank.toBase58(), bank.publicKey.toBase58());
                chai_1.assert.equal(proofAcc.whitelistedAddress.toBase58(), randomWallet.publicKey.toBase58());
                const bankAcc = yield gb.fetchBankAcc(bank.publicKey);
                chai_1.assert.equal(bankAcc.whitelistedCreators, 1);
                chai_1.assert.equal(bankAcc.whitelistedMints, 1);
                yield prepRemoveFromWhitelist(randomWallet.publicKey);
                yield (0, chai_1.expect)(gb.fetchWhitelistProofAcc(whitelistProof)).to.be.rejectedWith('Account does not exist');
            }));
            //no need to deserialize anything, if ix goes through w/o error, the deposit succeeds
            it('allows a deposit if mint whitelisted, and creators WL empty', () => __awaiter(void 0, void 0, void 0, function* () {
                const { whitelistedMint, whitelistProof } = yield whitelistMint(gem.tokenMint);
                yield prepDeposit(vaultOwner, whitelistProof);
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedMint);
            }));
            //this is expected behavior since we're doing an OR check
            it('allows a deposit if mint whitelisted, and creators WL NOT empty', () => __awaiter(void 0, void 0, void 0, function* () {
                const { whitelistedMint, whitelistProof } = yield whitelistMint(gem.tokenMint);
                const { whitelistedCreator } = yield whitelistCreator(randomWallet.publicKey //intentionally a random creator
                );
                yield prepDeposit(vaultOwner, whitelistProof);
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedMint);
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            it('allows a deposit if creator verified + whitelisted, and mint WL empty', () => __awaiter(void 0, void 0, void 0, function* () {
                const gemMetadata = yield (0, metaplex_1.createMetadata)(nw.conn, nw.wallet, gem.tokenMint);
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(nw.wallet.publicKey //this is the address used to create the metadata
                );
                yield prepDeposit(vaultOwner, web3_js_1.PublicKey.default, // since we're not relying on mint whitelist for tx to pass, we simply pass in a dummy PK
                gemMetadata, whitelistProof);
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            //again we're simply checking OR behavior
            it('allows a deposit if creator verified + whitelisted, and mint WL NOT empty', () => __awaiter(void 0, void 0, void 0, function* () {
                const gemMetadata = yield (0, metaplex_1.createMetadata)(nw.conn, nw.wallet, gem.tokenMint);
                const { gem: randomGem } = yield prepGem();
                const { whitelistedMint } = yield whitelistMint(randomGem.tokenMint); //random mint intentionally
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(nw.wallet.publicKey //this is the address used to create the metadata
                );
                yield prepDeposit(vaultOwner, web3_js_1.PublicKey.default, gemMetadata, whitelistProof);
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedMint);
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            it('allows a deposit if creator verified + whitelisted, but listed LAST', () => __awaiter(void 0, void 0, void 0, function* () {
                const gemMetadata = yield (0, metaplex_1.createMetadata)(nw.conn, nw.wallet, gem.tokenMint, 5, 5);
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(nw.wallet.publicKey //this is the address used to create the metadata
                );
                yield prepDeposit(vaultOwner, web3_js_1.PublicKey.default, gemMetadata, whitelistProof);
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            // --------------- failures
            it('FAILS a deposit if creator whitelisted but not verified (signed off)', () => __awaiter(void 0, void 0, void 0, function* () {
                const gemMetadata = yield (0, metaplex_1.createMetadata)(nw.conn, nw.wallet, gem.tokenMint, 5, 1, true);
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(nw.wallet.publicKey //this is the address used to create the metadata
                );
                yield (0, chai_1.expect)(prepDeposit(vaultOwner, web3_js_1.PublicKey.default, gemMetadata, whitelistProof)).to.be.rejectedWith('0x142');
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            it('FAILS a deposit if mint whitelist exists, but mint not whitelisted', () => __awaiter(void 0, void 0, void 0, function* () {
                //setup the whitelist for the WRONG gem
                const { gem: randomGem } = yield prepGem();
                const { whitelistedMint, whitelistProof } = yield whitelistMint(randomGem.tokenMint);
                yield (0, chai_1.expect)(prepDeposit(vaultOwner, whitelistProof)).to.be.rejectedWith('0x142');
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedMint);
            }));
            it('FAILS a deposit if creator whitelist exists, but creator not whitelisted', () => __awaiter(void 0, void 0, void 0, function* () {
                const gemMetadata = yield (0, metaplex_1.createMetadata)(nw.conn, nw.wallet, gem.tokenMint);
                //setup the whitelist for the WRONG creator
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(randomWallet.publicKey);
                yield (0, chai_1.expect)(prepDeposit(vaultOwner, web3_js_1.PublicKey.default, gemMetadata, whitelistProof)).to.be.rejectedWith('0x142');
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            it('FAILS to verify when proof is marked as "mint", but is actually for creator', () => __awaiter(void 0, void 0, void 0, function* () {
                const gemMetadata = yield (0, metaplex_1.createMetadata)(nw.conn, nw.wallet, gem.tokenMint);
                //intentionally passing in the wallet's address not the mint's
                //now the creator has a proof, but it's marked as "mint"
                const { whitelistedMint, whitelistProof } = yield whitelistMint(nw.wallet.publicKey);
                //let's also whitelist a random creator, so that both branches of checks are triggered
                const { whitelistedCreator } = yield whitelistCreator(randomWallet.publicKey);
                yield (0, chai_1.expect)(prepDeposit(vaultOwner, web3_js_1.PublicKey.default, gemMetadata, whitelistProof)).to.be.rejectedWith('0x142');
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedMint);
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            it('FAILS to verify when proof is marked as "creator", but is actually for mint', () => __awaiter(void 0, void 0, void 0, function* () {
                const gemMetadata = yield (0, metaplex_1.createMetadata)(nw.conn, nw.wallet, gem.tokenMint);
                //intentionally passing in the mint's address not the creator's
                //now the mint has a proof, but it's marked as "creator"
                const { whitelistedCreator, whitelistProof } = yield whitelistCreator(gem.tokenMint);
                //let's also whitelist a random mint, so that both branches of checks are triggered
                const { whitelistedMint } = yield whitelistMint(web3_js_1.Keypair.generate().publicKey);
                //unfortunately it's rejected not with the error we'd like
                //the issue is that when mint branch fails (as it should, with the correct error),
                //it falls back to checking creator branch, which fails with the wrong error
                yield (0, chai_1.expect)(prepDeposit(vaultOwner, whitelistProof, gemMetadata, web3_js_1.PublicKey.default)).to.be.rejectedWith('0x142');
                //clean up after
                yield prepRemoveFromWhitelist(whitelistedMint);
                yield prepRemoveFromWhitelist(whitelistedCreator);
            }));
            it('correctly fetches proof PDAs by type', () => __awaiter(void 0, void 0, void 0, function* () {
                // create 3 mint proofs
                const { whitelistedMint: m1 } = yield whitelistMint(web3_js_1.Keypair.generate().publicKey);
                const { whitelistedMint: m2 } = yield whitelistMint(web3_js_1.Keypair.generate().publicKey);
                const { whitelistedMint: m3 } = yield whitelistMint(web3_js_1.Keypair.generate().publicKey);
                // and 1 creator proof
                const { whitelistedCreator: c1 } = yield whitelistCreator(web3_js_1.Keypair.generate().publicKey);
                // verify counts
                let pdas = yield gb.fetchAllWhitelistProofPDAs();
                chai_1.assert.equal(pdas.length, 4);
                pdas = yield gb.fetchAllWhitelistProofPDAs(bank.publicKey);
                chai_1.assert.equal(pdas.length, 4);
                //clean up after
                yield prepRemoveFromWhitelist(m1);
                yield prepRemoveFromWhitelist(m2);
                yield prepRemoveFromWhitelist(m3);
                yield prepRemoveFromWhitelist(c1);
            }));
        });
    });
});
