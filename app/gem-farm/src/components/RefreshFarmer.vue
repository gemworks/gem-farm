<template>
  <div class="nes-container with-title">
    <p class="title">Refresh Farmer</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, watch } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { initGemFarm } from '@/common/gem-farm';
import { RewardType } from '../../../../tests/gem-farm/gem-farm.client';

export default defineComponent({
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
    });

    // --------------------------------------- refresh farmer

    return {};
  },
});
</script>

<style scoped></style>
