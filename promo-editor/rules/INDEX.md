---
id: INDEX
title: rules/ 디렉토리 인덱스 (Claude 읽기 가이드 + 빌드 매니페스트)
purpose: Claude 가 컨텐츠 feature 식별 후 어떤 rules/*.md 파일을 parallel Read 할지 결정하는 룩업.
status: ACTIVE (2026-05-28~)
---

# rules/ — Promo Studio HTML 생성 룰

> **Canonical SSOT**: 이 디렉토리의 `*.md` 파일들이 원본. 룰 변경은 여기서 직접 편집 → **즉시 반영** (build 단계 없음, 2026-05-28~).
> `promo-editor/js/dispatcher.js` 가 페이지 로드 시 `rules/*.md` 21개 (01-20 + 99) 를 `Promise.all` 로 병렬 fetch 한 뒤 컨텐츠 패턴 매칭으로 필요한 섹션만 묶어 Gemini 에 전달.
> file:// 환경 미지원 — HTTP 서버 (로컬: `python3 -m http.server`, 배포: GitHub Pages 등) 사용.

## Claude 전용 메타 문서 (build 제외 — Gemini 안 봄)

| 파일 | 역할 |
|---|---|
| [INDEX.md](INDEX.md) | 이 파일 — 룰 룩업 가이드 + 빌드 매니페스트 |
| [harness.md](harness.md) | 프로젝트 골격 (디렉토리 구조 / 작업 모드 / PRE-FLIGHT / 회귀 방지 원칙) |
| [skills.md](skills.md) | 슬래시 커맨드 + dispatcher 메커니즘 + 자동화 코어 + 3단계 파이프라인 |

---

## Claude 읽기 워크플로 (작업 진입 시)

1. **컨텐츠 분석** — 노션 row / 사용자 입력에서 feature 패턴 탐지 (이미지·테이블·버튼·탭·팝업·영상).
2. **이 INDEX 룩업** — 아래 "Always read" + 매칭 "Feature match" + 필요 시 "Context-dependent".
3. **단일 메시지에서 parallel Read** — 대상 파일들을 한 번에 Read (Read 도구 다중 호출).
4. **전체 rules/ 통독 금지** — 위 절차로 충분. 통독 시 메모리 `feedback_read-targeted-md.md` 위반.

---

## Always read (core — 모든 HTML 작업 필수)

| # | 파일 | 주제 |
|---|---|---|
| 01 | [01-roles-and-modes.md](01-roles-and-modes.md) | Role, 작업 모드 분기, PRE-FLIGHT, 자동 FAIL |
| 02 | [02-principles.md](02-principles.md) | 제0원칙 (원고 최우선) + 제0.5원칙 (구조 우선) |
| 03 | [03-prohibitions.md](03-prohibitions.md) | 절대 금지 + 에디터 파서 우회 |
| 04 | [04-html-preamble.md](04-html-preamble.md) | HTML preamble 3줄 |
| 05 | [05-html-structure.md](05-html-structure.md) | .se-contents + 1번·2번 블록 골격 |
| 09 | [09-section-card.md](09-section-card.md) | 섹션 카드 템플릿 + 일관성 |
| 99 | [99-overrides.md](99-overrides.md) | 사용자 누적 교정 (최상위 권위) |

## Always read (visual — 거의 항상 필요)

| # | 파일 | 주제 |
|---|---|---|
| 06 | [06-color-system.md](06-color-system.md) | 컬러 토큰, WCAG, muddy-zone 방지 |
| 07 | [07-typography.md](07-typography.md) | 폰트 크기·두께·승격 금지 |
| 08 | [08-spacing.md](08-spacing.md) | 간격 트리거-액션 매핑 |
| 16 | [16-responsive.md](16-responsive.md) | 반응형 적용 범위 + 검증 |

## Feature match (컨텐츠 패턴 매칭 시)

| 컨텐츠 패턴 | 추가 read | 파일 |
|---|---|---|
| 이미지 마커 `(item_NN.png)` / `<img>` | image | [10-image.md](10-image.md) |
| `<table>` / markdown pipe table | table | [11-table.md](11-table.md) |
| `[대버튼]` / `[중버튼]` / `[소버튼]` | button | [12-button.md](12-button.md) |
| `tab01` / `[Tab\d]` / `href="#tab\d"` | tab | [13-tab.md](13-tab.md) |
| `[팝업N]` / `popup-trigger` / `se-popup-content` | popup | [14-popup.md](14-popup.md) (대형 — 240+ 줄) |
| `[영상]` / `[영상\|옵션]` / `event-video` / `.mp4` | video | [15-video.md](15-video.md) (250+ 줄) |

위 패턴은 [../app.js](../app.js) 의 `FEATURE_DETECTORS` (L1049-1056) 와 1:1 매핑. 런타임 dispatcher 도 동일 규칙으로 Gemini 번들 구성.

## Context-dependent (상황별)

| # | 파일 | 언제 read |
|---|---|---|
| 17 | [17-layout-patterns.md](17-layout-patterns.md) | 레이아웃 패턴 A~J 적용 시 |
| 18 | [18-section-grouping.md](18-section-grouping.md) | 카드 묶음·중첩·헤딩 결정 시 + 메타 클리닝 |
| 19 | [19-notion-parsing.md](19-notion-parsing.md) | 노션 파싱 디테일 (대개 `../notion_parsing_rules.md` 우선) |
| 20 | [20-self-verify.md](20-self-verify.md) | 작업 종료 전 자가 검증 단계 |
| 97 | [97-snippets.md](97-snippets.md) | 복붙용 HTML 스니펫 (Claude-only, build 제외) |

---

## 편집 워크플로 (룰 변경 시)

1. `rules/*.md` 에서 해당 섹션 직접 편집 (`# [...]` 헤더 그대로 유지).
2. promo-editor UI 새로고침 (Cmd+Shift+R) → dispatcher.js 가 변경된 rules/*.md 다시 fetch.
3. 콘솔 `[dispatcher] loaded 21/21 rules` 로그 + `[dispatcher] sections: N/M` 로 섹션 split 정상 확인.

build 단계 없음 (2026-05-28 ~ `master_guidelines.md` + `build-guidelines.sh` 제거).

## 파일 fetch 순서 (dispatcher.js 의 RULES_FILE_LIST)

`promo-editor/js/dispatcher.js` 의 `RULES_FILE_LIST` 상수에 21개 파일 명시 (01-20 + 99):
- 01-20: 숫자 오름차순
- 99-overrides.md: 끝
- 제외 (런타임 fetch 안 함): `INDEX.md`, `harness.md`, `skills.md` (Claude 메타 문서), `97-snippets.md` (Claude 전용 참조)
- 새 rule 파일 추가 시 `RULES_FILE_LIST` 에도 등록 필요.

## 헤더 규칙 (dispatcher 호환 필수)

- 각 파일 안의 섹션 헤더는 `# [섹션명]` 형식. dispatcher 가 `/^#\s*\[([^\]]+)\]\s*$/` 로 split.
- 같은 파일 안에 여러 `# [...]` 섹션 가능 (예: `01-roles-and-modes.md` 는 4개 섹션 묶음).
- 섹션 간 separator: 빈 줄 + `---` + 빈 줄.
