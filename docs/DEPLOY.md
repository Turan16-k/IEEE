# Deploying to a public testnet

The demo runs on a local Hardhat chain. A public, verifiable deployment takes two commands and one faucet visit.

1. **Create the keys:**
   ```powershell
   node scripts/setup-testnet.js
   ```
   This writes a git-ignored `.env` with a fresh deployer key and a fresh 12-word mnemonic for the demo role keys (operators, verifiers, importers, feeds). It never overwrites an existing `.env`, and it prints the deployer address.
2. **Fund the deployer** with about 0.05 Sepolia ETH from a faucet, for example https://cloud.google.com/application/web3/faucet/ethereum/sepolia. That covers about 25 transactions of ~350k gas.
3. **Run the whole demo on Sepolia:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File run-demo.ps1 -Network sepolia
   ```
   It deploys, signs, verifies, anchors, runs the attack suite and funds the two importer addresses with 0.003 ETH each, then writes `deployments/sepolia.json` and `out/`.
4. **Optional: verify the source code on Etherscan.** Put an Etherscan API key in `.env`, then run:
   ```powershell
   npx hardhat verify --network sepolia <FacilityRegistry> <deployer>
   npx hardhat verify --network sepolia <EmissionPassport> <deployer> <FacilityRegistry> 2
   ```
5. **Publish:** commit `deployments/sepolia.json` and `out/`, then push. The public dashboard at `https://turan16-k.github.io/IEEE/app/?network=sepolia` then reads Sepolia live in every visitor's browser.

`--network baseSepolia` works the same way; Base Sepolia faucets are listed in the Base docs.
