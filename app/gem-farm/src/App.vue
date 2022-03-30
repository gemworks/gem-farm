<template>
  <div class="relative h-full min-h-screen">
    <div class="p-10">
      <router-view />
    </div>

    <div class="pt-10"></div>
  </div>
</template>

<script>
import TheNavBar from '@/components/TheNavBar';
import TheFooter from '@/components/gem-farm/TheFooter';
import TheCat from '@/components/gem-farm/TheCat';
export default {
  components: { TheCat, TheFooter, TheNavBar },
};
</script>

<style>
* {
  /* font-family: 'Press Start 2P', monospace; */
  cursor: auto;
}
input[type='radio']:checked + span {
  @apply text-black;
}
</style>
