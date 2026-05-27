#!/usr/bin/env python3
"""Rewrite segment-extract JSONL with fiction-brand anonymization."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEG_DIR = ROOT / "segment-extract"

sys.path.insert(0, str(ROOT / "scripts"))
from lib.anonymize import (  # noqa: E402
    anonymize_criteria,
    anonymize_identifier,
    anonymize_text,
    anonymize_trait_key,
    contains_forbidden,
)


def transform_audience(row: dict) -> dict:
    row = dict(row)
    row.pop("raw_json", None)
    for field in ("name", "key"):
        if field in row and isinstance(row[field], str):
            row[field] = anonymize_identifier(row[field])
    if "criteria" in row and isinstance(row["criteria"], str):
        row["criteria"] = anonymize_criteria(row["criteria"])
    for field in ("space_name", "description"):
        if field in row and isinstance(row[field], str):
            row[field] = anonymize_text(row[field])
    return row


def transform_trait(row: dict) -> dict:
    row = dict(row)
    if "trait_key" in row and isinstance(row["trait_key"], str):
        row["trait_key"] = anonymize_trait_key(row["trait_key"])
    return row


def transform_dest(row: dict) -> dict:
    row = dict(row)
    row.pop("raw_json", None)
    for field in ("destination_name", "destination_type", "destination_id"):
        if field in row and isinstance(row[field], str):
            row[field] = anonymize_identifier(row[field])
    return row


def process_file(path: Path, transform, in_place: bool) -> tuple[int, int]:
    if not path.exists():
        print(f"skip missing {path}")
        return 0, 0

    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    out_rows = [transform(row) for row in rows]
    bad = sum(1 for row in out_rows if contains_forbidden(json.dumps(row)))

    if in_place and out_rows:
        backup = path.with_suffix(path.suffix + ".bak")
        if not backup.exists():
            shutil.copy2(path, backup)
        path.write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in out_rows) + "\n"
        )
        print(f"  wrote {path}")

    return len(out_rows), bad


def main():
    parser = argparse.ArgumentParser(description="Anonymize segment-extract JSONL files")
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Rewrite files in segment-extract/ (creates .bak backups once)",
    )
    parser.add_argument(
        "--dir",
        type=Path,
        default=SEG_DIR,
        help="Directory containing audiences.jsonl, traits.jsonl, destinations.jsonl",
    )
    args = parser.parse_args()

    jobs = [
        ("audiences.jsonl", transform_audience),
        ("traits.jsonl", transform_trait),
        ("destinations.jsonl", transform_dest),
    ]

    total_bad = 0
    for filename, fn in jobs:
        path = args.dir / filename
        count, bad = process_file(path, fn, args.in_place)
        total_bad += bad
        print(f"{filename}: {count} rows, {bad} still contain forbidden tokens")

    if total_bad:
        print("Warning: some rows may still need manual review")
        sys.exit(1)


if __name__ == "__main__":
    main()
