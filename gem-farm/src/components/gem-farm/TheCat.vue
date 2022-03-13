<template>
  <div class="flex justify-center fork">
    <div v-if="showText" class="nes-balloon from-right balloon">
      <p>Fork me on Github</p>
    </div>
    <a href="https://github.com/gemworks/gem-farm" target="_blank" class="cat">
      <i
        @mouseover="showText = true"
        @mouseleave="showText = false"
        class="nes-octocat animate"
      ></i>
    </a>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';

export default defineComponent({
  setup() {
    const showText = ref(false);
    return {
      showText,
    };
  },
});
</script>

<style scoped>
.fork {
  position: fixed;
  bottom: 50px;
  right: 50px;
  height: 150px;
}

.balloon {
  width: 200px;
  align-self: flex-start;
}

.cat {
  align-self: flex-end;
}
</style>
