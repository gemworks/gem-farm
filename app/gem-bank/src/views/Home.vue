<template>
  <div class="nes-container with-title mb-10">
    <p class="title">Welcome to Gem Bank</p>
    <p>
      This app is designed to illustrate the functionality of Gem Bank. It is
      not production grade. Use at your own risk.
    </p>
  </div>
  <div class="flex flex-row">
    <div class="nes-container with-title flex-1 mr-5">
      <p class="title">Start/manage a bank</p>
      <p class="mb-5">
        Choose this if you want to be able to create / lock / unlock vaults for
        vault owners.
      </p>
      <router-link to="bank">
        <button class="nes-btn is-primary">Start a bank</button>
      </router-link>
    </div>
    <div class="nes-container with-title flex-1 ml-5">
      <p class="title">Use your Vault</p>
      <p class="mb-5">
        Choose this if you'd like to use a vault opened with someone's bank.
      </p>
      <router-link to="vault">
        <button class="nes-btn is-primary">Use vault</button>
      </router-link>
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
