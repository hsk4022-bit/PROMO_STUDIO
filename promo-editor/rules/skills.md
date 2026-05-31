---
id: skills
title: PROMO-STUDIO 스킬스 (capabilities + dispatcher 메커니즘)
purpose: 이 시스템이 제공하는 슬래시 커맨드, 룰 dispatcher 메커니즘, 자동화 코어 모듈을 한 곳에 정리. Claude/에이전트가 무엇을 호출할 수 있는지 파악.
status: ACTIVE (2026-05-28~)
scope: Claude-only (dispatcher.js 의 RULES_FILE_LIST 에 포함 안 됨 — Gemini 안 봄)
---

# PROMO-STUDIO 스킬스

> 이 파일은 **Claude/에이전트 전용 메타 문서**. Gemini 에 전달되지 않음.
> 시스템 capabilities — 슬래시 커맨드 / dispatcher / 자동화 모듈 / 파이프라인 단계.

---

## 1. 슬래시 커맨드 (사용자 호출)

[`.claude/commands/`](../../.claude/commands/) 에 정의된 사용자 호출 가능한 스킬.

| 커맨드 | 역할 | 안전성 |
|---|---|---|
| **/promo-status** | 노션 DB 현황 조회 (작업 안 함) | 안전 — read-only |
| **/html-gen** | 기존 배치 자동 HTML 생성 | 중간 — 결과물 생성 |
| **/promo-run** | 상태 머신 배치 실행 (멱등) | 중간 — 전체 파이프라인 |
| **/promo-resume** | 단일 row 정밀 제어 / 재진행 | 중간 — 특정 프로모션 |

발동 방식: 사용자가 `/promo-run` 식으로 입력 → `.claude/commands/<name>.md` 의 instruction 을 Claude 가 실행.

---

## 2. 룰 dispatcher 메커니즘 (Gemini 프롬프트 빌드)

`promo-editor/js/dispatcher.js` 의 런타임 룰 선택 로직.

```
[페이지 로드 직후 자동]
loadAllRules() → Promise.all 로 rules/*.md 21개 (01-20 + 99) 병렬 fetch
              → 각 파일 stripFrontmatter + splitGuidelinesIntoSections
              → rulesCache 채움

[사용자가 생성 클릭]
┌──────────────────────────────────────────────────────────┐
│ 사용자 페이스트 / 노션 컨텐츠                              │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 1. preprocessPasteContent (paste-preprocess.js)          │
│    - <aside> strip, pipe table 정규화                     │
│    - 영상 마커 → grid HTML 변환                            │
│    - raw HTML → [[PROMO_PRESERVE_N]] 토큰 치환             │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 2. rulesCache → 통합 sections 배열                         │
│    RULES_FILE_LIST 순서대로 각 파일의 # [섹션] 추출         │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 3. selectRulesForContent (dispatcher.js)                  │
│    CORE_SECTION_KEYWORDS (항상) +                         │
│    FEATURE_DETECTORS 매칭 (popup/video/table/tab/image)    │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 4. buildGuidelineBundle (dispatcher.js)                   │
│    core + matched features 만 concat                      │
│    → Gemini 프롬프트 (~600-700줄, 원본 1102 의 60%)        │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 5. Gemini API 호출 (CONTENT_MODEL)                        │
└────────────────────────┬─────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────────┐
│ 6. 9개 safety net + style-normalize (출력 강제)            │
│    - normalizeTableStructure / fixTableThs                │
│    - unhideTabSections / sanitizeBrokenPopupTriggers      │
│    - ensureEventVideoScript / installEmptyRowGuard       │
│    - restorePromoPreservedBlocks (토큰 → raw HTML 복원)    │
└────────────────────────┬─────────────────────────────────┘
                         ↓
                  최종 HTML 산출물
```

**feature 매칭 패턴** (`FEATURE_DETECTORS`):

| 패턴 | 매칭 룰 |
|---|---|
| `(item_NN.png)` / `<img>` | [10-image.md](10-image.md) |
| `<table>` / markdown pipe | [11-table.md](11-table.md) |
| `[대버튼]` / `[중버튼]` / `[소버튼]` | [12-button.md](12-button.md) |
| `tab\d+` / `href="#tab\d"` | [13-tab.md](13-tab.md) |
| `[팝업N]` / `popup-trigger` | [14-popup.md](14-popup.md) |
| `[영상]` / `.mp4` / `event-video` | [15-video.md](15-video.md) |

상세: [INDEX.md](INDEX.md) 의 "Feature match" 섹션.

---

## 3. 자동화 코어 모듈 (Route 1 — promo-editor UI 와 연계)

| 파일 | 역할 |
|---|---|
| [../pipeline.js](../pipeline.js) | OS 경로 정규화, File System Access API 핸들, `window.PromoPipeline` 노출 |
| [../ingest.js](../ingest.js) | INGESTION — 노션 페이지 전수 스캔 + `notion_data.json` + 컨텐츠_에셋 폴더 구축 |
| [../finalize.js](../finalize.js) | FINALIZE — `PROMO_xxx/` 해시 폴더 복사 + ZIP 생성 + 검증 리포트 |
| [../orchestrator.js](../orchestrator.js) | Route 1 진입점 — 자동화 컨텍스트 감지 시에만 동작 (수동 플로우 보존) |

**진입 트리거**: `orchestrator.js` 가 `window.location` / URL 파라미터 / `notion_data.json` 존재 여부로 자동화 컨텍스트 감지.

---

## 4. 3단계 이미지 파이프라인 (Ingestion → Generation → Finalize)

[image_pipeline_contract.md](../../image_pipeline_contract.md) 의 핵심:

| 단계 | 위치 | 출력 |
|---|---|---|
| **§1 Ingestion** | `ingest.js` + Claude (수동) | `notion_data.json` + `컨텐츠_에셋/` 폴더 + Hero 이미지 후보 |
| **§2 Generation** | `app.js generateContent` (UI) 또는 Claude (Route 2) | HTML + `(item_NN.png)` 마커 |
| **§3 Finalize** | `finalize.js` (UI) 또는 Claude (Route 2) | `PROMO_<hash>/` 폴더 + ZIP + 검증 리포트 |

**게이트**: 각 단계 끝에 검증 PASS 필요. FAIL 시 다음 단계 진입 금지.

---

## 5. Build 시스템 (2026-05-28 ~ 폐지, 런타임 fetch 로 대체)

build 단계 없음. `dispatcher.js` 가 페이지 로드 시 `rules/*.md` 21개 (01-20 + 99) 를 `Promise.all` 로 병렬 fetch.

| 도구 | 입력 | 출력 | 트리거 |
|---|---|---|---|
| `js/dispatcher.js` 의 `loadAllRules()` | `rules/[0-9][0-9]-*.md` + `99-overrides.md` | rulesCache (in-memory) | 스크립트 로드 시 자동 (`<script>` defer) |
| `js/dispatcher.js` 의 `buildGuidelineBundle(content)` | rulesCache + content 패턴 매칭 | Gemini 프롬프트 | `generateContent` 호출 시 |

**제외 파일** (dispatcher 의 `RULES_FILE_LIST` 에 없음):
- `INDEX.md`, `harness.md`, `skills.md` — Claude 메타 문서
- `97-snippets.md` — Claude 전용 스니펫 참조

**룰 추가 시**: `RULES_FILE_LIST` 에 새 파일명 등록 필요.

---

## 6. 4개 체크포인트 (Route 2 — Claude 단독 모드)

[orchestration_contract.md](../../orchestration_contract.md) 의 4 게이트:

| 체크포인트 | 시점 | 사용자 결정 |
|---|---|---|
| **CP1** | INGESTION 완료 후 | Hero 이미지 후보 확인 / Route 2 계속? Route 1 전환? |
| **CP2** | HERO 이미지 생성 후 | OK / 재생성 / 수정 |
| **CP3** | HTML 생성 후 | OK / 재생성 / 수정 |
| **CP4** | FINALIZE 직전 | OK / 재실행 |

각 체크포인트마다 채팅으로 사용자 OK 대기. **체크포인트 통과 없이 자동 진행 금지**.

---

## 7. 관련 메타 문서

- [INDEX.md](INDEX.md) — rules/ 룩업 가이드
- [harness.md](harness.md) — 프로젝트 골격 + 디렉토리 구조
- [../CLAUDE.md](../CLAUDE.md) — promo-editor PRE-FLIGHT 사본
- [../../CLAUDE.md](../../CLAUDE.md) — 루트 PRE-FLIGHT
