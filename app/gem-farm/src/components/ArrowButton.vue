<template>
  <button :disabled="disabled">
    <img
      src="../assets/play.png"
      alt="right"
      :width="60"
      :height="60"
      :class="{ left: left, disabled: disabled }"
    />
  </button>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  props: {
    left: Boolean,
    disabled: Boolean,
  },
  setup() {
    return {};
  },
});
</script>

<style scoped>
button,
img {
  outline: none !important;
}

.left {
  transform: scaleX(-1);
}
.disabled {
  opacity: 0;
}
</style>
