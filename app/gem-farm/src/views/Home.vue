<template>
  <div class="nes-container with-title mb-10">
    <p class="title">Welcome</p>
    <p>Welcome to Baby Zilla Club Staking Page</p>
    <p class="mt-5">
      T*Update With Instructions Later*
    </p>
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

