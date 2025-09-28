# Gem Farm 💎
_by Gemworks_

> [!WARNING]
> Gem farm was an experimental side project that has reached the end of its life.
>
> The code is fully open source so you can deploy your own version at any time (use [this fork](https://github.com/metaplex-foundation/gem-farm) from Metaplex, it’s up to date).
>
> Farmers (NFT holders): for convenience your NFTs have been sent back to you (our guess is you might not even remember you had them staked).
>
> Note 1: some NFT transfers failed and we don’t know why. If that’s you,  your NFT is still in the protocol and you can withdraw anytime.
>
> Note 2: rewards have not been auto-claimed. If you had accrued rewards, they’re there waiting for you. Go to the usual front-end and claim.
>
> Farms (NFT projects): your locked tokens have been unlocked. We don’t know where to send them back, so we just kept them in the program, but you can withdraw anytime. Also don’t forget to collect SOL from your treasuries.
>
> The following instructions are now deactivated to prevent future use of the protocol:
>
> - init bank
> - init vault
> - deposit gem
> - deposit gem pnft
> - initi farm
> - init farmer
> - flash deposit
> - flash deposit pnft
>
> All other instructions are still active, so you should be able to withdraw stuff.
> 
> Thank you for being a part of this experiment.

Gem Farm is a collection of on-chain Solana programs for NFT ("gem" 💎) staking.

It consists of:

- Gem Bank 🏦 - responsible for storing NFTs, lets you configure which mints are/not allowed into the vaults
- Gem Farm 🧑‍🌾 - responsible for issuing rewards, lets you configure fixed/variable rates, lock up periods, fees, rarities & more

Gem Bank is used under the hood by Gem Farm.

# Deploy your own version 🛠

- `git clone` the repo 
- Make sure you have `solana-cli` installed, keypair configured, and at least 10 sol on devnet beforehand
- Update path to your keypair in `Anchor.toml` that begins with `wallet =`
- Run `anchor build` to build the programs
- We need to update the program IDs:
    - Run `solana-keygen pubkey ./target/deploy/gem_bank-keypair.json` - insert the new Bank prog ID in the following locations:
        - `./Anchor.toml`
        - `./programs/gem_bank/src/lib.rs`
        - `./src/index.ts` (replace GEM_BANK_PROG_ID)
    - And `solana-keygen pubkey ./target/deploy/gem_farm-keypair.json` - insert the new Farm prog ID in the following locations:
        - `./Anchor.toml`
        - `./programs/gem_farm/src/lib.rs`
        - `./src/index.ts` (replace GEM_FARM_PROG_ID)
- Run `anchor build` to build one more time
- Run `anchor deploy --provider.cluster devnet` to deploy to devnet
- Now copy the IDLs into the apps:
    - `cp ./target/idl/gem_bank.json ./app/gem-bank/public`
    - `cp ./target/idl/gem_bank.json ./app/gem-farm/public`
    - `cp ./target/idl/gem_farm.json ./app/gem-farm/public`
- alternatively you can run the script I prepared `./scripts/cp_idl.sh`
- (!) IMPORTANT - run `yarn` inside the root of the repo
- finally start the apps!
    - eg cd into `app/gem-bank` and run yarn && yarn serve
- don't forget to open Chrome's console with `CMD+SHIFT+I` to get feedback from the app when you click buttons. It currently doesn't have a notifications system

Note that deploying your own version will cost you ~20 SOL.

# Debug cryptic errors ⚠️

If you get a cryptic error back that looks something like this: 
```
Transaction failed 0x1798
``` 
The steps to take are as follows:
- translate the 0x number into decimal (eg using [this](https://www.rapidtables.com/convert/number/hex-to-decimal.html?x=0x66)) - eg 0x1798 becomes 6040
- if the number is 6XXX, this is a custom error from the app. Go to errors.rs found [here](https://github.com/gemworks/gem-farm/blob/main/lib/gem_common/src/errors.rs) and find the error numbered 40 (the remainder of the decimal)
- any other number besides 6XXX means an anchor error - go [here](https://github.com/project-serum/anchor/blob/master/lang/src/error.rs) to decipher it

# License 🧾

MIT
