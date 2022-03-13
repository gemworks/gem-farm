<template>
  <div class="nes-container with-title">
    <p class="title">Whitelist Mints / Creators</p>
    <form @submit.prevent="updateWhitelist">
      <label>
        <input type="radio" class="nes-radio" value="add" v-model="action" />
        <span>Add</span>
      </label>
      <label>
        <input type="radio" class="nes-radio" value="remove" v-model="action" />
        <span>Remove</span>
      </label>

      <div class="nes-field class=mt-5">
        <label for="address">Address:</label>
        <input type="text" id="address" class="nes-input" v-model="address" />
      </div>

      <div class="mt-5">
        <label>
          <input
            type="radio"
            class="nes-radio"
            :value="WhitelistType.Creator"
            v-model="type"
          />
          <span>Creator</span>
        </label>
        <label>
          <input
            type="radio"
            class="nes-radio"
            :value="WhitelistType.Mint"
            v-model="type"
          />
          <span>Mint</span>
        </label>
      </div>

      <div class="mt-2">
        <button class="nes-btn is-primary">Update</button>
      </div>
    </form>

    <div class="mt-5">
      <div v-for="proof in proofs" :key="proof.address">
        {{ proof.account.whitelistedAddress.toBase58() }} -
        {{ parseWhitelistType(proof.account.whitelistType) }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';
import { WhitelistType } from '@gemworks/gem-farm-ts';
import useCluster from '@/composables/cluster';
import useWallet from '@/composables/wallet';
import { PublicKey } from '@solana/web3.js';
import { initGemFarm } from '@/common/gem-farm';

export default defineComponent({
  props: {
    farm: { type: String, required: true },
    bank: { type: String, required: true },
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
      await fetchProofs();
    });

    // --------------------------------------- whitelist
    const action = ref<string>('add');
    const address = ref<string>();
    const type = ref<WhitelistType>(WhitelistType.Creator);
    const proofs = ref<PublicKey[]>([]);

    const fetchProofs = async () => {
      proofs.value = await gf.fetchAllWhitelistProofPDAs(
        new PublicKey(props.bank)
      );
    };

    const updateWhitelist = async () => {
      if (action.value === 'add') {
        await gf.addToBankWhitelistWallet(
          new PublicKey(props.farm),
          new PublicKey(address.value!),
          type.value
        );
        await fetchProofs();
      } else {
        await gf.removeFromBankWhitelistWallet(
          new PublicKey(props.farm),
          new PublicKey(address.value!)
        );
        await fetchProofs();
      }
    };

    const parseWhitelistType = (numType: number) => {
      switch (numType) {
        case 1:
          return 'Creator';
        case 2:
          return 'Mint';
        case 3:
          return 'Mint + Whitelist';
        default:
          return 'unknown';
      }
    };

    return {
      WhitelistType,
      action,
      address,
      type,
      proofs,
      updateWhitelist,
      parseWhitelistType,
    };
  },
});
</script>

<style scoped></style>
