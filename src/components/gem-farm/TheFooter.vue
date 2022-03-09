<template>
  <div class="footer pt-1 pb-1">
      <a
        href='https://discord.gg/knighttemple'
        target='_blank'
        rel='noreferrer'
      >
        <img src="../../assets/discord.svg" height="31" width="28" />
      </a>
      <p class="px-3"></p>
      <a
        href='https://twitter.com/knighttemple'
        target='_blank'
        rel='noreferrer'
      >
        <img src="../../assets/twitter.svg" height="31" width="28" />
      </a>
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
  background-color: black;
}
</style>
