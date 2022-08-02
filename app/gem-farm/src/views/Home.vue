<template>
  <div class="nes-container with-title mb-10">
    <p class="title">Welcome</p>
    <p>Welcome to Gem Farm 💎 - the #1 NFT Staking solution on Solana!</p>
    <p class="mt-5">
      ABCDEFGHIJKLMNOP
    </p>
    <p class="mt-5">
      KIMJEONGSOO
      <router-link to="/farmer" class="text-blue-700">FARMER</router-link> tab
      and enter the farm address (ask your NFT project for it).
    </p>
    <p class="mt-5">
      You can find the docs
      <a class="text-blue-600" href="https://docs.gemworks.gg/" target="_blank"
        >here</a
      >.
    </p>
    <p class="mt-5">
      Gem Farm is deployed at:
      <span class="bg-yellow-100">{{ GEM_FARM_PROG_ID }}</span>
    </p>
  </div>
  <div class="flex flex-row">
    <div class="nes-container with-title flex-1 mr-5">
      <p class="title">Start/manage a farm</p>
      <p class="mb-5">
        Choose this if you have your own NFT collection you'd like to offer
        staking for.
      </p>
      <router-link to="manager">
        <button class="nes-btn is-primary">ww</button>
      </router-link>
    </div>
    <div class="nes-container with-title flex-1 ml-5">
      <p class="title">Stake your NFTs</p>
      <p class="mb-5">
        Choose this if you'd like to stake your NFTs at one of the existing
        farms.
      </p>
      <router-link to="farmer">
        <button class="nes-btn is-primary">ss</button>
      </router-link>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { GEM_FARM_PROG_ID } from '@gemworks/gem-farm-ts';
export default defineComponent({
  setup() {
    return {
      GEM_FARM_PROG_ID,
    };
  },
});
</script>
<style scoped></style>
