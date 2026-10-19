# Deploying to a public testnet

The demo runs on a local Hardhat chain. To give judges a public, verifiable deployment:

1. **Create a fresh deployer wallet** (for example in MetaMask) and fund it from a Sepolia faucet. About 0.05 Sepolia ETH is enough: about 25 transactions of ~350k gas.
2. **Generate a new demo mnemonic** for the role keys (operators, verifiers, importers). Never use the public Hardhat mnemonic on a public network:
   ```powershell
   node -e "console.log(require('ethers').Wallet.createRandom().mnemonic.phrase)"
   ```
3. Copy `.env.example` to `.env` and fill in:
   ```
   DEPLOYER_PRIVATE_KEY=0x...
   SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   ETHERSCAN_API_KEY=...            # optional, for source verification
   EMISPASS_MNEMONIC="twelve words ..."
   ```
   Load the variables into the shell for Python, for example `Get-Content .env | % { if ($_ -match '^(\w+)=(.*)$') { Set-Item "env:$($matches[1])" ($matches[2].Trim('"')) } }`.
4. Run:
   ```powershell
   .\run-demo.ps1 -Network sepolia
   ```
   `anchor.js` funds the two importer addresses with 0.003 ETH each if they have no balance.
5. Verify the source code on Etherscan:
   ```powershell
   npx hardhat verify --network sepolia <FacilityRegistry> <deployer>
   npx hardhat verify --network sepolia <EmissionPassport> <deployer> <FacilityRegistry> 2
   ```
6. The dashboard reads the testnet: `http://localhost:8080/app/?network=sepolia`. If you host the repository on GitHub Pages, the same URL works publicly, and judges' browsers read Sepolia directly.

Use `--network baseSepolia` the same way. Base Sepolia faucets are listed in the Base docs.
