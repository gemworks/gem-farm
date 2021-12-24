<template>
  <div class="nes-container with-title">
    <p class="title">Create Test Reward Mint</p>
    <button class="nes-btn is-primary" @click="createTestReward">
      Create Test Mint
    </button>
    <div v-if="mint">
      <p class="my-2">
        🎉 New mint created and 1,000,000 tokens deposited into your wallet!
      </p>
      <p class="mb-5">Mint: {{ mint }}</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { initGemFarm } from '@/common/gem-farm';

export default defineComponent({
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
    });

    const mint = ref(undefined);

    const createTestReward = async () => {
      const { mint: rewardMint } = await gf.createTestReward(1000000);
      mint.value = rewardMint.toBase58();
      console.log(mint.value);
    };

    return {
      mint,
      createTestReward,
    };
  },
});
</script>

<style scoped></style>
