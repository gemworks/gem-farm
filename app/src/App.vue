<template>
  <div class="p-10">
    <router-view />
  </div>
</template>

<style>
* {
  font-family: 'Press Start 2P', monospace;
}
input[type='radio']:checked + span {
  @apply text-black;
}
</style>
