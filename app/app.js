/* EmisPass dashboard: reads passports live from the EmissionPassport contract and the verifier
   output in out/. Falls back to the anchor-log snapshot when the chain is unreachable. */
(() => {
  const { ethers } = window;
  const params = new URLSearchParams(location.search);
  const NETWORK = params.get("network") || "localhost";
  const BASE = params.get("base") || "../";
  const STATUS = ["None", "Approved", "Flagged", "Revoked"];
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");
  const period = (p) => `${String(p).slice(0, 4)}-${String(p).slice(4)}`;

  const S = { dep: null, manifest: null, log: null, live: false, block: null, contract: null, passports: [], reports: {}, disclosures: {} };

  async function getJSON(p) {
    const r = await fetch(BASE + p, { cache: "no-store" });
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
  }
  async function getBytes(p) {
    const r = await fetch(BASE + p, { cache: "no-store" });
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

  // ------------------------------------------------------------------ loading
  async function load() {
    S.dep = await getJSON(`deployments/${NETWORK}.json`);
    S.manifest = await getJSON("out/manifest.json");
    S.log = await getJSON("out/anchor-log.json").catch(() => null);

    try {
      const provider = new ethers.JsonRpcProvider(S.dep.rpcUrl, S.dep.chainId, { staticNetwork: true });
      S.block = await withTimeout(provider.getBlockNumber(), 4000);
      const code = await provider.getCode(S.dep.contracts.EmissionPassport);
      if (code === "0x") throw new Error("contract not found");
      S.contract = new ethers.Contract(S.dep.contracts.EmissionPassport, S.dep.abi.EmissionPassport, provider);
      S.live = true;
    } catch (e) {
      S.live = false;
    }

    const byId = Object.fromEntries((S.log ? S.log.passports : []).map((p) => [p.passportId, p]));
    if (S.live) {
      const n = Number(await S.contract.passportCount());
      for (let i = 1; i <= n; i++) {
        const p = await S.contract.getPassport(i);
        const meta = byId[i] || {};
        S.passports.push({
          id: i,
          facilityId: Number(p.facilityId),
          period: Number(p.period),
          status: STATUS[Number(p.status)],
          riskScore: Number(p.riskScore),
          sigs: Number(p.verifierSignatures),
          production: Number(p.productionTonnes),
          direct: Number(p.directEmissionsKg),
          indirect: Number(p.indirectEmissionsKg),
          reportHash: p.reportHash,
          evidenceHash: p.evidenceHash,
          shipmentsRoot: p.shipmentsRoot,
          revocationReason: p.revocationReason,
          tag: meta.tag,
          kind: meta.kind,
          reportUri: meta.reportUri,
          evidenceUri: meta.evidenceUri,
        });
      }
    } else if (S.log) {
      for (const m of S.log.passports) {
        const sub = await getJSON(`out/submissions/${m.tag}.json`);
        S.passports.push({
          id: m.passportId, facilityId: m.facilityId, period: m.period, status: m.status, riskScore: m.riskScore,
          sigs: sub.verifierSignatures.length, production: sub.claim.productionTonnes, direct: sub.claim.directEmissionsKg,
          indirect: sub.claim.indirectEmissionsKg, reportHash: sub.verification.reportHash, evidenceHash: sub.claim.evidenceHash,
          shipmentsRoot: sub.claim.shipmentsRoot, tag: m.tag, kind: m.kind, reportUri: m.reportUri, evidenceUri: m.evidenceUri,
        });
      }
    }
    await Promise.all(S.passports.filter((p) => p.reportUri).map(async (p) => (S.reports[p.id] = await getJSON(p.reportUri))));
  }

  // ------------------------------------------------------------------ header + overview
  function renderHeader() {
    const c = S.dep.contracts.EmissionPassport;
    $("chain").innerHTML = S.live
      ? `<span class="dot"></span>${esc(S.dep.network)} · block ${fmt(S.block)}<br><span class="mono">${esc(c)}</span>`
      : `<span class="dot off"></span>${esc(S.dep.network)} unreachable · showing anchored snapshot<br><span class="mono">${esc(c)}</span>`;
  }

  function renderOverview() {
    const n = (s) => S.passports.filter((p) => p.status === s).length;
    const blocked = S.log ? S.log.attacks.filter((a) => a.blocked).length : 0;
    const total = S.log ? S.log.attacks.length : 0;
    const declarations = S.log ? S.log.declarations.length : 0;
    const kpis = [
      [S.passports.length, "passports anchored"],
      [n("Approved"), "approved"],
      [n("Flagged"), "flagged by AI verifiers"],
      [declarations, "shipments declared by EU importers"],
      [`${blocked}/${total}`, "attacks blocked on-chain"],
      [`${S.dep.verifierThreshold}-of-${S.dep.verifiers.length}`, "verifier threshold"],
    ];
    $("kpis").innerHTML = kpis.map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");

    $("passports").querySelector("tbody").innerHTML = S.passports
      .map((p) => {
        const f = S.dep.facilities[p.facilityId] || {};
        return `<tr><td>${p.id}</td><td>${esc(f.name || p.facilityId)}${p.kind === "correction" ? ' <span class="note">(correction)</span>' : ""}</td><td>${period(p.period)}</td>
          <td><span class="chip ${p.status}">${p.status}</span></td><td>${p.riskScore}</td><td>${p.sigs}/${S.dep.verifiers.length}</td>
          <td>${fmt(p.direct / p.production / 1000, 3)}</td><td><button class="btn link" data-open="${p.id}">Report →</button></td></tr>`;
      })
      .join("");
    $("passports").querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => {
        $("passportSel").value = b.dataset.open;
        renderVerifier();
        switchTab("verifier");
      })
    );
    $("datanote").innerHTML = S.live
      ? `Read live from <span class="mono">EmissionPassport</span> at block ${fmt(S.block)} (chainId ${S.dep.chainId}).`
      : "Chain not reachable from this browser; values come from the anchored snapshot in out/anchor-log.json.";
  }

  // ------------------------------------------------------------------ producer
  function renderProducer() {
    const fid = Number($("facilitySel").value);
    const ps = S.passports.filter((p) => p.facilityId === fid).sort((a, b) => a.period - b.period || a.id - b.id);
    const rep = S.reports[ps[ps.length - 1].id];
    const bench = rep.findings.find((f) => f.check === "benchmark").values;
    const def = rep.cbam.illustrativeDefaultT;

    const W = 560, H = 250, padL = 44, padB = 34, padT = 12;
    const vals = ps.map((p) => p.direct / p.production / 1000);
    const max = Math.max(def, bench.p90T, ...vals) * 1.15;
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const bw = (W - padL - 10) / ps.length;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Monthly direct emission intensity">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg += `<line x1="${padL}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2)}</text>`;
    }
    svg += `<rect x="${padL}" width="${W - padL - 6}" y="${y(bench.p90T)}" height="${Math.max(2, y(bench.p10T) - y(bench.p90T))}" fill="var(--band)"/>`;
    ps.forEach((p, i) => {
      const v = vals[i], x = padL + i * bw + bw * 0.2, w = bw * 0.6;
      const color = p.status === "Approved" ? "var(--bar)" : "var(--bar-bad)";
      svg += `<rect x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="3" fill="${color}"><title>${period(p.period)} ${p.kind || ""}: ${v.toFixed(3)} t/t (${p.status})</title></rect>`;
      svg += `<text x="${x + w / 2}" y="${H - padB + 14}" text-anchor="middle">${period(p.period)}</text>`;
      svg += `<text x="${x + w / 2}" y="${H - padB + 27}" text-anchor="middle">${p.kind === "correction" ? "corrected" : p.status === "Flagged" ? "flagged" : ""}</text>`;
      svg += `<text x="${x + w / 2}" y="${y(v) - 5}" text-anchor="middle">${v.toFixed(3)}</text>`;
    });
    svg += `<line x1="${padL}" x2="${W - 6}" y1="${y(def)}" y2="${y(def)}" stroke="var(--bad)" stroke-dasharray="5 4"/><text x="${W - 8}" y="${y(def) - 5}" text-anchor="end">illustrative default ${def.toFixed(2)}</text>`;
    svg += `<text x="${padL + 4}" y="${y(bench.p90T) - 4}">TR peers p10–p90</text></svg>`;
    $("intensityChart").innerHTML = svg;

    const latest = [...ps].reverse().find((p) => p.status === "Approved");
    const r = S.reports[latest.id];
    const saving = r.cbam.grossExposureDefaultEurPerT - r.cbam.grossExposureActualEurPerT;
    const exported = S.manifest.disclosures.filter((d) => d.submissionTag === latest.tag).length;
    $("cbamBox").innerHTML = `
      <p class="note">Latest approved passport #${latest.id} (${period(latest.period)}), CBAM scope: direct${r.cbam.indirectInScope ? " + indirect" : ""} emissions.</p>
      <div class="compare">
        <div><div class="l">Verified actual</div><div class="big">€${fmt(r.cbam.grossExposureActualEurPerT, 2)}</div><div class="l">per tonne · ${r.cbam.seeInScopeT.toFixed(3)} tCO2e/t</div></div>
        <div><div class="l">Illustrative default</div><div class="big">€${fmt(r.cbam.grossExposureDefaultEurPerT, 2)}</div><div class="l">per tonne · ${r.cbam.illustrativeDefaultT.toFixed(3)} tCO2e/t</div></div>
      </div>
      <p><b>€${fmt(saving, 2)}/t</b> lower gross CBAM exposure for the EU buyer when the passport is used instead of the default, at €${r.cbam.certificatePriceEur}/tCO2e.</p>
      <p class="note">${exported} shipments to EU importers committed in this passport. ${esc(r.cbam.note)}</p>`;
  }

  // ------------------------------------------------------------------ verifier
  function renderVerifier() {
    const p = S.passports.find((x) => x.id === Number($("passportSel").value));
    const r = S.reports[p.id];
    const f = S.dep.facilities[p.facilityId] || {};
    $("integrity").innerHTML = "";
    const color = r.riskScore >= 400 ? "var(--bad)" : r.riskScore > 0 ? "var(--warn)" : "var(--ok)";
    $("verdictCard").innerHTML = `
      <h3>${esc(f.name)} · ${period(p.period)}${p.kind === "correction" ? " · correction" : ""}</h3>
      <div class="verdict" style="color:${color}">${esc(r.verdict)}</div>
      <div class="note">On-chain status: <span class="chip ${p.status}">${p.status}</span>${p.revocationReason ? ` · ${esc(p.revocationReason)}` : ""}</div>
      <div class="gauge" title="risk ${r.riskScore}/1000"><i style="width:${r.riskScore / 10}%;background:${color}"></i></div>
      <dl class="kv">
        <dt>Risk score</dt><dd>${r.riskScore} / 1000</dd>
        <dt>Verifier signatures</dt><dd>${p.sigs} of ${S.dep.verifiers.length} (threshold ${S.dep.verifierThreshold})</dd>
        <dt>Production</dt><dd>${fmt(p.production)} t</dd>
        <dt>Direct / indirect</dt><dd>${fmt(p.direct / 1e6, 1)} kt / ${fmt(p.indirect / 1e6, 2)} kt</dd>
        <dt>Independent recalculation</dt><dd>${fmt(r.independentDirectEmissionsKg / 1e6, 1)} kt</dd>
        <dt>Model</dt><dd>v${esc(r.model.version)} · <span class="mono">${short(r.model.modelHash)}</span></dd>
        <dt>Report hash</dt><dd class="mono">${short(p.reportHash)}</dd>
        <dt>Evidence hash</dt><dd class="mono">${short(p.evidenceHash)}</dd>
      </dl>`;
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    $("findings").innerHTML = [...r.findings]
      .sort((a, b) => order[a.severity] - order[b.severity])
      .map((x) => `<li><span class="sev ${x.severity}">${x.severity}</span><div><div class="t">${esc(x.title)}</div><div class="d">${esc(x.detail)}</div></div></li>`)
      .join("");
  }

  async function checkIntegrity() {
    const p = S.passports.find((x) => x.id === Number($("passportSel").value));
    const out = [];
    for (const [label, uri, onchain] of [["AI report", p.reportUri, p.reportHash], ["Evidence bundle", p.evidenceUri, p.evidenceHash]]) {
      const h = ethers.keccak256(await getBytes(uri));
      const ok = h.toLowerCase() === onchain.toLowerCase();
      out.push(`<div class="line"><span class="chip ${ok ? "ok" : "bad"}">${ok ? "match" : "MISMATCH"}</span><b>${label}</b> keccak256(file) <span class="mono">${short(h)}</span> ${ok ? "=" : "≠"} on-chain <span class="mono">${short(onchain)}</span></div>`);
    }
    $("integrity").innerHTML = out.join("");
  }

  // ------------------------------------------------------------------ importer
  async function renderImporterList() {
    const imp = $("importerSel").value.toLowerCase();
    const items = S.manifest.disclosures.filter((d) => d.importer.toLowerCase() === imp);
    $("shipmentSel").innerHTML = items.map((d) => `<option value="${esc(d.uri)}">${esc(d.shipmentId)} (${esc(d.verdict.toLowerCase())})</option>`).join("");
    await renderDisclosure();
  }

  async function renderDisclosure() {
    const uri = $("shipmentSel").value;
    if (!uri) return;
    const d = (S.disclosures[uri] = S.disclosures[uri] || (await getJSON(uri)));
    const s = d.shipment;
    const p = S.passports.find((x) => x.tag === d.submissionTag);
    const r = p && S.reports[p.id];
    const qtyT = s.quantityKg / 1000;
    const scopeKgPerT = s.directKgPerT + (r && r.cbam.indirectInScope ? s.indirectKgPerT : 0);
    const embedded = (qtyT * scopeKgPerT) / 1000;
    const price = r ? r.cbam.certificatePriceEur : 0;
    const defT = r ? r.cbam.illustrativeDefaultT : 0;
    $("disclosure").innerHTML = `
      <dl class="kv">
        <dt>Shipment</dt><dd>${esc(s.shipmentId)}</dd>
        <dt>Producer</dt><dd>${esc(d.facilityName)} (${esc(d.installationId)})</dd>
        <dt>Product</dt><dd>${esc(s.product)} · CN ${esc(s.cnCode)}</dd>
        <dt>Quantity</dt><dd>${fmt(qtyT, 1)} t</dd>
        <dt>Specific emissions</dt><dd>${s.directKgPerT} kg/t direct · ${s.indirectKgPerT} kg/t indirect</dd>
        <dt>Embedded (CBAM scope)</dt><dd><b>${fmt(embedded, 1)} tCO2e</b></dd>
        <dt>Gross CBAM cost</dt><dd>€${fmt(embedded * price)} with passport vs €${fmt(qtyT * defT * price)} on illustrative default</dd>
        <dt>Passport</dt><dd>${p ? `#${p.id} · <span class="chip ${p.status}">${p.status}</span>` : "not anchored"}</dd>
      </dl>`;
    $("importerChecks").innerHTML = "";
  }

  async function runImporterChecks() {
    const d = S.disclosures[$("shipmentSel").value];
    const s = d.shipment;
    const p = S.passports.find((x) => x.tag === d.submissionTag);
    const rows = [];
    const add = (ok, text) => rows.push(`<li>${esc(text)}<span class="r chip ${ok ? "ok" : "bad"}">${ok ? "pass" : "fail"}</span></li>`);

    const commitment = ethers.keccak256(
      coder.encode(["string", "address", "string", "uint256", "uint256", "uint256", "uint32", "bytes32"], [s.shipmentId, s.importer, s.cnCode, s.quantityKg, s.directKgPerT, s.indirectKgPerT, s.period, s.salt])
    );
    add(commitment === d.commitment, "Disclosed values hash to the committed shipment record");

    const leaf = ethers.keccak256(ethers.keccak256(coder.encode(["address", "bytes32"], [s.importer, commitment])));
    let h = leaf;
    for (const sib of d.proof) h = BigInt(h) < BigInt(sib) ? ethers.keccak256(ethers.concat([h, sib])) : ethers.keccak256(ethers.concat([sib, h]));
    add(h.toLowerCase() === d.shipmentsRoot.toLowerCase(), `Merkle proof (${d.proof.length} hashes) reaches the passport root`);
    add(!!p && p.shipmentsRoot.toLowerCase() === d.shipmentsRoot.toLowerCase(), `Root matches passport #${p ? p.id : "?"} ${S.live ? "on-chain" : "(snapshot)"}`);
    add(!!p && p.status === "Approved", `Passport status is ${p ? p.status : "unknown"}`);

    if (S.live && p) {
      const ok = await S.contract.verifyShipment(p.id, s.importer, commitment, d.proof);
      add(ok, "Contract verifyShipment() accepts the proof for your address");
      const under = Number(await S.contract.declaredUnder(leaf));
      rows.push(`<li>Declaration status<span class="r chip ${under ? "warn" : "ok"}">${under ? `already declared under #${under}` : "not yet declared"}</span></li>`);
    } else if (S.log && p) {
      const dec = S.log.declarations.find((x) => x.shipmentId === s.shipmentId);
      rows.push(`<li>Declaration status (snapshot)<span class="r chip ${dec ? "warn" : "ok"}">${dec ? `declared in tx ${short(dec.txHash)}` : "not yet declared"}</span></li>`);
    }
    $("importerChecks").innerHTML = rows.join("");
  }

  // ------------------------------------------------------------------ security
  function renderSecurity() {
    const rows = (S.log ? S.log.attacks : []).map(
      (a) => `<tr><td>${esc(a.label)}</td><td class="mono">${esc(a.expected)}</td><td><span class="chip ${a.blocked ? "ok" : "bad"}">${a.blocked ? "blocked" : esc(a.result)}</span></td></tr>`
    );
    $("attacks").querySelector("tbody").innerHTML = rows.join("") || `<tr><td colspan="3">Run scripts/anchor.js to execute the attack suite.</td></tr>`;
  }

  // ------------------------------------------------------------------ wiring
  function switchTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
  }

  async function main() {
    document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    try {
      await load();
    } catch (e) {
      $("chain").textContent = "";
      $("overview").innerHTML = `<div class="card"><h3>Demo data not found</h3><p>${esc(e.message)}</p><p class="note">Run the demo pipeline first (see README) and serve the repository root, e.g. <code>python -m http.server 8080</code>, then open <code>/app/</code>.</p></div>`;
      return;
    }
    renderHeader();
    renderOverview();

    $("facilitySel").innerHTML = Object.entries(S.dep.facilities).map(([id, f]) => `<option value="${id}">${esc(f.name)}</option>`).join("");
    $("facilitySel").addEventListener("change", renderProducer);
    renderProducer();

    $("passportSel").innerHTML = S.passports.map((p) => `<option value="${p.id}">#${p.id} · ${esc((S.dep.facilities[p.facilityId] || {}).name)} · ${period(p.period)}${p.kind === "correction" ? " (correction)" : ""} · ${p.status}</option>`).join("");
    const flagged = S.passports.find((p) => p.status === "Flagged");
    if (flagged) $("passportSel").value = flagged.id;
    $("passportSel").addEventListener("change", renderVerifier);
    $("integrityBtn").addEventListener("click", checkIntegrity);
    renderVerifier();

    $("importerSel").innerHTML = Object.entries(S.dep.importers)
      .map(([k, a]) => `<option value="${a}">EU Importer ${k} (${short(a)})</option>`)
      .join("");
    $("importerSel").addEventListener("change", renderImporterList);
    $("shipmentSel").addEventListener("change", renderDisclosure);
    $("checkBtn").addEventListener("click", runImporterChecks);
    await renderImporterList();

    renderSecurity();

    const tab = params.get("tab");
    if (tab && document.getElementById(tab)) switchTab(tab);
    if (tab === "verifier") checkIntegrity();
    if (tab === "importer") runImporterChecks();
  }

  main();
})();
