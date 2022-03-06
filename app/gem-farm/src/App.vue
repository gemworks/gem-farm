<template>
  <div class="relative h-full min-h-screen">
    <TheNavBar />
    <div class="pt-10 px-10 flex justify-center align-middle">
      <img :width="50" :height="50" src="./assets/400x600.gif" />
    </div>
    <div class="italic mt-5 text-center">Powered by: Gem-Farm by Gemworks</div>

    <div class="p-10">
      <router-view />
    </div>

    <div class="pt-10"></div>
    <TheCat />
    <TheFooter />
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
  font-family: 'Press Start 2P', monospace;
}
input[type='radio']:checked + span {
  @apply text-black;
}
</style>
