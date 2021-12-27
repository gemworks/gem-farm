<template>
  <div class="nes-container with-title">
    <p class="title">{{ title }}</p>
    <div class="mb-2">Accrued reward: {{ reward.accruedReward }}</div>
    <div class="mb-2">Paid out reward: {{ reward.paidOutReward }}</div>
    <div v-if="parseRewardType(farmReward) === 'variable'">
      <div class="mb-2 w-full bg-black text-white">Variable reward:</div>
      <div class="mb-2">
        Last recorded accrued reward per gem:
        {{ reward.variableRate.lastRecordedAccruedRewardPerGem.n / 10 ** 15 }}
      </div>
    </div>
    <div v-else>
      <div class="mb-2 w-full bg-black text-white">Fixed reward:</div>
      <div class="mb-2">
        Staking begins: {{ reward.fixedRate.beginStakingTs }}
      </div>
      <div class="mb-2">
        Schedule begins: {{ reward.fixedRate.beginScheduleTs }}
      </div>
      <div class="mb-2">Last updated: {{ reward.fixedRate.lastUpdatedTs }}</div>
      <div class="mb-2">
        Promised duration: {{ reward.fixedRate.promisedDuration }}
      </div>
      <!--<div class="mb-2">-->
      <!--  Promised schedule: {{ reward.fixedRate.promisedSchedule }}-->
      <!--</div>-->
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  props: {
    reward: Object,
    farmReward: Object,
    title: String,
  },
  setup() {
    const parseRewardType = (reward: any): string => {
      //returns "variable" or "fixed"
      return Object.keys(reward.rewardType)[0];
    };

    return {
      parseRewardType,
    };
  },
});
</script>

<style scoped></style>
