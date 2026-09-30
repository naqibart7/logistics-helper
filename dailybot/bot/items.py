"""
items.py — per-project item tracker (Slice 4). One JSON file per project.
Schema matches Architecture §6.1: project, completionPct, items[{name,status}].
Status icons: 🔁 in_progress | 💰 done_payment | ✅ ready_on_site | 🚚 delivered
"""

import json
from pathlib import Path
from bot import config


def _item_path(project_id):
    return config.ITEMS_DIR / f"{project_id}.json"


def load_items(project_id):
    """Load project's item list, or empty template if none yet."""
    path = _item_path(project_id)
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {"project": project_id, "completionPct": 0, "items": []}


def save_items(record):
    """Persist item list (read-modify-write)."""
    path = _item_path(record["project"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)
    return path


def format_item_list(record):
    """Human string like 'PVC 🔁, H. Steel 🔁'."""
    icons = {"in_progress": "🔁", "done_payment": "💰", "ready_on_site": "✅", "delivered": "🚚"}
    if not record.get("items"):
        return "—"
    return ", ".join(f"{it['name']} {icons.get(it['status'], '?')}" for it in record["items"])


def apply_item_changes(record, changes_text):
    """
    Parse free-text changes from Naqib. Supported patterns:
    - "PVC -> done_payment"  (move status)
    - "add H. Steel in_progress" (new item)
    - "remove PVC" (delete item)
    - "no change" / "-" (nothing)
    Returns updated record.
    """
    text = changes_text.strip()
    if text.lower() in ("no change", "-", "tiada", "x"):
        return record

    # simple line-by-line parsing (keep original case for names)
    for line in text.replace(";", "\n").split("\n"):
        line = line.strip()
        if not line:
            continue
        low = line.lower()
        if "->" in low or "→" in low:
            sep = "->" if "->" in low else "→"
            # find separator in original case
            idx = low.index(sep)
            name = line[:idx].strip()
            status = line[idx + len(sep):].strip()
            for it in record["items"]:
                if it["name"].lower() == name.lower():
                    it["status"] = status
                    break
        elif low.startswith("add "):
            # "add H. Steel in_progress"
            parts = line[4:].strip().split()
            if len(parts) >= 2:
                name = " ".join(parts[:-1])
                status = parts[-1]
                record["items"].append({"name": name, "status": status})
        elif low.startswith("remove "):
            name = line[7:].strip()
            record["items"] = [it for it in record["items"] if it["name"].lower() != name.lower()]
    return record


def icon_for(status):
    return {"in_progress": "🔁", "done_payment": "💰", "ready_on_site": "✅", "delivered": "🚚"}.get(status, "?")