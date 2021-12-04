import * as anchor from "@project-serum/anchor";
import { clusterApiUrl, PublicKey } from "@solana/web3.js";

function getClusterUrl(nameOrUrl: string) {
  if (["localnet", "localhost"].includes(nameOrUrl)) {
    return "https://localhost:8899";
  } else if (nameOrUrl == "devnet" || nameOrUrl == "mainnet-beta") {
    return clusterApiUrl(nameOrUrl);
  } else {
    return nameOrUrl;
  }
}

export function getProviderForClusterUrl(nameOrUrl: string) {
  const clusterUrl = getClusterUrl(nameOrUrl);
  return anchor.Provider.local(clusterUrl);
}