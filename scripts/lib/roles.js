// Demo role keys derived from one mnemonic; must match verifier/emispass/crypto.py ROLE_INDEX.
const { ethers } = require("ethers");

const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";
const ROLE_INDEX = {
  admin: 0,
  "operator:1": 1,
  "operator:2": 2,
  "operator:3": 3,
  "verifier:1": 4,
  "verifier:2": 5,
  "verifier:3": 6,
  "importer:A": 7,
  "importer:B": 8,
  "feed:grid-meter": 9,
  "feed:fuel-supplier": 10,
  attacker: 11,
};

function roleWallet(role, provider) {
  // The local chain always uses the Hardhat mnemonic, even when .env (loaded by hardhat.config.js)
  // holds a testnet mnemonic.
  const local = ["localhost", "hardhat", undefined].includes(process.env.HARDHAT_NETWORK);
  const phrase = (!local && process.env.EMISPASS_MNEMONIC) || HARDHAT_MNEMONIC;
  const wallet = ethers.HDNodeWallet.fromPhrase(phrase, undefined, `m/44'/60'/0'/0/${ROLE_INDEX[role]}`);
  return provider ? wallet.connect(provider) : wallet;
}

module.exports = { ROLE_INDEX, roleWallet };
