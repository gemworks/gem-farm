#grab old pk
old_bank_pk=`solana-keygen pubkey ./target/deploy/gem_bank-keypair.json`
old_farm_pk=`solana-keygen pubkey ./target/deploy/gem_farm-keypair.json`
echo OLD BANK PK: $old_bank_pk
echo OLD FARM PK: $old_farm_pk

#stash old keypair
cd ./target/deploy #need to cd for renaming to work ok
mv gem_bank-keypair.json gem_bank-keypair-`ls | wc -l | xargs`.json
mv gem_farm-keypair.json gem_farm-keypair-`ls | wc -l | xargs`.json
cd ./../..

#build and grab new pk
anchor build
new_bank_pk=`solana-keygen pubkey ./target/deploy/gem_bank-keypair.json`
new_farm_pk=`solana-keygen pubkey ./target/deploy/gem_farm-keypair.json`
echo BUILT, NEW BANK PK: $new_bank_pk
echo BUILT, NEW FARM PK: $new_farm_pk

#insert into relevant files
sed -i'.original' -e "s/$old_bank_pk/$new_bank_pk/g" ./Anchor.toml
sed -i'.original' -e "s/$old_bank_pk/$new_bank_pk/g" ./programs/gem_bank/src/lib.rs
sed -i'.original' -e "s/$old_bank_pk/$new_bank_pk/g" ./app/gem-bank/src/globals.ts
sed -i'.original' -e "s/$old_bank_pk/$new_bank_pk/g" ./app/gem-farm/src/globals.ts
echo BANK REPLACED!
sed -i'.original' -e "s/$old_farm_pk/$new_farm_pk/g" ./Anchor.toml
sed -i'.original' -e "s/$old_farm_pk/$new_farm_pk/g" ./programs/gem_farm/src/lib.rs
sed -i'.original' -e "s/$old_farm_pk/$new_farm_pk/g" ./app/gem-farm/src/globals.ts
echo FARM REPLACED!

#need to build again with new pk
anchor build

#copy idl
#bank needs one
cp ./target/idl/gem_bank.json ./app/gem-bank/public
#farm needs both
cp ./target/idl/gem_bank.json ./app/gem-farm/public
cp ./target/idl/gem_farm.json ./app/gem-farm/public

#deploy!
#solana balance #to know if enough sol left for deployment
#anchor deploy --provider.cluster devnet
#echo DEPLOYED TO DEVNET
#solana balance
