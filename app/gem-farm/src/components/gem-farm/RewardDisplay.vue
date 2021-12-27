<template>
  <div class="nes-container with-title">
    <p class="title">{{ title }}</p>
    <div class="mb-2">Type: {{ parseRewardType(reward) }}</div>
    <div class="mb-2">Mint: {{ parseRewardMint(reward) }}</div>

    <!--config-->
    <div class="mb-2 w-full bg-black text-white">Config:</div>
    <div v-if="parseRewardType(reward) === 'variable'">
      <div class="mb-2">
        Reward rate: {{ reward.variableRate.rewardRate.n / 10 ** 15 }}
      </div>
      <div class="mb-2">
        Accrued reward / gem:
        {{ reward.variableRate.accruedRewardPerGem.n / 10 ** 15 }}
      </div>
      <div class="mb-2">
        Reward last updated: {{ reward.variableRate.rewardLastUpdatedTs }}
      </div>
      <div class="mb-2"></div>
    </div>
    <div v-else>
      <div class="mb-2">
        Reserved amount: {{ reward.fixedRate.reservedAmount }}
      </div>
      <div class="mb-2">
        Base rate: {{ reward.fixedRate.schedule.baseRate }}
      </div>
      <div class="mb-2" v-if="reward.fixedRate.schedule.tier1">
        T1 reward rate:
        {{ reward.fixedRate.schedule.tier1.rewardRate }} tokens/gem/s
      </div>
      <div class="mb-2" v-if="reward.fixedRate.schedule.tier1">
        T1 required tenure:
        {{ reward.fixedRate.schedule.tier1.requiredTenure }} sec
      </div>
      <!--tier 2-->
      <div class="mb-2" v-if="reward.fixedRate.schedule.tier2">
        T2 reward rate:
        {{ reward.fixedRate.schedule.tier2.rewardRate }} tokens/gem/s
      </div>
      <div class="mb-2" v-if="reward.fixedRate.schedule.tier2">
        T2 required tenure:
        {{ reward.fixedRate.schedule.tier2.requiredTenure }} sec
      </div>
      <!--tier 3-->
      <div class="mb-2" v-if="reward.fixedRate.schedule.tier3">
        T3 reward rate:
        {{ reward.fixedRate.schedule.tier3.rewardRate }} tokens/gem/s
      </div>
      <div class="mb-2" v-if="reward.fixedRate.schedule.tier3">
        T3 required tenure:
        {{ reward.fixedRate.schedule.tier3.requiredTenure }} sec
      </div>
    </div>

    <!--funds-->
    <div class="mb-2 w-full bg-black text-white">Funds:</div>
    <div class="mb-2">Funded: {{ reward.funds.totalFunded }}</div>
    <div class="mb-2">Refunded: {{ reward.funds.totalRefunded }}</div>
    <div class="mb-2">Accrued: {{ reward.funds.totalAccruedToStakers }}</div>

    <!--times-->
    <div class="mb-2 w-full bg-black text-white">Times:</div>
    <div class="mb-2">Duration: {{ reward.times.durationSec }}</div>
    <div class="mb-2">Reward end: {{ reward.times.rewardEndTs }}</div>
    <div class="mb-2">Lock end: {{ reward.times.lockEndTs }}</div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  props: {
    reward: Object,
    title: String,
  },
  setup() {
    // todo ideally should be using one from client, but n/a during render
    const parseRewardType = (reward: any): string => {
      //returns "variable" or "fixed"
      return Object.keys(reward.rewardType)[0];
    };

    const parseRewardConfig = (reward: any) => {
      const type = parseRewardType(reward);
      if (type === 'variable') {
        return reward.variableRate;
      } else {
        return reward.fixedRate;
      }
    };

    const parseRewardMint = (reward?: any) => {
      return `${reward.rewardMint.toBase58().substr(0, 10)}...`;
    };

    return {
      parseRewardType,
      parseRewardConfig,
      parseRewardMint,
    };
  },
});
</script>

<style scoped></style>
