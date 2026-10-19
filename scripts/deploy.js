// Deploys FacilityRegistry + EmissionPassport (2-of-3 verifiers) and registers the demo facilities.
// Usage: npx hardhat run scripts/deploy.js --network localhost|sepolia|baseSepolia
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { roleWallet } = require("./lib/roles");

const ROOT = path.resolve(__dirname, "..");
const THRESHOLD = 2;

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const datasetPath = path.join(ROOT, "data", "demo", "dataset.json");
  if (!fs.existsSync(datasetPath)) throw new Error("data/demo/dataset.json missing - run `python -m emispass simulate` first");
  const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));

  console.log(`Deploying to ${network.name} (chainId ${chainId}) from ${deployer.address}`);
  const registry = await ethers.deployContract("FacilityRegistry", [deployer.address]);
  await registry.waitForDeployment();
  const passport = await ethers.deployContract("EmissionPassport", [deployer.address, await registry.getAddress(), THRESHOLD]);
  await passport.waitForDeployment();
  const deployedBlock = (await passport.deploymentTransaction().wait()).blockNumber;

  const VERIFIER_ROLE = await passport.VERIFIER_ROLE();
  const verifiers = ["verifier:1", "verifier:2", "verifier:3"].map((r) => roleWallet(r).address);
  for (const v of verifiers) await (await passport.grantRole(VERIFIER_ROLE, v)).wait();

  const facilities = {};
  for (const f of dataset.facilities) {
    const operator = roleWallet(`operator:${f.facilityId}`).address;
    await (await registry.registerFacility(f.name, f.installationId, f.country, f.sectorCode, f.route, operator)).wait();
    facilities[f.facilityId] = { name: f.name, installationId: f.installationId, sector: f.sector, route: f.route, cnCode: f.cnCode, operator };
  }

  const artifact = (name) => hre.artifacts.readArtifactSync(name).abi;
  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    rpcUrl: network.name === "localhost" || network.name === "hardhat" ? "http://127.0.0.1:8545" : network.config.url,
    deployer: deployer.address,
    deployedBlock,
    contracts: { FacilityRegistry: await registry.getAddress(), EmissionPassport: await passport.getAddress() },
    verifierThreshold: THRESHOLD,
    verifiers,
    regulator: deployer.address,
    facilities,
    importers: { A: roleWallet("importer:A").address, B: roleWallet("importer:B").address },
    trustedFeeds: dataset.trustedFeeds,
    abi: { FacilityRegistry: artifact("FacilityRegistry"), EmissionPassport: artifact("EmissionPassport") },
  };
  const outDir = path.join(ROOT, "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${network.name}.json`), JSON.stringify(deployment, null, 1));

  console.log(`FacilityRegistry  ${deployment.contracts.FacilityRegistry}`);
  console.log(`EmissionPassport  ${deployment.contracts.EmissionPassport}  (threshold ${THRESHOLD}-of-${verifiers.length})`);
  console.log(`Registered ${Object.keys(facilities).length} facilities -> deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
