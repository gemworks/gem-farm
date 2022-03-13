<template>
  <div class="nes-container with-title">
    <p class="title">Authorize / Deauthorize Funders</p>
    <div class="flex">
      <!--authorize-->
      <form class="mr-5 flex-1" @submit.prevent="authorizeFunder">
        <div class="nes-field mb-5">
          <label for="authorizeFunder"></label>
          <input id="authorizeFunder" class="nes-input" v-model="toAuthorize" />
        </div>
        <button class="nes-btn is-primary mb-5">Authorize</button>
      </form>
      <!--DEauthorize-->
      <form class="flex-1" @submit.prevent="deauthorizeFunder">
        <div class="nes-field mb-5">
          <label for="deauthorizeFunder"></label>
          <input
            id="deauthorizeFunder"
            class="nes-input"
            v-model="toDeauthorize"
          />
        </div>
        <button class="nes-btn is-primary mb-5">Deauthorize</button>
      </form>
    </div>
    <!--list of current funders-->
    <div v-if="funders && funders.length" class="mb-5">
      <p class="mb-2">Authorized funders:</p>
      <div v-for="f in funders" :key="f.publicKey.toBase58()">
        {{ f.account.authorizedFunder.toBase58() }}
      </div>
    </div>
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
  },
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
      await getCurrentFunders(props.farm!);
    });

    // --------------------------------------- funders
    const toAuthorize = ref<string>();
    const toDeauthorize = ref<string>();
    const funders = ref<any[]>();

    const getCurrentFunders = async (farm: string) => {
      funders.value = await gf!.fetchAllAuthProofPDAs(new PublicKey(farm));
    };

    const authorizeFunder = async () => {
      await gf!.authorizeFunderWallet(
        new PublicKey(props.farm!),
        new PublicKey(toAuthorize.value!)
      );
      await getCurrentFunders(props.farm!);
    };

    const deauthorizeFunder = async () => {
      await gf!.deauthorizeFunderWallet(
        new PublicKey(props.farm!),
        new PublicKey(toDeauthorize.value!)
      );
      await getCurrentFunders(props.farm!);
    };

    return {
      funders,
      toAuthorize,
      toDeauthorize,
      authorizeFunder,
      deauthorizeFunder,
    };
  },
});
</script>

<style scoped></style>
