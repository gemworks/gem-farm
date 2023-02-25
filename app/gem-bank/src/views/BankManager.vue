<template>
  <ConfigPane />
  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>
    <!--if a bank exists-->

    <div v-for="(bank, i) in bankList" :key="i">
      <BankDetails :key="i" :bank="bank" :bankAcc="bankAcc[i]" class="mb-10" />
      <TheWhitelist :bank="bank.toBase58()" class="mb-10" />
      <ManageVaults :bank="bank" />
      <!--create a bank if one doesn't exist-->
      <br />

    </div>
    <div class="text-center">
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
    let bankList = ref<PublicKey[]>([]);
    let bankAcc = ref<any>([]);

    const fetchBank = async () => {
      //todo in theory you can have many banks per owner, but here making it easy
      const banks = (await gb.fetchAllBankPDAs(
        getWallet()!.publicKey!
      )) as any[];
      if (banks.length > 0) {
        for (const bank of banks) {
          bankList.value.push(bank.publicKey);
          bankAcc.value.push(bank.account);

          console.log(
            `bank at ${bank.publicKey.toBase58()}:`,
            stringifyPKsAndBNs(bank.account.value)
          );
        }
      }
    };

    const startBank = async () => {
      const { bank: fetchedBank } = await gb.initBankWallet();
      bankList.value.push(fetchedBank.publicKey);
      console.log('bank created', fetchedBank.publicKey.toBase58());
      await fetchBank();
    };

    return {
      bankList,
      bankAcc,
      wallet,
      startBank,
    };
  },
});
</script>

<style scoped></style>
