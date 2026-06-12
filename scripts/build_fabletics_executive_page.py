#!/usr/bin/env python3
"""Build /fabletics/ from fabletics-executive-report.html."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_executive_page import ROOT, build  # noqa: E402

if __name__ == "__main__":
    out, src = build("fabletics")
    print(f"✓ fabletics executive → {out.relative_to(ROOT)} (from {src})")
