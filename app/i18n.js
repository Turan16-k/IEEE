/* UI strings (EN/TR) and bilingual rendering of verifier findings from their numeric values. */
(function (root) {
  const S = {
    en: {
      tagline: "Verifiable embedded-emission passports for CBAM & TR-ETS",
      tabOverview: "Overview", tabSimulator: "Try to cheat", tabProducer: "Producer", tabVerifier: "AI Verifier", tabImporter: "EU Importer", tabRealData: "Real data", tabSecurity: "Security",
      connect: "Connect wallet", connected: "Wallet",
      lede: "A Turkish steel or cement exporter that cannot prove its real emissions pays CBAM on punitive <em>default values</em>. EmisPass turns a plant's monthly emission report into a passport that three independent AI verifiers must co-sign before it is anchored on-chain, and that an EU importer can check for its own shipment without seeing anyone else's data.",
      flow1: "Operator signs", flow1s: "monthly activity data & totals (EIP-712)",
      flow2: "Signed feeds", flow2s: "grid meter, fuel supplier, satellite",
      flow3: "3 AI verifiers", flow3s: "reconcile, recalculate, ML anomaly checks",
      flow4: "2-of-3 on-chain", flow4s: "passport anchored, report hash bound",
      flow5: "EU importer", flow5s: "Merkle proof, declares shipment once",
      kPassports: "passports anchored", kApproved: "approved", kFlagged: "flagged by AI verifiers", kDeclared: "shipments declared by EU importers", kAttacks: "attacks blocked on-chain", kThreshold: "verifier threshold",
      passportsTitle: "Passports on-chain", thFacility: "Facility", thPeriod: "Period", thStatus: "Status", thRisk: "Risk", thSigs: "Verifier sigs", thDirect: "Direct tCO2e/t",
      report: "Report →", correction: "(correction)",
      liveNote: (b, c) => `Read live from <span class="mono">EmissionPassport</span> at block ${b} (chainId ${c}).`,
      snapNote: "Chain not reachable from this browser; values come from the anchored snapshot in out/anchor-log.json.",
      chainLive: (n, b) => `${n} · block ${b}`, chainSnap: (n) => `${n} unreachable · showing anchored snapshot`,
      simTitle: "Play the dishonest plant manager",
      simLede: "Change what the plant declares and watch the same AI verifier that signs passports react. Supplier, grid-meter and satellite data stay what they really were — exactly as in real life. Runs entirely in your browser with the exported models.",
      facility: "Facility", presets: "Scenarios", pHonest: "Honest report", pFuel: "Hide 30 % of main fuel", pElec: "Hide 10 % of electricity", pProd: "Under-report production 20 %", pTotal: "Shave 12 % off the total only", pTamper: "Edit meter record after signing",
      fuelSlider: (l) => `Declared ${l}`, elecSlider: "Declared electricity", prodSlider: "Declared production", hideTotal: "Lower reported total without changing activity data", tamper: "Alter the grid-meter record after the utility signed it",
      ofTrue: "of real value", simVerdict: "AI verifier verdict", simWould: (s) => `On-chain this passport would be <b>${s}</b>.`, simApproved: "Approved", simFlagged: "Flagged — shipments cannot be declared",
      declaredVs: "Declared vs independent direct emissions", simNote: "Same Gradient Boosting and Isolation Forest models as the verifier nodes, exported from scikit-learn and parity-tested (scripts/check-simulator.js). Feed signatures are verified with ethers.js.",
      chartTitle: "Direct emission intensity vs Turkish peers", chartNote: "Bars: verified monthly specific direct emissions. Band: p10–p90 of Turkish installations on the same route (Climate TRACE, real data). Dashed: illustrative CBAM default incl. 2026 mark-up.",
      worthTitle: "What verified data is worth", latestPassport: (id, p, ind) => `Latest approved passport #${id} (${p}), CBAM scope: direct${ind ? " + indirect" : ""} emissions.`,
      verifiedActual: "Verified actual", illusDefault: "Illustrative default", perTonne: "per tonne", saving: (s, p) => `<b>€${s}/t</b> lower gross CBAM exposure for the EU buyer when the passport is used instead of the default, at €${p}/tCO2e.`,
      committed: (n) => `${n} shipments to EU importers committed in this passport.`, cbamNote: "Gross exposure before the free-allocation adjustment (CBAM factor). Default value is ILLUSTRATIVE (Turkish route p90 from Climate TRACE × 1.10 mark-up), not the official EU default.",
      dlCsv: "CBAM supplier data (CSV)", dlJson: "CBAM supplier data (JSON)",
      passport: "Passport", verifyHashes: "Verify report & evidence hashes", revoke: "Revoke (regulator)", revokeReason: "Reason for revocation (e.g. site visit finding):",
      onchainStatus: "On-chain status", riskScore: "Risk score", sigs: "Verifier signatures", sigsOf: (a, b, k) => `${a} of ${b} (threshold ${k})`, production: "Production", directIndirect: "Direct / indirect", recalc: "Independent recalculation", model: "Model", reportHash: "Report hash", evidenceHash: "Evidence hash",
      findings: "Findings", summary: "Plain-language summary", actions: "Next steps", summarySource: (s) => s.startsWith("llm") ? `Written by Claude (${s.slice(4)}) from the report; the verdict comes from the checks.` : "Template summary generated from the report.",
      match: "match", mismatch: "MISMATCH", aiReport: "AI report", evidenceBundle: "Evidence bundle", onchain: "on-chain",
      actingAs: "Acting as", shipment: "Shipment", disclosed: "Disclosed to you by the producer", indepChecks: "Independent checks", runChecks: "Run checks", declareWallet: "Declare with connected wallet",
      privacy: "Only a salted commitment of your shipment is on-chain. Other importers' quantities and the plant's process data stay private.",
      producer: "Producer", product: "Product", quantity: "Quantity", see: "Specific emissions", embedded: "Embedded (CBAM scope)", grossCost: "Gross CBAM cost", withPassport: "with passport vs", onDefault: "on illustrative default", notAnchored: "not anchored",
      c1: "Disclosed values hash to the committed shipment record", c2: (n) => `Merkle proof (${n} hashes) reaches the passport root`, c3: (id, live) => `Root matches passport #${id} ${live ? "on-chain" : "(snapshot)"}`, c4: (s) => `Passport status is ${s}`, c5: "Contract verifyShipment() accepts the proof for your address", c6: "Declaration status", c6s: "Declaration status (snapshot)",
      notDeclared: "not yet declared", declaredUnder: (id) => `already declared under #${id}`, declaredTx: (h) => `declared in tx ${h}`, pass: "pass", fail: "fail",
      realTitle: "Real satellite and emissions data", s5pTitle: "Sentinel-5P NO₂ over İskenderun Bay industrial zone (real data)",
      s5pNote: (n, q) => `Monthly mean tropospheric NO₂ column over the industrial box minus a rural background box, from ${n} cloud-screened overpasses (qa ≥ ${q}). This is the production signal the verifier uses as supporting evidence; here it is computed from real Copernicus data for 2025-07 – 2026-09. Winter values are higher because NO₂ lives longer in cold, dark months, which is why the verifier compares a plant with its own seasonal history; months without cloud-free overpasses are omitted.`,
      ctTitle: "Turkish peer benchmarks (Climate TRACE, real data)", ctNote: (n) => `${n} Turkish installations. Each dot is one installation's estimated emission intensity; the verifier flags a declared intensity far below its route's p10.`,
      routeCol: "Route", assetsCol: "Installations", medianCol: "Median t/t", bandCol: "p10 – p90", totalCol: "Emissions (Mt/yr)",
      attacksTitle: "Attacks executed against the deployed contracts", thAttack: "Attack", thDefence: "Expected defence", thResult: "Result", blocked: "blocked",
      trustTitle: "Trust boundaries", offchainTitle: "What stays off-chain",
      footer: "EmisPass · IEEE ClimateChain Global Hackathon 2026 · Track: Carbon Markets & Emissions Transparency · Facilities and plant data in this demo are <b>fictional/synthetic</b>; peer benchmarks (Climate TRACE) and satellite NO₂ (Copernicus Sentinel-5P) are real data.",
      noWallet: "No browser wallet found. Install MetaMask to send transactions.", txSent: (h) => `Transaction sent: ${h}`, txDone: "Confirmed. Reloading…", needLive: "Wallet actions need a reachable chain (local node or testnet).", wrongAccount: (a) => `Switch your wallet to ${a} to declare this shipment.`, notRegulator: "The connected account does not hold REGULATOR_ROLE.",
      sevNames: { info: "info", low: "low", medium: "medium", high: "high", critical: "critical" },
      verdicts: { APPROVED: "APPROVED", FLAGGED: "FLAGGED" },
      status: { Approved: "Approved", Flagged: "Flagged", Revoked: "Revoked", None: "None" },
    },
    tr: {
      tagline: "CBAM ve TR-ETS için doğrulanabilir gömülü emisyon pasaportları",
      tabOverview: "Genel bakış", tabSimulator: "Hileyi dene", tabProducer: "Üretici", tabVerifier: "YZ Doğrulayıcı", tabImporter: "AB İthalatçısı", tabRealData: "Gerçek veri", tabSecurity: "Güvenlik",
      connect: "Cüzdan bağla", connected: "Cüzdan",
      lede: "Gerçek emisyonlarını kanıtlayamayan Türk çelik ya da çimento ihracatçısı, CBAM'ı cezalandırıcı <em>varsayılan değerler</em> üzerinden öder. EmisPass, bir tesisin aylık emisyon raporunu, zincire yazılmadan önce üç bağımsız yapay zekâ doğrulayıcısının birlikte imzalaması gereken bir pasaporta dönüştürür. AB ithalatçısı bu pasaportu, başkasının verisini görmeden kendi sevkiyatı için kontrol edebilir.",
      flow1: "Operatör imzalar", flow1s: "aylık faaliyet verisi ve toplamlar (EIP-712)",
      flow2: "İmzalı veri akışları", flow2s: "şebeke sayacı, yakıt tedarikçisi, uydu",
      flow3: "3 YZ doğrulayıcı", flow3s: "mutabakat, yeniden hesaplama, ML anomali",
      flow4: "Zincirde 2/3 onay", flow4s: "pasaport yazılır, rapor hash'i bağlanır",
      flow5: "AB ithalatçısı", flow5s: "Merkle kanıtı, sevkiyatı bir kez beyan eder",
      kPassports: "zincirdeki pasaport", kApproved: "onaylı", kFlagged: "YZ tarafından işaretli", kDeclared: "AB ithalatçılarının beyan ettiği sevkiyat", kAttacks: "zincirde engellenen saldırı", kThreshold: "doğrulayıcı eşiği",
      passportsTitle: "Zincirdeki pasaportlar", thFacility: "Tesis", thPeriod: "Dönem", thStatus: "Durum", thRisk: "Risk", thSigs: "Doğrulayıcı imzası", thDirect: "Doğrudan tCO2e/t",
      report: "Rapor →", correction: "(düzeltme)",
      liveNote: (b, c) => `<span class="mono">EmissionPassport</span> sözleşmesinden canlı okundu: blok ${b} (chainId ${c}).`,
      snapNote: "Bu tarayıcıdan zincire erişilemiyor; değerler out/anchor-log.json içindeki kayıtlı anlık görüntüden geliyor.",
      chainLive: (n, b) => `${n} · blok ${b}`, chainSnap: (n) => `${n} erişilemiyor · kayıtlı anlık görüntü`,
      simTitle: "Hileli tesis müdürünü oyna",
      simLede: "Tesisin beyan ettiği değerleri değiştir ve pasaportları imzalayan yapay zekâ doğrulayıcısının nasıl tepki verdiğini izle. Tedarikçi, sayaç ve uydu verileri gerçekte neyse o kalır — tıpkı gerçek hayatta olduğu gibi. Dışa aktarılan modellerle tamamen tarayıcında çalışır.",
      facility: "Tesis", presets: "Senaryolar", pHonest: "Dürüst beyan", pFuel: "Ana yakıtın %30'unu gizle", pElec: "Elektriğin %10'unu gizle", pProd: "Üretimi %20 düşük bildir", pTotal: "Yalnızca toplamdan %12 düş", pTamper: "İmzadan sonra sayaç kaydını değiştir",
      fuelSlider: (l) => `Beyan edilen ${l}`, elecSlider: "Beyan edilen elektrik", prodSlider: "Beyan edilen üretim", hideTotal: "Faaliyet verisini değiştirmeden bildirilen toplamı düşür", tamper: "Şebeke sayacı kaydını dağıtım şirketi imzaladıktan sonra değiştir",
      ofTrue: "gerçek değerin", simVerdict: "YZ doğrulayıcı kararı", simWould: (s) => `Bu pasaport zincirde <b>${s}</b> olurdu.`, simApproved: "onaylı", simFlagged: "işaretli — sevkiyatlar beyan edilemez",
      declaredVs: "Beyan edilen ve bağımsız hesaplanan doğrudan emisyon", simNote: "Doğrulayıcı düğümlerle aynı Gradient Boosting ve Isolation Forest modelleri; scikit-learn'den dışa aktarıldı ve eşdeğerlik testi yapıldı (scripts/check-simulator.js). Veri akışı imzaları ethers.js ile doğrulanır.",
      chartTitle: "Türk benzerlerine göre doğrudan emisyon yoğunluğu", chartNote: "Çubuklar: doğrulanmış aylık özgül doğrudan emisyon. Bant: aynı rotadaki Türk tesislerinin p10–p90 aralığı (Climate TRACE, gerçek veri). Kesikli çizgi: 2026 ek oranı dahil temsili CBAM varsayılan değeri.",
      worthTitle: "Doğrulanmış verinin değeri", latestPassport: (id, p, ind) => `Son onaylı pasaport #${id} (${p}), CBAM kapsamı: doğrudan${ind ? " + dolaylı" : ""} emisyon.`,
      verifiedActual: "Doğrulanmış gerçek değer", illusDefault: "Temsili varsayılan", perTonne: "ton başına", saving: (s, p) => `Pasaport varsayılan değer yerine kullanıldığında AB alıcısının brüt CBAM maliyeti <b>ton başına €${s}</b> düşer (€${p}/tCO2e fiyatla).`,
      committed: (n) => `Bu pasaportta AB ithalatçılarına ${n} sevkiyat taahhüt edildi.`, cbamNote: "Ücretsiz tahsis düzeltmesinden (CBAM faktörü) önceki brüt maliyet. Varsayılan değer TEMSİLİDİR (Climate TRACE Türk rota p90 × 1,10 ek oran); resmî AB değeri değildir.",
      dlCsv: "CBAM tedarikçi verisi (CSV)", dlJson: "CBAM tedarikçi verisi (JSON)",
      passport: "Pasaport", verifyHashes: "Rapor ve kanıt hash'lerini doğrula", revoke: "İptal et (düzenleyici)", revokeReason: "İptal gerekçesi (örn. saha ziyareti bulgusu):",
      onchainStatus: "Zincirdeki durum", riskScore: "Risk puanı", sigs: "Doğrulayıcı imzaları", sigsOf: (a, b, k) => `${b} imzadan ${a} (eşik ${k})`, production: "Üretim", directIndirect: "Doğrudan / dolaylı", recalc: "Bağımsız yeniden hesaplama", model: "Model", reportHash: "Rapor hash'i", evidenceHash: "Kanıt hash'i",
      findings: "Bulgular", summary: "Sade dille özet", actions: "Sonraki adımlar", summarySource: (s) => s.startsWith("llm") ? `Rapordan Claude (${s.slice(4)}) tarafından yazıldı; kararı kontroller verir.` : "Rapordan üretilen şablon özet.",
      match: "eşleşiyor", mismatch: "UYUŞMUYOR", aiReport: "YZ raporu", evidenceBundle: "Kanıt paketi", onchain: "zincirdeki",
      actingAs: "Kimliğin", shipment: "Sevkiyat", disclosed: "Üreticinin sana açıkladıkları", indepChecks: "Bağımsız kontroller", runChecks: "Kontrolleri çalıştır", declareWallet: "Bağlı cüzdanla beyan et",
      privacy: "Zincirde yalnızca sevkiyatının tuzlanmış taahhüdü var. Diğer ithalatçıların miktarları ve tesisin süreç verisi gizli kalır.",
      producer: "Üretici", product: "Ürün", quantity: "Miktar", see: "Özgül emisyon", embedded: "Gömülü (CBAM kapsamı)", grossCost: "Brüt CBAM maliyeti", withPassport: "pasaportla, karşılığında", onDefault: "temsili varsayılanla", notAnchored: "zincirde yok",
      c1: "Açıklanan değerler taahhüt edilen sevkiyat kaydıyla eşleşiyor", c2: (n) => `Merkle kanıtı (${n} hash) pasaport köküne ulaşıyor`, c3: (id, live) => `Kök, ${live ? "zincirdeki" : "anlık görüntüdeki"} #${id} pasaportuyla eşleşiyor`, c4: (s) => `Pasaport durumu: ${s}`, c5: "Sözleşmenin verifyShipment() fonksiyonu kanıtı adresin için kabul ediyor", c6: "Beyan durumu", c6s: "Beyan durumu (anlık görüntü)",
      notDeclared: "henüz beyan edilmedi", declaredUnder: (id) => `#${id} altında beyan edildi`, declaredTx: (h) => `${h} işleminde beyan edildi`, pass: "geçti", fail: "kaldı",
      realTitle: "Gerçek uydu ve emisyon verisi", s5pTitle: "İskenderun Körfezi sanayi bölgesi üzerinde Sentinel-5P NO₂ (gerçek veri)",
      s5pNote: (n, q) => `Sanayi kutusundaki aylık ortalama troposferik NO₂ sütunundan kırsal arka plan kutusunun çıkarılmış hâli; bulut elemesinden geçmiş ${n} geçişten (qa ≥ ${q}). Doğrulayıcının destekleyici kanıt olarak kullandığı üretim sinyali budur; burada 2025-07 – 2026-09 için gerçek Copernicus verisinden hesaplandı. Kış değerleri yüksektir, çünkü NO₂ soğuk ve karanlık aylarda atmosferde daha uzun kalır; doğrulayıcının bir tesisi kendi mevsimsel geçmişiyle karşılaştırmasının nedeni budur. Bulutsuz geçiş olmayan aylar gösterilmez.`,
      ctTitle: "Türk sektör kıyasları (Climate TRACE, gerçek veri)", ctNote: (n) => `${n} Türk tesisi. Her nokta bir tesisin tahmini emisyon yoğunluğu; doğrulayıcı, rotasının p10 değerinin çok altındaki beyanları işaretler.`,
      routeCol: "Rota", assetsCol: "Tesis", medianCol: "Medyan t/t", bandCol: "p10 – p90", totalCol: "Emisyon (Mt/yıl)",
      attacksTitle: "Dağıtılan sözleşmelere karşı yapılan saldırılar", thAttack: "Saldırı", thDefence: "Beklenen savunma", thResult: "Sonuç", blocked: "engellendi",
      trustTitle: "Güven sınırları", offchainTitle: "Zincir dışında kalanlar",
      footer: "EmisPass · IEEE ClimateChain Global Hackathon 2026 · İz: Carbon Markets & Emissions Transparency · Bu demodaki tesisler ve tesis verileri <b>kurgusal/sentetiktir</b>; sektör kıyasları (Climate TRACE) ve uydu NO₂ verisi (Copernicus Sentinel-5P) gerçektir.",
      noWallet: "Tarayıcı cüzdanı bulunamadı. İşlem göndermek için MetaMask kur.", txSent: (h) => `İşlem gönderildi: ${h}`, txDone: "Onaylandı. Yenileniyor…", needLive: "Cüzdan işlemleri için erişilebilir bir zincir gerekir (yerel düğüm ya da testnet).", wrongAccount: (a) => `Bu sevkiyatı beyan etmek için cüzdanını ${a} hesabına geçir.`, notRegulator: "Bağlı hesapta REGULATOR_ROLE yetkisi yok.",
      sevNames: { info: "bilgi", low: "düşük", medium: "orta", high: "yüksek", critical: "kritik" },
      verdicts: { APPROVED: "ONAYLANDI", FLAGGED: "İŞARETLENDİ" },
      status: { Approved: "Onaylı", Flagged: "İşaretli", Revoked: "İptal", None: "Yok" },
    },
  };

  const FUEL = {
    en: { naturalGasNm3: "natural gas", cokingCoalT: "coking coal", pciCoalT: "PCI coal", petcokeT: "petroleum coke", limestoneT: "limestone", electrodesT: "graphite electrodes", chargeCarbonT: "charge carbon", clinkerT: "clinker" },
    tr: { naturalGasNm3: "doğal gaz", cokingCoalT: "kok kömürü", pciCoalT: "PCI kömürü", petcokeT: "petrokok", limestoneT: "kireçtaşı", electrodesT: "grafit elektrot", chargeCarbonT: "şarj karbonu", clinkerT: "klinker" },
  };
  const FEED = { en: { gridMeter: "Grid meter", fuelSupplier: "Fuel supplier" }, tr: { gridMeter: "Şebeke sayacı", fuelSupplier: "Yakıt tedarikçisi" } };
  const DRIVER = {
    en: ["direct kg/t", "indirect kg/t", "declared/independent ratio", "production per satellite unit"],
    tr: ["doğrudan kg/t", "dolaylı kg/t", "beyan/bağımsız oranı", "uydu birimi başına üretim"],
  };
  const GROUP = { en: { "BF-BOF": "BF-BOF", EAF: "EAF", cement: "cement" }, tr: { "BF-BOF": "yüksek fırın (BF-BOF)", EAF: "ark ocağı (EAF)", cement: "çimento" } };

  const n = (v, d = 0) => Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sg = (v, d = 1) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(d)}`;

  // Map Python report findings (title/values) onto the same keys the browser verifier emits.
  function keyOf(f) {
    if (f.key) return f.key;
    const t = f.title;
    if (f.check === "provenance") return t.includes("failed") ? "feedFailed" : "feedAuthentic";
    if (f.check === "reconciliation") return t.startsWith("Electricity") ? "elecVsMeter" : "fuelVsDeliveries";
    if (f.check === "recalculation") return t.startsWith("Declared total") ? "totalMismatch" : t.startsWith("Direct") ? "directVsRecalc" : "indirectVsMeter";
    if (f.check === "benchmark") return t.includes("implausibly") ? "benchLow" : t.includes("above") ? "benchHigh" : "benchOk";
    if (f.check === "ml-expected-intensity") return "mlIntensity";
    if (f.check === "ml-anomaly") return t.includes("anomalous") ? "anomalous" : "consistent";
    return "satellite";
  }
  function feedOf(f) {
    if (f.values && f.values.feed) return f.values.feed;
    return f.title.startsWith("Grid") ? "gridMeter" : "fuelSupplier";
  }
  function driverIdx(f) {
    const d = f.values.driver;
    return typeof d === "number" ? d : Math.max(0, DRIVER.en.indexOf(d));
  }

  function renderFinding(f, lang) {
    const v = f.values || {}, k = keyOf(f), tr = lang === "tr";
    const fuel = (x) => FUEL[lang][x] || x;
    switch (k) {
      case "feedAuthentic": return [tr ? `${FEED.tr[feedOf(f)]} verisi doğrulandı` : `${FEED.en[feedOf(f)]} feed authentic`, tr ? "İmza geçerli, imzacı güven listesinde, kapsam uyuyor." : "Signature valid, signer on trust list, scope matches."];
      case "feedFailed": return [tr ? `${FEED.tr[feedOf(f)]} verisi doğrulanamadı` : `${FEED.en[feedOf(f)]} feed failed authentication`, tr ? "Bağımsız kanıt doğrulanamadı; beyan doğrulanamaz (imza, imzalanan içerikle uyuşmuyor)." : "Independent evidence could not be authenticated; the claim cannot be verified (signature does not match the signed content)."];
      case "elecVsMeter": return [tr ? "Elektrik ve şebeke sayacı" : "Electricity vs grid meter", tr ? `Beyan ${n(v.declared)} MWh, sayaç ${n(v.metered)} MWh (%${sg(v.deviationPct)}).` : `Declared ${n(v.declared)} MWh, metered ${n(v.metered)} MWh (${sg(v.deviationPct)} %).`];
      case "fuelVsDeliveries": {
        const fu = v.fuel || Object.keys(FUEL.en).find((x) => f.title.toLowerCase().startsWith(FUEL.en[x])) || "";
        return [tr ? `${cap(fuel(fu))} ve tedarikçi teslimatları` : `${cap(fuel(fu))} vs supplier deliveries`, tr ? `Beyan edilen tüketim ${n(v.declared)}, tedarikçinin teslim ettiği ${n(v.delivered)} (%${sg(v.deviationPct)}).` : `Declared consumption ${n(v.declared)}, supplier delivered ${n(v.delivered)} (${sg(v.deviationPct)} %).`];
      }
      case "totalMismatch": return [tr ? "Beyan edilen toplam, beyan edilen faaliyet verisiyle uyuşmuyor" : "Declared total does not match declared activity data", tr ? `Toplam, operatörün kendi girdilerinden %${sg(v.deviationPct)} farklı.` : `Totals differ by ${sg(v.deviationPct)} % from the operator's own inputs.`];
      case "directVsRecalc": return [tr ? "Doğrudan emisyon ve bağımsız yeniden hesaplama" : "Direct emissions vs independent recalculation", tr ? `Beyan ${n(v.declaredKg / 1e6, 1)} kt, tedarikçi/sayaç verisinden hesaplanan ${n(v.independentKg / 1e6, 1)} kt (%${sg(v.deviationPct)}).` : `Declared ${n(v.declaredKg / 1e6, 1)} kt, recomputed from supplier/meter data ${n(v.independentKg / 1e6, 1)} kt (${sg(v.deviationPct)} %).`];
      case "indirectVsMeter": return [tr ? "Dolaylı emisyon ve sayaç × şebeke faktörü" : "Indirect emissions vs metered electricity × grid factor", tr ? `Beyan ${n(v.declaredKg / 1e6, 2)} kt, beklenen ${n(v.expectedKg / 1e6, 2)} kt (%${sg(v.deviationPct)}).` : `Declared ${n(v.declaredKg / 1e6, 2)} kt, expected ${n(v.expectedKg / 1e6, 2)} kt (${sg(v.deviationPct)} %).`];
      case "benchLow": case "benchHigh": case "benchOk": {
        const grp = v.group || (f.detail || "").match(/Turkish (\S+) p10/)?.[1] || "";
        const title = { benchLow: tr ? "Yoğunluk, üretim rotası için akla yatkın olmayacak kadar düşük" : "Intensity implausibly low for production route", benchHigh: tr ? "Yoğunluk Türk benzer aralığının üstünde" : "Intensity above Turkish peer range", benchOk: tr ? "Yoğunluk Türk benzer aralığında" : "Intensity within Turkish peer range" }[k];
        return [title, tr ? `${n(v.intensityT, 3)} tCO2e/t; Türk ${GROUP.tr[grp] || grp} p10–p90: ${n(v.p10T, 3)}–${n(v.p90T, 3)} (medyan ${n(v.medianT, 3)}, ${v.peerAssets} tesis, Climate TRACE).` : `${n(v.intensityT, 3)} tCO2e/t vs Turkish ${grp} p10–p90 ${n(v.p10T, 3)}–${n(v.p90T, 3)} (median ${n(v.medianT, 3)}, ${v.peerAssets} assets, Climate TRACE).`];
      }
      case "mlIntensity": return [tr ? "Beyan edilen yoğunluk ve bağımsız sinyallerden ML tahmini" : "Declared intensity vs ML estimate from independent signals", tr ? `Gradient Boosting modeli (yakıt teslimatları, sayaç, uydu aktivitesi) ${n(v.predictedT, 3)} t/t bekliyor; beyan ${n(v.declaredT, 3)} t/t (%${sg(v.deviationPct)}).` : `Gradient-boosting model (fuel deliveries, metered electricity, satellite activity) expects ${n(v.predictedT, 3)} t/t; declared ${n(v.declaredT, 3)} t/t (${sg(v.deviationPct)} %).`];
      case "anomalous": case "consistent": {
        const drv = DRIVER[lang][driverIdx(f)];
        const title = k === "anomalous" ? (tr ? "Bu ay, tesisin geçmişine göre anormal" : "Month is anomalous vs facility history") : (tr ? "Bu ay, tesisin geçmişiyle tutarlı" : "Month consistent with facility history");
        return [title, tr ? `Isolation Forest skoru ${n(v.score, 3)} (geçmişin en az olağan ayı ${n(v.historicalFloor, 3)}); en büyük sapma '${drv}' değişkeninde (${sg(v.zScore)} sigma).` : `Isolation Forest score ${n(v.score, 3)} (least normal historical month ${n(v.historicalFloor, 3)}); largest deviation in '${drv}' (${sg(v.zScore)} sigma).`];
      }
      default: return [tr ? "Üretim ve uydu aktivite sinyali" : "Production vs satellite activity signal", tr ? `Uydudan çıkarılan üretim ${n(v.impliedT)} t, beyan ${n(v.declaredT)} t (%${sg(v.deviationPct)}). Yalnızca destekleyici sinyal.` : `Satellite-implied production ${n(v.impliedT)} t, declared ${n(v.declaredT)} t (${sg(v.deviationPct)} %). Supporting signal only.`];
    }
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  root.EmisI18n = { S, FUEL, renderFinding };
})(typeof self !== "undefined" ? self : this);
