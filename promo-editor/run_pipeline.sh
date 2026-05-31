#!/usr/bin/env bash
# ============================================================================
#  run_pipeline.sh — Route 2 자동화 실행기 (디버깅 흔적 정리본)
#
#  Claude 가 MCP notion-fetch 결과를 .cache/notion_raw.md 에 덮어쓴 뒤
#  이 스크립트 한 번으로 build_notion_data.py 호출.
#
#  📁 파일 정리
#    - .cache/notion_raw.md          : MCP 원문 캐시 (디버깅용, 매번 덮어씀)
#    - .cache/notion_data_report.txt : 검증 리포트 (매번 덮어씀)
#    - notion_data.json              : promo-editor 브리지 파일 (유지 필수)
#
#  ⚠️ add-on 전용: 기존 수동 플로우·app.js·컨텐츠_에셋 폴더 규칙을 훼손하지 않음
#
#  사용법:
#    ./run_pipeline.sh <asset_dir> [out_json]
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CACHE="$HERE/.cache"
RAW="$CACHE/notion_raw.md"
REPORT="$CACHE/notion_data_report.txt"
ASSET_DIR="${1:-}"
OUT="${2:-$HERE/notion_data.json}"

mkdir -p "$CACHE"

# 이전 버전 호환: promo-editor 루트에 notion_raw.md 가 있으면 .cache/ 로 이동
if [[ -f "$HERE/notion_raw.md" && ! -f "$RAW" ]]; then
  mv "$HERE/notion_raw.md" "$RAW"
  echo "ℹ️  notion_raw.md → .cache/ 로 이동"
fi

if [[ -z "$ASSET_DIR" ]]; then
  echo "❌ 사용법: $0 <asset_dir> [out_json]" >&2
  exit 1
fi
if [[ ! -f "$RAW" ]]; then
  echo "❌ .cache/notion_raw.md 가 없습니다. Claude 가 MCP notion-fetch 결과를 먼저 써야 합니다." >&2
  exit 1
fi
if [[ ! -d "$ASSET_DIR" ]]; then
  echo "❌ asset_dir 없음: $ASSET_DIR" >&2
  exit 1
fi

echo "▶ build_notion_data.py 실행"
python3 "$HERE/build_notion_data.py" \
  --raw "$RAW" \
  --asset-dir "$ASSET_DIR" \
  --out "$OUT" \
  --report "$REPORT"

echo "✅ 파이프라인 완료"
echo "   산출물: $OUT"
echo "   캐시:   $CACHE/ (raw + report)"
