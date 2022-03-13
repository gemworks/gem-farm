<template>
  <div class="footer pt-1 pb-1">
    <p class="px-3">Built with</p>
    <i class="nes-icon heart"></i>
    <p class="px-3">
      by
      <a
        class="nes-text is-primary"
        href="https://twitter.com/_ilmoi"
        target="_blank"
        >@_ilmoi</a
      >
      | powered by
      <a
        class="nes-text is-primary"
        href="https://twitter.com/GenesysGo"
        target="_blank"
        >GenesysGo</a
      >
    </p>
    <img src="../../assets/gg_logo.png" height="31" width="28" />
  </div>
</template>

<script>
export default {};
</script>

<style scoped>
.footer {
  @apply w-full flex justify-center align-middle bg-gray-200 text-center;
  position: absolute;
  bottom: 0px;
  height: 40px;
}
</style>
