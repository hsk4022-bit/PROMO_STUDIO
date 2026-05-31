# 필독 (MANDATORY)

이 프로젝트에서 작업하는 모든 에이전트는 작업 시작 **전에** 반드시 아래를 수행해야 한다.

## 1. 규칙 파일 로드 (예외 없음)
다음을 **반드시** 읽은 후 작업 시작한다. 하나라도 건너뛰면 즉시 FAIL.

- **`orchestration_contract.md`** ★ — End-to-End 자동화 계약. Route 1/2 분기, 4개 체크포인트, UI 원격 제어, 회귀 방지 원칙
- **`image_pipeline_contract.md`** ★ — 이미지 수집·치환·해시 파이프라인. 3단계(Ingestion → Generation → Finalize) + 검증 게이트
- **`rules/INDEX.md`** — HTML 생성 룰 룩업 가이드. 컨텐츠 feature 식별 후 매칭 `rules/*.md` 만 **parallel Read** (단일 메시지 multi-Read). rules/ 전체 통독 금지. (`master_guidelines.md` + `build-guidelines.sh` 는 2026-05-28 제거 — dispatcher.js 가 런타임 fetch)
- **`notion_parsing_rules.md`** — 노션 기획서 파싱 규칙 (블록 타입, callout 재귀, 이미지, 해시 폴더, 테이블 병합 등)
- **`app.js`** — 결과물 포맷 규칙의 원본. 다음 함수/상수를 반드시 확인:
  - `generateHashString(length)` — 해시 폴더명 규칙 (16자리) / 파일명 해시(8자리)
  - `detectExistingHash()` — 수정 시 기존 해시 유지
  - `currentHashFolder` — 해시 상태
  - `contentAssetLibrary`, `runImageMatching` — 컨텐츠 에셋 → 마커 치환 파이프라인
  - `IMAGE_MODEL`, `CONTENT_MODEL` — Gemini 모델명 **(확인만 할 것, 절대 수정 금지)**
  - ZIP 구조 (`PROMO_SLICED/`, `PROMO_html/`)

> 에이전트가 수동으로 HTML을 생성하더라도 **promo-editor가 만드는 결과물과 완전히 동일한 포맷**을 따라야 한다. 임의 폴더명·파일 구조·해시 규칙 생성 금지.
>
> Route 1 (promo-editor UI) 과 Route 2 (Claude 단독) 의 **결과물 포맷은 100% 동일**. 기능상 차이 금지. 차이 나면 FAIL.

## 2. PRE-FLIGHT 선언 출력
파일 로드 후 사용자에게 다음 선언을 출력한 뒤 작업 시작:

```
✅ orchestration_contract.md 로드 완료 (Route 분기 / 4개 체크포인트 / 회귀 방지)
✅ image_pipeline_contract.md 로드 완료 (3단계 파이프라인 / 검증 게이트)
✅ rules/INDEX.md 룩업 완료 — 로드한 rules/*.md: <목록 명시 (예: 01,02,03,04,05,06,07,08,09,11,14,15,16,99)>
✅ notion_parsing_rules.md 로드 완료
✅ app.js 포맷 규칙 확인 완료 (해시 / 모델명 / ZIP 구조 / contentAssetLibrary)
```

이 선언 없이 작업 시작 시 즉시 FAIL.

## 3. 최우선 원칙 (Top-Level Principles)

1. **이미지 수집이 끝나기 전에는 HTML 한 줄도 쓰지 않는다.** → `image_pipeline_contract.md` §1
2. **체크포인트 통과 없이 다음 단계 자동 진행 금지.** → `orchestration_contract.md` §체크포인트
3. **기존 수동 플로우는 절대 훼손 금지.** 자동화는 add-on 형태로만. 자동화 진입 조건 없으면 기존 동작 100% 동일. → `orchestration_contract.md` §회귀 방지
4. **두 Route 의 결과물 포맷 100% 동일.** 차이 나면 FAIL.

## 4. Route 판정 — 작업 요청 들어오면 **맨 먼저** 결정

사용자 프롬프트를 해석해 Route 1 또는 Route 2 를 선택한다. 판정 기준:

| 트리거 (사용자 프롬프트에 있는 표현) | Route | 동작 |
|---|---|---|
| "클로드로", "Claude 로", "채팅으로", "UI 없이" | **Route 2** | Claude 가 전체 파이프라인 수행 (INGESTION → HERO → HTML → FINALIZE → 배너). 체크포인트마다 채팅으로 "OK/재생성/수정" 대기 |
| "프로모 에디터로", "promo-editor 로", "UI 로" | **Route 1** | Claude 는 **INGESTION 까지만** 수행 (노션 파싱 + `notion_data.json` + 컨텐츠 에셋 폴더 구축). 이후 "`promo-editor/index.html` 열어주세요" 안내 후 대기. UI 에서 유저가 HERO/CONTENT/배너 진행 |
| 명시 없음 | **기본값 Route 2** | 단, INGESTION 완료 직후 유저에게 "Route 2 로 계속? 아니면 Route 1 (UI) 로?" 1회 확인 |

### 경로 필드 매핑 (공통 — 두 Route 모두)

`notion_data.json` 의 `basicInfo` 에서 읽는다. 없으면 그 자리 표기의 폴백 사용:

| 용도 | 노션 필드 | 폴백 |
|---|---|---|
| 컨텐츠 에셋 마스터 | `컨텐츠 에셋 경로` | `로컬 저장 경로/컨텐츠_에셋/` |
| 산출물 (HTML + ZIP) | `산출물 저장 경로` | `로컬 저장 경로` |
| 배너 산출물 | `배너 로컬 저장 경로` | `배너 저장 경로` → 없으면 산출물 저장 경로 하위 `배너/` |

### Route 1 종료 시점
- INGESTION 완료 + 검증 PASS 리포트 출력
- 사용자에게 **"promo-editor/index.html 열어주세요. 나머지 UI 에서 진행됩니다."** 라는 안내 출력
- Claude 는 HERO/HTML/배너 생성에 **절대 개입하지 않음** (회귀 방지)

### Route 2 종료 시점
- 4개 체크포인트 모두 OK + `§3.4 최종 검증 리포트` + `orchestration_log.json` 저장

## 5. 작업 완료 후 자가 검증

결과물 전달 **전**에 아래 리포트를 반드시 사용자에게 출력한다. 하나라도 ✗면 "완료" 선언 금지:

- `rules/20-self-verify.md` 의 자가 검증 리포트 섹션
- `image_pipeline_contract.md` 의 **§3.4 최종 검증 리포트**
- `orchestration_contract.md` 의 **체크리스트 (종료 전)**

리포트 없이 사용자에게 "완료"라고 보고하는 순간 FAIL.

---

**세부 규칙, FAIL 조건, 금지 항목은 각 계약 파일 참조.**
