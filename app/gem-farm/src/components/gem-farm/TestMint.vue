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
import { defineComponent, ref } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { BrowserWallet } from '@gemworks/gem-farm-ts';

export default defineComponent({
  setup() {
    const { getWallet } = useWallet();
    const { getConnection } = useCluster();

    const mint = ref<string>();

    const createTestReward = async () => {
      const bw = new BrowserWallet(getConnection(), getWallet() as any);

      const { mint: rewardMint } = await bw.createMintAndFundATA(0, 1000000);
      mint.value = rewardMint.toBase58();
    };

    return {
      mint,
      createTestReward,
    };
  },
});
</script>

<style scoped></style>
