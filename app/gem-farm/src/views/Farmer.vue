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
        @refresh-farmer="handleRefreshFarmer"
      />
      <Vault
        v-if="renderVault"
        class="mb-10"
        :vault="farmerAcc.vault.toBase58()"
        @selected-wallet-nft="handleNewSelectedNFT"
      >
        <button
          v-if="farmerState === 'staked' && selectedNFTs.length > 0"
          class="nes-btn is-primary mr-5"
          @click="addGems"
        >
          Add Gems (resets staking)
        </button>
        <button
          v-if="farmerState === 'unstaked'"
          class="nes-btn is-success mr-5"
          @click="beginStaking"
        >
          Begin staking
        </button>
        <button
          v-if="farmerState === 'staked'"
          class="nes-btn is-error mr-5"
          @click="endStaking"
        >
          End staking
        </button>
        <button
          v-if="farmerState === 'pendingCooldown'"
          class="nes-btn is-error mr-5"
          @click="endStaking"
        >
          End cooldown
        </button>
        <button class="nes-btn is-warning" @click="claim">
          Claim {{ availableA }} A / {{ availableB }} B
        </button>
      </Vault>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, nextTick, onMounted, ref, watch } from 'vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
import { initGemFarm } from '@/common/gem-farm';
import { PublicKey } from '@solana/web3.js';
import ConfigPane from '@/components/ConfigPane.vue';
import FarmerDisplay from '@/components/gem-farm/FarmerDisplay.vue';
import Vault from '@/components/gem-bank/Vault.vue';
import { INFT } from '@/common/web3/NFTget';
import { stringifyPubkeysAndBNsInObject } from '../../../../tests/utils/types';

export default defineComponent({
  components: { Vault, FarmerDisplay, ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    let gf: any;
    watch([wallet, cluster], async () => {
      gf = await initGemFarm(getConnection(), getWallet()!);
      farmerIdentity.value = getWallet()!.publicKey?.toBase58();
    });

    //needed in case we switch in from another window
    onMounted(async () => {
      if (getWallet() && getConnection()) {
        gf = await initGemFarm(getConnection(), getWallet()!);
        farmerIdentity.value = getWallet()!.publicKey?.toBase58();
      }
    });

    // --------------------------------------- farmer details
    const farm = ref<string>('CkgZGhXnthqkATu5UTVa4CEhGWcfTBLMoHRd1demNv3a');
    const farmAcc = ref<any>();

    const farmerIdentity = ref<string>();
    const farmerAcc = ref<any>();
    const farmerState = ref<string>();

    const availableA = ref<string>();
    const availableB = ref<string>();

    const updateAvailableRewards = async () => {
      availableA.value = farmerAcc.value.rewardA.accruedReward
        .sub(farmerAcc.value.rewardA.paidOutReward)
        .toString();
      availableB.value = farmerAcc.value.rewardB.accruedReward
        .sub(farmerAcc.value.rewardB.paidOutReward)
        .toString();
    };

    const fetchFarn = async () => {
      farmAcc.value = await gf.fetchFarmAcc(new PublicKey(farm.value!));
      console.log(
        `farm found at ${farm.value}:`,
        stringifyPubkeysAndBNsInObject(farmAcc.value)
      );
    };

    const fetchFarmer = async () => {
      const [farmerPDA] = await gf.findFarmerPDA(
        new PublicKey(farm.value!),
        getWallet()!.publicKey
      );
      console.log('farmer PDA', farmerPDA.toBase58());
      farmerIdentity.value = getWallet()!.publicKey?.toBase58();
      farmerAcc.value = await gf.fetchFarmerAcc(farmerPDA);
      farmerState.value = gf.parseFarmerState(farmerAcc.value);
      await updateAvailableRewards();
      console.log(
        `farmer found at ${farmerIdentity.value}:`,
        stringifyPubkeysAndBNsInObject(farmerAcc.value)
      );
    };

    const initFarmer = async () => {
      return gf.initFarmerWallet(new PublicKey(farm.value!));
    };

    const findOrInitFarmer = async () => {
      //fetch the farm first - we'll need it for reward type determination later
      await fetchFarn();
      try {
        await fetchFarmer();
      } catch (e) {
        console.log('uh oh there was an error when finding farmer:', e);
        await initFarmer();
        await fetchFarmer();
      }
    };

    // --------------------------------------- staking
    const beginStaking = async () => {
      await gf.stakeWallet(new PublicKey(farm.value!));
      await refreshVault();
      await fetchFarmer();
    };

    const endStaking = async () => {
      await gf.unstakeWallet(new PublicKey(farm.value!));
      await refreshVault();
      await fetchFarmer();
    };

    const claim = async () => {
      await gf.claimWallet(
        new PublicKey(farm.value!),
        new PublicKey(farmAcc.value.rewardA.rewardMint!),
        new PublicKey(farmAcc.value.rewardB.rewardMint!)
      );
      await fetchFarmer();
    };

    const renderVault = ref<boolean>(true);

    const refreshVault = async () => {
      renderVault.value = false;
      await nextTick();
      renderVault.value = true;
    };

    const handleRefreshFarmer = async () => {
      await fetchFarmer();
    };

    // --------------------------------------- adding extra gem
    const selectedNFTs = ref<INFT[]>([]);

    const handleNewSelectedNFT = (newSelectedNFTs: INFT[]) => {
      console.log(`presently selected ${newSelectedNFTs.length} NFTs`);
      selectedNFTs.value = newSelectedNFTs;
    };

    const addSingleGem = async (gemMint: PublicKey, gemSource: PublicKey) => {
      await gf.flashDepositWallet(
        new PublicKey(farm.value!),
        '1',
        gemMint,
        gemSource
      );
      await refreshVault();
      await fetchFarmer();
    };

    const addGems = async () => {
      await Promise.all(
        selectedNFTs.value.map((nft) => {
          addSingleGem(nft.mint, nft.pubkey!);
        })
      );
      console.log(
        `added another ${selectedNFTs.value.length} gems into staking vault`
      );
    };

    return {
      wallet,
      farm,
      farmAcc,
      farmer: farmerIdentity,
      farmerAcc,
      farmerState,
      availableA,
      availableB,
      findOrInitFarmer,
      beginStaking,
      endStaking,
      claim,
      handleRefreshFarmer,
      selectedNFTs,
      handleNewSelectedNFT,
      addGems,
      renderVault,
    };
  },
});
</script>

<style scoped></style>
