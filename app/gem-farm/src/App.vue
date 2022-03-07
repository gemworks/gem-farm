<template>
  <div class="relative h-full min-h-screen"> <!--style="background-color: black;">-->
  <h1 style="text-align: center;">Baby Zilla Club Staking v0.0.1</h1>

    <div class="p-10">
      <router-view />
    </div>

    <div class="pt-10"></div>
    <TheCat />
    <TheFooter />
  </div>
</template>

<script>
import TheFooter from '@/components/gem-farm/TheFooter';
export default {
  components: { TheFooter },
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
