/* Export of passport data in the shape of the key fields of the EU CBAM "communication template
   for installations" (Implementing Regulation (EU) 2023/1773). Not the official Excel template. */
(function (root) {
  const CATEGORY = { IronSteel: "Iron or steel products", Cement: "Cement", Aluminium: "Aluminium products", Fertiliser: "Fertilisers" };

  function lastDay(period) {
    const y = Math.floor(period / 100), m = period % 100;
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function build({ passport, report, facility, dep, shipment }) {
    const p = String(passport.period);
    const prod = passport.production;
    const data = {
      template: "EmisPass export - key fields of the EU CBAM communication template for installations (Implementing Regulation (EU) 2023/1773). Not the official template.",
      installation: {
        name: facility.name,
        installationId: facility.installationId,
        country: "TR",
        aggregatedGoodsCategory: CATEGORY[facility.sector] || facility.sector,
        productionRoute: facility.route,
      },
      reportingPeriod: { start: `${p.slice(0, 4)}-${p.slice(4)}-01`, end: `${p.slice(0, 4)}-${p.slice(4)}-${lastDay(passport.period)}` },
      goods: {
        cnCode: facility.cnCode,
        description: report.facility.product,
        productionTonnes: prod,
        specificDirectEmissions_tCO2e_per_t: +(passport.direct / prod / 1000).toFixed(4),
        specificIndirectEmissions_tCO2e_per_t: +(passport.indirect / prod / 1000).toFixed(4),
        indirectEmissionsInCbamScope: report.cbam.indirectInScope,
        determinationMethod: "Actual data - calculation-based (activity data x IPCC 2006 default emission factors)",
        electricityEmissionFactorSource: "Grid mix (EPİAŞ generation by source)",
      },
      carbonPricePaid: { amount: 0, currency: "TRY", note: "TR-ETS pilot year 2026 is reporting-only; no carbon price due." },
      verification: {
        emisPassPassportId: passport.id,
        status: passport.status,
        riskScore: passport.riskScore,
        verifierSignatures: passport.sigs,
        verifierThreshold: dep.verifierThreshold,
        reportHash: passport.reportHash,
        evidenceHash: passport.evidenceHash,
        modelHash: report.model.modelHash,
        contract: dep.contracts.EmissionPassport,
        chainId: dep.chainId,
        network: dep.network,
      },
    };
    if (shipment) {
      data.shipment = {
        shipmentId: shipment.shipmentId,
        importer: shipment.importer,
        quantityTonnes: shipment.quantityKg / 1000,
        embeddedDirect_tCO2e: +((shipment.quantityKg / 1000) * shipment.directKgPerT / 1000).toFixed(3),
        embeddedIndirect_tCO2e: +((shipment.quantityKg / 1000) * shipment.indirectKgPerT / 1000).toFixed(3),
      };
    }
    return data;
  }

  function toCsv(obj) {
    const rows = [["field", "value"]];
    (function flat(o, prefix) {
      for (const [k, v] of Object.entries(o)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") flat(v, key);
        else rows.push([key, v]);
      }
    })(obj, "");
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  root.EmisCbam = { build, toCsv, download };
})(typeof self !== "undefined" ? self : this);
