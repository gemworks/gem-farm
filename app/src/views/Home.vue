<template>
  <ConfigPane />
  <div class="mt-2">hello world</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ConfigPane from '@/components/ConfigPane.vue';
export default defineComponent({
  components: { ConfigPane },
  setup() {
    return {};
  },
});
</script>

<style scoped></style>
