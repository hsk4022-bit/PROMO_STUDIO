# PROMO-STUDIO

노션 DB의 프로모션 기획서를 자동으로 HTML/배너로 생성하는 도구.

## 진입 시 결정 트리

사용자 발화에서 다음 키워드 확인:

- **"프로모 에디터로" / "UI로"** → Route 1 (UI 모드)
  - INGESTION만 Claude가 수행 → `promo-editor/index.html` 열도록 안내
- **"Claude로 다 해줘" / 명시 없음 (기본값)** → Route 2 (Claude 자동 모드)
  - 모든 단계 Claude가 진행, 4 체크포인트마다 사용자 승인

## 작업 전 필독 (절대 누락 금지)

HTML/이미지/배너 생성 작업 진입 시 다음을 반드시 수행:

1. **컨텐츠 분석 → feature 식별** (이미지·테이블·버튼·탭·팝업·영상).
2. **[promo-editor/rules/INDEX.md](promo-editor/rules/INDEX.md) 룩업** → "Always read" + 매칭 "Feature match" 파일 리스트 도출.
3. **단일 메시지 multi-Read 로 parallel 로드** (Read 도구 N개 동시 호출).
4. 다른 가이드도 함께 read:
   - [promo-editor/CLAUDE.md](promo-editor/CLAUDE.md) — pre-flight 체크리스트
   - [promo-editor/notion_parsing_rules.md](promo-editor/notion_parsing_rules.md) — 노션 입력 파싱
   - [promo-editor/orchestration_contract.md](promo-editor/orchestration_contract.md) — Route 1/2 + 4 체크포인트
   - [promo-editor/image_pipeline_contract.md](promo-editor/image_pipeline_contract.md) — 3단계 이미지 파이프라인

배너 작업 시 추가:
- [banner-studio/master_guidelines.md](banner-studio/master_guidelines.md) (단일 파일 유지)
- [banner-l/master_guidelines.md](banner-l/master_guidelines.md) (단일 파일 유지)

⚠️ promo-editor 에서는 [promo-editor/rules/INDEX.md](promo-editor/rules/INDEX.md) 룩업 후 매칭 rules/*.md 만 parallel Read. **통독 금지**.

## 룰 편집 위치

룰 변경은 [promo-editor/rules/*.md](promo-editor/rules/) **직접 편집**.
이 디렉토리가 **canonical SSOT** 입니다 (build artifact 없음, 2026-05-28~).
편집 즉시 효과 적용 (build 단계 없음). dispatcher.js 가 페이지 로드 시 rules/*.md 를 병렬 fetch.

## 룰 dispatcher (2026-05-28 ~ rules/*.md 직접 fetch 전환)

Gemini 호출 시 컨텐츠 패턴 매칭으로 필요한 섹션만 묶어 보냄:
- `dispatcher.js` 가 페이지 로드 시 `rules/*.md` 21개 (01-20 + 99) 병렬 fetch → 캐시
- `splitGuidelinesIntoSections()` — 각 파일의 `# [섹션]` 헤더 기준 split
- `selectRulesForContent(content, sections)` — 컨텐츠 패턴 매칭으로 필요 섹션만 선택
- `buildGuidelineBundle(content)` — core (구조/색/원칙) + matched features (영상/탭/팝업/이미지/테이블/버튼) 만 묶음
- 호출자: CONTENT 생성 경로 ([app.js:299](promo-editor/app.js:299))

**효과**:
- 노션에 영상 없으면 영상 룰 (240줄+) 제외 → 프롬프트 ~30% 축소
- 팝업 없으면 팝업 룰 (240줄+) 제외 → 또 ~25% 축소
- Gemini attention 집중 → 룰 준수율 향상 → safety net 의존 감소
- 룰 수정 즉시 반영 (build 단계 없음)

**검증**: DevTools 콘솔에서 `[dispatcher]` 로그 — `loaded N/N rules`, `features:`, `sections: N/M`, `skipped:` 확인 가능.

> **현재 활성 패턴 (2026-05-28~)**: `promo-editor/rules/*.md` 가 canonical SSOT. `master_guidelines.md` + `build-guidelines.sh` 제거됨. `dispatcher.js` (`promo-editor/js/dispatcher.js`) 가 런타임에 rules/*.md 직접 fetch (Promise.all 21개 병렬). Claude (에이전트) 는 `rules/INDEX.md` 룩업 후 feature 별 parallel Read.

## app.js Safety Net (회귀 방지 코드)

Gemini 출력 변동성에 대한 9개 방어 코드가 `promo-editor/app.js` 에 활성:

| 위치 | 역할 |
|---|---|
| L887 | 슬라이서 캡처 1.3x (렌더 안정 + 화질) |
| L1225 | 슬라이서 렌더 에러 사람-읽기 가능한 로깅 |
| L1755 | `index_불러오기용.html` popup-trigger onclick fallback (donor 복사) |
| L6263 | phantom `<td>` 셀 폭주 청소 (문자열 단계) |
| L6442 | popup-trigger 인라인 콘텐츠 복원기 (button → se-popup-content) |
| L8653 / L8701 | fixTableThs cascade 차단 (maxCols 20 cap, trailing 빈 셀 strip) |
| L676 (unhideTabSectionsOnImport) | 재불러오기 시 탭 섹션 display:none/visibility/opacity:0 + tab-content 클래스 자동 strip |
| L7084 (unhideTabSections) | 생성 직후 탭 섹션 hide/show 토글 패턴 무력화 (Gemini 가 종종 tab02~ 에 display:none + scrollIntoView onclick 조합 출력 → 2~N번 탭 영원히 숨김 회귀 방지) |
| L5768 (ensureEventVideoScript 진입부) | event-video wrapper 의 aspect-ratio/background/position/border-radius/overflow/isolation 인라인 스타일 strip + nested 깨진 markup (literal escape된 HTML, 중첩 wrapper) 정리. Gemini 가 종종 wrapper 에 aspect-ratio:16/9 박아 세로 영상 잘림 회귀 방지 |
| build_notion_data.py `_VIDEO_MARKER_LINE_RE` + `_convert_inline_video_markers_in_pipe_rows` (2026-05-27) | (1) 마커-URL 같은 줄 케이스도 그리드 변환 (`\s*\n\s*` → `\s{1,200}?`) — 한 줄 마커 다발이 세로 적층되는 회귀 방지. (2) markdown pipe 셀 안 `[영상\|opts] url` → event-video div 결정론적 치환 — 표 안 영상이 텍스트로 노출되는 회귀 방지. paste 경로(app.js `_convertInlineVideoMarkersInPipeRows`)도 동일 |
| build_notion_data.py `<aside>` unwrap + `_normalize_pipe_table_rows` (2026-05-27) | (1) 노션 web copy 의 콜아웃 `<aside>` 태그 strip — `<callout>` 와 동일 처리, 태그가 영상 마커 사이에 끼어 그리드 run 판정 실패하는 회귀 방지. Hero 의 `_find_callout_s3` / `_find_callout_url` 도 두 태그 모두 매칭. (2) 셀 안 줄바꿈으로 markdown pipe row 가 여러 줄에 걸친 경우 한 줄로 머지 — `| ... \n url \| ... \|` 형태에서 셀별 영상 변환이 실패하는 회귀 방지. paste 경로(app.js `_stripAsideTags` / `_normalizePipeTableRows`)도 동일 |
| app.js `_convertVideoMarkdownTablesToHtml` (2026-05-27) | markdown pipe table 에 event-video div 가 들어가면 표 전체를 raw HTML `<table>` 로 변환. Gemini 가 markdown 셀 안 raw HTML `<div>` 를 누락하는 회귀 차단 (= 4-aside 그리드 경로와 동일 결정론 형태). build_notion_data.py 도 동일 형태로 들어가도록 향후 동기화. |
| app.js video safety-net (generateContent 안, ensureEventVideoScript 직전, 2026-05-27) | 입력 `data` 의 event-video data-src URL 중 Gemini 출력 `out` 에 빠진 게 있으면 누락 URL 만으로 raw HTML grid 만들어 .se-contents 끝에 삽입. console.warn 으로 회귀 진단 가능. Gemini 가 raw HTML 보존 룰 위반해도 영상은 최소한 노출됨 |
| app.js raw HTML placeholder 시스템 (2026-05-27) | preprocessPasteContent 가 만드는 raw `<table>` + event-video div 블록을 Gemini 에 보내기 전 `[[PROMO_PRESERVE_N]]` 토큰으로 치환. `_promoPreservedBlocks` 배열에 실제 HTML 저장. generateContent 가 Gemini 출력에서 토큰을 다시 raw HTML 로 복원 (`restorePromoPreservedBlocks`). 회귀 차단: 실측 Gemini 가 "preserve verbatim" 룰 무시하고 raw `<table>` 4/4 URL 드롭 케이스 발견 → 토큰 텍스트 보존율은 훨씬 높음. 시스템 프롬프트에 토큰 보존 명령 자동 주입. |
| app.js `_isCellEmpty` 3곳 element 검사 통일 (2026-05-27 / 2026-05-28) | 기존 `_isCellEmpty` 가 textContent 만 검사 → 영상 셀(텍스트 없고 `<video>` 만) 을 빈 셀로 오판 → "선두 빈 row 제거" 루프가 영상 그리드 row 전체 삭제. 동일 패턴이 3곳에 분산되어 있어 모두 fix 필요: ① fixTableThs(L9624) ② installEmptyRowGuard MutationObserver(L8150) ③ stripEmptyRowsOnExport(L2203). 모두 video/img/iframe/audio/source/canvas/svg/button/a/input 자식 있으면 비었지 않다고 판정. (`[empty-row-guard] mutation removed: N` 로그 떠도 정상 — 진짜 빈 row 만 제거) |
| app.js 영상 그리드 콜아웃 박스 wrap + border skip (2026-05-28) | (1) 복원 후 DOM 기반 콜아웃 박스 wrap — 영상 그리드/표를 `mutedColor` bg + padding 1.5rem + border-radius 0.75rem 박스로 wrap (섹션 카드보다 가벼운 콜아웃 스타일). 직전 형제가 섹션 카드면 그 안으로 흡수+wrap (영상은 직전 섹션의 일부 + 자체 박스 시각 구분). 이미 bg-styled 박스 안이면 skip. 섹션 카드 판별: `background-color` 있는 `.se-div` + `max-width` 없음 (콘텐츠 래퍼 제외). (2) `standardizeTableStyles` — event-video 표는 `dataTables` 필터에서 제외, td 도 `borderBottom` 만 수집/적용. (3) `fixTableThs` — event-video 표 셀은 기본 `1px solid #d9d9d9` 박지 않음. |

이 방어 코드들은 룰 분할/통합과 무관. 단순 후처리 safety net 이라 그대로 유지.

## 슬래시 커맨드

- [/promo-status](.claude/commands/promo-status.md) — DB 현황 조회 (안전, 작업 안 함)
- [/promo-run](.claude/commands/promo-run.md) — 상태 머신 배치 실행 (멱등)
- [/promo-resume](.claude/commands/promo-resume.md) — 단일 row 정밀 제어
- [/html-gen](.claude/commands/html-gen.md) — 기존 배치 자동 생성

## 환경 설정

루트의 `.env` 파일에 노션 DB ID와 Gemini API 키 설정. 템플릿: `.env.example` 참고.

## 노션 DB 정보

작업 데이터(경로, URL, 텍스트, 이미지 등)는 모두 노션의 `[기본 정보]` 테이블 및 각 섹션에서 런타임 fetch. 코드/문서에는 노션 데이터를 저장하지 않음.

DB 스키마/상태 전이/컨펌 게이트 상세는 메모리 `reference_notion_db.md` 참고.
