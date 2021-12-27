<template>
  <div class="nes-container with-title">
    <p class="title">Update Farm</p>
    <form @submit.prevent="updateFarm">
      <div class="nes-field mb-5">
        <label for="manager">New farm manager</label>
        <input type="text" id="manager" class="nes-input" v-model="manager" />
      </div>
      <!--FarmConfig-->
      <div class="nes-field mb-5">
        <label for="minStakingPeriodSec">Min staking period (sec)</label>
        <input
          type="text"
          id="minStakingPeriodSec"
          class="nes-input"
          v-model="minStakingPeriodSec"
        />
      </div>
      <div class="nes-field mb-5">
        <label for="cooldownPeriodSec">Cooldown period (sec)</label>
        <input
          type="text"
          id="cooldownPeriodSec"
          class="nes-input"
          v-model="cooldownPeriodSec"
        />
      </div>
      <div class="nes-field mb-5">
        <label for="unstakingFeeLamp">Unstaking fee (lamports)</label>
        <input
          type="text"
          id="unstakingFeeLamp"
          class="nes-input"
          v-model="unstakingFeeLamp"
        />
      </div>
      <button class="nes-btn is-primary mb-5" type="submit">Update farm</button>
    </form>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';
import useWallet from '../../composables/wallet';
import useCluster from '../../composables/cluster';
import { initGemFarm } from '../../common/gem-farm';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

export default defineComponent({
  props: {
    farm: String,
  },
  emits: ['update-farm'],
  setup(props, ctx) {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
    });

    //needed coz mounts later
    onMounted(async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
      }
    });

    // --------------------------------------- update farm
    const manager = ref<string>();
    const minStakingPeriodSec = ref<string>();
    const cooldownPeriodSec = ref<string>();
    const unstakingFeeLamp = ref<string>();

    const updateFarm = async () => {
      let newConfig;
      if (
        minStakingPeriodSec.value ||
        cooldownPeriodSec.value ||
        unstakingFeeLamp.value
      ) {
        newConfig = {
          minStakingPeriodSec: new BN(minStakingPeriodSec.value!),
          cooldownPeriodSec: new BN(cooldownPeriodSec.value!),
          unstakingFeeLamp: new BN(unstakingFeeLamp.value!),
        };
      }

      await gf.updateFarmWallet(
        new PublicKey(props.farm!),
        newConfig,
        manager.value ? new PublicKey(manager.value) : undefined
      );
      ctx.emit('update-farm');
    };

    return {
      manager,
      minStakingPeriodSec,
      cooldownPeriodSec,
      unstakingFeeLamp,
      updateFarm,
    };
  },
});
</script>

<style scoped></style>
