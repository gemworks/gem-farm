<template>
  <div class="nes-container with-title">
    <p class="title">Farmer Details</p>
    <div class="mb-2">
      state:
      <p class="inline-block bg-yellow-200">{{ parseFarmerState(farmer) }}</p>
    </div>
    <div class="mb-2">Associated vault: {{ farmer.vault.toBase58() }}</div>
    <div class="mb-2">Gems staked: {{ farmer.gemsStaked }}</div>
    <div class="mb-2">Min staking ends: {{ farmer.minStakingEndsTs }}</div>
    <div class="mb-2">Cooldown ends: {{ farmer.cooldownEndsTs }}</div>

    <div class="flex">
      <div class="flex-1 mr-5">
        <FarmerRewardDisplay
          :farmReward="farm.rewardA"
          :reward="farmer.rewardA"
          title="Reward A"
        />
      </div>
      <div class="flex-1">
        <FarmerRewardDisplay
          :farmReward="farm.rewardB"
          :reward="farmer.rewardB"
          title="Reward B"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import FarmerRewardDisplay from '@/components/gem-farm/FarmerRewardDisplay.vue';
export default defineComponent({
  components: { FarmerRewardDisplay },
  props: {
    farmer: Object,
    farm: Object,
  },
  setup() {
    const parseFarmerState = (farmer: any): string => {
      return Object.keys(farmer.state)[0];
    };

    return {
      parseFarmerState,
    };
  },
});
</script>

<style scoped></style>
