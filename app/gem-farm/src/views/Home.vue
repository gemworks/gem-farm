<template>
  <div class="nes-container with-title mb-10">
    <p class="title">Welcome to Gem Farm</p>
    <p>
      This app is designed to illustrate the functionality of Gem Farm. It is
      not production grade. Use at your own risk.
    </p>
  </div>
  <div class="flex flex-row">
    <div class="nes-container with-title flex-1 mr-5">
      <p class="title">Start/manage a farm</p>
      <p>
        Choose if you have your own NFT collection you'd like to offer staking
        for.
      </p>
      <button class="nes-btn is-primary">Start a farm</button>
    </div>
    <div class="nes-container with-title flex-1 ml-5">
      <p class="title">Stake your NFTs</p>
      <p>
        Choose if you'd like to stake your NFTs at one of the existing farms'.
      </p>
      <button class="nes-btn is-primary">Stake NFTs</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  setup() {
    return {};
  },
});
</script>
<style scoped></style>
