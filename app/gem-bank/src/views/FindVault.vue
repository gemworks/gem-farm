<template>
  <p>
    Fill in any of the below 4 fields to find a vault. If you search by
    bank/bank manager, you'll be presented with a list of vault IDs. If you
    search by vault/vault creator you'll be presented with actual contents.
  </p>

  <div class="nes-container with-title mt-10">
    <p class="title">Find vault(s)</p>

    <form @submit.prevent="loadVaults">
      <div class="nes-field mb-5">
        <label for="vaultCreator">By bank:</label>
        <input type="text" id="bank" class="mt-2 nes-input" v-model="bank" />
      </div>
      <div class="nes-field mb-5">
        <label for="vaultCreator">By bank manager:</label>
        <input
          type="text"
          id="bankManager"
          class="nes-input mt-2"
          v-model="bankManager"
        />
      </div>
      <div class="nes-field mb-5">
        <label for="vaultCreator">By vault:</label>
        <input type="text" id="vault" class="nes-input mt-2" v-model="vault" />
      </div>
      <div class="nes-field mb-5">
        <label for="vaultCreator">By vault creator:</label>
        <input
          type="text"
          id="vaultCreator"
          class="nes-input mt-2"
          v-model="vaultCreator"
        />
      </div>
      <button class="mt-5 nes-btn is-primary" type="submit">
        Find vault(s)
      </button>
    </form>
  </div>

  <NFTGrid
    v-if="vault || vaultCreator"
    class="nes-container with-title mt-10"
    :title="`${vaultCreator || vault} contents`"
    :nfts="fetchedVaultNFTs"
  />

  <div v-else-if="bank || bankManager" class="nes-container with-title mt-10">
    <p class="title">{{ bankManager || bank }} vaults</p>
    {{ fetchedVaultList }}
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { getNFTMetadataForMany, INFT } from '@/common/web3/NFTget';
import { initGemBank } from '@/common/gem-bank';
import useCluster from '@/composables/cluster';
import { PublicKey } from '@solana/web3.js';
import NFTGrid from '@/components/NFTGrid.vue';
export default defineComponent({
  components: { NFTGrid },
  setup() {
    const { cluster, getConnection } = useCluster();

    let gb: any;

    const bank = ref<string>();
    const bankManager = ref<string>();
    const vault = ref<string>();
    const vaultCreator = ref<string>();

    const fetchedVaultList = ref<string[]>();
    const fetchedVaultNFTs = ref<INFT[]>();

    onMounted(async () => {
      gb = await initGemBank(getConnection());
    });

    const loadByBank = async (bank: PublicKey) => {
      const vaults = await gb.fetchAllVaultPDAs(bank);
      if (vaults && vaults.length) {
        fetchedVaultList.value = vaults.map((v: any) => v.publicKey.toBase58());
      }
    };

    const loadByBankManager = async () => {
      const banks = await gb.fetchAllBankPDAs();
      if (banks && banks.length) {
        const bank = banks.filter(
          (b: any) => b.account.manager.toBase58() === bankManager.value
        )[0];
        await loadByBank(bank.publicKey);
      }
    };

    const loadByVault = async (vault: PublicKey) => {
      const foundGDRs = await gb.fetchAllGdrPDAs(vault);
      if (foundGDRs && foundGDRs.length) {
        const mints = foundGDRs.map((gdr: any) => {
          return { mint: gdr.account.gemMint };
        });
        fetchedVaultNFTs.value = await getNFTMetadataForMany(
          mints,
          getConnection()
        );
      }
    };

    const loadByVaultCreator = async () => {
      const vaults = await gb.fetchAllVaultPDAs();
      if (vaults && vaults.length) {
        const vault = vaults.filter(
          (v: any) => v.account.creator.toBase58() === vaultCreator.value
        )[0];
        await loadByVault(vault.publicKey);
      }
    };

    const loadVaults = async () => {
      if (vaultCreator.value) {
        await loadByVaultCreator();
      } else if (vault.value) {
        await loadByVault(new PublicKey(vault.value!));
      } else if (bankManager.value!) {
        await loadByBankManager();
      } else if (new PublicKey(bank.value!)) {
        await loadByBank(new PublicKey(bank.value!));
      }
    };

    return {
      bank,
      bankManager,
      vault,
      vaultCreator,
      loadVaults,
      fetchedVaultList,
      fetchedVaultNFTs,
    };
  },
});
</script>

<style scoped></style>
