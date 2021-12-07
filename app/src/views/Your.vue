<template>
  <ConfigPane />

  <div class="flex items-stretch">
    <NFTGrid
      title="Your wallet"
      class="flex-1"
      :nfts="displayWalletNFTs"
      @selected="handleWalletSelected"
    />

    <div class="m-2 flex flex-col justify-center items-center align-center">
      <ArrowButton class="my-2" @click="moveNFTs(false)" />
      <ArrowButton class="my-2" :left="true" @click="moveNFTs(true)" />
    </div>

    <div v-if="!bank || !vault" class="flex-1 nes-container with-title">
      <p class="title">Your vault</p>
      <!--create bank if doesn't exist-->
      <button v-if="!bank" class="m-2 nes-btn is-primary" @click="startBank">
        Start bank
      </button>
      <!--create vault if doesn't exist-->
      <button v-else class="m-2 nes-btn is-primary" @click="createVault">
        Create vault
      </button>
    </div>
    <!--else show vault contents-->
    <NFTGrid
      v-else
      title="Gem vault"
      class="flex-1"
      :nfts="displayVaultNFTs"
      @selected="handleVaultSelected"
    />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import ConfigPane from '@/components/ConfigPane.vue';
import NFTGrid from '@/components/NFTGrid.vue';
import ArrowButton from '@/components/ArrowButton.vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { getNFTsByOwner, INFT } from '@/common/nft/get';
import { GemBankClient, initGemBank } from '@/common/gem-bank';
import { PublicKey } from '@solana/web3.js';

export default defineComponent({
  components: { ArrowButton, NFTGrid, ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    // --------------------------------------- state

    const walletNFTs = ref<INFT[]>([]);
    const vaultNFTs = ref<INFT[]>([]);
    const selectedWalletNFTs = ref<INFT[]>([]);
    const selectedVaultNFTs = ref<INFT[]>([]);
    const toWalletNFTs = ref<INFT[]>([]);
    const toVaultNFTs = ref<INFT[]>([]);

    const displayWalletNFTs = computed(() => {
      return [...walletNFTs.value, ...toWalletNFTs.value];
    });
    const displayVaultNFTs = computed(() => {
      return [...vaultNFTs.value, ...toVaultNFTs.value];
    });

    const handleWalletSelected = (e:any) => {
      if (e.selected) {
        selectedWalletNFTs.value.push(e.nft);
      } else {
        const index = selectedWalletNFTs.value.indexOf(e.nft);
        selectedWalletNFTs.value.splice(index, 1);
      }
    };
    const handleVaultSelected = (e:any) => {
      if (e.selected) {
        selectedVaultNFTs.value.push(e.nft);
      } else {
        const index = selectedVaultNFTs.value.indexOf(e.nft);
        selectedVaultNFTs.value.splice(index, 1);
      }
    };

    // --------------------------------------- wallet
    const getWalletNFTs = async () => {
      if (getWallet()) {
        walletNFTs.value = await getNFTsByOwner(
          getWallet()!.publicKey!,
          getConnection()
        );
      }
    };

    // --------------------------------------- vault
    let gb: any;
    const bank = ref<PublicKey>();
    const vault = ref<PublicKey>();
    const gdrs = ref([]);

    watch([wallet, cluster], async () => {
      await getWalletNFTs();
      gb = await initGemBank(getConnection(), getWallet()!);

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
          }
        }
      }
    });

    const startBank = async () => {
      const txSig = await gb.startBank();
      console.log('bank created', txSig);
    };

    const createVault = async () => {
      const txSig = await gb.addVault(bank.value);
      console.log('vault created', txSig);
    };

    const loadVault = async () => {
      console.log(gdrs.value);
    };

    // --------------------------------------- moving nfts

    const removeManyFromList = (toRemove: any[], fromList: any[]) {
      toRemove.forEach(i => {
        const index = fromList.indexOf(i);
        if (index > -1) {
          fromList.splice(index, 1);
        }
      })
    }

    const moveNFTs = (moveLeft: boolean) => {
      if (moveLeft) {
        toWalletNFTs.value.push(...selectedVaultNFTs.value);
        removeManyFromList(selectedVaultNFTs.value, vaultNFTs.value);
        removeManyFromList(selectedVaultNFTs.value, toVaultNFTs.value);
        selectedVaultNFTs.value = [];
      } else {
        toVaultNFTs.value.push(...selectedWalletNFTs.value);
        removeManyFromList(selectedWalletNFTs.value, walletNFTs.value)
        removeManyFromList(selectedWalletNFTs.value, toWalletNFTs.value)
        selectedWalletNFTs.value = [];
      }
    };

    return {
      displayWalletNFTs,
      displayVaultNFTs,
      handleWalletSelected,
      handleVaultSelected,
      moveNFTs,
      bank,
      vault,
      startBank,
      createVault,
      loadVault,
    };
  },
});
</script>

<style scoped></style>
