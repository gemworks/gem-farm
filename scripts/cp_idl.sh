# ------- copy IDLs into apps
# bank
cp ./target/idl/gem_bank.json ./app/gem-bank/public/
# farm
cp ./target/idl/gem_bank.json ./app/gem-farm/public/
cp ./target/idl/gem_farm.json ./app/gem-farm/public/

# ------- copy types into SDK
cp -r ./target/types ./src/

echo IDLs and Types copied!