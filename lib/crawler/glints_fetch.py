#!/usr/bin/env python3
"""
Helper Glints: ambil listing dan detail lewat cloudscraper.

Dipanggil dari lib/crawler/glints.ts. Output selalu JSON di stdout.

  python3 glints_fetch.py search <keywords> <location>
  echo '["id1","id2"]' | python3 glints_fetch.py detail <min_ms> <max_ms>

Catatan: Glints memasang WAF yang menolak klien non-browser. cloudscraper
dipakai atas keputusan pemilik project. Jeda sopan wajib dijaga.
"""

import json
import random
import re
import sys
import time
from urllib.parse import quote_plus

import cloudscraper

BASE = "https://glints.com/id/en"
NEXT_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def next_data(html: str) -> dict:
    m = NEXT_RE.search(html)
    if not m:
        raise RuntimeError("__NEXT_DATA__ tidak ada (kemungkinan diblokir)")
    return json.loads(m.group(1))["props"]["pageProps"]


def draft_text(raw) -> str:
    """Ubah JSON Draft.js (descriptionJsonString) jadi teks biasa."""
    if not raw:
        return ""
    try:
        blocks = json.loads(raw).get("blocks", [])
    except (ValueError, AttributeError):
        return str(raw)
    lines = []
    for b in blocks:
        t = (b.get("text") or "").strip()
        if not t:
            continue
        lines.append(f"- {t}" if b.get("type") in ("unordered-list-item", "ordered-list-item") else t)
    return "\n".join(lines)


def search(keywords: str, location: str) -> list:
    q = f"keyword={quote_plus(keywords)}&country=ID&locationName={quote_plus(location)}"
    s = cloudscraper.create_scraper()
    r = s.get(f"{BASE}/opportunities/jobs/explore?{q}", timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}")
    pp = next_data(r.text)
    jobs = (pp.get("initialJobs") or {}).get("jobsInPage") or []
    return [j for j in jobs if j.get("status") == "OPEN"]


def detail(ids: list, dmin: int, dmax: int) -> dict:
    s = cloudscraper.create_scraper()
    out = {}
    for i, jid in enumerate(ids):
        if i:
            time.sleep(random.uniform(dmin, dmax) / 1000)
        try:
            r = s.get(f"{BASE}/opportunities/jobs/{jid}", timeout=30)
            if r.status_code != 200:
                print(f"detail {jid}: HTTP {r.status_code}", file=sys.stderr)
                continue
            data = next_data(r.text).get("initialData", {}).get("data", {}) or {}
            out[jid] = {
                "description": draft_text(data.get("descriptionJsonString")),
            }
        except Exception as e:  # satu job gagal jangan hentikan batch
            print(f"detail {jid}: {e}", file=sys.stderr)
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: glints_fetch.py search|detail ...", file=sys.stderr)
        return 2
    mode = sys.argv[1]
    try:
        if mode == "search":
            result = search(sys.argv[2], sys.argv[3])
        elif mode == "detail":
            ids = json.load(sys.stdin)
            result = detail(ids, int(sys.argv[2]), int(sys.argv[3]))
        else:
            print(f"mode tidak dikenal: {mode}", file=sys.stderr)
            return 2
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
