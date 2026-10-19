"""Emission factors, routes and CBAM parameters used by the verifier.

Fuel factors are IPCC 2006 defaults (Vol. 2, Table 1.2 / 1.4) converted with typical net
calorific values; process factors follow IPCC Vol. 3. They are deliberately transparent so an
auditor can recompute every number in a verification report.
"""

# tCO2 per unit of activity
EMISSION_FACTORS = {
    "naturalGasNm3": 56.1 * 34.5e-6,  # 56.1 t/TJ x 34.5 MJ/Nm3 = 0.001935 t/Nm3
    "cokingCoalT": 94.6 * 28.2e-3,  # 2.668 t/t
    "pciCoalT": 94.6 * 25.8e-3,  # 2.441 t/t
    "petcokeT": 97.5 * 32.5e-3,  # 3.169 t/t
    "limestoneT": 0.440,  # CaCO3 calcination
    "electrodesT": 3.663,  # graphite electrodes, ~100 % C
    "chargeCarbonT": 3.0,  # anthracite charge carbon, ~82 % C
    "clinkerT": 0.525,  # clinker calcination (process emissions)
}

LABELS = {
    "naturalGasNm3": "Natural gas (Nm3)",
    "cokingCoalT": "Coking coal (t)",
    "pciCoalT": "PCI coal (t)",
    "petcokeT": "Petroleum coke (t)",
    "limestoneT": "Limestone (t)",
    "electrodesT": "Graphite electrodes (t)",
    "chargeCarbonT": "Charge carbon (t)",
    "clinkerT": "Clinker (t)",
}

FUELS_BY_ROUTE = {
    "BF-BOF": ["cokingCoalT", "pciCoalT", "limestoneT", "naturalGasNm3"],
    "EAF": ["naturalGasNm3", "electrodesT", "chargeCarbonT", "limestoneT"],
    "dry-kiln": ["petcokeT", "naturalGasNm3", "clinkerT"],
}

# Which Climate TRACE benchmark group each production route maps to
BENCHMARK_GROUP = {"BF-BOF": "BF-BOF", "EAF": "EAF", "dry-kiln": "cement"}

# CBAM scope: indirect emissions count only for cement and fertilisers (Reg. 2023/956, Annex II)
CBAM_INDIRECT_IN_SCOPE = {"IronSteel": False, "Cement": True}

# EU CBAM certificate price for Q3 2026 (EUR/tCO2e), per Commission publication
CBAM_PRICE_EUR = 82.32

# Mark-up on default values in 2026 (+10 %), rising to +20 % (2027) and +30 % (2028+)
DEFAULT_MARKUP_2026 = 1.10

# Illustrative default value = Turkish route p90 intensity (Climate TRACE) x 2026 mark-up.
# Replace with the official country/CN-code default values before any real use.
ILLUSTRATIVE_DEFAULT_BASIS = "p90T"

# Grid emission factors by source (tCO2/MWh), used to turn an EPİAŞ generation mix into a
# grid intensity. Renewables and nuclear are zero at the point of generation.
GRID_SOURCE_EF = {
    "lignite": 1.10,
    "importedCoal": 0.95,
    "hardCoal": 0.95,
    "naturalGas": 0.40,
    "fuelOil": 0.75,
    "hydro": 0.0,
    "wind": 0.0,
    "solar": 0.0,
    "geothermal": 0.12,  # non-condensable CO2 from Turkish fields is material
    "biomass": 0.0,
    "other": 0.50,
}

# Thresholds used by the rule checks
TOLERANCE = {
    "electricityMeterPct": 2.0,  # metered vs declared electricity
    "fuelDeliveryPct": 5.0,  # supplier deliveries vs declared consumption (stock changes allowed)
    "recalcHighPct": 5.0,
    "recalcCriticalPct": 15.0,
    "satelliteProductionPct": 15.0,
}

SEVERITY_POINTS = {"info": 0, "low": 40, "medium": 120, "high": 300, "critical": 600}
FLAG_THRESHOLD = 400  # risk score (0-1000) at or above which the verdict is FLAGGED
