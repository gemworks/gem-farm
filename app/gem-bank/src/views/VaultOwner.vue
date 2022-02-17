<template>
  <ConfigPane />
  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>
    <!--bank address-->
    <div class="nes-container with-title mb-10">
      <p class="title">Connect to a Bank</p>
      <div class="nes-field mb-5">
        <label for="farm">Bank address:</label>
        <input id="farm" class="nes-input" v-model="bank" />
      </div>
      <div v-if="vault">Vault found: {{ vault }}</div>
    </div>

    <div v-if="vault">
      <!--control buttons-->
      <div class="mb-5 flex justify-center">
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
        <div class="m-2 flex flex-col">
          <ArrowButton class="my-2" @click="moveNFTsFE(false)" />
          <ArrowButton class="my-2" :left="true" @click="moveNFTsFE(true)" />
        </div>
        <!--right-->
        <NFTGrid
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
      </div>
    </div>
    <div v-else class="flex-1 text-center">
      <button class="nes-btn is-primary" @click="createVault">
        Create vault
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue';
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
import { findVaultPDA } from '@gemworks/gem-farm-ts';

export default defineComponent({
  components: { TheWhitelist, ArrowButton, NFTGrid, ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gb: any;
    watch([wallet, cluster], async () => {
      await startFresh();
    });

    onMounted(async () => {
      if (getWallet()) {
        await startFresh();
      }
    });

    // --------------------------------------- manage vault
    const bank = ref<string>();
    const vault = ref<string>();
    const gdrs = ref([]);
    const vaultLocked = ref<boolean>(false);

    watch(bank, async () => {
      await startFresh();
    });

    const startFresh = async () => {
      vault.value = undefined;
      gdrs.value = [];
      vaultLocked.value = false;

      gb = await initGemBank(getConnection(), getWallet()!);
      await fetchVault();
      if (vault.value) {
        await Promise.all([populateWalletNFTs(), populateGemBankNFTs()]);
      }
    };

    const fetchVault = async () => {
      try {
        const bankPk = new PublicKey(bank.value!);
        const [vaultAddr] = await findVaultPDA(bankPk, getWallet()!.publicKey!);
        try {
          //if this goes through, then the vault exists
          const acc = await gb.fetchVaultAcc(vaultAddr);

          vault.value = vaultAddr.toBase58();
          vaultLocked.value = acc.locked;
          console.log('found vault', vault.value);
        } catch (e) {
          vault.value = undefined;
          vaultLocked.value = false;
          console.log('looks like vault doesnt exist');
        }
      } catch (e) {
        console.log('bad bank public key');
      }
    };

    const createVault = async () => {
      const { vault: fetchedVault } = await gb.initVaultWallet(
        new PublicKey(bank.value!)
      );
      vault.value = fetchedVault.toBase58();
      console.log('vault created', fetchedVault.toBase58());
      await startFresh();
    };

    const depositGem = async (
      mint: PublicKey,
      creator: PublicKey,
      source: PublicKey
    ) => {
      const { txSig } = await gb.depositGemWallet(
        new PublicKey(bank.value!),
        new PublicKey(vault.value!),
        new BN(1),
        mint,
        source,
        creator
      );
      console.log('deposit done', txSig);
    };

    const withdrawGem = async (mint: PublicKey) => {
      const { txSig } = await gb.withdrawGemWallet(
        new PublicKey(bank.value!),
        new PublicKey(vault.value!),
        new BN(1),
        mint
      );
      console.log('withdrawal done', txSig);
    };

    // --------------------------------------- populate initial nfts
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

    const populateWalletNFTs = async () => {
      // zero out to begin with
      currentWalletNFTs.value = [];
      selectedWalletNFTs.value = [];
      desiredWalletNFTs.value = [];

      if (getWallet()) {
        currentWalletNFTs.value = await getNFTsByOwner(
          getWallet()!.publicKey!,
          getConnection()
        );
        desiredWalletNFTs.value = [...currentWalletNFTs.value];
      }
    };

    const populateGemBankNFTs = async () => {
      // zero out to begin with
      currentVaultNFTs.value = [];
      selectedVaultNFTs.value = [];
      desiredVaultNFTs.value = [];

      const foundGDRs = await gb.fetchAllGdrPDAs(new PublicKey(vault.value!));
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
    };

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
        const creator = new PublicKey(
          (nft.onchainMetadata as any).data.creators[0].address
        );
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
      createVault,
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
