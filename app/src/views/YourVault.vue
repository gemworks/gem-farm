<template>
  <ConfigPane />

  <div
    v-if="
      (toWalletNFTs && toWalletNFTs.length) ||
      (toVaultNFTs && toVaultNFTs.length)
    "
    class="m-5 flex justify-center"
  >
    <button class="nes-btn is-primary" @click="moveNFTsOnChain">
      Move Gems!
    </button>
  </div>

  <div class="flex items-stretch">
    <NFTGrid
      title="Your wallet"
      class="flex-1"
      :nfts="desiredWalletNFTs"
      @selected="handleWalletSelected"
    />

    <div class="m-2 flex flex-col justify-center items-center align-center">
      <ArrowButton class="my-2" @click="moveNFTsFE(false)" />
      <ArrowButton class="my-2" :left="true" @click="moveNFTsFE(true)" />
    </div>

    <NFTGrid
      v-if="wallet && bank && vault"
      title="Your vault"
      class="flex-1"
      :nfts="desiredVaultNFTs"
      @selected="handleVaultSelected"
    />
    <div v-else class="flex-1 nes-container with-title">
      <p class="title">Your vault</p>
      <!--ask the user to connect wallet-->
      <div v-if="!wallet">Pls connect wallet :(</div>
      <!--create bank if doesn't exist-->
      <button
        v-else-if="!bank"
        class="m-2 nes-btn is-primary"
        @click="startBank"
      >
        Start bank
      </button>
      <!--create vault if doesn't exist-->
      <button v-else class="m-2 nes-btn is-primary" @click="createVault">
        Create vault
      </button>
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

export default defineComponent({
  components: { ArrowButton, NFTGrid, ConfigPane },
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
        await depositGem(nft.mint, nft.pubkey!);
      }
      for (const nft of toWalletNFTs.value) {
        await withdrawGem(nft.mint);
      }
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
    const gdrs = ref([]); //todo keep?

    const startBank = async () => {
      const txSig = await gb.startBankWallet();
      console.log('bank created', txSig);
    };

    const createVault = async () => {
      const txSig = await gb.addVaultWallet(bank.value);
      console.log('vault created', txSig);
    };

    const depositGem = async (mint: PublicKey, source: PublicKey) => {
      const { txSig } = await gb.depositGemWallet(
        bank.value,
        vault.value,
        new BN(1),
        mint,
        source
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
      startBank,
      createVault,
    };
  },
});
</script>

<style scoped></style>
