<template>
  <div class="relative h-full min-h-screen">
    <!-- <TheNavBar /> -->
    <div class="justify-center align-center">
      <div class="pt-10 px-10 flex justify-center align-center">
        <div class="pt-10 px-10 flex justify-left align-left">
          <img :height=250 :width=250 src="./assets/IMSO_StakHub_logo.png" />
        </div>
        <div class="pt-10 px-10 flex font-thin justify-right align-right">
          <p class="text-4x1 pt-3 px-1 mt-1 text-white">
            <br>Stake your IMSO NFTs for Off$PRING Token.<br>
            <br>You may claim your $SPRING at any time. <br>
            <br>Current Overlord Unique staking rewards: 2000 $SPRING / day
            <br>Current Overlord Clone staking rewards: 1200 $SPRING / day
            <br>Current Chimp staking rewards: 400 $SPRING / day<br>
          </p>
        </div>
      </div> 
    </div>

    <div class="p-10">
      <router-view />
    </div>

    <div class="pt-10"></div>
<!--    <TheCat />
    <TheFooter />
-->
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
  font-family: 'Exo 2', sans-serif; 
}
body {
  background-image: url("./assets/staking_ui_bg.jpg");
}
input[type='radio']:checked + span {
  @apply text-black;
}
</style>
