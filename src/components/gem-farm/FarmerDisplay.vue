<template>
  <div class="nes-container with-title">
    <p class="title bg-dark">All Paladins </p>
    <!-- <div class="mb-2">
      state:
      <p class="inline-block">
        {{ parseFarmerState(farmerAcc) }}
      </p>
    </div> -->
    <div class="mb-2">Total NFTs: 1000</div>
    
    <div class="mb-2">NFTs Staked: {{ farmAcc.gemsStaked }}</div>
    <div class="mb-2">Total PALD Earned: {{ farmAcc.rewardA.funds.totalAccruedToStakers }}</div>
    <div class="mb-5">Percentage Staked: {{ farmAcc.gemsStaked * 100 / 1000 }}%
      <div class="progress bg-dark mt-1">
        <div class='progress-bar progress-bar-info bg-info' role='progressbar' aria-valuenow='100'
        aria-valuemin='0' aria-valuemax='1000' :style="{ 'width': farmAcc.gemsStaked * 100 / 1000  + '%'}">
        <span>{{ farmAcc.gemsStaked }} / 1000 </span>
        </div>
      </div>
    </div>
    
    <div class="flex mb-5 row">
      <div class="flex-1 m-2 col-sm-12">
        <FarmerRewardDisplay
          :key="farmerAcc.rewardA"
          :farmReward="farmAcc.rewardA"
          :reward="farmerAcc.rewardA"
          title="Your Rewards"
        />
      </div>
      <!-- <div class="flex-1 m-2 col-sm-12">
        <FarmerRewardDisplay
          :key="farmerAcc.rewardB"
          :farmReward="farmAcc.rewardB"
          :reward="farmerAcc.rewardB"
          title="Reward B"
        />
      </div> -->
    </div>
    <button class="btn is-dark mb-5" @click="refreshFarmer">
      Refresh account
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, watch } from 'vue';
import FarmerRewardDisplay from '@/components/gem-farm/FarmerRewardDisplay.vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { initGemFarm } from '@/common/gem-farm';
import { PublicKey } from '@solana/web3.js';
import { parseDate } from '@/common/util';

export default defineComponent({
  components: { FarmerRewardDisplay },
  props: {
    farm: String,
    farmAcc: Object,
    farmer: String,
    farmerAcc: Object,
  },
  emits: ['refresh-farmer'],
  setup(props, ctx) {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
    });

    //need an onmounted hook because this component isn't yet mounted when wallet/cluster are set
    onMounted(async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
      }
    });

    // --------------------------------------- display farmer
    // todo ideally should be using one from client, but n/a during render
    const parseFarmerState = (farmer: any): string => {
      return Object.keys(farmer.state)[0];
    };

    const refreshFarmer = async () => {
      await gf.refreshFarmerWallet(
        new PublicKey(props.farm!),
        new PublicKey(props.farmer!)
      );
      ctx.emit('refresh-farmer');
    };

    return {
      refreshFarmer,
      parseFarmerState,
      parseDate,
    };
  },
});

</script>

<style scoped>
.nes-container .with-title .title{
  background-color: black;
}

/* .progress-bar {
  width: 
} */
</style>
