#!/usr/bin/env python3
"""python 측 leaf 변환 패리티 러너.

build_notion_data.py 의 순수 leaf 함수/정규식을 cases.json 골든 스펙에 대해 검증한다.
JS 측 run_js.mjs 와 동일한 cases.json 을 쓰므로, 한쪽 구현만 바뀌면(드리프트) 그 쪽 러너가 FAIL 한다.

사용: python3 run_python.py   (실패 시 비-0 종료)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# build_notion_data.py 는 promo-editor/ 루트에 있음
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..", "..")))

import build_notion_data as b  # noqa: E402

with open(os.path.join(HERE, "cases.json"), encoding="utf-8") as f:
    CASES = json.load(f)

fails = []  # (section, detail)


def check(section, label, actual, expect):
    if actual != expect:
        fails.append((section, label, expect, actual))


# 1) 그리드 치수
for c in CASES["grid_dimensions"]:
    n = c["n"]
    check("grid_dimensions", f"n={n}", list(b._grid_dimensions(n)), c["expect"])

# 2) 옵션 → data-attr
for c in CASES["opts_to_attrs"]:
    check("opts_to_attrs", repr(c["opts"]), b._opts_to_data_attrs(c["opts"]), c["expect"])

# 3) 영상 그리드 HTML
for c in CASES["video_grid_html"]:
    videos = [tuple(v) for v in c["videos"]]
    check("video_grid_html", f"{len(videos)} videos",
          b._build_video_grid_html(videos), c["expect"])

# 4) 영상 마커 정규식 — (opts, url) 매치 목록. 비참여 옵션 그룹은 "" 정규화.
for c in CASES["marker_regex"]:
    matches = [[m[0] or "", m[1]] for m in b._VIDEO_MARKER_LINE_RE.findall(c["text"])]
    check("marker_regex", repr(c["text"][:40]), matches, c["expect"])

# ── 리포트 ──
total = sum(len(v) for k, v in CASES.items() if isinstance(v, list))
if fails:
    print(f"[python] PARITY FAIL — {len(fails)}/{total} case(s) mismatched:")
    for section, label, expect, actual in fails:
        print(f"  ✗ {section} [{label}]")
        print(f"      expect: {expect!r}")
        print(f"      actual: {actual!r}")
    sys.exit(1)

print(f"[python] PARITY PASS — {total}/{total} cases match cases.json")
