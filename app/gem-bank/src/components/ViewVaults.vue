<template>
  <div class="nes-container with-title">
    <p class="title">View Vaults</p>
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
        v-if="selectedVaultAcc"
        :key="selectedVaultAcc"
        :vaultAcc="selectedVaultAcc"
      />
      <!--vault contents-->
      <div>
        <NFTGrid
          class="nes-container with-title mt-10"
          title="Vault contents"
          :nfts="fetchedVaultNFTs"
        />
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
import { stringifyPKsAndBNs } from '../../../../tests/gem-common/types';

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
      selectedVaultAcc.value = fetchedVaultList.value[idx].account;
    };

    const loadVaults = async () => {
      const vaults = await gb.fetchAllVaultPDAs(new PublicKey(props.bank!));

      if (vaults && vaults.length) {
        fetchedVaultList.value = vaults;
        console.log('found vaults', stringifyPKsAndBNs(vaults));

        selectedVault.value = vaults[0].publicKey.toBase58();
        await loadNFTs();
      }
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
    };
  },
});
</script>

<style scoped></style>
