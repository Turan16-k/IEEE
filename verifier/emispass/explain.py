"""Plain-language summaries of verification reports for plant managers (Turkish + English).

The verdict always comes from the deterministic checks; this module only explains it. A
template summary is always produced. If the `anthropic` package is installed and credentials are
available (ANTHROPIC_API_KEY or an `ant auth login` profile), Claude rewrites the summary from the
report's findings; any failure falls back to the template.
"""

from __future__ import annotations

import json

MODEL = "claude-opus-5-5"

SCHEMA = {
    "type": "object",
    "properties": {
        "tr": {"type": "string"},
        "en": {"type": "string"},
        "actionsTr": {"type": "array", "items": {"type": "string"}},
        "actionsEn": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tr", "en", "actionsTr", "actionsEn"],
    "additionalProperties": False,
}

SYSTEM = (
    "You explain an emissions verification report to the manager of an industrial plant. "
    "Use only the numbers in the report; do not invent facts or change the verdict. "
    "Write one short paragraph in Turkish (tr) and the same in English (en), at most 90 words each, "
    "plain language, no jargon such as 'Isolation Forest'. Then list at most three concrete next "
    "actions in each language. If the verdict is APPROVED, say so and keep actions minimal."
)


def template_summary(report: dict) -> dict:
    fac = report["facility"]["name"]
    period = f"{str(report['period'])[:4]}-{str(report['period'])[4:]}"
    serious = [f for f in report["findings"] if f["severity"] in ("critical", "high")]
    if report["verdict"] == "APPROVED":
        tr = (f"{fac} için {period} beyanı onaylandı. Beyan edilen emisyonlar sayaç ve tedarikçi kayıtlarıyla, "
              f"Türk sektör kıyaslarıyla ve tesisin geçmişiyle tutarlı. Risk puanı {report['riskScore']}/1000.")
        en = (f"The {period} claim of {fac} is approved. Declared emissions match the meter and supplier records, "
              f"Turkish peer benchmarks and the plant's own history. Risk score {report['riskScore']}/1000.")
        return {"tr": tr, "en": en, "actionsTr": ["Pasaportu AB ithalatçılarınızla paylaşın."], "actionsEn": ["Share the passport with your EU importers."], "source": "template"}
    rec = next((f for f in report["findings"] if f["check"] == "recalculation" and f["severity"] in ("critical", "high")), None)
    dev = rec["values"]["deviationPct"] if rec else None
    tr = (f"{fac} için {period} beyanı işaretlendi (risk {report['riskScore']}/1000). {len(serious)} ciddi bulgu var"
          + (f"; beyan edilen doğrudan emisyon, bağımsız verilerden hesaplanandan %{abs(dev):.0f} düşük." if dev is not None else ".")
          + " Pasaport bu haliyle AB ithalatçıları tarafından kullanılamaz.")
    en = (f"The {period} claim of {fac} is flagged (risk {report['riskScore']}/1000). There are {len(serious)} serious findings"
          + (f"; declared direct emissions are {abs(dev):.0f}% below the independent recalculation." if dev is not None else ".")
          + " The passport cannot be used by EU importers as it stands.")
    return {
        "tr": tr,
        "en": en,
        "actionsTr": ["Yakıt tüketimini tedarikçi faturalarıyla mutabık hale getirin.", "Düzeltilmiş beyanı aynı dönem için yeniden gönderin."],
        "actionsEn": ["Reconcile fuel consumption with supplier invoices.", "Resubmit a corrected claim for the same period."],
        "source": "template",
    }


def llm_summary(report: dict) -> dict | None:
    try:
        import anthropic
    except ImportError:
        return None
    compact = {k: report[k] for k in ("facility", "period", "verdict", "riskScore", "declared", "independentDirectEmissionsKg", "cbam")}
    compact["findings"] = [{k: f[k] for k in ("severity", "title", "detail")} for f in report["findings"] if f["severity"] != "info"]
    try:
        client = anthropic.Anthropic()
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
            system=SYSTEM,
            messages=[{"role": "user", "content": json.dumps(compact, ensure_ascii=False)}],
        )
    except anthropic.AuthenticationError:
        return None
    except anthropic.APIStatusError as e:
        print(f"  LLM summary skipped: API error {e.status_code}")
        return None
    except anthropic.APIConnectionError:
        print("  LLM summary skipped: connection error")
        return None
    except Exception:  # no credentials configured
        return None
    if response.stop_reason in ("refusal", "max_tokens"):
        return None
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        return None
    data = json.loads(text)
    data["source"] = f"llm:{response.model}"
    return data


def summarize(report: dict, use_llm: bool = True) -> dict:
    return (use_llm and llm_summary(report)) or template_summary(report)
