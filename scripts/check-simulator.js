// Parity check: the in-browser verifier (app/verifier.js) must reproduce the Python verdicts
// for the anchored September passports. Run after `python -m emispass run`.
const fs = require("fs");
const path = require("path");
const V = require("../app/verifier.js");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const B = read("out/simulator.json");
const manifest = read("out/manifest.json");

let failures = 0;
function compare(label, js, py) {
  const sevJs = js.findings.map((f) => `${f.check}:${f.severity}`).join(",");
  const sevPy = py.findings.map((f) => `${f.check}:${f.severity}`).join(",");
  const ok = js.verdict === py.verdict && js.riskScore === py.riskScore && sevJs === sevPy;
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label.padEnd(30)} js=${js.verdict}/${js.riskScore}  py=${py.verdict}/${py.riskScore}`);
  if (!ok) console.log(`     js: ${sevJs}\n     py: ${sevPy}`);
}

for (const [fid, fac] of Object.entries(B.facilities)) {
  const subs = manifest.submissions.filter((s) => String(s.facilityId) === fid && s.period === B.period);
  const honestTag = subs.find((s) => (fac.underDeclaredInDemo ? s.kind === "correction" : s.kind === "original")).tag;
  compare(`F${fid} honest`, V.verify(B, fac, V.declare(B, fac, {})), read(`out/reports/${honestTag}.json`));
  if (fac.underDeclaredInDemo) {
    const fraudTag = subs.find((s) => s.kind === "original").tag;
    compare(`F${fid} coking coal -30%`, V.verify(B, fac, V.declare(B, fac, { fuel: { cokingCoalT: 0.7 } })), read(`out/reports/${fraudTag}.json`));
  }
  const tampered = V.verify(B, fac, V.declare(B, fac, { tamperMeter: true }));
  const prov = tampered.findings.find((f) => f.check === "provenance" && f.values.feed === "gridMeter");
  const ok = prov.severity === "critical" && tampered.verdict === "FLAGGED";
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"} ${`F${fid} tampered meter record`.padEnd(30)} -> ${tampered.verdict} (signature check ${prov.severity})`);
}
console.log(failures ? `\n${failures} parity failure(s)` : "\nBrowser verifier matches the Python verifier.");
process.exitCode = failures ? 1 : 0;
