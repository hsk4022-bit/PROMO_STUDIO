---
id: harness
title: PROMO-STUDIO 하네스 (프로젝트 프레임워크)
purpose: Claude / 에이전트가 작업 진입 시 따라야 할 프로젝트 골격. 디렉토리 구조 / 작업 모드 / PRE-FLIGHT / 회귀 방지 원칙을 한 곳에 모음.
status: ACTIVE (2026-05-28~)
scope: Claude-only (dispatcher.js 의 RULES_FILE_LIST 에 포함 안 됨 — Gemini 안 봄)
---

# PROMO-STUDIO 하네스

> 이 파일은 **Claude/에이전트 전용 메타 문서**. Gemini 에 전달되지 않음 (`dispatcher.js` 의 `RULES_FILE_LIST` 에서 제외).
> 실제 룰은 [INDEX.md](INDEX.md) 룩업 후 `01-…20-*.md` 참조.

---

## 1. 디렉토리 구조 (한 눈에)

```
PROMO-STUDIO-main4_new/
├── CLAUDE.md                       # 루트 PRE-FLIGHT 선언 (작업 진입 시 필독)
├── orchestration_contract.md       # Route 1/2 분기, 4개 체크포인트, 회귀 방지 ★
├── image_pipeline_contract.md      # 3단계 이미지 파이프라인 (Ingestion → Generation → Finalize) ★
├── notion_parsing_rules.md         # 노션 블록 → 마크다운 변환 규칙
│
├── .claude/
│   ├── commands/                   # 슬래시 커맨드 (skills.md 참조)
│   └── settings.json               # hook (PreToolUse: notion_data.json 직접 편집 차단)
│
└── promo-editor/                   # 프로모 에디터 UI + 자동화 코어
    ├── index.html                  # entry point
    ├── pipeline.js                 # 자동화 코어 (OS 경로·FS 핸들)
    ├── ingest.js                   # INGESTION (노션 전수 스캔)
    ├── finalize.js                 # FINALIZE (ZIP 산출물 + 검증 리포트)
    ├── orchestrator.js             # Route 1 진입점
    ├── app.js                      # 수동 에디터 (Stage 1-10 분리 완료, ~1500줄)
    ├── style.css
    │
    ├── rules/                      # ★ canonical SSOT (Gemini HTML 생성 룰)
    │   ├── INDEX.md                # 룩업 가이드
    │   ├── harness.md              # ★ 이 파일
    │   ├── skills.md               # 슬래시 커맨드 + dispatcher
    │   ├── 01-roles-and-modes.md   # 역할/모드/PRE-FLIGHT
    │   ├── 02-principles.md        # 제0/0.5 원칙
    │   ├── 03-prohibitions.md      # 절대 금지
    │   ├── ... 04-20               # HTML 생성 룰 (always read / feature match / context)
    │   ├── 97-snippets.md          # Claude 전용 스니펫 (build 제외)
    │   └── 99-overrides.md         # 사용자 누적 교정 (최상위 권위)
    │
    └── js/                         # ★ app.js 분리 산출물 (작업 진행 중)
        ├── state.js / utils.js     # 인프라
        ├── dispatcher.js           # 룰 split/select/bundle
        ├── color-palette.js        # 디자인 시스템
        ├── tab/table/video/popup-builder/image-editor   # feature (rules/10-15 짝)
        ├── slicer/export/drag-drop/asset-library/clipboard/hero-image/history/editor-helpers   # 툴 기능
        ├── notion.js               # 외부 연결
        └── paste-preprocess.js + style-normalize.js     # HTML 생성 조건 트리오 (입력/출력)
```

---

## 2. 작업 모드 (Route 판정 — 작업 진입 시 가장 먼저 결정)

| 트리거 (사용자 발화) | Route | Claude 가 하는 일 |
|---|---|---|
| "클로드로" / "Claude 로" / "채팅으로" / "UI 없이" | **Route 2** | 전체 파이프라인 수행. 4개 체크포인트마다 사용자 OK 대기. |
| "프로모 에디터로" / "promo-editor 로" / "UI 로" | **Route 1** | INGESTION 까지만. 그 후 "`promo-editor/index.html` 열어주세요" 안내. |
| 명시 없음 | **기본 Route 2** | INGESTION 직후 Route 확인 1회. |

상세: [orchestration_contract.md](../../orchestration_contract.md)

---

## 3. PRE-FLIGHT (작업 시작 전 필독 — 누락 시 즉시 FAIL)

작업 진입 시 다음 5개 파일 로드 + 선언 출력:

```
✅ orchestration_contract.md 로드 완료 (Route 분기 / 4개 체크포인트 / 회귀 방지)
✅ image_pipeline_contract.md 로드 완료 (3단계 파이프라인 / 검증 게이트)
✅ rules/INDEX.md 룩업 완료 — 로드한 rules/*.md: <목록>
✅ notion_parsing_rules.md 로드 완료
✅ app.js 포맷 규칙 확인 완료 (해시 / 모델명 / ZIP 구조 / contentAssetLibrary)
```

**예외**: 소스 코드 리팩토링 (예: app.js → js/ 분리) 작업은 HTML 생성 파이프라인이 아니므로 PRE-FLIGHT 적용 안 함.

---

## 4. 최우선 원칙 (Top-Level Principles)

1. **이미지 수집 완료 전 HTML 한 줄도 쓰지 않는다** — [image_pipeline_contract.md §1](../../image_pipeline_contract.md)
2. **체크포인트 통과 없이 다음 단계 자동 진행 금지** — [orchestration_contract.md §체크포인트](../../orchestration_contract.md)
3. **기존 수동 플로우 절대 훼손 금지** — 자동화는 add-on 만. 자동화 진입 조건 없으면 기존 동작 100% 동일.
4. **Route 1 / Route 2 결과물 포맷 100% 동일** — 차이 나면 FAIL.

---

## 5. 회귀 방지 핵심 (코드 변경 시)

- **app.js 의 9개 safety net** (CLAUDE.md L37-65 / `project_promo-studio-fragility.md` 메모리) 절대 무력화 금지.
- **로직 변경 시** 영상/팝업/탭/표 4종 풀 파이프라인 회귀 검증 필수.
- **신규 룰 추가 시** `# [섹션명]` 헤더 형식 준수 (`splitGuidelinesIntoSections` 의 `/^#\s*\[([^\]]+)\]\s*$/` 정규식 매칭).

---

## 6. 작업 완료 후 자가 검증

결과물 전달 **전** 다음 3개 리포트 출력 (하나라도 ✗ 면 "완료" 선언 금지):
- [20-self-verify.md](20-self-verify.md) 자가 검증 리포트
- [image_pipeline_contract.md §3.4](../../image_pipeline_contract.md) 최종 검증 리포트
- [orchestration_contract.md 체크리스트](../../orchestration_contract.md)

---

## 7. 관련 메타 문서

- [INDEX.md](INDEX.md) — rules/ 룩업 가이드 (어떤 룰을 read 할지)
- [skills.md](skills.md) — 슬래시 커맨드 + dispatcher 메커니즘
- [../CLAUDE.md](../CLAUDE.md) — promo-editor 디렉토리의 PRE-FLIGHT 사본
- [../../CLAUDE.md](../../CLAUDE.md) — 루트 PRE-FLIGHT (Route 판정 + 핵심 원칙)
