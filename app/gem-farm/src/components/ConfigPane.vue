<template>
  <div class="flex justify-center mb-10 row">
    <!-- <div class="flex-1"></div> -->
    <div class="nes-select is-dark justify-center flex col-md-4 col-sm-12">
      <select required id="wallet" v-model="chosenWallet">
        <option class="text-gray-500" :value="null">Connect wallet..</option>
        <option :value="WalletName.Phantom">Phantom</option>
        <option :value="WalletName.Sollet">Sollet</option>
        <option :value="WalletName.SolletExtension">Sollet Extension</option>
        <option :value="WalletName.Solflare">Solflare</option>
        <option :value="WalletName.SolflareWeb">Solflare Web</option>
      </select>
    </div>
    <!-- <div class="flex-1"></div> -->
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue';
import { WalletName } from '@solana/wallet-adapter-wallets';
import useCluster, { Cluster } from '@/composables/cluster';
import useWallet from '@/composables/wallet';

export default defineComponent({
  setup() {
    // cluster
    const { cluster, setCluster, getClusterURL } = useCluster();
    const chosenCluster = computed({
      get() {
        return cluster.value;
      },
      set(newVal: Cluster) {
        setCluster(newVal);
      },
    });

    // wallet
    const { getWalletName, setWallet } = useWallet();
    const chosenWallet = computed({
      get() {
        return getWalletName();
      },
      set(newVal: WalletName | null) {
        setWallet(newVal, getClusterURL());
      },
    });

    return {
      Cluster,
      chosenCluster,
      WalletName,
      chosenWallet,
    };
  },
});
</script>

<style scoped>
  #wallet {
    font-size: 1.5em;
    text-align: center;
    border-image-source: none;
    border-top-style: dotted;
    border-right-style: solid;
    border-bottom-style: dotted;
    border-left-style: solid;
    border-radius: 5px;
    animation: effect 2s linear infinite;
  }
  div.nes-select.is-dark.flex::after {
    display: none;
  }
</style>
