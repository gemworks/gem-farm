<template>
  <ConfigPane />
  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>
    <!--when farm initialized-->
    <div v-if="foundFarms && foundFarms.length">
      <!--farm selector-->
      <div class="nes-container with-title mb-10">
        <p class="title">Farms found</p>
        <div class="nes-select mb-5">
          <select v-model="farm">
            <option v-for="f in foundFarms" :key="f.publicKey.toBase58()">
              {{ f.publicKey.toBase58() }}
            </option>
          </select>
        </div>
        <div class="mb-5">Selected farm: {{ farm }}</div>
        <div class="mb-5">Associated bank: {{ bank }}</div>
      </div>
      <!--authorize funder-->
      <AuthorizeFunder :farm="farm" />
    </div>
    <!--when it's not-->
    <div v-else>
      <TestMint class="mb-10" />
      <InitFarm class="mb-10" @new-farm-bank="handleNewFarmBank" />
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
import { stringifyPubkeysAndBNInArray } from '../../../../../tests/utils/types';
import AuthorizeFunder from '@/components/gem-farm/AuthorizeFunder.vue';

export default defineComponent({
  components: { AuthorizeFunder, InitFarm, TestMint, ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
      await findFarmsByManager(getWallet()!.publicKey!);
    });

    const foundFarms = ref<any[]>([]);
    const farm = ref(undefined);
    const bank = ref(undefined);

    watch(farm, (newFarm: any) => {
      console.log('new farm is', newFarm);
      let ff = filterFoundFarmsByPk(newFarm);
      bank.value = ff.account.bank.toBase58();
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
      console.log(stringifyPubkeysAndBNInArray([foundFarms.value[0]]));

      //start by assinging the 1st one
      farm.value = foundFarms.value[0].publicKey.toBase58();
      bank.value = foundFarms.value[0].account.bank.toBase58();
    };

    const handleNewFarmBank = (obj: any) => {
      farm.value = obj.farm;
      bank.value = obj.bank;
    };

    return {
      wallet,
      foundFarms,
      farm,
      bank,
      handleNewFarmBank,
    };
  },
});
</script>

<style scoped></style>
