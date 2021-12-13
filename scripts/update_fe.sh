#grab old pk
old_pk=`solana-keygen pubkey ./target/deploy/gem_bank-keypair.json`
echo OLD PK: $old_pk

#stash old keypair
cd ./target/deploy
mv gem_bank-keypair.json gem_bank-keypair-`ls | wc -l | xargs`.json
cd ./../..

#build and grab new pk
anchor build
new_pk=`solana-keygen pubkey ./target/deploy/gem_bank-keypair.json`
echo BUILT, NEW PK: $new_pk

#insert into relevant files
sed -i'.original' -e "s/$old_pk/$new_pk/g" ./Anchor.toml
sed -i'.original' -e "s/$old_pk/$new_pk/g" ./programs/gem_bank/src/lib.rs
sed -i'.original' -e "s/$old_pk/$new_pk/g" ./app/src/globals.ts
echo REPLACED!

#need to build again with new pk
anchor build

#copy idl
cp ./target/idl/gem_bank.json ./app/public

#deploy!
anchor deploy --provider.cluster devnet
echo DEPLOYED TO DEVNET