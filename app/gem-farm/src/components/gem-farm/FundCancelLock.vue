<template>
  <div class="nes-container with-title">
    <p class="title">Fund / Cancel / Lock Funding</p>
    <!--switch between A and B rewards-->
    <p class="mb-2">Choose reward:</p>
    <div class="nes-select mb-5">
      <select required v-model="selectedReward">
        <option value="rewardA">Reward A</option>
        <option value="rewardB">Reward B</option>
      </select>
    </div>

    <form @submit.prevent="fundReward">
      <!--fixed only-->
      <div v-if="activeRewardType === 'fixed'">
        <div class="nes-field mb-5">
          <label for="baseRate">Base rate (tokens/gem/s):</label>
          <input
            id="baseRate"
            type="number"
            class="nes-input"
            v-model="baseRate"
          />
        </div>
        <div class="nes-field mb-5">
          <label for="t1RewardRate">Tier 1 reward rate (tokens/gem/s):</label>
          <input
            id="t1RewardRate"
            type="number"
            class="nes-input"
            v-model="t1RewardRate"
          />
        </div>
        <div class="nes-field mb-5">
          <label for="t1RequiredTenure">Tier 1 required tenure (sec):</label>
          <input
            id="t1RequiredTenure"
            type="number"
            class="nes-input"
            v-model="t1RequiredTenure"
          />
        </div>
        <div class="nes-field mb-5">
          <label for="t2RewardRate">Tier 2 reward rate (tokens/gem/s):</label>
          <input
            id="t2RewardRate"
            type="number"
            class="nes-input"
            v-model="t2RewardRate"
          />
        </div>
        <div class="nes-field mb-5">
          <label for="t2RequiredTenure">Tier 2 required tenure (sec):</label>
          <input
            id="t2RequiredTenure"
            type="number"
            class="nes-input"
            v-model="t2RequiredTenure"
          />
        </div>
        <div class="nes-field mb-5">
          <label for="t3RewardRate">Tier 3 reward rate (tokens/gem/s):</label>
          <input
            id="t3RewardRate"
            type="number"
            class="nes-input"
            v-model="t3RewardRate"
          />
        </div>
        <div class="nes-field mb-5">
          <label for="t3RequiredTenure">Tier 3 required tenure (sec):</label>
          <input
            id="t3RequiredTenure"
            type="number"
            class="nes-input"
            v-model="t3RequiredTenure"
          />
        </div>
      </div>

      <div class="nes-field mb-5">
        <label for="amount">Amount (total tokens):</label>
        <input id="amount" type="number" class="nes-input" v-model="amount" />
      </div>
      <div class="nes-field mb-5">
        <label for="duration">Duration (sec):</label>
        <input
          id="duration"
          type="number"
          class="nes-input"
          v-model="duration"
        />
      </div>
      <!--buttons-->
      <div class="flex mb-5">
        <button type="submit" class="nes-btn is-primary mr-5">Fund</button>
        <button
          type="button"
          class="nes-btn is-error mr-5"
          @click="cancelReward"
        >
          Cancel
        </button>
        <button type="button" class="nes-btn is-warning" @click="lockReward">
          Lock
        </button>
      </div>
    </form>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { initGemFarm } from '@/common/gem-farm';

export default defineComponent({
  props: {
    farm: String,
    farmAcc: Object,
  },
  setup(props, ctx) {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
      }
    });

    // --------------------------------------- fund / cancel / lock
    const selectedReward = ref('rewardA');
    const activeRewardType = ref();

    //fixed reward
    const baseRate = ref();
    const t1RewardRate = ref();
    const t1RequiredTenure = ref();
    const t2RewardRate = ref();
    const t2RequiredTenure = ref();
    const t3RewardRate = ref();
    const t3RequiredTenure = ref();

    const amount = ref();
    const duration = ref();

    const setRewardType = (selectedReward: string) => {
      activeRewardType.value = gf.parseRewardType(
        props.farmAcc![selectedReward]
      );
    };

    watch(selectedReward, (newReward: string) => {
      setRewardType(newReward);
    });

    const fundReward = async () => {};

    const cancelReward = async () => {};

    const lockReward = async () => {};

    // --------------------------------------- mounted
    //need an onmounted hook because this component isn't yet mounted when wallet/cluster are set
    onMounted(async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
        setRewardType(selectedReward.value);
      }
    });

    return {
      selectedReward,
      activeRewardType,
      baseRate,
      t1RewardRate,
      t1RequiredTenure,
      t2RewardRate,
      t2RequiredTenure,
      t3RewardRate,
      t3RequiredTenure,
      amount,
      duration,
      fundReward,
      cancelReward,
      lockReward,
    };
  },
});
</script>

<style scoped></style>
