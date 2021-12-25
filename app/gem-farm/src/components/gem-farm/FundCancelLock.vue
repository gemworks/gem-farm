<template>
  <div class="nes-container with-title">
    <p class="title">Fund / Cancel / Lock Funding</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, watch } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { initGemFarm } from '@/common/gem-farm';
import { GemFarmClient } from '../../../../../tests/gem-farm/gem-farm.client';

export default defineComponent({
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
    });

    // --------------------------------------- fund / cancel / lock

    return {};
  },
});
</script>

<style scoped></style>
