<template>
  <div v-for="v in fetchedVaults" :key="v.publicKey.toBase58()" class="my-10">
    <NFTGrid :title="v.publicKey.toBase58()" :nfts="v.nfts" />
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import NFTGrid from '@/components/NFTGrid.vue';
import useCluster from '@/composables/cluster';
import { initGemBank } from '@/common/gem-bank';
import { getNFTMetadataForMany, INFT } from '@/common/web3/NFTget';
import { PublicKey } from '@solana/web3.js';

interface IFetchedVault {
  publicKey: PublicKey;
  account: any;
  nfts: INFT;
}

export default defineComponent({
  components: { NFTGrid },
  setup() {
    const { cluster, getConnection } = useCluster();

    let gb: any;
    const fetchedVaults = ref<IFetchedVault[]>([]);

    const fetchAll = async () => {
      const vaults = await gb.fetchAllVaultPDAs();
      if (vaults && vaults.length) {
        for (const v of vaults) {
          let nfts;
          const foundGDRs = await gb.fetchAllGdrPDAs(v.publicKey);
          if (foundGDRs && foundGDRs.length) {
            const mints = foundGDRs.map((gdr: any) => {
              return { mint: gdr.account.gemMint };
            });
            nfts = await getNFTMetadataForMany(mints, getConnection());
          }
          fetchedVaults.value.push({
            ...v,
            nfts,
          });
        }
      }
    };

    onMounted(async () => {
      gb = await initGemBank(getConnection());
      await fetchAll();
      console.log(fetchedVaults.value);
    });

    return {
      fetchedVaults,
    };
  },
});
</script>

<style scoped></style>
