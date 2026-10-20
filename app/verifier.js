/* In-browser port of verifier/emispass/checks.py + node.verify for the "try to cheat" simulator.
   Uses the models exported to out/simulator.json; scripts/check-simulator.js asserts that it
   reproduces the Python verdicts. Works in the browser (window.EmisVerifier) and in Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("ethers"));
  else root.EmisVerifier = factory(root.ethers);
})(typeof self !== "undefined" ? self : this, function (ethers) {
  const pct = (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100);
  const f32 = Math.fround;

  function walk(tree, x) {
    let i = 0;
    while (tree.left[i] !== -1) i = f32(x[tree.feature[i]]) <= tree.threshold[i] ? tree.left[i] : tree.right[i];
    return i;
  }
  const predictGbr = (m, x) => m.init + m.learningRate * m.trees.reduce((s, t) => s + t.value[walk(t, x)], 0);
  const scoreIforest = (m, x) => -Math.pow(2, -m.trees.reduce((s, t) => s + t.leafDepth[walk(t, x)], 0) / m.denominator);

  function deepEqual(a, b) {
    if (typeof a !== typeof b) return false;
    if (a && typeof a === "object") {
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
    }
    return a === b;
  }

  function finding(check, severity, key, values) {
    return { check, severity, key, values: values || {} };
  }

  function independentDirectKg(B, rec, route) {
    const d = rec.declaration, del = rec.feeds.fuelSupplier.record.deliveries;
    let total = 0;
    for (const f of B.fuelsByRoute[route]) total += (f in del ? del[f] : d.activity[f] || 0) * B.emissionFactors[f];
    return total * 1000;
  }

  function verify(B, fac, rec) {
    const route = fac.route, d = rec.declaration, T = B.tolerance, out = [];
    // 1. provenance
    for (const [name, env] of Object.entries(rec.feeds)) {
      let okSig = false;
      try {
        okSig = ethers.verifyMessage(ethers.toUtf8Bytes(env.message), env.signature).toLowerCase() === env.signer.toLowerCase();
      } catch (_) {}
      const okBody = deepEqual(JSON.parse(env.message), env.record);
      const expected = B.trustedFeeds[name];
      const okSigner = !!expected && env.signer.toLowerCase() === expected.toLowerCase();
      const okScope = env.record.installationId === d.installationId && env.record.period === rec.period;
      out.push(okSig && okBody && okSigner && okScope
        ? finding("provenance", "info", "feedAuthentic", { feed: name })
        : finding("provenance", "critical", "feedFailed", { feed: name, signatureValid: okSig && okBody, trustedSigner: okSigner, scopeMatches: okScope }));
    }
    // 2. reconciliation
    const metered = rec.feeds.gridMeter.record.electricityMWh;
    let dev = pct(d.electricityMWh, metered);
    out.push(finding("reconciliation", Math.abs(dev) > T.electricityMeterPct ? "high" : "info", "elecVsMeter", { declared: d.electricityMWh, metered, deviationPct: dev }));
    for (const [fuel, delivered] of Object.entries(rec.feeds.fuelSupplier.record.deliveries)) {
      const declared = d.activity[fuel] || 0;
      dev = pct(declared, delivered);
      let sev = "info";
      if (Math.abs(dev) > T.fuelDeliveryPct) sev = dev < -3 * T.fuelDeliveryPct ? "critical" : "high";
      out.push(finding("reconciliation", sev, "fuelVsDeliveries", { fuel, declared, delivered, deviationPct: dev }));
    }
    // 3. recalculation
    const own = B.fuelsByRoute[route].reduce((s, f) => s + (d.activity[f] || 0) * B.emissionFactors[f], 0) * 1000;
    const independent = independentDirectKg(B, rec, route);
    const arith = pct(d.directEmissionsKg, own);
    if (Math.abs(arith) > 0.5) out.push(finding("recalculation", "high", "totalMismatch", { deviationPct: arith }));
    dev = pct(d.directEmissionsKg, independent);
    out.push(finding("recalculation", Math.abs(dev) > T.recalcCriticalPct ? "critical" : Math.abs(dev) > T.recalcHighPct ? "high" : "info", "directVsRecalc", { declaredKg: d.directEmissionsKg, independentKg: independent, deviationPct: dev }));
    const indExpected = metered * d.gridEmissionFactor * 1000;
    const devI = pct(d.indirectEmissionsKg, indExpected);
    out.push(finding("recalculation", Math.abs(devI) > T.recalcHighPct ? "high" : "info", "indirectVsMeter", { declaredKg: d.indirectEmissionsKg, expectedKg: indExpected, deviationPct: devI }));
    // 4. benchmark (real Climate TRACE data)
    const g = B.benchmarks[B.benchmarkGroup[route]];
    const intensity = d.directEmissionsKg / d.productionTonnes / 1000;
    const bsev = intensity < g.p10T * 0.85 ? "medium" : intensity > g.p90T * 1.25 ? "low" : "info";
    out.push(finding("benchmark", bsev, bsev === "medium" ? "benchLow" : bsev === "low" ? "benchHigh" : "benchOk", { intensityT: intensity, p10T: g.p10T, p90T: g.p90T, medianT: g.medianT, peerAssets: g.assets, group: B.benchmarkGroup[route] }));
    // 5. ML expected intensity (GradientBoostingRegressor)
    const prod = d.productionTonnes, del = rec.feeds.fuelSupplier.record.deliveries;
    const fuelCo2PerT = Object.entries(del).reduce((s, [f, q]) => s + q * B.emissionFactors[f], 0) / prod;
    const predicted = predictGbr(B.gbr, [fac.routeIndex, fuelCo2PerT, metered / prod, (rec.satellite.no2AnomalyUmolM2 / prod) * 1000]);
    dev = pct(intensity, predicted);
    out.push(finding("ml-expected-intensity", dev < -15 ? "high" : dev < -7 ? "medium" : "info", "mlIntensity", { predictedT: predicted, declaredT: intensity, deviationPct: dev }));
    // 6. ML anomaly vs own history (IsolationForest + robust z)
    const H = fac.history;
    const feats = [d.directEmissionsKg / prod, d.indirectEmissionsKg / prod, d.directEmissionsKg / independent, prod / rec.satellite.no2AnomalyUmolM2];
    const x = feats.map((v, i) => (v - H.mu[i]) / H.sd[i]);
    const score = scoreIforest(H.iforest, x);
    let worst = 0;
    x.forEach((v, i) => { if (Math.abs(v) > Math.abs(x[worst])) worst = i; });
    const anomalous = score < H.floor - 0.02 || Math.abs(x[worst]) > 4.0;
    out.push(finding("ml-anomaly", anomalous ? "medium" : "info", anomalous ? "anomalous" : "consistent", { score, historicalFloor: H.floor, driver: worst, zScore: x[worst], historyMonths: H.months }));
    // 7. satellite consistency
    const implied = rec.satellite.no2AnomalyUmolM2 * H.satelliteRatioMedian;
    dev = pct(prod, implied);
    out.push(finding("satellite", Math.abs(dev) > T.satelliteProductionPct ? "medium" : "info", "satellite", { impliedT: implied, declaredT: prod, deviationPct: dev }));

    const riskScore = Math.min(1000, out.reduce((s, f) => s + B.severityPoints[f.severity], 0));
    const critical = out.some((f) => f.severity === "critical");
    return { findings: out, riskScore, verdict: critical || riskScore >= B.flagThreshold ? "FLAGGED" : "APPROVED", independentDirectKg: independent, intensityT: intensity };
  }

  /** Rebuild the operator's declaration from multipliers, as the plant's MRV system would. */
  function declare(B, fac, opts) {
    const base = fac.record.declaration, o = opts || {};
    const fuel = o.fuel || {};
    const activity = {};
    for (const [k, v] of Object.entries(base.activity)) activity[k] = v * (fuel[k] == null ? 1 : fuel[k]);
    const electricityMWh = base.electricityMWh * (o.electricity == null ? 1 : o.electricity);
    const productionTonnes = Math.round(base.productionTonnes * (o.production == null ? 1 : o.production));
    let direct = B.fuelsByRoute[fac.route].reduce((s, f) => s + (activity[f] || 0) * B.emissionFactors[f], 0) * 1000;
    if (o.hideTotal) direct *= 1 - o.hideTotal;
    const decl = Object.assign({}, base, {
      activity, electricityMWh, productionTonnes,
      directEmissionsKg: Math.round(direct),
      indirectEmissionsKg: Math.round(electricityMWh * base.gridEmissionFactor * 1000),
    });
    const feeds = JSON.parse(JSON.stringify(fac.record.feeds));
    if (o.tamperMeter) feeds.gridMeter.record.electricityMWh = Math.round(feeds.gridMeter.record.electricityMWh * 0.85 * 1000) / 1000;
    return { period: fac.record.period, declaration: decl, feeds, satellite: fac.record.satellite };
  }

  return { verify, declare, predictGbr, scoreIforest };
});
