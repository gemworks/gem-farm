<template>
  <ConfigPane />
  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>
    <!--if a bank exists-->
    <div v-if="bank">
      <BankDetails
        v-if="bankAcc"
        :key="bankAcc"
        :bank="bank"
        :bankAcc="bankAcc"
        class="mb-10"
      />
      <TheWhitelist :bank="bank ? bank.toBase58() : undefined" class="mb-10" />
      <ManageVaults :bank="bank" :key="bank" />
    </div>
    <!--create a bank if one doesn't exist-->
    <div v-else class="text-center">
      <button class="nes-btn is-primary" @click="startBank">
        Start a new bank
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watch } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { PublicKey } from '@solana/web3.js';
import TheWhitelist from '@/components/TheWhitelist.vue';
import ConfigPane from '@/components/ConfigPane.vue';
import { initGemBank } from '@/common/gem-bank';
import BankDetails from '@/components/BankDetails.vue';
import { stringifyPKsAndBNs } from '@gemworks/gem-farm-ts';
import ManageVaults from '@/components/ManageVaults.vue';

export default defineComponent({
  components: { ManageVaults, BankDetails, ConfigPane, TheWhitelist },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gb: any;
    watch([wallet, cluster], async () => {
      gb = await initGemBank(getConnection(), getWallet()!);
      await fetchBank();
    });

    onMounted(async () => {
      if (getWallet()) {
        gb = await initGemBank(getConnection(), getWallet()!);
        await fetchBank();
      }
    });

    // --------------------------------------- manage bank
    const bank = ref<PublicKey>();
    const bankAcc = ref<any>();

    const fetchBank = async () => {
      //todo in theory you can have many banks per owner, but here making it easy
      const banks = await gb.fetchAllBankPDAs(getWallet()!.publicKey!);
      if (banks && banks.length) {
        bank.value = banks[0].publicKey;
        bankAcc.value = banks[0].account;
        console.log(
          `bank at ${bank.value!.toBase58()}:`,
          stringifyPKsAndBNs(bankAcc.value)
        );
      }
    };

    const startBank = async () => {
      const { bank: fetchedBank } = await gb.initBankWallet();
      bank.value = fetchedBank.publicKey;
      console.log('bank created', fetchedBank.publicKey.toBase58());
      await fetchBank();
    };

    return {
      bank,
      bankAcc,
      wallet,
      startBank,
    };
  },
});
</script>

<style scoped></style>
