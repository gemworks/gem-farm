<template>
  <ConfigPane />
  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>
    <div class="flex mb-10">
      <button
        class="nes-btn is-primary mr-5"
        @click="showNewFarm = !showNewFarm"
      >
        New farm
      </button>
      <button class="nes-btn is-primary" @click="loadFarms">Load farms</button>
    </div>
    <!--new farms-->
    <div v-if="showNewFarm">
      <TestMint class="mb-10" />
      <InitFarm class="mb-10" @new-farm="handleNewFarm" />
    </div>
    <!--existing farms-->
    <div v-if="foundFarms && foundFarms.length">
      <!--farm selector-->
      <div class="nes-container with-title mb-10">
        <p class="title">Farm Details</p>
        <p class="mb-2">Choose farm:</p>
        <div class="nes-select mb-5">
          <select v-model="farm">
            <option v-for="f in foundFarms" :key="f.publicKey.toBase58()">
              {{ f.publicKey.toBase58() }}
            </option>
          </select>
        </div>
        <div class="mb-2">Associated bank: {{ farmAcc.bank }}</div>
        <div class="mb-2">
          Initialized farmer count: {{ farmAcc.farmerCount }}
        </div>
        <div class="mb-2">
          Staked farmer count: {{ farmAcc.stakedFarmerCount }}
        </div>
        <div class="mb-2">Gems staked: {{ farmAcc.gemsStaked }}</div>
        <!--<div class="mb-2">Config: {{ farmAcc.config }}</div>-->
        <div class="flex">
          <!--reward A-->
          <div class="flex-1 mr-5">
            <RewardDisplay :reward="farmAcc.rewardA" title="Reward A" />
          </div>
          <!--reward B-->
          <div class="flex-1">
            <RewardDisplay :reward="farmAcc.rewardB" title="Reward B" />
          </div>
        </div>
      </div>
      <!--manage funders-->
      <AuthorizeFunder :farm="farm" class="mb-10" />
      <!--manage funding-->
      <FundCancelLock
        :farm="farm"
        :farmAcc="farmAcc"
        class="mb-10"
        @update-farm="handleUpdateFarm"
      />
      <!--refresh farmer-->
      <RefreshFarmer :farm="farm" class="mb-10" />
      <!--treasury payout-->
      <TreasuryPayout :farm="farm" class="mb-10" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';
import ConfigPane from '@/components/ConfigPane.vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import TestMint from '@/components/gem-farm/TestMint.vue';
import { initGemFarm } from '@/common/gem-farm';
import InitFarm from '@/components/gem-farm/InitFarm.vue';
import { PublicKey } from '@solana/web3.js';
import { stringifyPubkeysAndBNInArray } from '../../../../tests/utils/types';
import AuthorizeFunder from '@/components/gem-farm/AuthorizeFunder.vue';
import FundCancelLock from '@/components/gem-farm/FundCancelLock.vue';
import RewardDisplay from '@/components/gem-farm/RewardDisplay.vue';
import RefreshFarmer from '@/components/gem-farm/RefreshFarmer.vue';
import TreasuryPayout from '@/components/gem-farm/TreasuryPayout.vue';

export default defineComponent({
  components: {
    TreasuryPayout,
    RefreshFarmer,
    RewardDisplay,
    FundCancelLock,
    AuthorizeFunder,
    InitFarm,
    TestMint,
    ConfigPane,
  },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
      await findFarmsByManager(getWallet()!.publicKey!);
    });

    // --------------------------------------- farm locator
    const foundFarms = ref<any[]>([]);
    const farm = ref<string>();
    const farmAcc = ref<any>();

    watch(farm, (newFarm: any) => {
      let ff = filterFoundFarmsByPk(newFarm);
      farmAcc.value = ff.account;
    });

    const filterFoundFarmsByPk = (farm: string) => {
      return foundFarms.value.filter(
        (ff) => ff.publicKey.toBase58() === farm
      )[0];
    };

    const findFarmsByManager = async (manager: PublicKey) => {
      foundFarms.value = await gf.fetchAllFarmPDAs(manager);
      console.log(
        `found a total of ${
          foundFarms.value.length
        } farms for manager ${manager.toBase58()}`
      );
      console.log('PDAs are:', stringifyPubkeysAndBNInArray(foundFarms.value));

      //start by assigning the 1st one
      farm.value = foundFarms.value[0].publicKey.toBase58();
      farmAcc.value = foundFarms.value[0].account;
    };

    // --------------------------------------- rest
    const showNewFarm = ref<boolean>(false);

    const handleNewFarm = async (newFarm: string) => {
      farm.value = newFarm;
      await findFarmsByManager(getWallet()!.publicKey!);
    };

    const handleUpdateFarm = async () => {
      await findFarmsByManager(getWallet()!.publicKey!);
    };

    const loadFarms = async () => {
      await findFarmsByManager(getWallet()!.publicKey!);
    };

    // --------------------------------------- mounted
    //needed in case we switch in from another window
    onMounted(async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
      }
    });

    return {
      wallet,
      foundFarms,
      farm,
      farmAcc,
      handleNewFarm,
      handleUpdateFarm,
      showNewFarm,
      loadFarms,
    };
  },
});
</script>

<style scoped></style>
