#!/usr/bin/env bash
# python↔JS leaf 변환 패리티 게이트.
#   build_notion_data.py 와 video.js/paste-preprocess.js 의 공유 leaf 규칙(그리드 치수·옵션매핑·
#   그리드 HTML·영상 마커 정규식)이 cases.json 골든 스펙에 둘 다 맞는지 검증한다.
#   한쪽만 고쳐 드리프트가 나면 그 쪽 러너가 FAIL → 전체 비-0 종료.
#
# 사용: bash tests/transform-parity/parity.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

rc=0
echo "── python ──"
python3 "$HERE/run_python.py" || rc=1
echo "── js ──"
node "$HERE/run_js.mjs" || rc=1

echo
if [ "$rc" -eq 0 ]; then
  echo "✅ PARITY OK — python ↔ JS leaf 변환 일치"
else
  echo "❌ PARITY DRIFT — 위 FAIL 케이스 확인. 한쪽 구현만 바뀌었는지 점검 후 양쪽 동기화."
fi
exit "$rc"
