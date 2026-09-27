"""Dataset upload, safe extraction, validation, class discovery and splitting."""
from __future__ import annotations

import io
import stat
import zipfile

from conftest import upload, run_worker_once
from fixtures import CLASSES, make_zip, sample_image


def _get(client, admin, dsv_id):
    r = client.get(f"/v1/admin/datasets/versions/{dsv_id}", headers=admin)
    assert r.status_code == 200, r.text
    return r.json()


def test_valid_class_folder_zip(client, admin, env):
    z = make_zip(env / "ds.zip", per_class=20)
    res = upload(client, admin, z)
    assert res["upload"].status_code == 200, res["upload"].text
    assert res["upload"].json()["status"] == "queued"
    run_worker_once()
    v = _get(client, admin, res["create"]["id"])
    assert v["status"] in ("ready", "ready_with_warnings"), v
    assert v["structure"] == "class_folders"
    assert v["total_images"] == 60
    assert v["class_count"] == 3
    assert sorted(c["raw_name"] for c in v["classes"]) == sorted(CLASSES)
    names = {c["raw_name"]: c["display_name"] for c in v["classes"]}
    assert names["Fixture___Red_spots"] == "Fixture Red Spots"
    assert v["validation"]["summary"]["formats"] == {"JPEG": 60}
    assert v["validation"]["stripped_prefix"] == "dataset"
    assert v["splits"] == []  # no split until the admin generates one
    assert v["content_hash"] and len(v["content_hash"]) == 64
    assert "storage_path" not in v


def test_predefined_split_is_respected(client, admin, env):
    z = make_zip(env / "ds.zip", per_class=20, structure="predefined")
    res = upload(client, admin, z)
    run_worker_once()
    v = _get(client, admin, res["create"]["id"])
    assert v["structure"] == "predefined_splits"
    assert len(v["splits"]) == 1
    s = v["splits"][0]
    assert s["strategy"] == "predefined"
    assert (s["train_count"], s["val_count"], s["test_count"]) == (36, 12, 12)
    assert v["validation"]["summary"]["split_counts"] == {"train": 36, "val": 12, "test": 12}


def test_predefined_split_with_loose_files_at_root(client, admin, env):
    # Real-world layout: wrapper/train, wrapper/val (no test) plus a script and README beside them.
    z = make_zip(env / "ds.zip", per_class=20, structure="predefined", wrapper="tomato",
                 extra={"tomato/cnn_train.py": b"print('x')", "tomato/README.txt": b"hello"})
    res = upload(client, admin, z)
    run_worker_once()
    v = _get(client, admin, res["create"]["id"])
    assert v["status"] in ("ready", "ready_with_warnings"), v["validation"]
    assert v["structure"] == "predefined_splits" and v["total_images"] == 60
    assert v["validation"]["summary"]["skipped"] == {"executable_or_script": 1, "outside_class_folder": 1}


def test_path_traversal_rejected(client, admin, env):
    p = env / "evil.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("A/ok.jpg", sample_image())
        z.writestr("../../escape.jpg", sample_image())
    res = upload(client, admin, p)
    run_worker_once()
    v = _get(client, admin, res["create"]["id"])
    assert v["status"] == "invalid"
    assert v["validation"]["error"]["code"] == "unsafe_archive"
    assert not (env / "escape.jpg").exists() and not (env / "storage" / "escape.jpg").exists()


def test_absolute_path_and_symlink_rejected(client, admin, env):
    p = env / "abs.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("/etc/passwd.jpg", sample_image())
    res = upload(client, admin, p, name="abs")
    p2 = env / "link.zip"
    with zipfile.ZipFile(p2, "w") as z:
        info = zipfile.ZipInfo("A/link.jpg")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        z.writestr(info, "/etc/passwd")
    res2 = upload(client, admin, p2, name="link")
    run_worker_once()
    assert _get(client, admin, res["create"]["id"])["validation"]["error"]["code"] == "unsafe_archive"
    assert _get(client, admin, res2["create"]["id"])["validation"]["error"]["code"] == "unsafe_archive"


def test_zip_bomb_rejected(client, admin, env):
    p = env / "bomb.zip"
    with zipfile.ZipFile(p, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("A/huge.jpg", b"\0" * (50 * 1024 * 1024))
    res = upload(client, admin, p)
    run_worker_once()
    assert _get(client, admin, res["create"]["id"])["validation"]["error"]["code"] == "suspicious_compression"


def test_not_a_zip_rejected_at_upload(client, admin, env):
    p = env / "fake.zip"
    p.write_bytes(b"this is not a zip file at all")
    res = upload(client, admin, p)
    assert res["upload"].status_code == 415
    assert _get(client, admin, res["create"]["id"])["status"] == "invalid"


def test_corrupt_archive(client, admin, env):
    p = env / "broken.zip"
    p.write_bytes(b"PK\x03\x04" + b"garbage" * 100)
    res = upload(client, admin, p)
    run_worker_once()
    assert _get(client, admin, res["create"]["id"])["validation"]["error"]["code"] == "corrupt_archive"


def test_junk_files_skipped_and_reported(client, admin, env):
    extra = {
        "dataset/Fixture___Red_spots/virus.exe": b"MZ....",
        "dataset/Fixture___Red_spots/run.sh": b"#!/bin/sh",
        "dataset/__MACOSX/._x.jpg": b"junk",
        "dataset/Fixture___Red_spots/.DS_Store": b"junk",
        "dataset/Fixture___Red_spots/notes.txt": b"hello",
        "dataset/Fixture___Red_spots/broken.jpg": b"\xff\xd8\xff\xe0 not really a jpeg",
        "dataset/Fixture___Blue_stripes/actually_png.jpg": sample_image(CLASSES[1], fmt="PNG"),
        "dataset/Empty_class/": b"",
        "dataset/readme.md": b"root level file",
    }
    z = make_zip(env / "ds.zip", per_class=12, extra=extra)
    res = upload(client, admin, z)
    run_worker_once()
    v = _get(client, admin, res["create"]["id"])
    val = v["validation"]
    assert v["total_images"] == 37  # 36 + the PNG-with-.jpg-extension
    assert val["summary"]["skipped"]["executable_or_script"] == 2
    assert val["summary"]["skipped"]["hidden_or_system"] >= 2
    assert val["summary"]["skipped"]["not_an_image"] == 1
    assert val["summary"]["skipped"]["outside_class_folder"] == 1
    assert val["summary"]["rejected"]["corrupt_or_unreadable"] == 1
    assert val["summary"]["formats"] == {"JPEG": 36, "PNG": 1}
    codes = {w["code"] for w in val["warnings"]}
    assert {"executables", "corrupt_images", "extension_mismatch", "empty_class", "unknown_files"} <= codes
    assert "Empty_class" in val["empty_classes"]
    assert v["class_count"] == 3


def test_duplicates_and_imbalance_detected(client, admin, env):
    img = sample_image(CLASSES[0], seed=5)
    extra = {f"dataset/Fixture___healthy/dup_{i}.jpg": img for i in range(3)}
    extra["dataset/Fixture___Red_spots/copy.jpg"] = img  # same bytes under another class
    z = make_zip(env / "ds.zip", per_class=12, extra=extra, classes=CLASSES[:2])
    # add a large third class to create imbalance
    with zipfile.ZipFile(z, "a") as zz:
        from fixtures import draw, jpeg
        import random

        rng = random.Random(3)
        for i in range(130):
            zz.writestr(f"dataset/Fixture___Big/img_{i}.jpg", jpeg(draw("Fixture___Big", rng)))
    res = upload(client, admin, z)
    run_worker_once()
    val = _get(client, admin, res["create"]["id"])["validation"]
    d = val["duplicates"]
    assert d["exact_duplicate_images"] == 3
    assert d["cross_class_groups"] >= 1
    imb = next(w for w in val["warnings"] if w["code"] == "class_imbalance")
    assert "highly imbalanced" in imb["message"]


def test_too_few_classes_is_invalid(client, admin, env):
    z = make_zip(env / "one.zip", per_class=10, classes=["Only_one"])
    res = upload(client, admin, z)
    run_worker_once()
    v = _get(client, admin, res["create"]["id"])
    assert v["status"] == "invalid"


def test_mixed_structure_is_invalid(client, admin, env):
    p = env / "mixed.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("train/A/1.jpg", sample_image())
        z.writestr("B/1.jpg", sample_image())
    res = upload(client, admin, p)
    run_worker_once()
    assert _get(client, admin, res["create"]["id"])["validation"]["error"]["code"] == "malformed_structure"


def test_split_generation_reproducible_and_stratified(client, admin, env):
    z = make_zip(env / "ds.zip", per_class=40)
    res = upload(client, admin, z)
    run_worker_once()
    dsv = res["create"]["id"]
    bad = client.post(f"/v1/admin/datasets/versions/{dsv}/splits", json={"train_pct": 70, "val_pct": 20, "test_pct": 20, "seed": 1}, headers=admin)
    assert bad.status_code == 400 and "100" in bad.json()["error"]["message"]
    a = client.post(f"/v1/admin/datasets/versions/{dsv}/splits", json={"train_pct": 70, "val_pct": 15, "test_pct": 15, "seed": 7}, headers=admin).json()
    b = client.post(f"/v1/admin/datasets/versions/{dsv}/splits", json={"train_pct": 70, "val_pct": 15, "test_pct": 15, "seed": 7}, headers=admin).json()
    c = client.post(f"/v1/admin/datasets/versions/{dsv}/splits", json={"train_pct": 70, "val_pct": 15, "test_pct": 15, "seed": 8}, headers=admin).json()
    from kd_backend.datasets.service import load_split_assignments

    _, aa = load_split_assignments(a["id"])
    _, bb = load_split_assignments(b["id"])
    _, cc = load_split_assignments(c["id"])
    assert aa == bb
    assert aa != cc
    assert (a["train_count"], a["val_count"], a["test_count"]) == (84, 18, 18)
    for cls, counts in a["per_class"].items():
        assert counts == {"train": 28, "val": 6, "test": 6}, (cls, counts)


def test_split_keeps_duplicates_together():
    from kd_backend.datasets.split import stratified_group_split
    from kd_backend.datasets.validate import duplicate_groups

    entries = []
    for i in range(30):
        entries.append({"class": "A", "split": None, "sha256": f"a{i // 3}", "dhash": i * 7919, "original": str(i)})  # groups of 3 identical
    groups, stats = duplicate_groups(entries)
    assert stats["exact_duplicate_groups"] == 10
    assign, _ = stratified_group_split(entries, groups, 60, 20, 20, 1)
    for g in set(groups):
        assert len({assign[i] for i, gg in enumerate(groups) if gg == g}) == 1


def test_duplicate_version_rejected(client, admin, env):
    z = make_zip(env / "ds.zip", per_class=10)
    res = upload(client, admin, z)
    data = z.read_bytes()
    r = client.post("/v1/admin/datasets/versions", json={
        "dataset_id": res["create"]["dataset_id"], "version": "1.0", "source": "x", "owner": "x", "license": "x", "permission_status": "owned",
        "original_filename": "ds.zip", "size_bytes": len(data), "confirm_provenance": True}, headers=admin)
    assert r.status_code == 409
    r = client.post("/v1/admin/datasets/versions", json={
        "dataset_id": res["create"]["dataset_id"], "version": "1.1", "source": "x", "owner": "x", "license": "x", "permission_status": "owned",
        "original_filename": "ds.zip", "size_bytes": len(data), "confirm_provenance": True}, headers=admin)
    assert r.status_code == 200
    # cannot re-upload over an already-uploaded version
    again = client.put(f"/v1/admin/datasets/versions/{res['create']['id']}/archive", content=data, headers={**admin, "Content-Type": "application/zip"})
    assert again.status_code == 409


def test_provenance_required_and_confirmed(client, admin, env):
    base = {"dataset_name": "X", "version": "1.0", "source": "s", "owner": "o", "license": "l", "permission_status": "owned", "original_filename": "x.zip", "size_bytes": 10}
    assert client.post("/v1/admin/datasets/versions", json=base, headers=admin).status_code == 400  # not confirmed
    assert client.post("/v1/admin/datasets/versions", json={**base, "confirm_provenance": True, "permission_status": "yes"}, headers=admin).status_code == 400
    assert client.post("/v1/admin/datasets/versions", json={**base, "confirm_provenance": True, "source": " "}, headers=admin).status_code == 400
    assert client.post("/v1/admin/datasets/versions", json={**base, "confirm_provenance": True, "original_filename": "x.rar"}, headers=admin).status_code == 400
    r = client.post("/v1/admin/datasets/versions", json={**base, "confirm_provenance": True, "size_bytes": 10**15}, headers=admin)
    assert r.status_code == 413


def test_upload_size_mismatch_and_cleanup(client, admin, env):
    z = make_zip(env / "ds.zip", per_class=5)
    data = z.read_bytes()
    r = client.post("/v1/admin/datasets/versions", json={"dataset_name": "Y", "version": "1.0", "source": "s", "owner": "o", "license": "l", "permission_status": "owned",
                                                         "original_filename": "ds.zip", "size_bytes": len(data) - 10, "confirm_provenance": True}, headers=admin)
    dsv = r.json()["id"]
    r = client.put(f"/v1/admin/datasets/versions/{dsv}/archive", content=data, headers={**admin, "Content-Type": "application/zip"})
    assert r.status_code == 400
    assert _get(client, admin, dsv)["status"] == "upload_failed"
    assert not list((env / "storage" / "temp").glob("*.part"))
