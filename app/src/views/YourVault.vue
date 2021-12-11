<template>
  <ConfigPane />

  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>
    <TheWhitelist :bank="bank ? bank.toBase58() : undefined" />

    <!--control buttons-->
    <div class="m-5 flex justify-center">
      <button
        v-if="vault"
        class="nes-btn is-primary my-x"
        @click="setVaultLock"
      >
        {{ vaultLocked ? 'Unlock' : 'Lock' }} vault
      </button>
      <button
        v-if="
          (toWalletNFTs && toWalletNFTs.length) ||
          (toVaultNFTs && toVaultNFTs.length)
        "
        class="nes-btn is-primary mx-5"
        @click="moveNFTsOnChain"
      >
        Move Gems!
      </button>
    </div>

    <!--wallet + vault view-->
    <div class="flex items-stretch">
      <!--left-->
      <NFTGrid
        title="Your wallet"
        class="flex-1"
        :nfts="desiredWalletNFTs"
        @selected="handleWalletSelected"
      />

      <!--mid-->
      <div class="m-2 flex flex-col justify-center items-center align-center">
        <ArrowButton class="my-2" @click="moveNFTsFE(false)" />
        <ArrowButton class="my-2" :left="true" @click="moveNFTsFE(true)" />
      </div>

      <!--right-->
      <NFTGrid
        v-if="bank && vault"
        title="Your vault"
        class="flex-1"
        :nfts="desiredVaultNFTs"
        @selected="handleVaultSelected"
      >
        <div
          v-if="vaultLocked"
          class="locked flex-col justify-center items-center align-center"
        >
          <p class="mt-10">This vault is locked!</p>
        </div>
      </NFTGrid>
      <div v-else class="flex-1 nes-container with-title">
        <p class="title">Your vault</p>
        <!--create bank if doesn't exist-->
        <button v-if="!bank" class="m-2 nes-btn is-primary" @click="startBank">
          Start bank
        </button>
        <!--create vault if doesn't exist-->
        <button
          v-else-if="!vault"
          class="m-2 nes-btn is-primary"
          @click="createVault"
        >
          Create vault
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, ref, watch } from 'vue';
import ConfigPane from '@/components/ConfigPane.vue';
import NFTGrid from '@/components/NFTGrid.vue';
import ArrowButton from '@/components/ArrowButton.vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import {
  getNFTMetadataForMany,
  getNFTsByOwner,
  INFT,
} from '@/common/web3/NFTget';
import { initGemBank } from '@/common/gem-bank';
import { PublicKey } from '@solana/web3.js';
import { getListDiffBasedOnMints, removeManyFromList } from '@/common/util';
import { BN } from '@project-serum/anchor';
import TheWhitelist from '@/components/TheWhitelist.vue';

export default defineComponent({
  components: { TheWhitelist, ArrowButton, NFTGrid, ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    // --------------------------------------- state

    //current walet/vault state
    const currentWalletNFTs = ref<INFT[]>([]);
    const currentVaultNFTs = ref<INFT[]>([]);
    //selected but not yet moved over in FE
    const selectedWalletNFTs = ref<INFT[]>([]);
    const selectedVaultNFTs = ref<INFT[]>([]);
    //moved over in FE but not yet onchain
    const desiredWalletNFTs = ref<INFT[]>([]);
    const desiredVaultNFTs = ref<INFT[]>([]);
    //moved over onchain
    const toWalletNFTs = ref<INFT[]>([]);
    const toVaultNFTs = ref<INFT[]>([]);

    // --------------------------------------- populate initial nfts

    const populateWalletNFTs = async () => {
      if (getWallet()) {
        currentWalletNFTs.value = await getNFTsByOwner(
          getWallet()!.publicKey!,
          getConnection()
        );
        desiredWalletNFTs.value = [...currentWalletNFTs.value];
      }
    };

    const populateGemBankNFTs = async () => {
      const banks = await gb.fetchAllBankPDAs(getWallet()!.publicKey!);
      if (banks && banks.length) {
        bank.value = banks[0].publicKey;
        console.log('bank is', bank.value!.toBase58());

        const vaults = await gb.fetchAllVaultPDAs(bank.value);
        if (vaults && vaults.length) {
          vault.value = vaults[0].publicKey;
          vaultLocked.value = vaults[0].account.locked;
          console.log('vault is', vault.value!.toBase58());

          const foundGDRs = await gb.fetchAllGdrPDAs(vault.value);
          if (foundGDRs && foundGDRs.length) {
            gdrs.value = foundGDRs;
            console.log(`found a total of ${foundGDRs.length} gdrs`);

            const mints = foundGDRs.map((gdr: any) => {
              return { mint: gdr.account.gemMint };
            });
            currentVaultNFTs.value = await getNFTMetadataForMany(
              mints,
              getConnection()
            );
            desiredVaultNFTs.value = [...currentVaultNFTs.value];
            console.log(
              `populated a total of ${currentVaultNFTs.value.length} vault NFTs`
            );
          }
        }
      }
    };

    watch([wallet, cluster], async () => {
      //populate wallet nfts
      await populateWalletNFTs();

      //populate gembank nfts
      gb = await initGemBank(getConnection(), getWallet()!);
      await populateGemBankNFTs();
    });

    // --------------------------------------- moving nfts

    const handleWalletSelected = (e: any) => {
      if (e.selected) {
        selectedWalletNFTs.value.push(e.nft);
      } else {
        const index = selectedWalletNFTs.value.indexOf(e.nft);
        selectedWalletNFTs.value.splice(index, 1);
      }
    };

    const handleVaultSelected = (e: any) => {
      if (e.selected) {
        selectedVaultNFTs.value.push(e.nft);
      } else {
        const index = selectedVaultNFTs.value.indexOf(e.nft);
        selectedVaultNFTs.value.splice(index, 1);
      }
    };

    const moveNFTsFE = (moveLeft: boolean) => {
      if (moveLeft) {
        //push selected vault nfts into desired wallet
        desiredWalletNFTs.value.push(...selectedVaultNFTs.value);
        //remove selected vault nfts from desired vault
        removeManyFromList(selectedVaultNFTs.value, desiredVaultNFTs.value);
        //empty selection list
        selectedVaultNFTs.value = [];
      } else {
        //push selected wallet nfts into desired vault
        desiredVaultNFTs.value.push(...selectedWalletNFTs.value);
        //remove selected wallet nfts from desired wallet
        removeManyFromList(selectedWalletNFTs.value, desiredWalletNFTs.value);
        //empty selected walelt
        selectedWalletNFTs.value = [];
      }
    };

    //todo jam into single tx
    const moveNFTsOnChain = async () => {
      for (const nft of toVaultNFTs.value) {
        console.log(nft);
        const creator = new PublicKey(
          (nft.onchainMetadata as any).data.creators[0].address
        );
        console.log('creator is', creator);
        await depositGem(nft.mint, creator, nft.pubkey!);
      }
      for (const nft of toWalletNFTs.value) {
        await withdrawGem(nft.mint);
      }
      await populateWalletNFTs();
      await populateGemBankNFTs();
    };

    //to vault = vault desired - vault current
    watch(
      desiredVaultNFTs,
      () => {
        toVaultNFTs.value = getListDiffBasedOnMints(
          desiredVaultNFTs.value,
          currentVaultNFTs.value
        );
        console.log('to vault nfts are', toVaultNFTs.value);
      },
      { deep: true }
    );

    //to wallet = wallet desired - wallet current
    watch(
      desiredWalletNFTs,
      () => {
        toWalletNFTs.value = getListDiffBasedOnMints(
          desiredWalletNFTs.value,
          currentWalletNFTs.value
        );
        console.log('to wallet nfts are', toWalletNFTs.value);
      },
      { deep: true }
    );

    // --------------------------------------- gem bank

    let gb: any;
    const bank = ref<PublicKey>();
    const vault = ref<PublicKey>();
    const gdrs = ref([]);
    const vaultLocked = ref<boolean>(false);

    const startBank = async () => {
      const { bank: fetchedBank } = await gb.startBankWallet();
      bank.value = fetchedBank.publicKey;
      console.log('bank created', fetchedBank.publicKey.toBase58());
    };

    const createVault = async () => {
      const { vault: fetchedVault } = await gb.createVaultWallet(bank.value);
      vault.value = fetchedVault;
      console.log('vault created', fetchedVault.toBase58());
    };

    const setVaultLock = async () => {
      await gb.setVaultLockWallet(bank.value, vault.value, !vaultLocked.value);
      vaultLocked.value = !vaultLocked.value;
      console.log('vault lock value changed to ', vaultLocked.value);
    };

    const depositGem = async (
      mint: PublicKey,
      creator: PublicKey,
      source: PublicKey
    ) => {
      const { txSig } = await gb.depositGemWallet(
        bank.value,
        vault.value,
        new BN(1),
        mint,
        source,
        creator
      );
      console.log('deposit done', txSig);
    };

    const withdrawGem = async (mint: PublicKey) => {
      const destATA = await gb.getATA(mint, getWallet()!.publicKey);
      const { txSig } = await gb.withdrawGemWallet(
        bank.value,
        vault.value,
        new BN(1),
        mint,
        destATA
      );
      console.log('withdrawal done', txSig);
    };

    // --------------------------------------- return

    return {
      wallet,
      desiredWalletNFTs,
      desiredVaultNFTs,
      toVaultNFTs,
      toWalletNFTs,
      handleWalletSelected,
      handleVaultSelected,
      moveNFTsFE,
      moveNFTsOnChain,
      bank,
      vault,
      vaultLocked,
      startBank,
      createVault,
      setVaultLock,
    };
  },
});
</script>

<style scoped>
.locked {
  @apply text-center bg-black text-white;
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0.7;
  z-index: 10;
}
</style>
