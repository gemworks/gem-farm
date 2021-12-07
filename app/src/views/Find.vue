<template>
  <div>
    <!--<form @submit.prevent="loadVault">-->
    <!--  <div class="nes-field">-->
    <!--    <label for="vaultCreator">Vault Creator PK:</label>-->
    <!--    <input-->
    <!--      type="text"-->
    <!--      id="vaultCreator"-->
    <!--      class="nes-input"-->
    <!--      v-model="vaultCreator"-->
    <!--    />-->
    <!--  </div>-->
    <!--  <button class="mt-2 nes-btn is-primary" type="submit">-->
    <!--    Load vault-->
    <!--  </button>-->
    <!--</form>-->
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
export default defineComponent({
  setup() {
    const vaultCreator = ref<string>(
      'AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX'
    );
    return {};
  },
});
</script>

<style scoped></style>
