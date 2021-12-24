<template>
  <ConfigPane />
  <div v-if="!wallet" class="text-center">Pls connect (burner) wallet</div>
  <div v-else>manager</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ConfigPane from '@/components/ConfigPane.vue';
import useWallet from '@/composables/wallet';
import useCluster from '@/composables/cluster';
export default defineComponent({
  components: { ConfigPane },
  setup() {
    const { wallet, getWallet } = useWallet();
    const { cluster, getConnection } = useCluster();

    return {
      wallet,
    };
  },
});
</script>

<style scoped></style>
