import { computed, readonly, ref, shallowRef, Ref } from 'vue';
import {
  getPhantomWallet,
  getSolflareWallet,
  getSolflareWebWallet,
  getSolletExtensionWallet,
  getSolletWallet,
  Wallet,
  WalletName,
} from '@solana/wallet-adapter-wallets';
import { PublicKey } from '@solana/web3.js';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';

const walletClass = ref<Wallet | null>(null);
const walletAdapter = ref<Ref<SignerWalletAdapter | null>>(shallowRef(null));

const walletMapping = {
  Phantom: getPhantomWallet,
  Sollet: getSolletWallet,
  'Sollet (Extension)': getSolletExtensionWallet,
  Solflare: getSolflareWallet,
  'Solflare (Web)': getSolflareWebWallet,
};

export default function useWallet() {
  const isConnected = computed(() => !!walletAdapter.value);

  const getWallet = (): SignerWalletAdapter | null => {
    if (walletAdapter.value) {
      return walletAdapter.value;
    }
    return null;
  };

  const setWallet = (newWallet: string | null, network: string) => {
    console.log('attempting to set wallet', newWallet, network.substr(0, 20));

    if (!newWallet) {
      console.log('removing active wallet');
      walletClass.value = null;
      walletAdapter.value = null; // don't think I need shallowRef here
      return;
    }

    const gottenWallet = (walletMapping as any)[newWallet!]({ network });
    const connectedAdapter = gottenWallet.adapter();
    connectedAdapter
      .connect()
      .then(() => {
        // only set the two if the call succeeds
        walletClass.value = gottenWallet;
        walletAdapter.value = connectedAdapter;
        console.log(
          'wallet successfully connected',
          newWallet,
          network.substr(0, 20)
        );
      })
      .catch(() => {
        console.log('oh no, failed to connect to wallet, try again');
        walletClass.value = null;
        walletAdapter.value = null;
      });
  };

  const getWalletName = (): WalletName | null => {
    if (walletClass.value) {
      return walletClass.value.name;
    }
    return null;
  };

  const getWalletAddress = (): PublicKey | null => {
    if (walletAdapter.value) {
      return walletAdapter.value.publicKey;
    }
    return null;
  };

  return {
    wallet: readonly(walletAdapter),
    isConnected,
    getWallet,
    setWallet,
    getWalletName,
    getWalletAddress,
  };
}
