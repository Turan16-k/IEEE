// Anchors the verifier output (out/) on-chain, runs the attack demonstrations and lets the demo
// EU importers declare their shipments. Writes out/anchor-log.json for the dashboard.
// Usage: npx hardhat run scripts/anchor.js --network localhost|sepolia|baseSepolia
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { roleWallet } = require("./lib/roles");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const STATUS = ["None", "Approved", "Flagged", "Revoked"];

function errorName(passport, e) {
  if (e.revert && e.revert.name) return e.revert.name;
  const data = e.data || (e.error && e.error.data) || (e.info && e.info.error && e.info.error.data);
  try {
    if (data) return passport.interface.parseError(data).name;
  } catch (_) {}
  const msg = e.shortMessage || e.message || "";
  const m = msg.match(/custom error '(\w+)\(/) || msg.match(/reverted with custom error (\w+)/);
  return m ? m[1] : msg;
}

async function expectRevert(passport, label, expected, fn) {
  try {
    const tx = await fn();
    await tx.wait();
    console.log(`  !! ${label}: NOT rejected`);
    return { label, expected, result: "NOT REJECTED" };
  } catch (e) {
    const name = errorName(passport, e);
    console.log(`  OK ${label}: rejected with ${name}`);
    return { label, expected, result: name, blocked: name === expected };
  }
}

async function main() {
  const { ethers, network } = hre;
  const dep = read(`deployments/${network.name}.json`);
  const manifest = read("out/manifest.json");
  if (manifest.contract.toLowerCase() !== dep.contracts.EmissionPassport.toLowerCase()) {
    throw new Error("out/ was generated for a different deployment - rerun `python -m emispass run`");
  }
  const [relayer] = await ethers.getSigners();
  const passport = await ethers.getContractAt("EmissionPassport", dep.contracts.EmissionPassport, relayer);
  const log = { network: network.name, chainId: dep.chainId, contract: dep.contracts.EmissionPassport, passports: [], attacks: [], declarations: [] };

  const attacksByTarget = Object.fromEntries(manifest.attacks.map((a) => [a.targetTag, read(a.uri)]));
  const submissions = manifest.submissions.map((s) => read(`out/submissions/${s.tag}.json`));

  console.log("\n== Anchoring verified passports");
  for (const s of submissions) {
    const attack = attacksByTarget[s.tag];
    if (attack) {
      console.log(`\n== Attack: ${attack.description}`);
      log.attacks.push(
        await expectRevert(passport, "compromised verifier + outsider approve an under-declared claim", "InsufficientVerifierSignatures", () =>
          passport.submitPassport(attack.claim, attack.operatorSignature, attack.verification, attack.verifierSignatures)
        )
      );
      console.log("");
    }
    const tx = await passport.submitPassport(s.claim, s.operatorSignature, s.verification, s.verifierSignatures);
    const receipt = await tx.wait();
    const ev = receipt.logs.map((l) => { try { return passport.interface.parseLog(l); } catch (_) { return null; } }).find((x) => x && x.name === "PassportIssued");
    const passportId = Number(ev.args.passportId);
    const status = STATUS[Number(ev.args.status)];
    console.log(`  #${String(passportId).padStart(2)} ${s.tag.padEnd(34)} ${status.padEnd(8)} risk=${s.verification.riskScore}  sigs=${ev.args.verifierSignatures}  gas=${receipt.gasUsed}`);
    log.passports.push({ tag: s.tag, passportId, facilityId: s.facilityId, period: s.period, kind: s.kind, status, riskScore: s.verification.riskScore, txHash: tx.hash, gasUsed: receipt.gasUsed.toString(), reportUri: s.reportUri, evidenceUri: s.evidenceUri });
  }

  console.log("\n== Attack: replay an already anchored passport");
  const first = submissions[0];
  log.attacks.push(await expectRevert(passport, "replay of an anchored claim", "BadNonce", () => passport.submitPassport(first.claim, first.operatorSignature, first.verification, first.verifierSignatures)));

  console.log("== Attack: lower the emissions after signatures were collected");
  const last = submissions.find((s) => s.facilityId === 1 && s.period === 202609);
  const tampered = { ...last.claim, nonce: last.claim.nonce + 1, period: 202610, directEmissionsKg: Math.floor(Number(last.claim.directEmissionsKg) / 2) };
  log.attacks.push(await expectRevert(passport, "tampered emission figures", "BadOperatorSignature", () => passport.submitPassport(tampered, last.operatorSignature, last.verification, last.verifierSignatures)));

  console.log("\n== EU importers declare shipments (selective disclosure)");
  const byTag = Object.fromEntries(log.passports.map((p) => [p.tag, p]));
  const importers = { [dep.importers.A.toLowerCase()]: roleWallet("importer:A", ethers.provider), [dep.importers.B.toLowerCase()]: roleWallet("importer:B", ethers.provider) };
  if (!["localhost", "hardhat"].includes(network.name)) {
    for (const w of Object.values(importers)) {
      if ((await ethers.provider.getBalance(w.address)) < ethers.parseEther("0.001")) {
        await (await relayer.sendTransaction({ to: w.address, value: ethers.parseEther("0.003") })).wait();
      }
    }
  }
  const approved = manifest.disclosures.filter((d) => byTag[d.submissionTag].status === "Approved");
  const toDeclare = approved.filter((d, i) => d.importer.toLowerCase() === dep.importers.A.toLowerCase() || i % 3 === 0);
  for (const d of toDeclare) {
    const disc = read(d.uri);
    const p = byTag[d.submissionTag];
    const importer = importers[d.importer.toLowerCase()];
    const tx = await passport.connect(importer).declareShipment(p.passportId, disc.commitment, disc.proof);
    await tx.wait();
    console.log(`  ${disc.shipment.shipmentId.padEnd(32)} -> passport #${p.passportId} by ${disc.shipment.importerName}`);
    log.declarations.push({ shipmentId: disc.shipment.shipmentId, passportId: p.passportId, importer: d.importer, txHash: tx.hash });
  }

  console.log("\n== Attack: reuse / steal a shipment record");
  const reused = read(toDeclare[0].uri);
  const reusedP = byTag[toDeclare[0].submissionTag];
  const owner = importers[reused.shipment.importer.toLowerCase()];
  const other = Object.values(importers).find((w) => w.address !== owner.address);
  log.attacks.push(await expectRevert(passport, "same importer declares the same shipment twice", "ShipmentAlreadyDeclared", () => passport.connect(owner).declareShipment(reusedP.passportId, reused.commitment, reused.proof)));
  log.attacks.push(await expectRevert(passport, "another importer claims someone else's shipment", "InvalidShipmentProof", () => passport.connect(other).declareShipment(reusedP.passportId, reused.commitment, reused.proof)));
  const flaggedDisc = manifest.disclosures.find((d) => byTag[d.submissionTag].status === "Flagged");
  if (flaggedDisc) {
    const fd = read(flaggedDisc.uri);
    const fp = byTag[flaggedDisc.submissionTag];
    log.attacks.push(await expectRevert(passport, "declare a shipment from a FLAGGED passport", "InvalidShipmentProof", () => passport.connect(importers[fd.shipment.importer.toLowerCase()]).declareShipment(fp.passportId, fd.commitment, fd.proof)));
  }

  fs.writeFileSync(path.join(ROOT, "out", "anchor-log.json"), JSON.stringify(log, null, 1));
  const blocked = log.attacks.filter((a) => a.blocked).length;
  console.log(`\n${log.passports.length} passports anchored, ${log.declarations.length} shipments declared, ${blocked}/${log.attacks.length} attacks blocked as expected -> out/anchor-log.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
