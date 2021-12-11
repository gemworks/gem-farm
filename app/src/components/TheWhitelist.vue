<template>
  <div class="nes-container with-title">
    <p class="title">Whitelist settings</p>
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
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { WhitelistType } from '../../../tests/gem-bank/gem-bank.client';
import useCluster from '@/composables/cluster';
import useWallet from '@/composables/wallet';
import { initGemBank } from '@/common/gem-bank';
import { PublicKey } from '@solana/web3.js';

export default defineComponent({
  props: {
    bank: { type: String, required: true },
  },
  setup(props, ctx) {
    const action = ref<string>('add');
    const address = ref<string>('75ErM1QcGjHiPMX7oLsf9meQdGSUs4ZrwS2X8tBpsZhA');
    const type = ref<WhitelistType>(WhitelistType.Creator);

    const { getConnection } = useCluster();
    const { getWallet } = useWallet();

    let gb: any;
    onMounted(async () => {
      gb = await initGemBank(getConnection(), getWallet()!);
    });

    const updateWhitelist = async () => {
      console.log(props.bank);

      if (action.value === 'add') {
        const { txSig } = await gb.addToWhitelistWallet(
          new PublicKey(props.bank),
          new PublicKey(address.value),
          type.value
        );
        console.log('added', txSig);
      } else {
        const { txSig } = await gb.removeFromWhitelistWallet(
          new PublicKey(props.bank),
          new PublicKey(address.value)
        );
        console.log('removed', txSig);
      }
    };

    return {
      WhitelistType,
      action,
      address,
      type,
      updateWhitelist,
    };
  },
});
</script>

<style scoped></style>
