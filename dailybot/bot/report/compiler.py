"""
report/compiler.py — weekly report compiler (Slice 5).

Ported near-verbatim from Teleport's bot/report/compiler.py. The only change is
the input source: Teleport fed it SQLite `activities_by_day`; v2 feeds the same
`{date_iso: [{project, activity_type, detail}]}` shape built from daily/*.json
(see bot/weekly.py). The LLM prompt + 7-key JSON contract are byte-for-byte the
same one Teleport already live-validated (7/7 keys in 4.6 s).
"""

import asyncio
import json
import logging
from datetime import date

from openai import OpenAI

from bot import config
from bot.report.utils import BM_DAYS, BM_MONTHS

logger = logging.getLogger(__name__)

# Teleport's HARIAN_PROJECT constant, inlined (v2 has no database module).
HARIAN_PROJECT = "Harian"


def _format_activities_for_prompt(
    activities_by_day: dict[str, list[dict]],
    working_days: list[date],
) -> str:
    """Build a clear, structured text block of the week's activities."""
    lines: list[str] = []
    for d in working_days:
        key = d.isoformat()
        day_bm = BM_DAYS[d.weekday()]
        month_bm = BM_MONTHS[d.month]
        date_str = f"{day_bm}, {d.day} {month_bm} {d.year}"
        acts = activities_by_day.get(key, [])
        visible = [
            a for a in acts
            if not (a.get("project") == HARIAN_PROJECT and (a.get("detail") or "").strip() in ("", "-"))
        ]
        lines.append(f"### {date_str}")
        if not visible:
            lines.append("Tiada aktiviti direkodkan.")
        else:
            for a in visible:
                detail_part = f" — {a['detail']}" if a.get("detail") else ""
                lines.append(f"- [{a['project']}] {a['activity_type']}{detail_part}")
        lines.append("")
    return "\n".join(lines)


SYSTEM_PROMPT = """\
Kamu adalah pembantu penulisan laporan mingguan profesional untuk syarikat pembinaan/perabot \
dalam Bahasa Malaysia formal. Tugas kamu adalah menulis laporan mingguan berdasarkan data \
aktiviti yang diberikan, mengikut struktur dan arahan yang tepat.

Peraturan penting:
1. Gunakan Bahasa Malaysia formal dan objektif.
2. JANGAN reka atau tambah detail yang tidak ada dalam data aktiviti.
3. Jika sesuatu hari tiada rekod, tulis laporan yang ringkas dan jujur untuk hari itu.
4. Gunakan ayat pencapaian ("Berjaya...") untuk bahagian pencapaian.
5. Cadangan mesti berkait dengan isu atau corak yang benar-benar berlaku minggu itu.
6. Format output mesti TEPAT seperti yang diminta — 6 bahagian bernombor, tiada bahagian tambahan.
"""


def _build_user_prompt(
    activities_text: str,
    week_line: str,
    date_range_line: str,
) -> str:
    return f"""\
Berikut adalah rekod aktiviti kerja untuk minggu {date_range_line} ({week_line}):

{activities_text}

---

Sila tulis laporan mingguan dalam Bahasa Malaysia formal dengan TEPAT 6 bahagian berikut. \
Output mesti dalam format JSON dengan kunci: \
"ringkasan", "isu", "cadangan", "pencapaian_kerja", "pencapaian_peribadi", \
"refleksi_belajar", "refleksi_perbaiki".

Arahan setiap bahagian:

**BAHAGIAN 1 — Ringkasan Kerja Minggu Ini** (kunci: "ringkasan")
- Satu perenggan pembuka menyebut fokus utama minggu ini dan projek yang terlibat.
- Diikuti dengan senarai bertanda (*) tugasan utama, dikumpul mengikut logik (bukan sekadar \
senarai mentah setiap aktiviti).

**BAHAGIAN 2 — Isu / Masalah Dihadapi** (kunci: "isu")
- Hanya masalah NYATA dari rekod aktiviti (kelewatan, kecacatan, kerosakan, pertikaian).
- Jika tiada isu, tulis: "Tiada isu kritikal yang menjejaskan kelancaran operasi sepanjang minggu."

**BAHAGIAN 3 — Cadangan / Keperluan Sokongan** (kunci: "cadangan")
- Cadangan praktikal yang LANGSUNG berkaitan dengan isu atau corak yang berlaku minggu itu.
- Bukan nasihat generik.

**BAHAGIAN 4A — Pencapaian dalam Kerja** (kunci: "pencapaian_kerja")
- Pencapaian, penghantaran selesai, masalah yang diselesaikan.
- Setiap item bermula dengan "Berjaya...".

**BAHAGIAN 4B — Pencapaian Peribadi** (kunci: "pencapaian_peribadi")
- Pertumbuhan kemahiran, koordinasi, perkembangan peribadi melalui kerja minggu ini.
- Setiap item bermula dengan "Berjaya..." atau "Mampu...".

**BAHAGIAN 5A — Apa yang Saya Belajar / Sedar Minggu Ini** (kunci: "refleksi_belajar")
- Pelajaran praktikal dan peringkat proses — bukan klise motivasi.

**BAHAGIAN 5B — Apa Saya Nak Perbaiki Minggu Depan** (kunci: "refleksi_perbaiki")
- Kawasan penambahbaikan spesifik dan tindakan susulan \
(cth: "Follow up dengan pembekal X", "Sediakan bahan untuk projek Y").

Output JSON sahaja, tiada teks lain di luar JSON.
"""


REQUIRED_KEYS = (
    "ringkasan",
    "isu",
    "cadangan",
    "pencapaian_kerja",
    "pencapaian_peribadi",
    "refleksi_belajar",
    "refleksi_perbaiki",
)


def _strip_code_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.lstrip().startswith("json"):
            raw = raw.lstrip()[4:]
        raw = raw.strip()
    return raw


def _validate_sections(sections: dict) -> dict[str, str]:
    missing = [k for k in REQUIRED_KEYS if k not in sections]
    if missing:
        raise ValueError(f"LLM response missing keys {missing}. Got: {sorted(sections.keys())}")
    return {k: str(sections[k]) for k in REQUIRED_KEYS}


def _call_llm_sync(user_prompt: str) -> str:
    """Blocking LLM call — always run inside run_in_executor."""
    client = OpenAI(api_key=config.llm_api_key(), base_url=config.LLM_BASE_URL)
    kwargs = {
        "model": config.LLM_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    try:
        completion = client.chat.completions.create(
            **kwargs, response_format={"type": "json_object"}
        )
    except Exception:
        logger.info("JSON mode not supported by %s, retrying without it", config.LLM_MODEL)
        completion = client.chat.completions.create(**kwargs)
    content = completion.choices[0].message.content
    if not content:
        raise ValueError("Empty response from LLM")
    return content.strip()


async def compile_report(
    activities_by_day: dict[str, list[dict]],
    working_days: list[date],
    week_line: str,
    date_range_line: str,
) -> dict[str, str]:
    """Call the configured LLM and return the validated 7-key section dict."""
    activities_text = _format_activities_for_prompt(activities_by_day, working_days)
    user_prompt = _build_user_prompt(activities_text, week_line, date_range_line)

    logger.info(
        "Calling LLM provider=%s model=%s for report generation...",
        config.LLM_PROVIDER,
        config.LLM_MODEL,
    )

    loop = asyncio.get_running_loop()
    raw = await loop.run_in_executor(None, _call_llm_sync, user_prompt)
    raw = _strip_code_fences(raw)

    try:
        sections = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse LLM JSON: %s | raw=%.500s", e, raw)
        raise ValueError(f"LLM did not return valid JSON: {e}") from e

    validated = _validate_sections(sections)
    logger.info("Report sections received: %s", list(validated.keys()))
    return validated