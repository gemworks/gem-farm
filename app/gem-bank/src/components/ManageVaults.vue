<template>
  <div class="nes-container with-title">
    <p class="title">Manage Vaults</p>
    <div v-if="fetchedVaultList && fetchedVaultList.length">
      <!--selector-->
      <p class="mb-2">Choose vault:</p>
      <div class="nes-select mb-5">
        <select v-model="selectedVault">
          <option :id="v.publicKey.toBase58()" v-for="v in fetchedVaultList">
            {{ v.publicKey.toBase58() }}
          </option>
        </select>
      </div>
      <!--vault details-->
      <VaultDetails
        class="mb-5"
        v-if="selectedVaultAcc"
        :key="selectedVaultAcc"
        :vaultAcc="selectedVaultAcc"
      />
      <!--vault lock-->
      <button class="nes-btn is-primary mb-5" @click="setVaultLock">
        {{ parseVaultLock() ? 'Unlock' : 'Lock' }} vault
      </button>
      <!--vault contents-->
      <div>
        <NFTGrid
          class="nes-container with-title"
          title="Vault contents"
          :nfts="fetchedVaultNFTs"
        >
          <div
            v-if="parseVaultLock()"
            class="locked flex-col justify-center items-center align-center"
          >
            <p class="mt-10">This vault is locked!</p>
          </div>
        </NFTGrid>
      </div>
    </div>
    <div v-else>This bank has no vaults yet :(</div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';
import { getNFTMetadataForMany, INFT } from '@/common/web3/NFTget';
import { initGemBank } from '@/common/gem-bank';
import useCluster from '@/composables/cluster';
import { PublicKey } from '@solana/web3.js';
import NFTGrid from '@/components/NFTGrid.vue';
import useWallet from '@/composables/wallet';
import VaultDetails from '@/components/VaultDetails.vue';
import { stringifyPKsAndBNs } from '@gemworks/gem-farm-ts';

export default defineComponent({
  components: { VaultDetails, NFTGrid },
  props: {
    bank: Object,
  },
  setup(props, ctx) {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gb: any;
    watch([wallet, cluster], async () => {
      gb = await initGemBank(getConnection(), getWallet()!);
      await loadVaults();
    });

    onMounted(async () => {
      if (getWallet()) {
        gb = await initGemBank(getConnection(), getWallet()!);
        await loadVaults();
      }
    });

    // --------------------------------------- view vault
    const selectedVault = ref<string>();
    const selectedVaultAcc = ref<any>();
    const selectedVaultIndex = ref<number>(0);

    const fetchedVaultList = ref<any[]>([]);
    const fetchedVaultNFTs = ref<INFT[]>();

    watch(selectedVault, async () => {
      updateVaultByPk();
      await loadNFTs();
    });

    const updateVaultByPk = () => {
      const idx = fetchedVaultList.value.findIndex(
        (fv) => fv.publicKey.toBase58() === selectedVault.value
      );
      selectedVaultIndex.value = idx;
      selectedVaultAcc.value = fetchedVaultList.value[idx].account;
    };

    const loadVaults = async () => {
      const vaults = await gb.fetchAllVaultPDAs(new PublicKey(props.bank!));

      if (vaults && vaults.length) {
        fetchedVaultList.value = vaults;
        console.log('found vaults', stringifyPKsAndBNs(vaults));

        selectedVault.value =
          vaults[selectedVaultIndex.value].publicKey.toBase58();
        updateVaultByPk();
        await loadNFTs();
      }
    };

    const parseVaultLock = () => {
      return selectedVaultAcc.value.locked;
    };

    const setVaultLock = async () => {
      await gb.setVaultLockWallet(
        new PublicKey(props.bank!),
        new PublicKey(selectedVault.value!),
        !parseVaultLock()
      );
      console.log('vault lock value changed to:', !parseVaultLock());
      await loadVaults();
    };

    const loadNFTs = async () => {
      //reset original contents
      fetchedVaultNFTs.value = [];

      const foundGDRs = await gb.fetchAllGdrPDAs(
        new PublicKey(selectedVault.value!)
      );

      if (foundGDRs && foundGDRs.length) {
        const mints = foundGDRs.map((gdr: any) => {
          return { mint: gdr.account.gemMint };
        });
        fetchedVaultNFTs.value = await getNFTMetadataForMany(
          mints,
          getConnection()
        );
      }
    };

    return {
      selectedVault,
      selectedVaultAcc,
      fetchedVaultList,
      fetchedVaultNFTs,
      setVaultLock,
      parseVaultLock,
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
