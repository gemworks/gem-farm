<template>
  <ConfigPane />
  <!--<div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>-->

  <!--<div v-else>-->
  <TestMint />

  <div class="nes-container with-title mt-10">
    <p class="title">New Farm Config</p>
    <form @submit.prevent="initFarm">
      <div class="flex items-end mb-5">
        <div class="nes-field mr-5 w-9/12">
          <label for="mintA">Reward A mint:</label>
          <input type="text" id="mintA" class="nes-input" />
        </div>
        <div class="nes-select w-1/4">
          <select>
            <option :value="RewardType.Variable">Variable</option>
            <option :value="RewardType.Fixed">Fixed</option>
          </select>
        </div>
      </div>

      <div class="flex items-end mb-5">
        <div class="nes-field mr-5 w-9/12">
          <label for="mintA">Reward B mint:</label>
          <input type="text" id="mintB" class="nes-input" />
        </div>
        <div class="nes-select w-1/4">
          <select>
            <option :value="RewardType.Variable">Variable</option>
            <option :value="RewardType.Fixed">Fixed</option>
          </select>
        </div>
      </div>
    </form>
  </div>

  <!--</div>-->
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ConfigPane from '@/components/ConfigPane.vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { RewardType } from '../../../../tests/gem-farm/gem-farm.client';
import TestMint from '@/components/TestMint.vue';

export default defineComponent({
  components: { TestMint, ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    return {
      wallet,
      RewardType,
    };
  },
});
</script>

<style scoped></style>
