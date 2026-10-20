/* EmisPass dashboard: reads passports live from the EmissionPassport contract and the verifier
   output in out/. Falls back to the anchor-log snapshot when the chain is unreachable. */
(() => {
  const { ethers, EmisI18n, EmisVerifier, EmisCbam } = window;
  const params = new URLSearchParams(location.search);
  const NETWORK = params.get("network");
  const BASE = params.get("base") || "../";
  const STATUS = ["None", "Approved", "Flagged", "Revoked"];
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");
  const period = (p) => `${String(p).slice(0, 4)}-${String(p).slice(4)}`;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };
  let LANG = params.get("lang") || store.get("emispass.lang") || ((navigator.language || "en").toLowerCase().startsWith("tr") ? "tr" : "en");
  const t = (key, ...a) => {
    const v = (EmisI18n.S[LANG] || EmisI18n.S.en)[key] ?? EmisI18n.S.en[key];
    return typeof v === "function" ? v(...a) : v;
  };
  const statusName = (s) => t("status")[s] || s;

  const S = { dep: null, manifest: null, log: null, live: false, block: null, provider: null, contract: null, passports: [], reports: {}, summaries: {}, disclosures: {}, sim: null, s5p: null, ct: null, account: null, signer: null };

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

  function toast(msg, ms = 4000) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (el.hidden = true), ms);
  }

  // ------------------------------------------------------------------ loading
  async function load() {
    S.manifest = await getJSON("out/manifest.json");
    const candidates = NETWORK ? [NETWORK] : ["sepolia", "baseSepolia", "localhost"];
    for (const net of candidates) {
      const dep = await getJSON(`deployments/${net}.json`).catch(() => null);
      if (dep && (NETWORK || dep.contracts.EmissionPassport.toLowerCase() === S.manifest.contract.toLowerCase())) {
        S.dep = dep;
        break;
      }
    }
    if (!S.dep) throw new Error("no deployment file matches out/manifest.json");
    S.log = await getJSON("out/anchor-log.json").catch(() => null);
    S.sim = await getJSON("out/simulator.json").catch(() => null);
    S.s5p = await getJSON("data/sentinel5p/iskenderun-bay.json").catch(() => null);
    S.ct = await getJSON("data/climatetrace/tur_industrial_assets.json").catch(() => null);

    // A page served from the internet must not probe the visitor's loopback RPC: browsers
    // answer with a local-network permission prompt instead of an error.
    const loopbackRpc = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(S.dep.rpcUrl || "");
    const localPage = ["localhost", "127.0.0.1", ""].includes(location.hostname);
    try {
      if (loopbackRpc && !localPage) throw new Error("loopback RPC not reachable from a public page");
      S.provider = new ethers.JsonRpcProvider(S.dep.rpcUrl, S.dep.chainId, { staticNetwork: true });
      S.block = await withTimeout(S.provider.getBlockNumber(), 4000);
      const code = await S.provider.getCode(S.dep.contracts.EmissionPassport);
      if (code === "0x") throw new Error("contract not found");
      S.contract = new ethers.Contract(S.dep.contracts.EmissionPassport, S.dep.abi.EmissionPassport, S.provider);
      S.live = true;
    } catch (e) {
      S.live = false;
      if (S.provider) S.provider.destroy();
      S.provider = null;
    }

    const byId = Object.fromEntries((S.log ? S.log.passports : []).map((p) => [p.passportId, p]));
    S.passports = [];
    if (S.live) {
      const n = Number(await S.contract.passportCount());
      for (let i = 1; i <= n; i++) {
        const p = await S.contract.getPassport(i);
        const meta = byId[i] || {};
        S.passports.push({
          id: i, facilityId: Number(p.facilityId), period: Number(p.period), status: STATUS[Number(p.status)],
          riskScore: Number(p.riskScore), sigs: Number(p.verifierSignatures), production: Number(p.productionTonnes),
          direct: Number(p.directEmissionsKg), indirect: Number(p.indirectEmissionsKg), reportHash: p.reportHash,
          evidenceHash: p.evidenceHash, shipmentsRoot: p.shipmentsRoot, revocationReason: p.revocationReason,
          tag: meta.tag, kind: meta.kind, reportUri: meta.reportUri, evidenceUri: meta.evidenceUri,
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
    const subByTag = Object.fromEntries(S.manifest.submissions.map((s) => [s.tag, s]));
    await Promise.all(
      S.passports.filter((p) => p.reportUri).map(async (p) => {
        S.reports[p.id] = await getJSON(p.reportUri);
        const sub = subByTag[p.tag];
        if (sub && sub.explanationUri) S.summaries[p.id] = await getJSON(sub.explanationUri).catch(() => null);
      })
    );
  }

  // ------------------------------------------------------------------ i18n
  function applyStatic() {
    document.documentElement.lang = LANG;
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === LANG)));
    renderWalletButton();
  }

  function findingItem(f) {
    const [title, detail] = EmisI18n.renderFinding(f, LANG);
    return `<li><span class="sev ${f.severity}">${esc(t("sevNames")[f.severity])}</span><div><div class="t">${esc(title)}</div><div class="d">${esc(detail)}</div></div></li>`;
  }
  const ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sortFindings = (fs) => [...fs].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  // ------------------------------------------------------------------ header + overview
  function renderHeader() {
    const c = S.dep.contracts.EmissionPassport;
    $("chain").innerHTML = S.live
      ? `<span class="dot"></span>${esc(t("chainLive", S.dep.network, fmt(S.block)))}<br><span class="mono">${esc(c)}</span>`
      : `<span class="dot off"></span>${esc(t("chainSnap", S.dep.network))}<br><span class="mono">${esc(c)}</span>`;
  }

  function renderOverview() {
    const n = (s) => S.passports.filter((p) => p.status === s).length;
    const blocked = S.log ? S.log.attacks.filter((a) => a.blocked).length : 0;
    const total = S.log ? S.log.attacks.length : 0;
    const kpis = [
      [S.passports.length, t("kPassports")], [n("Approved"), t("kApproved")], [n("Flagged"), t("kFlagged")],
      [S.log ? S.log.declarations.length : 0, t("kDeclared")], [`${blocked}/${total}`, t("kAttacks")],
      [`${S.dep.verifierThreshold}-of-${S.dep.verifiers.length}`, t("kThreshold")],
    ];
    $("kpis").innerHTML = kpis.map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");
    $("passports").querySelector("tbody").innerHTML = S.passports
      .map((p) => {
        const f = S.dep.facilities[p.facilityId] || {};
        return `<tr><td>${p.id}</td><td>${esc(f.name || p.facilityId)}${p.kind === "correction" ? ` <span class="note">${esc(t("correction"))}</span>` : ""}</td><td>${period(p.period)}</td>
          <td><span class="chip ${p.status}">${esc(statusName(p.status))}</span></td><td>${p.riskScore}</td><td>${p.sigs}/${S.dep.verifiers.length}</td>
          <td>${fmt(p.direct / p.production / 1000, 3)}</td><td><button class="btn link" data-open="${p.id}">${esc(t("report"))}</button></td></tr>`;
      })
      .join("");
    $("passports").querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => {
        $("passportSel").value = b.dataset.open;
        renderVerifier();
        switchTab("verifier");
      })
    );
    $("datanote").innerHTML = S.live ? t("liveNote", fmt(S.block), S.dep.chainId) : esc(t("snapNote"));
  }

  // ------------------------------------------------------------------ simulator
  const simState = { fid: null, fuel: {}, electricity: 1, production: 1, hideTotal: 0, tamper: false };

  function mainFuel(fac) {
    const B = S.sim, a = fac.record.declaration.activity;
    return B.fuelsByRoute[fac.route].filter((f) => f in a && f !== "clinkerT").sort((x, y) => a[y] * B.emissionFactors[y] - a[x] * B.emissionFactors[x])[0];
  }

  function renderSimControls() {
    if (!S.sim) return;
    const fac = S.sim.facilities[simState.fid];
    const B = S.sim, a = fac.record.declaration.activity;
    const fuels = B.fuelsByRoute[fac.route].filter((f) => f in a);
    const slider = (id, label, value, min, max) =>
      `<div class="slider"><label for="${id}">${esc(label)} <b id="${id}V">${Math.round(value * 100)} %</b> <span class="note">${esc(t("ofTrue"))}</span></label><input type="range" id="${id}" min="${min}" max="${max}" step="1" value="${Math.round(value * 100)}"></div>`;
    let html = fuels.map((f) => slider(`sf_${f}`, t("fuelSlider", EmisI18n.FUEL[LANG][f] || f), simState.fuel[f] ?? 1, 50, 120)).join("");
    html += slider("sf_elec", t("elecSlider"), simState.electricity, 70, 110);
    html += slider("sf_prod", t("prodSlider"), simState.production, 60, 120);
    html += `<label class="check"><input type="checkbox" id="sf_total" ${simState.hideTotal ? "checked" : ""}> ${esc(t("hideTotal"))}</label>`;
    html += `<label class="check"><input type="checkbox" id="sf_tamper" ${simState.tamper ? "checked" : ""}> ${esc(t("tamper"))}</label>`;
    $("simControls").innerHTML = html;
    fuels.forEach((f) => $(`sf_${f}`).addEventListener("input", (e) => { simState.fuel[f] = e.target.value / 100; $(`sf_${f}V`).textContent = `${e.target.value} %`; runSim(); }));
    $("sf_elec").addEventListener("input", (e) => { simState.electricity = e.target.value / 100; $("sf_elecV").textContent = `${e.target.value} %`; runSim(); });
    $("sf_prod").addEventListener("input", (e) => { simState.production = e.target.value / 100; $("sf_prodV").textContent = `${e.target.value} %`; runSim(); });
    $("sf_total").addEventListener("change", (e) => { simState.hideTotal = e.target.checked ? 0.12 : 0; runSim(); });
    $("sf_tamper").addEventListener("change", (e) => { simState.tamper = e.target.checked; runSim(); });
  }

  function runSim() {
    if (!S.sim) return;
    const fac = S.sim.facilities[simState.fid];
    const rec = EmisVerifier.declare(S.sim, fac, { fuel: simState.fuel, electricity: simState.electricity, production: simState.production, hideTotal: simState.hideTotal, tamperMeter: simState.tamper });
    const r = EmisVerifier.verify(S.sim, fac, rec);
    const flagged = r.verdict === "FLAGGED";
    const color = flagged ? "var(--bad)" : r.riskScore > 0 ? "var(--warn)" : "var(--ok)";
    const declared = rec.declaration.directEmissionsKg / 1e6, indep = r.independentDirectKg / 1e6;
    const max = Math.max(declared, indep) * 1.1;
    $("simResult").innerHTML = `
      <h3>${esc(t("simVerdict"))}</h3>
      <div class="verdict" style="color:${color}">${esc(t("verdicts")[r.verdict])}</div>
      <div class="gauge" title="risk ${r.riskScore}/1000"><i style="width:${r.riskScore / 10}%;background:${color}"></i></div>
      <dl class="kv"><dt>${esc(t("riskScore"))}</dt><dd>${r.riskScore} / 1000</dd><dt>tCO2e/t</dt><dd>${fmt(r.intensityT, 3)}</dd></dl>
      <p>${t("simWould", esc(flagged ? t("simFlagged") : t("simApproved")))}</p>
      <h3>${esc(t("declaredVs"))}</h3>
      <div class="bars">
        <div><span>${LANG === "tr" ? "Beyan" : "Declared"}</span><i style="width:${(declared / max) * 100}%;background:${color}"></i><b>${fmt(declared, 1)} kt</b></div>
        <div><span>${LANG === "tr" ? "Bağımsız" : "Independent"}</span><i style="width:${(indep / max) * 100}%;background:var(--muted)"></i><b>${fmt(indep, 1)} kt</b></div>
      </div>`;
    $("simFindings").innerHTML = sortFindings(r.findings).map(findingItem).join("");
  }

  function renderSimulator() {
    if (!S.sim) {
      $("simControls").innerHTML = `<p class="note">out/simulator.json missing - rerun the verifier pipeline.</p>`;
      return;
    }
    if (!simState.fid) simState.fid = Object.keys(S.sim.facilities).find((k) => S.sim.facilities[k].underDeclaredInDemo) || Object.keys(S.sim.facilities)[0];
    $("simFacility").innerHTML = Object.entries(S.sim.facilities).map(([id, f]) => `<option value="${id}">${esc(f.name)}</option>`).join("");
    $("simFacility").value = simState.fid;
    const presets = [["honest", t("pHonest")], ["fuel", t("pFuel")], ["elec", t("pElec")], ["prod", t("pProd")], ["total", t("pTotal")], ["tamper", t("pTamper")]];
    $("simPresets").innerHTML = presets.map(([k, l]) => `<button class="btn ghost small" data-preset="${k}">${esc(l)}</button>`).join("");
    $("simPresets").querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => applyPreset(b.dataset.preset)));
    renderSimControls();
    runSim();
  }

  function applyPreset(k) {
    const fac = S.sim.facilities[simState.fid];
    Object.assign(simState, { fuel: {}, electricity: 1, production: 1, hideTotal: 0, tamper: false });
    if (k === "fuel") simState.fuel[mainFuel(fac)] = 0.7;
    if (k === "elec") simState.electricity = 0.9;
    if (k === "prod") simState.production = 0.8;
    if (k === "total") simState.hideTotal = 0.12;
    if (k === "tamper") simState.tamper = true;
    renderSimControls();
    runSim();
  }

  // ------------------------------------------------------------------ producer
  function latestApproved(fid) {
    return S.passports.filter((p) => p.facilityId === fid && p.status === "Approved").sort((a, b) => b.period - a.period || b.id - a.id)[0];
  }

  function renderProducer() {
    const fid = Number($("facilitySel").value);
    const ps = S.passports.filter((p) => p.facilityId === fid).sort((a, b) => a.period - b.period || a.id - b.id);
    if (!ps.length) return;
    const rep = S.reports[ps[ps.length - 1].id];
    const bench = rep.findings.find((f) => f.check === "benchmark").values;
    const def = rep.cbam.illustrativeDefaultT;

    const W = 560, H = 250, padL = 44, padB = 34, padT = 12;
    const vals = ps.map((p) => p.direct / p.production / 1000);
    const max = Math.max(def, bench.p90T, ...vals) * 1.15;
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const bw = (W - padL - 10) / ps.length;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t("chartTitle"))}">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg += `<line x1="${padL}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2)}</text>`;
    }
    svg += `<rect x="${padL}" width="${W - padL - 6}" y="${y(bench.p90T)}" height="${Math.max(2, y(bench.p10T) - y(bench.p90T))}" fill="var(--band)"/>`;
    ps.forEach((p, i) => {
      const v = vals[i], x = padL + i * bw + bw * 0.2, w = bw * 0.6;
      const color = p.status === "Approved" ? "var(--bar)" : "var(--bar-bad)";
      svg += `<rect x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="3" fill="${color}"><title>${period(p.period)}: ${v.toFixed(3)} t/t (${esc(statusName(p.status))})</title></rect>`;
      svg += `<text x="${x + w / 2}" y="${H - padB + 14}" text-anchor="middle">${period(p.period)}</text>`;
      svg += `<text x="${x + w / 2}" y="${H - padB + 27}" text-anchor="middle">${p.kind === "correction" ? esc(t("correction")) : p.status !== "Approved" ? esc(statusName(p.status)) : ""}</text>`;
      svg += `<text x="${x + w / 2}" y="${y(v) - 5}" text-anchor="middle">${v.toFixed(3)}</text>`;
    });
    svg += `<line x1="${padL}" x2="${W - 6}" y1="${y(def)}" y2="${y(def)}" stroke="var(--bad)" stroke-dasharray="5 4"/><text x="${W - 8}" y="${y(def) - 5}" text-anchor="end">${esc(t("illusDefault"))} ${def.toFixed(2)}</text>`;
    svg += `<text x="${padL + 4}" y="${y(bench.p90T) - 4}">TR p10–p90</text></svg>`;
    $("intensityChart").innerHTML = svg;

    const latest = latestApproved(fid);
    const r = S.reports[latest.id];
    const saving = r.cbam.grossExposureDefaultEurPerT - r.cbam.grossExposureActualEurPerT;
    const exported = S.manifest.disclosures.filter((d) => d.submissionTag === latest.tag).length;
    $("cbamBox").innerHTML = `
      <p class="note">${esc(t("latestPassport", latest.id, period(latest.period), r.cbam.indirectInScope))}</p>
      <div class="compare">
        <div><div class="l">${esc(t("verifiedActual"))}</div><div class="big">€${fmt(r.cbam.grossExposureActualEurPerT, 2)}</div><div class="l">${esc(t("perTonne"))} · ${r.cbam.seeInScopeT.toFixed(3)} tCO2e/t</div></div>
        <div><div class="l">${esc(t("illusDefault"))}</div><div class="big">€${fmt(r.cbam.grossExposureDefaultEurPerT, 2)}</div><div class="l">${esc(t("perTonne"))} · ${r.cbam.illustrativeDefaultT.toFixed(3)} tCO2e/t</div></div>
      </div>
      <p>${t("saving", fmt(saving, 2), r.cbam.certificatePriceEur)}</p>
      <p class="note">${esc(t("committed", exported))} ${esc(t("cbamNote"))}</p>`;
  }

  function cbamFor(passport, shipment) {
    return EmisCbam.build({ passport, report: S.reports[passport.id], facility: S.dep.facilities[passport.facilityId], dep: S.dep, shipment });
  }
  function downloadProducer(kind) {
    const p = latestApproved(Number($("facilitySel").value));
    const data = cbamFor(p);
    const name = `emispass-cbam-${data.installation.installationId}-${p.period}`;
    if (kind === "csv") EmisCbam.download(`${name}.csv`, EmisCbam.toCsv(data), "text/csv");
    else EmisCbam.download(`${name}.json`, JSON.stringify(data, null, 2), "application/json");
  }

  // ------------------------------------------------------------------ verifier
  function renderVerifier() {
    const p = S.passports.find((x) => x.id === Number($("passportSel").value));
    if (!p) return;
    const r = S.reports[p.id];
    const f = S.dep.facilities[p.facilityId] || {};
    $("integrity").innerHTML = "";
    const color = r.riskScore >= 400 ? "var(--bad)" : r.riskScore > 0 ? "var(--warn)" : "var(--ok)";
    $("verdictCard").innerHTML = `
      <h3>${esc(f.name)} · ${period(p.period)}${p.kind === "correction" ? ` · ${esc(t("correction"))}` : ""}</h3>
      <div class="verdict" style="color:${color}">${esc(t("verdicts")[r.verdict])}</div>
      <div class="note">${esc(t("onchainStatus"))}: <span class="chip ${p.status}">${esc(statusName(p.status))}</span>${p.revocationReason ? ` · ${esc(p.revocationReason)}` : ""}</div>
      <div class="gauge" title="risk ${r.riskScore}/1000"><i style="width:${r.riskScore / 10}%;background:${color}"></i></div>
      <dl class="kv">
        <dt>${esc(t("riskScore"))}</dt><dd>${r.riskScore} / 1000</dd>
        <dt>${esc(t("sigs"))}</dt><dd>${esc(t("sigsOf", p.sigs, S.dep.verifiers.length, S.dep.verifierThreshold))}</dd>
        <dt>${esc(t("production"))}</dt><dd>${fmt(p.production)} t</dd>
        <dt>${esc(t("directIndirect"))}</dt><dd>${fmt(p.direct / 1e6, 1)} kt / ${fmt(p.indirect / 1e6, 2)} kt</dd>
        <dt>${esc(t("recalc"))}</dt><dd>${fmt(r.independentDirectEmissionsKg / 1e6, 1)} kt</dd>
        <dt>${esc(t("model"))}</dt><dd>v${esc(r.model.version)} · <span class="mono">${short(r.model.modelHash)}</span></dd>
        <dt>${esc(t("reportHash"))}</dt><dd class="mono">${short(p.reportHash)}</dd>
        <dt>${esc(t("evidenceHash"))}</dt><dd class="mono">${short(p.evidenceHash)}</dd>
      </dl>`;
    const sm = S.summaries[p.id];
    $("summaryCard").innerHTML = sm
      ? `<h3>${esc(t("summary"))}</h3><p>${esc(LANG === "tr" ? sm.tr : sm.en)}</p>
         <h3>${esc(t("actions"))}</h3><ul class="plain">${(LANG === "tr" ? sm.actionsTr : sm.actionsEn).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
         <p class="note">${esc(t("summarySource", sm.source))}</p>`
      : "";
    $("summaryCard").hidden = !sm;
    $("findings").innerHTML = sortFindings(r.findings).map(findingItem).join("");
    $("revokeBtn").hidden = !(S.live && p.status !== "Revoked");
  }

  async function checkIntegrity() {
    const p = S.passports.find((x) => x.id === Number($("passportSel").value));
    const out = [];
    for (const [label, uri, onchain] of [[t("aiReport"), p.reportUri, p.reportHash], [t("evidenceBundle"), p.evidenceUri, p.evidenceHash]]) {
      const h = ethers.keccak256(await getBytes(uri));
      const ok = h.toLowerCase() === onchain.toLowerCase();
      out.push(`<div class="line"><span class="chip ${ok ? "ok" : "bad"}">${esc(ok ? t("match") : t("mismatch"))}</span><b>${esc(label)}</b> keccak256(file) <span class="mono">${short(h)}</span> ${ok ? "=" : "≠"} ${esc(t("onchain"))} <span class="mono">${short(onchain)}</span></div>`);
    }
    $("integrity").innerHTML = out.join("");
  }

  // ------------------------------------------------------------------ importer
  async function renderImporterList() {
    const imp = $("importerSel").value.toLowerCase();
    const items = S.manifest.disclosures.filter((d) => d.importer.toLowerCase() === imp);
    const keep = $("shipmentSel").value;
    $("shipmentSel").innerHTML = items.map((d) => `<option value="${esc(d.uri)}">${esc(d.shipmentId)} (${esc(t("verdicts")[d.verdict])})</option>`).join("");
    if (items.some((d) => d.uri === keep)) $("shipmentSel").value = keep;
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
        <dt>${esc(t("shipment"))}</dt><dd>${esc(s.shipmentId)}</dd>
        <dt>${esc(t("producer"))}</dt><dd>${esc(d.facilityName)} (${esc(d.installationId)})</dd>
        <dt>${esc(t("product"))}</dt><dd>${esc(s.product)} · CN ${esc(s.cnCode)}</dd>
        <dt>${esc(t("quantity"))}</dt><dd>${fmt(qtyT, 1)} t</dd>
        <dt>${esc(t("see"))}</dt><dd>${s.directKgPerT} kg/t direct · ${s.indirectKgPerT} kg/t indirect</dd>
        <dt>${esc(t("embedded"))}</dt><dd><b>${fmt(embedded, 1)} tCO2e</b></dd>
        <dt>${esc(t("grossCost"))}</dt><dd>€${fmt(embedded * price)} ${esc(t("withPassport"))} €${fmt(qtyT * defT * price)} ${esc(t("onDefault"))}</dd>
        <dt>${esc(t("passport"))}</dt><dd>${p ? `#${p.id} · <span class="chip ${p.status}">${esc(statusName(p.status))}</span>` : esc(t("notAnchored"))}</dd>
      </dl>`;
    $("importerChecks").innerHTML = "";
    $("declareBtn").hidden = !(S.live && p && p.status === "Approved");
  }

  function shipmentLeaf(d) {
    const s = d.shipment;
    const commitment = ethers.keccak256(
      coder.encode(["string", "address", "string", "uint256", "uint256", "uint256", "uint32", "bytes32"], [s.shipmentId, s.importer, s.cnCode, s.quantityKg, s.directKgPerT, s.indirectKgPerT, s.period, s.salt])
    );
    const leaf = ethers.keccak256(ethers.keccak256(coder.encode(["address", "bytes32"], [s.importer, commitment])));
    return { commitment, leaf };
  }

  async function runImporterChecks() {
    const d = S.disclosures[$("shipmentSel").value];
    if (!d) return;
    const s = d.shipment;
    const p = S.passports.find((x) => x.tag === d.submissionTag);
    const rows = [];
    const add = (ok, text) => rows.push(`<li>${esc(text)}<span class="r chip ${ok ? "ok" : "bad"}">${esc(ok ? t("pass") : t("fail"))}</span></li>`);
    const { commitment, leaf } = shipmentLeaf(d);
    add(commitment === d.commitment, t("c1"));
    let h = leaf;
    for (const sib of d.proof) h = BigInt(h) < BigInt(sib) ? ethers.keccak256(ethers.concat([h, sib])) : ethers.keccak256(ethers.concat([sib, h]));
    add(h.toLowerCase() === d.shipmentsRoot.toLowerCase(), t("c2", d.proof.length));
    add(!!p && p.shipmentsRoot.toLowerCase() === d.shipmentsRoot.toLowerCase(), t("c3", p ? p.id : "?", S.live));
    add(!!p && p.status === "Approved", t("c4", p ? statusName(p.status) : "?"));
    if (S.live && p) {
      add(await S.contract.verifyShipment(p.id, s.importer, commitment, d.proof), t("c5"));
      const under = Number(await S.contract.declaredUnder(leaf));
      rows.push(`<li>${esc(t("c6"))}<span class="r chip ${under ? "warn" : "ok"}">${esc(under ? t("declaredUnder", under) : t("notDeclared"))}</span></li>`);
    } else if (S.log && p) {
      const dec = S.log.declarations.find((x) => x.shipmentId === s.shipmentId);
      rows.push(`<li>${esc(t("c6s"))}<span class="r chip ${dec ? "warn" : "ok"}">${esc(dec ? t("declaredTx", short(dec.txHash)) : t("notDeclared"))}</span></li>`);
    }
    $("importerChecks").innerHTML = rows.join("");
  }

  function downloadShipment() {
    const d = S.disclosures[$("shipmentSel").value];
    const p = d && S.passports.find((x) => x.tag === d.submissionTag);
    if (!p) return;
    EmisCbam.download(`emispass-cbam-${d.shipment.shipmentId}.csv`, EmisCbam.toCsv(cbamFor(p, d.shipment)), "text/csv");
  }

  // ------------------------------------------------------------------ wallet (MetaMask / EIP-1193)
  function renderWalletButton() {
    $("walletBtn").textContent = S.account ? `${t("connected")} ${S.account.slice(0, 6)}…${S.account.slice(-4)}` : t("connect");
  }

  async function connectWallet() {
    if (!window.ethereum) return toast(t("noWallet"));
    const hexId = "0x" + S.dep.chainId.toString(16);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: hexId, chainName: `EmisPass ${S.dep.network}`, rpcUrls: [S.dep.rpcUrl], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 } }] });
      } else throw e;
    }
    const bp = new ethers.BrowserProvider(window.ethereum);
    S.signer = await bp.getSigner();
    S.account = await S.signer.getAddress();
    renderWalletButton();
    window.ethereum.on && window.ethereum.on("accountsChanged", () => { S.signer = null; S.account = null; renderWalletButton(); });
  }

  async function sendTx(fn) {
    if (!S.live) return toast(t("needLive"));
    if (!S.signer) await connectWallet();
    if (!S.signer) return;
    try {
      const tx = await fn(S.contract.connect(S.signer));
      toast(t("txSent", short(tx.hash)), 8000);
      await tx.wait();
      toast(t("txDone"));
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast(e.shortMessage || e.message, 8000);
    }
  }

  async function declareWithWallet() {
    const d = S.disclosures[$("shipmentSel").value];
    const p = d && S.passports.find((x) => x.tag === d.submissionTag);
    if (!p) return;
    if (!S.signer) await connectWallet().catch((e) => toast(e.message));
    if (!S.account) return;
    if (S.account.toLowerCase() !== d.shipment.importer.toLowerCase()) return toast(t("wrongAccount", short(d.shipment.importer)), 8000);
    const { commitment } = shipmentLeaf(d);
    await sendTx((c) => c.declareShipment(p.id, commitment, d.proof));
  }

  async function revokeWithWallet() {
    const p = S.passports.find((x) => x.id === Number($("passportSel").value));
    if (!S.signer) await connectWallet().catch((e) => toast(e.message));
    if (!S.account) return;
    const role = await S.contract.REGULATOR_ROLE();
    if (!(await S.contract.hasRole(role, S.account))) return toast(t("notRegulator"), 8000);
    const reason = window.prompt(t("revokeReason"));
    if (!reason) return;
    await sendTx((c) => c.revokePassport(p.id, reason));
  }

  // ------------------------------------------------------------------ real data
  function quantiles(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function routeOf(a) {
    const tpe = (a.assetType || "").toUpperCase();
    if (a.sector === "iron-and-steel") return tpe.includes("EAF") ? "EAF" : tpe.includes("BF") || tpe.includes("BOF") ? "BF-BOF" : tpe || "unknown";
    return a.sector;
  }

  function renderRealData() {
    if (S.s5p) {
      const months = Object.entries(S.s5p.months);
      const vals = months.map(([, v]) => v.meanEnhancement * 1e6);
      const W = 760, H = 240, padL = 48, padB = 34, padT = 14;
      const max = Math.max(...vals, 1) * 1.15, min = Math.min(0, ...vals);
      const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
      const bw = (W - padL - 10) / months.length;
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Sentinel-5P NO2">`;
      for (let i = 0; i <= 4; i++) {
        const v = min + ((max - min) / 4) * i;
        svg += `<line x1="${padL}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(0)}</text>`;
      }
      months.forEach(([m, v], i) => {
        const val = vals[i], x = padL + i * bw + bw * 0.18, w = bw * 0.64;
        svg += `<rect x="${x}" y="${Math.min(y(val), y(0))}" width="${w}" height="${Math.abs(y(0) - y(val))}" rx="2" fill="var(--bar)"><title>${period(m)}: ${val.toFixed(1)} µmol/m² (${v.samples})</title></rect>`;
        if (i % 2 === 0) svg += `<text x="${x + w / 2}" y="${H - padB + 14}" text-anchor="middle">${period(m)}</text>`;
      });
      svg += `<text x="${padL}" y="${padT - 2}">µmol/m²</text></svg>`;
      $("s5pChart").innerHTML = svg;
      $("s5pNote").textContent = t("s5pNote", S.s5p.daily.length, S.s5p.qaMin);
    } else {
      $("s5pChart").innerHTML = `<p class="note">data/sentinel5p/iskenderun-bay.json missing.</p>`;
    }
    if (S.ct) {
      const groups = {};
      for (const a of S.ct.assets) if (a.emissionsFactor > 0) (groups[routeOf(a)] = groups[routeOf(a)] || []).push(a.emissionsFactor);
      const routes = ["EAF", "cement", "aluminum", "BF-BOF"].filter((r) => groups[r]);
      const W = 760, rowH = 34, padL = 90, H = routes.length * rowH + 30;
      const max = 3.2, x = (v) => padL + (W - padL - 10) * Math.min(v, max) / max;
      let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Climate TRACE intensities">`;
      for (let v = 0; v <= 3; v += 0.5) svg += `<line x1="${x(v)}" x2="${x(v)}" y1="4" y2="${H - 22}" stroke="var(--line)"/><text x="${x(v)}" y="${H - 6}" text-anchor="middle">${v.toFixed(1)}</text>`;
      routes.forEach((r, i) => {
        const cy = 18 + i * rowH;
        svg += `<text x="${padL - 8}" y="${cy + 4}" text-anchor="end">${esc(r)}</text>`;
        groups[r].forEach((v, j) => (svg += `<circle cx="${x(v)}" cy="${cy + ((j % 5) - 2) * 3}" r="4" fill="var(--bar)" fill-opacity="0.55"/>`));
      });
      svg += `</svg>`;
      $("ctChart").innerHTML = svg;
      const bm = S.sim ? S.sim.benchmarks : null;
      $("ctTable").querySelector("tbody").innerHTML = routes
        .map((r) => {
          const s = [...groups[r]].sort((a, b) => a - b);
          const b = bm && bm[r];
          const total = S.ct.assets.filter((a) => routeOf(a) === r).reduce((acc, a) => acc + (a.emissionsT || 0), 0) / 1e6;
          return `<tr><td>${esc(r)}</td><td>${s.length}</td><td>${fmt(b ? b.medianT : quantiles(s, 0.5), 3)}</td><td>${fmt(b ? b.p10T : quantiles(s, 0.1), 3)} – ${fmt(b ? b.p90T : quantiles(s, 0.9), 3)}</td><td>${fmt(total, 1)}</td></tr>`;
        })
        .join("");
      $("ctNote").textContent = `${t("ctNote", S.ct.assets.length)} ${S.ct.source} · ${S.ct.retrievedAt.slice(0, 10)}`;
    }
  }

  // ------------------------------------------------------------------ security
  const TRUST = {
    en: [
      ["Operator", "can lie about activity data → caught by signed third-party feeds and independent recalculation."],
      ["One verifier", "can be bribed or hacked → k-of-n threshold (2-of-3), duplicate and unregistered signatures ignored."],
      ["Relayer", "can alter numbers in transit → EIP-712 signatures over every field, nonce blocks replay."],
      ["Importer", "could reuse a record → leaf bound to its address, declarable once."],
      ["AI model", "could be swapped → model hash of code, factors and ML config stored per passport."],
    ],
    tr: [
      ["Operatör", "faaliyet verisinde yalan söyleyebilir → imzalı üçüncü taraf verileri ve bağımsız yeniden hesaplama yakalar."],
      ["Tek doğrulayıcı", "rüşvet alabilir ya da ele geçirilebilir → k-of-n eşik (2/3); tekrarlanan ve kayıtsız imzalar sayılmaz."],
      ["Aktarıcı", "rakamları yolda değiştirebilir → her alan EIP-712 ile imzalı, nonce tekrar gönderimi engeller."],
      ["İthalatçı", "bir kaydı yeniden kullanabilir → yaprak adresine bağlı, yalnızca bir kez beyan edilebilir."],
      ["YZ modeli", "değiştirilebilir → kod, faktörler ve ML ayarlarının hash'i her pasaportta saklanır."],
    ],
  };
  const OFFCHAIN = {
    en: ["Plant process data and fuel invoices (only <code>evidenceHash</code> on-chain).", "Full AI report (only <code>reportHash</code>, verifiable by anyone holding the file).", "Per-shipment quantities and buyers (salted commitments in a Merkle tree)."],
    tr: ["Tesis süreç verisi ve yakıt faturaları (zincirde yalnızca <code>evidenceHash</code>).", "Tam YZ raporu (yalnızca <code>reportHash</code>; dosyaya sahip olan herkes doğrulayabilir).", "Sevkiyat başına miktarlar ve alıcılar (Merkle ağacında tuzlanmış taahhütler)."],
  };
  function renderSecurity() {
    const rows = (S.log ? S.log.attacks : []).map((a) => `<tr><td>${esc(a.label)}</td><td class="mono">${esc(a.expected)}</td><td><span class="chip ${a.blocked ? "ok" : "bad"}">${esc(a.blocked ? t("blocked") : a.result)}</span></td></tr>`);
    $("attacks").querySelector("tbody").innerHTML = rows.join("") || `<tr><td colspan="3">Run scripts/anchor.js to execute the attack suite.</td></tr>`;
    $("trustList").innerHTML = TRUST[LANG].map(([a, b]) => `<li><b>${esc(a)}</b> ${esc(b)}</li>`).join("");
    $("offchainList").innerHTML = OFFCHAIN[LANG].map((x) => `<li>${x}</li>`).join("");
  }

  // ------------------------------------------------------------------ wiring
  function switchTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === name));
  }

  function fillSelects() {
    const keepF = $("facilitySel").value, keepP = $("passportSel").value, keepI = $("importerSel").value;
    $("facilitySel").innerHTML = Object.entries(S.dep.facilities).map(([id, f]) => `<option value="${id}">${esc(f.name)}</option>`).join("");
    if (keepF) $("facilitySel").value = keepF;
    $("passportSel").innerHTML = S.passports.map((p) => `<option value="${p.id}">#${p.id} · ${esc((S.dep.facilities[p.facilityId] || {}).name)} · ${period(p.period)}${p.kind === "correction" ? ` ${esc(t("correction"))}` : ""} · ${esc(statusName(p.status))}</option>`).join("");
    const flagged = S.passports.find((p) => p.status === "Flagged");
    $("passportSel").value = keepP || (flagged ? flagged.id : S.passports[0] && S.passports[0].id);
    $("importerSel").innerHTML = Object.entries(S.dep.importers).map(([k, a]) => `<option value="${a}">EU Importer ${k} (${short(a)})</option>`).join("");
    if (keepI) $("importerSel").value = keepI;
  }

  async function renderAll() {
    applyStatic();
    renderHeader();
    fillSelects();
    renderOverview();
    renderSimulator();
    renderProducer();
    renderVerifier();
    await renderImporterList();
    renderRealData();
    renderSecurity();
  }

  async function main() {
    document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.querySelectorAll(".lang button").forEach((b) =>
      b.addEventListener("click", async () => {
        LANG = b.dataset.lang;
        store.set("emispass.lang", LANG);
        await renderAll();
      })
    );
    applyStatic();
    try {
      await load();
    } catch (e) {
      $("chain").textContent = "";
      $("overview").innerHTML = `<div class="card"><h3>Demo data not found</h3><p>${esc(e.message)}</p><p class="note">Run the demo pipeline first (see README) and serve the repository root, e.g. <code>python -m http.server 8080</code>, then open <code>/app/</code>.</p></div>`;
      return;
    }
    $("facilitySel").addEventListener("change", renderProducer);
    $("passportSel").addEventListener("change", renderVerifier);
    $("integrityBtn").addEventListener("click", checkIntegrity);
    $("revokeBtn").addEventListener("click", revokeWithWallet);
    $("importerSel").addEventListener("change", renderImporterList);
    $("shipmentSel").addEventListener("change", renderDisclosure);
    $("checkBtn").addEventListener("click", runImporterChecks);
    $("declareBtn").addEventListener("click", declareWithWallet);
    $("dlCsv").addEventListener("click", () => downloadProducer("csv"));
    $("dlJson").addEventListener("click", () => downloadProducer("json"));
    $("dlShipCsv").addEventListener("click", downloadShipment);
    $("walletBtn").addEventListener("click", () => connectWallet().catch((e) => toast(e.message)));
    $("simFacility").addEventListener("change", (e) => { simState.fid = e.target.value; applyPreset("honest"); });
    await renderAll();

    const tab = params.get("tab");
    if (tab && document.getElementById(tab)) switchTab(tab);
    if (tab === "verifier") checkIntegrity();
    if (tab === "importer") runImporterChecks();
    if (tab === "simulator" && params.get("preset")) applyPreset(params.get("preset"));
  }

  main();
})();
