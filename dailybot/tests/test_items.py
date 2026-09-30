from bot.items import load_items, save_items, format_item_list, apply_item_changes, icon_for


def test_empty_template(data_dirs):
    rec = load_items("pj-rufaidah")
    assert rec == {"project": "pj-rufaidah", "completionPct": 0, "items": []}


def test_save_load_roundtrip(data_dirs):
    rec = load_items("pj-rufaidah")
    rec["items"] = [{"name": "PVC", "status": "in_progress"},
                    {"name": "H. Steel", "status": "in_progress"}]
    rec["completionPct"] = 62
    save_items(rec)
    rec2 = load_items("pj-rufaidah")
    assert rec2["items"][0]["name"] == "PVC"
    assert rec2["completionPct"] == 62


def test_format_item_list():
    rec = {"project": "p", "completionPct": 0,
           "items": [{"name": "PVC", "status": "in_progress"}]}
    assert "PVC" in format_item_list(rec)


def test_apply_move_status():
    rec = {"project": "p", "completionPct": 0,
           "items": [{"name": "PVC", "status": "in_progress"}]}
    rec = apply_item_changes(rec, "PVC -> done_payment")
    assert rec["items"][0]["status"] == "done_payment"


def test_apply_add_preserves_case():
    rec = {"project": "p", "completionPct": 0, "items": []}
    rec = apply_item_changes(rec, "add Aluminium ready_on_site")
    assert any(it["name"] == "Aluminium" for it in rec["items"])


def test_apply_remove():
    rec = {"project": "p", "completionPct": 0,
           "items": [{"name": "PVC", "status": "in_progress"}]}
    rec = apply_item_changes(rec, "remove PVC")
    assert rec["items"] == []


def test_apply_no_change_variants():
    rec = {"project": "p", "completionPct": 0,
           "items": [{"name": "PVC", "status": "in_progress"}]}
    for txt in ("no change", "-", "tiada", "x"):
        assert apply_item_changes(rec, txt)["items"] == rec["items"]


def test_apply_multiline():
    rec = {"project": "p", "completionPct": 0,
           "items": [{"name": "PVC", "status": "in_progress"}]}
    rec = apply_item_changes(rec, "PVC -> done_payment; add H. Steel in_progress")
    statuses = {it["name"]: it["status"] for it in rec["items"]}
    assert statuses == {"PVC": "done_payment", "H. Steel": "in_progress"}


def test_icon_for():
    assert icon_for("in_progress") == "🔁"
    assert icon_for("done_payment") == "💰"
    assert icon_for("ready_on_site") == "✅"
    assert icon_for("delivered") == "🚚"
    assert icon_for("unknown") == "?"