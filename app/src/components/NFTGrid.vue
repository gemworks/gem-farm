<template>
  <div class="nes-container with-title">
    <p class="title">{{ title }}</p>
    <div class="flex flex-wrap">
      <NFTCard v-for="nft in nfts" :key="nft" :nft="nft" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue';
import NFTCard from '@/components/NFTCard.vue';
import { getNFTsByOwner, INFT } from '@/common/nft/get';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';

export default defineComponent({
  components: { NFTCard },
  props: {
    title: String,
  },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    const nfts = ref<INFT[]>([]);

    const getNFTs = async () => {
      if (getWallet()) {
        nfts.value = await getNFTsByOwner(
          getWallet()!.publicKey!,
          getConnection()
        );
      }
    };

    watch([wallet, cluster], async () => {
      await getNFTs();
    });

    return {
      nfts,
    };
  },
});
</script>

<style scoped></style>
