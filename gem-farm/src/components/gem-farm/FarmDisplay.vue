<template>
  <div class="mb-2">Associated bank: {{ farmAcc.bank }}</div>
  <!--config-->
  <div class="mb-2">Farm config:</div>
  <div class="mb-2 ml-5">
    Min staking period: {{ farmAcc.config.minStakingPeriodSec }} sec
  </div>
  <div class="mb-2 ml-5">
    Cooldown period: {{ farmAcc.config.cooldownPeriodSec }} sec
  </div>
  <div class="mb-2 ml-5">
    Unstaking fee: {{ farmAcc.config.unstakingFeeLamp }} lamp
  </div>

  <!--participating farmers/gems-->
  <div class="mb-2">Initialized farmer count: {{ farmAcc.farmerCount }}</div>
  <div class="mb-2">Staked farmer count: {{ farmAcc.stakedFarmerCount }}</div>
  <div class="mb-5">Gems staked: {{ farmAcc.gemsStaked }}</div>

  <div class="flex">
    <!--reward A-->
    <div class="flex-1 mr-5">
      <RewardDisplay
        :key="farmAcc.rewardA"
        :reward="farmAcc.rewardA"
        title="Reward A"
      />
    </div>
    <!--reward B-->
    <div class="flex-1">
      <RewardDisplay
        :key="farmAcc.rewardB"
        :reward="farmAcc.rewardB"
        title="Reward B"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import RewardDisplay from '@/components/gem-farm/RewardDisplay.vue';
export default defineComponent({
  components: { RewardDisplay },
  props: {
    farmAcc: Object,
  },
  setup() {
    return {};
  },
});
</script>

<style scoped></style>
