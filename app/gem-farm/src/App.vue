<template>
  <TheNavBar />
  <div class="p-10">
    <router-view />
  </div>
</template>

<script>
import TheNavBar from '@/components/TheNavBar';
export default {
  components: { TheNavBar },
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
