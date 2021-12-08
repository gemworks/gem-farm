<template>
  <div class="nes-container with-title">
    <p class="title">Find vaults</p>

    <form @submit.prevent="loadVault">
      <div class="nes-field mb-5">
        <label for="vaultCreator">By bank:</label>
        <input type="text" id="bank" class="mt-2 nes-input" v-model="bank" />
      </div>
      <div class="nes-field mb-5">
        <label for="vaultCreator">By bank manager:</label>
        <input
          type="text"
          id="bankManager"
          class="nes-input mt-2"
          v-model="bankManager"
        />
      </div>
      <div class="nes-field mb-5">
        <label for="vaultCreator">By vault:</label>
        <input type="text" id="vault" class="nes-input mt-2" v-model="vault" />
      </div>
      <div class="nes-field mb-5">
        <label for="vaultCreator">By vault creator:</label>
        <input
          type="text"
          id="vaultCreator"
          class="nes-input mt-2"
          v-model="vaultCreator"
        />
      </div>
      <button class="mt-5 nes-btn is-primary" type="submit">Load vault</button>
    </form>
  </div>

  <div class="nes-container with-title">
    <p class="title">{{ vault }} contents</p>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
export default defineComponent({
  setup() {
    const bank = ref<string>('CSwpBExQt1SqfQZbBVu4PVJ7qSR9VzVYvWdNHJnu13WJ');
    const bankManager = ref<string>(
      'AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX'
    );
    const vault = ref<string>('FLXfkFNbM7TULMBJqj2NxCyt3v2fqiShqrWzjgDUdxa9');
    const vaultCreator = ref<string>(
      'AGsJu1jZmFcVDPdm6bbaP54S3sMEinxmdiYWhaBBDNVX'
    );

    const loadVault = async () => {};

    return {
      bank,
      bankManager,
      vault,
      vaultCreator,
      loadVault,
    };
  },
});
</script>

<style scoped></style>
