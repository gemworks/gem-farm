# Gem Farm 💎
_by Gemworks_

Gem Farm is a collection of on-chain Solana programs for NFT ("gem" 💎) staking.

It consists of:

- Gem Bank 🏦 - responsible for storing NFTs, lets you configure which mints are/not allowed into the vaults
- Gem Farm 🧑‍🌾 - responsible for issuing rewards, lets you configure fixed/variable rates, lock up periods, fees, rarities & more

Gem Bank is used under the hood by Gem Farm.

# Official deployment 🚀

Both programs are now officially deployed across all 3 networks (mainnet, devnet, testnet):
```
bank: bankHHdqMuaaST4qQk6mkzxGeKPHWmqdgor6Gs8r88m
farm: farmL4xeBFVXJqtfxCzU9b28QACM7E2W2ctT6epAjvE
```

There is a one-time 1.5 SOL fee to use gem-farm for the farm manager. 

# Deploy your own version 🛠

- `git clone` the repo 
- Make sure you have `solana-cli` installed, keypair configured, and at least 10 sol on devnet beforehand
- Update path to your keypair in `Anchor.toml` that begins with `wallet =`
- Run `anchor build` to build the programs
- We need to update the program IDs:
    - Run `solana-keygen pubkey ./target/deploy/gem_bank-keypair.json` - insert the new Bank prog ID in the following locations:
        - `./Anchor.toml`
        - `./programs/gem_bank/src/lib.rs`
        - `./app/gem-bank/src/globals.ts`
        - `./app/gem-farm/src/globals.ts`
    - And `solana-keygen pubkey ./target/deploy/gem_farm-keypair.json` - insert the new Farm prog ID in the following locations:
        - `./Anchor.toml`
        - `./programs/gem_farm/src/lib.rs`
        - `./app/gem-farm/src/globals.ts`
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
Transaction failed 0x141
``` 
The steps to take are as follows:
- translate the 0x number into decimal (eg using [this](https://www.rapidtables.com/convert/number/hex-to-decimal.html?x=0x66)) - eg 0x141 becomes 321
- if the first number is 3, this is a custom error from the app. Go to errors.rs found [here](https://github.com/gemworks/gem-farm/blob/main/lib/gem_common/src/errors.rs) and find the error numbered 21 (the remainder of the decimal)
- any other number besides 3 means an anchor error - go [here](https://github.com/project-serum/anchor/blob/master/lang/src/error.rs) to decipher it

# Docs ✏️

Extensive documentation is available [here](https://docs.gemworks.gg/).

The answer you're looking for is probably there. Pls don't DM with random questions.

# License 🧾

MIT
