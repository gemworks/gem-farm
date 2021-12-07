<template>
  <ConfigPane />

  <div class="flex items-stretch">
    <NFTGrid title="Your wallet" class="flex-1" />
    <div class="m-2 flex flex-col justify-center items-center align-center">
      <ArrowButton @click="moveNFTs(false)" />
      <ArrowButton :left="true" @click="moveNFTs(true)" />
    </div>
    <NFTGrid title="Gem bank" class="flex-1" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ConfigPane from '@/components/ConfigPane.vue';
import NFTGrid from '@/components/NFTGrid.vue';
import ArrowButton from '@/components/ArrowButton.vue';
export default defineComponent({
  components: { ArrowButton, NFTGrid, ConfigPane },
  setup() {
    const moveNFTs = (moveLeft: boolean) => {};

    return {
      moveNFTs,
    };
  },
});
</script>

<style scoped></style>
