require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { DEPLOYER_PRIVATE_KEY, SEPOLIA_RPC_URL, BASE_SEPOLIA_RPC_URL, ETHERSCAN_API_KEY } = process.env;
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" },
  },
  networks: {
    localhost: { url: "http://127.0.0.1:8545" },
    sepolia: { url: SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", accounts, chainId: 11155111 },
    baseSepolia: { url: BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", accounts, chainId: 84532 },
  },
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  sourcify: { enabled: true },
};
