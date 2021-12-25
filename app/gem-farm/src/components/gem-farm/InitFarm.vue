<template>
  <div class="nes-container with-title">
    <p class="title">New Farm Config</p>
    <form @submit.prevent="initFarm">
      <!--reward A-->
      <div class="flex items-end mb-5">
        <div class="nes-field mr-5 w-9/12">
          <label for="mintA">Reward A mint:</label>
          <input type="text" id="mintA" class="nes-input" v-model="mintA" />
        </div>
        <div class="nes-select w-1/4">
          <select v-model="typeA">
            <option :value="RewardType.Variable">Variable</option>
            <option :value="RewardType.Fixed">Fixed</option>
          </select>
        </div>
      </div>
      <!--reward B-->
      <div class="flex items-end mb-5">
        <div class="nes-field mr-5 w-9/12">
          <label for="mintA">Reward B mint:</label>
          <input type="text" id="mintB" class="nes-input" v-model="mintB" />
        </div>
        <div class="nes-select w-1/4">
          <select v-model="typeB">
            <option :value="RewardType.Variable">Variable</option>
            <option :value="RewardType.Fixed">Fixed</option>
          </select>
        </div>
      </div>
      <!--FarmConfig-->
      <div class="nes-field mb-5">
        <label for="minStakingPeriodSec">Min staking period (sec)</label>
        <input
          type="number"
          id="minStakingPeriodSec"
          class="nes-input"
          v-model="minStakingPeriodSec"
        />
      </div>
      <div class="nes-field mb-5">
        <label for="cooldownPeriodSec">Cooldown period (sec)</label>
        <input
          type="number"
          id="cooldownPeriodSec"
          class="nes-input"
          v-model="cooldownPeriodSec"
        />
      </div>
      <div class="nes-field mb-5">
        <label for="unstakingFeeLamp">Unstaking fee (lamports)</label>
        <input
          type="number"
          id="unstakingFeeLamp"
          class="nes-input"
          v-model="unstakingFeeLamp"
        />
      </div>
      <button class="nes-btn is-primary mb-5" type="submit">Start farm*</button>
      <p class="mb-5">* this creates an associated Gem Bank automatically</p>
    </form>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue';
import useWallet from '../../composables/wallet';
import useCluster from '../../composables/cluster';
import { initGemFarm } from '@/common/gem-farm';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { RewardType } from '../../../../../tests/gem-farm/gem-farm.client';

export default defineComponent({
  setup(props, ctx) {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
    });

    // --------------------------------------- init farm
    const mintA = ref('HpoWeaMWCNwveUmXqryG3EnUJ3UacBCKqJEA7pG9EHhV');
    const typeA = ref(RewardType.Variable);
    const mintB = ref('CUaxcHnWqmsJjegT1EYXfVA3m76sbSRmFJGy4k5EgGgS');
    const typeB = ref(RewardType.Fixed);

    const minStakingPeriodSec = ref(0);
    const cooldownPeriodSec = ref(0);
    const unstakingFeeLamp = ref(0);

    const initFarm = async () => {
      const { farm, bank } = await gf.initFarmWallet(
        new PublicKey(mintA.value),
        typeA.value,
        new PublicKey(mintB.value),
        typeB.value,
        {
          minStakingPeriodSec: new BN(minStakingPeriodSec.value),
          cooldownPeriodSec: new BN(cooldownPeriodSec.value),
          unstakingFeeLamp: new BN(unstakingFeeLamp.value),
        }
      );
      console.log('new farm started!', farm.publicKey.toBase58());
      console.log('bank is', bank.publicKey.toBase58());

      ctx.emit('new-farm-bank', {
        farm: farm.publicKey.toBase58(),
        bank: bank.publicKey.toBase58(),
      });
    };

    return {
      wallet,
      RewardType,
      mintA,
      typeA,
      mintB,
      typeB,
      minStakingPeriodSec,
      cooldownPeriodSec,
      unstakingFeeLamp,
      initFarm,
    };
  },
});
</script>

<style scoped></style>
