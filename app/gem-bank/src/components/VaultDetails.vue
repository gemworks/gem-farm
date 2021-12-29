<template>
  <div>
    <!--todo need to write a bytes to string fn-->
    <!--<div class="mb-2">Name: {{ vaultAcc.name }}</div>-->
    <div class="mb-2">Creator: {{ vaultAcc.creator.toBase58() }}</div>
    <div class="mb-2">Current owner: {{ vaultAcc.owner.toBase58() }}</div>
    <div class="mb-2">
      Currently locked:
      <p class="inline-block bg-yellow-200">{{ vaultAcc.locked }}</p>
    </div>
    <div class="mb-2">Mints stored: {{ vaultAcc.gemBoxCount }}</div>
    <div class="mb-2">Gems stored: {{ vaultAcc.gemCount }}</div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  props: {
    vaultAcc: Object,
  },
  setup() {
    return {};
  },
});
</script>

<style scoped></style>
