# /promo-resume — 특정 프로모션 재진행 / 작업자 일괄 dispatch

두 가지 모드로 동작:
1. **단일 row 모드** (`/promo-resume <프로모션명>`) — 특정 프로모션 1건을 골라 원하는 단계부터 재진행
2. **작업자 배치 모드** (`/promo-resume <이름>`) — 해당 작업자의 ▶️진행가능 항목을 전부 찾아 각각 별개 세션으로 dispatch

---

## 사용 방법

```
/promo-resume <프로모션명> [단계]   ← 단일 row 정밀 제어
/promo-resume <이름>                ← 작업자의 전체 ▶️진행가능 일괄 dispatch
```

예시:
- `/promo-resume <프로모션명>` — 현재 상태부터 자동 진행
- `/promo-resume <프로모션명> hero` — HERO 단계부터 강제 재시작
- `/promo-resume <프로모션명> content` — CONTENT 단계만 재생성
- `/promo-resume <프로모션명> finalize` — 결과물 저장만
- `/promo-resume <프로모션명> reset` — 상태를 ⏳대기로 되돌림 (실제 작업 안 함)
- `/promo-resume <이름>` — 해당 작업자 담당의 ▶️진행가능 항목 전부 병렬 dispatch

---

## STEP 0: 환경 초기화

`/promo-run` STEP 0-A·0-B·0-C와 동일:
1. 사용자 메시지 → `~/.claude/memory/promo-studio.md` 순으로 설정값 로드
2. 값 확보 후 메모리 파일 저장 (없으면 생성)
3. GitHub에서 파일 다운로드 (URL 있으면) 또는 기존 로컬 파일 사용

---

## 모드 판별 (STEP 1)

인자가 1개이고 단계 키워드(`hero`, `content`, `finalize`, `test-deploy`, `live-deploy`, `reset`)가 아닐 때:

1. `notion-search`로 **담당자 이름**으로 먼저 검색 시도:
   ```
   mcp__...__notion-search
     query: <인자>
     data_source_url: "collection://${NOTION_DB_ID}"
     filters: { 담당자: <인자> }
     page_size: 25
   ```
2. 결과 중 `상태 = ▶️진행가능` 인 row가 1건 이상이면 → **작업자 배치 모드** 진입 (아래 BATCH 섹션)
3. 0건이면 → 프로모션명 검색으로 폴백 → **단일 row 모드** (STEP 1 이하)

---

## [BATCH] 작업자 배치 모드

### B-1: ▶️진행가능 항목 수집

STEP 0에서 담당자 필터로 검색된 결과 중 `상태 = ▶️진행가능`인 row만 추출.
각 row에 대해 `notion-fetch`로 properties 병렬 조회 (단일 메시지에 동시 호출):

```
mcp__...__notion-fetch  id: <row URL>
```

추출 properties:
- 프로모션명, 게임명, 담당자, 상태
- 게시물 도구, 배너 도구 (Route 결정)
- HERO/CONTENT/테스트/라이브 컨펌 여부

### B-2: Route 분류 및 사용자 표시

`/promo-run` STEP 1-C·1-D·1-E와 동일 로직으로 다음 단계 결정 + Route 분류.

```
📋 <이름> 담당 ▶️진행가능 항목 N건:

[Route 1 — 프로모 에디터 UI] M1건
  - <프로모션명> (<게임명>) → INGESTION 후 UI 진입

[Route 2 — Claude 자동] M2건
  - <프로모션명> (<게임명>) → HERO 생성부터 자동
  - <프로모션명> (<게임명>) → CONTENT 생성 단계

▶ 모두 별개 세션으로 spawn합니다.
```

0건이면:
```
📋 <이름> 담당 ▶️진행가능 항목 없음. /promo-status로 현황 확인.
```

### B-3: 각 row를 spawn_task로 dispatch

`/promo-run` STEP 2와 동일하게 **단일 메시지에 모든 spawn_task 동시 호출**:

```
mcp__ccd_session__spawn_task
  title: <프로모션명>
  tldr: [Route N] <게임명> - <다음 단계> (담당: <이름>)
  prompt: <Route 1이면 STEP 3-A, Route 2이면 STEP 3-B 프롬프트 — /promo-run 참조>
```

dispatch 완료 후:
```
📤 N건 dispatched. Recents 좌측에서 각 작업을 클릭해주세요:

[Route 1] M1건
  1. <프로모션명> (<게임명>)
[Route 2] M2건
  2. <프로모션명> (<게임명>)

▶ 현황: /promo-status  ▶ 단일 재진행: /promo-resume <프로모션명>
```

메인 세션 종료. 추가 작업 없음.

---

## STEP 1: 프로모션명으로 row 식별

`notion-search` 호출 (`notion-query-data-sources` 환경 미존재 → `notion-search`로 대체):

```
mcp__...__notion-search
  query: <인자 — 프로모션명>
  data_source_url: "collection://${NOTION_DB_ID}"
  filters: {}
  page_size: 10
```

검색 결과 후처리:
- 0건 → "해당 프로모션을 찾을 수 없습니다." 출력 후 종료
- 1건 → 해당 row의 URL 확보 후 STEP 2로 진행
- 2건 이상 → 매칭된 목록 표시 후 사용자에게 정확한 이름 재입력 요청

row URL 확보 즉시 `notion-fetch`로 **자동** 전체 페이지 파싱 (사용자 입력 대기 없음):

```
notion-fetch id: <row URL>
```

fetch 결과에서 추출:
- 프로모션명 / 게임명 / 담당자 / 상태
- HERO 컨펌 / CONTENT 컨펌 / 테스트 배포 / 라이브 배포
- 게시물 도구 / 배너 도구 / 비고
- [기본 정보], [HERO_SECTION], [CONTENT_SECTION], [BANNER_SECTION] 전체 내용

---

## STEP 2: 단계 결정

인자로 받은 단계가 있으면 해당 단계 강제 실행. 없으면 현재 상태 기준 자동 결정:

| 현재 상태 | 자동 다음 단계 |
|---|---|
| ⏳대기 | hero |
| 🎨HERO생성 | hero (재시도) |
| ⚠️HERO컨펌대기 | content (HERO 컨펌됐으면) / hero 재생성 (안 됐으면) |
| 📝CONTENT생성 | content (재시도) |
| ⚠️CONTENT컨펌대기 | finalize (CONTENT 컨펌됐으면) / content 재생성 (안 됐으면) |
| ✅생성완료 | test-deploy (테스트 배포 체크됐으면) |
| 🧪테스트배포 | live-deploy (라이브 배포 체크됐으면) |
| 🚀라이브 | "이미 라이브 상태입니다. 강제 재실행하려면 단계 명시 필요." |
| ❌실패 | "실패 상태입니다. 비고: <메시지>. 어떤 단계부터 재시도할지 명시해주세요." |

사용자에게 결정된 단계 표시 후 진행:
```
🎯 대상: <프로모션명> (<게임명>)
📍 현재 상태: <상태>
▶ 실행할 단계: <단계>
```

---

## STEP 3: 단계별 실행 (단일 Agent + 격리 디렉토리)

`/promo-run`의 STEP 3-B 그룹별 로직을 1건만 적용. Agent 호출은 1개.

**격리 디렉토리 사용** (단일 row지만 일관성 유지):
```
promo-editor/.cache/parallel/<프로모션명_safe>/
```
- 기존 디렉토리 있으면 재사용 (재실행 시 캐시된 색상/이미지 활용 가능)
- 없으면 새로 생성 (`mkdir -p`)
- `<프로모션명_safe>` = `/promo-run`과 동일 규칙 (특수문자 제거 + 16자 해시 prefix)

### 단계: hero
- `/promo-run` STEP 3-B의 HERO 생성 로직 그대로
- 재실행 시 기존 컨텐츠_에셋 폴더 재사용 (재다운로드 안 함, 충돌 시에만 갱신)
- 결과 이미지를 채팅창에 인라인 표시

### 단계: content
- `/promo-run` STEP 3-B의 CONTENT 생성 로직
- 기존 격리 디렉토리의 `output.html` 덮어쓰기

### 단계: finalize
- `/promo-run` STEP 3-B의 FINALIZE 로직
- 기존 16자 해시 폴더 있으면 재사용 (`detectExistingHash()`)

### 단계: test-deploy
- `/promo-run` STEP 3-B의 테스트 배포 로직

### 단계: live-deploy
- `/promo-run` STEP 3-B의 라이브 배포 로직

### 단계: reset
- 노션 상태를 `⏳대기`로 변경 (`notion-update-page`)
- 모든 컨펌 체크박스 해제 (HERO/CONTENT/테스트/라이브)
- "다음 /promo-run 또는 /promo-resume hero 실행 시 처음부터 진행됩니다." 안내
- 실제 생성 작업 안 함

---

## STEP 4: 결과 출력

```
✅ <프로모션명> — <단계> 완료
[결과물 / 이미지 / 경로]
📍 노션 상태: <변경 후 상태>

▶ 다음 단계 진행:
- 결과 OK → 노션에서 컨펌 체크박스 ✅ 후 /promo-run 또는 /promo-resume <프로모션명>
- 다시 → /promo-resume <프로모션명> <단계>
```

---

## 핵심 원칙

- **단일 row만 처리** — 다른 row 영향 없음
- **단계 강제 실행 가능** — 자동 흐름 무시하고 원하는 단계만
- **재실행 안전** — 기존 결과물 덮어쓰기 또는 해시 재사용
- **reset은 작업 안 함** — 상태만 되돌림 (대시보드 정리용)

---

## 주의

- 프로모션명은 시멘틱 검색이라 부분 매치 가능. 짧으면 여러 건 매치 → 명확한 이름 사용 권장.
- 단계 강제 실행 시 노션 컨펌 게이트 무시 → 사용자가 의도적으로 명령했다고 판단.
- `reset` 후 결과물 폴더는 자동 삭제하지 않음 (수동 관리).
