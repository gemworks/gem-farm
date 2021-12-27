<template>
  <div>
    <div class="mb-2">Base rate: {{ schedule.baseRate }} tokens/gem/s</div>
    <div class="mb-2" v-if="schedule.tier1">
      T1 reward rate:
      {{ schedule.tier1.rewardRate }} tokens/gem/s
    </div>
    <div class="mb-2" v-if="schedule.tier1">
      T1 required tenure:
      {{ schedule.tier1.requiredTenure }} sec
    </div>
    <!--tier 2-->
    <div class="mb-2" v-if="schedule.tier2">
      T2 reward rate:
      {{ schedule.tier2.rewardRate }} tokens/gem/s
    </div>
    <div class="mb-2" v-if="schedule.tier2">
      T2 required tenure:
      {{ schedule.tier2.requiredTenure }} sec
    </div>
    <!--tier 3-->
    <div class="mb-2" v-if="schedule.tier3">
      T3 reward rate:
      {{ schedule.tier3.rewardRate }} tokens/gem/s
    </div>
    <div class="mb-2" v-if="schedule.tier3">
      T3 required tenure:
      {{ schedule.tier3.requiredTenure }} sec
    </div>
    <div class="mb-2">
      Denominator:
      {{ schedule.denominator }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  props: {
    schedule: Object,
  },
  setup() {
    return {};
  },
});
</script>

<style scoped></style>
