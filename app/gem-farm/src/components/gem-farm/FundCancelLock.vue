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
    <div class="mb-5">
      Selected reward is
      <p class="inline-block bg-yellow-200">{{ activeRewardType }}</p>
    </div>

    <form @submit.prevent="fundReward">
      <!--fixed only-->
      <div v-if="activeRewardType === 'fixed'">
        <div class="flex mb-5">
          <div class="nes-field mr-5 flex-1">
            <label for="baseRate">Base rate (tokens/gem/s):</label>
            <input
              id="baseRate"
              type="text"
              class="nes-input"
              v-model="baseRate"
            />
          </div>
          <div class="nes-field flex-1">
            <label for="denominator">Denominator (divides all rates):</label>
            <input
              id="denominator"
              type="text"
              class="nes-input"
              v-model="denominator"
            />
          </div>
        </div>
        <!--t1-->
        <div class="flex mb-5">
          <div class="nes-field mr-5 flex-1">
            <label for="t1RewardRate">Tier 1 reward rate (tokens/gem/s):</label>
            <input
              id="t1RewardRate"
              type="text"
              class="nes-input"
              v-model="t1RewardRate"
            />
          </div>
          <div class="nes-field flex-1">
            <label for="t1RequiredTenure">Tier 1 required tenure (sec):</label>
            <input
              id="t1RequiredTenure"
              type="text"
              class="nes-input"
              v-model="t1RequiredTenure"
            />
          </div>
        </div>
        <!--t2-->
        <div class="flex mb-5">
          <div class="nes-field mr-5 flex-1">
            <label for="t2RewardRate">Tier 2 reward rate (tokens/gem/s):</label>
            <input
              id="t2RewardRate"
              type="text"
              class="nes-input"
              v-model="t2RewardRate"
            />
          </div>
          <div class="nes-field flex-1">
            <label for="t2RequiredTenure">Tier 2 required tenure (sec):</label>
            <input
              id="t2RequiredTenure"
              type="text"
              class="nes-input"
              v-model="t2RequiredTenure"
            />
          </div>
        </div>
        <!--t3-->
        <div class="flex mb-5">
          <div class="nes-field mr-5 flex-1">
            <label for="t3RewardRate">Tier 3 reward rate (tokens/gem/s):</label>
            <input
              id="t3RewardRate"
              type="text"
              class="nes-input"
              v-model="t3RewardRate"
            />
          </div>
          <div class="nes-field flex-1">
            <label for="t3RequiredTenure">Tier 3 required tenure (sec):</label>
            <input
              id="t3RequiredTenure"
              type="text"
              class="nes-input"
              v-model="t3RequiredTenure"
            />
          </div>
        </div>
      </div>

      <div class="nes-field mb-5">
        <label for="amount">Amount (total tokens):</label>
        <input id="amount" type="text" class="nes-input" v-model="amount" />
      </div>
      <div class="nes-field mb-5">
        <label for="duration">Duration (sec):</label>
        <input id="duration" type="text" class="nes-input" v-model="duration" />
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
import { PublicKey } from '@solana/web3.js';

export default defineComponent({
  props: {
    farm: String,
    farmAcc: Object,
  },
  emits: ['update-farm'],
  setup(props, ctx) {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
      }
    });

    //need an onmounted hook because this component isn't yet mounted when wallet/cluster are set
    onMounted(async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
        setRewardType(selectedReward.value);
      }
    });

    // --------------------------------------- fund / cancel / lock
    const selectedReward = ref<string>('rewardA');
    const activeRewardType = ref<string>();

    //fixed reward
    const baseRate = ref<string>();
    const denominator = ref<string>();
    const t1RewardRate = ref<string>();
    const t1RequiredTenure = ref<string>();
    const t2RewardRate = ref<string>();
    const t2RequiredTenure = ref<string>();
    const t3RewardRate = ref<string>();
    const t3RequiredTenure = ref<string>();

    const amount = ref<string>();
    const duration = ref<string>();

    const setRewardType = (selectedReward: string) => {
      activeRewardType.value = gf.parseRewardType(
        props.farmAcc![selectedReward]
      );
    };

    watch(selectedReward, (newReward: string) => {
      setRewardType(newReward);
    });

    const fundReward = async () => {
      if (activeRewardType.value === 'variable') {
        await gf.fundVariableRewardWallet(
          new PublicKey(props.farm!),
          new PublicKey(props.farmAcc![selectedReward.value].rewardMint),
          amount.value,
          duration.value
        );
      } else {
        await gf.fundFixedRewardWallet(
          new PublicKey(props.farm!),
          new PublicKey(props.farmAcc![selectedReward.value].rewardMint),
          amount.value,
          duration.value,
          baseRate.value,
          denominator.value,
          t1RewardRate.value,
          t1RequiredTenure.value,
          t2RewardRate.value,
          t2RequiredTenure.value,
          t3RewardRate.value,
          t3RequiredTenure.value
        );
      }
      ctx.emit('update-farm');
    };

    const cancelReward = async () => {
      await gf.cancelRewardWallet(
        new PublicKey(props.farm!),
        new PublicKey(props.farmAcc![selectedReward.value].rewardMint)
      );
      ctx.emit('update-farm');
    };

    const lockReward = async () => {
      await gf.lockRewardWallet(
        new PublicKey(props.farm!),
        new PublicKey(props.farmAcc![selectedReward.value].rewardMint)
      );
      ctx.emit('update-farm');
    };

    return {
      selectedReward,
      activeRewardType,
      baseRate,
      denominator,
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
