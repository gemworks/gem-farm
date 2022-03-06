<template>
  <div class="relative h-full min-h-screen content">
    <div class="pt-10 px-10 flex justify-center align-middle">
      <p class="text-4xl pt-3 px-1 mt-1 title text-white">Paladin</p>
      <img :width="80" :height="80" src="./assets/logo.png" />
      <p class="text-4xl pt-3 px-2 mt-1 title text-white">Board</p>
    </div>
    <!-- <div class="italic mt-5 text-center"></div> -->

    <div class="p-10">
      <router-view />
    </div>

    <div class="pt-10"></div>
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
@font-face {
  font-family: 'VT323-Regular';
  src: url('./assets/fonts/VT323-Regular.ttf');
}
* {
  font-family: 'VT323-Regular', monospace;
  cursor: url(https://cur.cursors-4u.net/sports/spo-1/spo15.cur), auto !important;
  color: white;
}
input[type='radio']:checked + span {
  @apply text-black;
}
.content {
  background: #303331;
}
.title {
  font-family: 'Blackadder ITC';
  font-weight: bold;
  margin-top: auto;
  margin-bottom: auto;
}
</style>
