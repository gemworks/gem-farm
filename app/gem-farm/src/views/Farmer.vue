<template>
  <ConfigPane />
  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>
    <!--farm address-->
    <div class="nes-container with-title mb-10">
      <p class="title">Manage Farmer</p>
      <div class="nes-field mb-5">
        <label for="farm">Farm:</label>
        <input id="farm" class="nes-input" v-model="farm" />
      </div>
      <button class="nes-btn is-primary mb-5" @click="findOrInitFarmer">
        Find/create Farmer
      </button>
    </div>

    <div v-if="farmerAcc">
      <FarmerDisplay
        :farm="farm"
        :farmAcc="farmAcc"
        :farmer="farmer"
        :farmerAcc="farmerAcc"
        class="mb-10"
      />
      <Vault class="mb-10" :vault="farmerAcc.vault.toBase58()" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { initGemFarm } from '@/common/gem-farm';
import { PublicKey } from '@solana/web3.js';
import ConfigPane from '@/components/ConfigPane.vue';
import FarmerDisplay from '@/components/gem-farm/FarmerDisplay.vue';
import Vault from '@/components/gem-bank/Vault.vue';
export default defineComponent({
  components: { Vault, FarmerDisplay, ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
      farmer.value = getWallet()!.publicKey?.toBase58();
    });

    // --------------------------------------- farmer
    const farm = ref<string>('4PcJxZEDkVs5bdHVtRMSoLZYvqKdaBoFP9s9VLzNWWPR');
    const farmAcc = ref<any>();
    const farmer = ref<string>();
    const farmerAcc = ref<any>();

    const findFarmer = async () => {
      const [farmerPDA] = await gf.findFarmerPDA(
        new PublicKey(farm.value!),
        getWallet()!.publicKey
      );
      farmer.value = getWallet()!.publicKey?.toBase58();
      farmerAcc.value = await gf.fetchFarmerAcc(farmerPDA);
      console.log('farmer is', farmerAcc.value);
    };

    const initFarmer = async () => {
      return gf.initFarmerWallet(new PublicKey(farm.value!));
    };

    const fetchFarn = async () => {
      farmAcc.value = await gf.fetchFarmAcc(new PublicKey(farm.value!));
      console.log('farm is', farmAcc.value);
    };

    const findOrInitFarmer = async () => {
      //fetch the farm first - we'll need it for reward type determination later
      await fetchFarn();
      try {
        await findFarmer();
      } catch (e) {
        await initFarmer();
        await findFarmer();
      }
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
      farm,
      farmAcc,
      farmer,
      farmerAcc,
      findOrInitFarmer,
    };
  },
});
</script>

<style scoped></style>
