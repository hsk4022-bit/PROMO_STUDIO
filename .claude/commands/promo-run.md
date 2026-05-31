# /promo-run — 디스패처 (각 row → 별개 세션, 타이틀=프로모션명)

노션 대시보드 DB의 처리 가능한 row를 조회해서, 각 row를 **독립 Claude 세션**으로 spawn한다. 각 세션의 타이틀은 프로모션명으로 설정 → Recents 좌측에 프로모션명으로 표시됨. 사용자는 각 세션에서 인터랙티브하게 5단계 게이트 진행.

---

## 핵심 동작

```
사용자: /promo-run

메인 세션 (dispatcher):
  1. 노션 DB 조회 → 처리 가능한 row 목록
  2. 각 row마다 spawn_task 호출
     - title: <프로모션명>
     - prompt: 자기 row만 처리하는 인터랙티브 워크플로우
  3. 메인 세션은 dispatch만 하고 종료
  4. 사용자에게 "N건 dispatched, Recents 확인" 안내

→ Recents 좌측에 프로모션명으로 N개 새 세션 생성됨
→ 각 세션 클릭 → 그 프로모션의 작업 진행
```

---

## STEP 0: 환경 초기화 (파일 다운로드 + 가이드 읽기)

### 0-A: 설정값 확인

우선순위대로 값 로드:
1. 사용자 메시지에서 추출
2. 없으면 `~/.claude/memory/promo-studio.md` 에서 로드
3. 거기도 없으면 사용자에게 요청

확인할 값:
- `NOTION_URL` — 노션 대시보드 URL
- `GITHUB_RAW` — GitHub raw base URL (`https://raw.githubusercontent.com/<계정>/<레포>/main`)
- `GEMINI_API_KEY` — Gemini API 키

`LOCAL_PATH`는 `~/.claude/promo-studio/` 고정 (사용자 입력 불필요).

값 확보 후 `~/.claude/memory/promo-studio.md` 에 저장 (없으면 생성, 있으면 덮어쓰기):
```md
# Promo Studio 설정
- NOTION_URL: <값>
- GITHUB_RAW: <값>
- GEMINI_API_KEY: <값>
- LOCAL_PATH: ~/.claude/promo-studio/
```

### 0-B: 파일 로드 방식 결정

- `GITHUB_RAW` 값이 있음 → GitHub에서 fetch 후 로컬에 저장 (덮어쓰기)
- `GITHUB_RAW` 값이 없음 + 로컬 파일 존재 → 기존 로컬 파일 그대로 사용
- `GITHUB_RAW` 값이 없음 + 로컬 파일 없음 → 사용자에게 GitHub URL 요청

아래 파일들을 `GITHUB_RAW` 기준으로 fetch 후 로컬 절대경로에 저장 (기존 파일 덮어쓰기):

| GitHub 경로 | 로컬 저장 경로 |
|---|---|
| `/promo-editor/CLAUDE.md` | `<로컬경로>/promo-editor/CLAUDE.md` |
| `/promo-editor/rules/` (디렉토리 전체) | `<로컬경로>/promo-editor/rules/` |
| `/promo-editor/notion_parsing_rules.md` | `<로컬경로>/promo-editor/notion_parsing_rules.md` |
| `/promo-editor/orchestration_contract.md` | `<로컬경로>/promo-editor/orchestration_contract.md` |
| `/promo-editor/image_pipeline_contract.md` | `<로컬경로>/promo-editor/image_pipeline_contract.md` |
| `/promo-editor/generate_hero.py` | `<로컬경로>/promo-editor/generate_hero.py` |
| `/promo-editor/build_notion_data.py` | `<로컬경로>/promo-editor/build_notion_data.py` |

배너 단계 진입 시 추가:
| `/banner-studio/master_guidelines.md` | `<로컬경로>/banner-studio/master_guidelines.md` |
| `/banner-l/master_guidelines.md` | `<로컬경로>/banner-l/master_guidelines.md` |

`<로컬경로>` = 사용자가 첫 실행 시 지정한 절대경로. 메모리에 저장해 이후 재사용.

다운로드 완료 후:
```
✅ 파일 N개 다운로드 완료 (GitHub → 로컬)
```

### 0-C: 가이드 파일 읽기

다운로드된 로컬 파일을 전체 읽기. 부분 grep 금지.

---

## STEP 1: 담당자 필터 + DB 조회

### 1-A: 담당자 필터 결정

인자 파싱:
- `/promo-run` (인자 없음) → 메모리(`reference_notion_db.md`)에서 본인 user ID 로드 → 담당자 필터 적용
- `/promo-run all` → 필터 없음 (전체 row)
- `/promo-run @<이름>` → 해당 이름의 user ID 검색 후 필터

본인 user ID 미등록 시 안내 후 종료 (이전 버전과 동일).

### 1-B: DB의 모든 row 식별 + properties 수집

`notion-query-data-sources` 도구가 환경에 따라 미존재할 수 있으므로 `notion-search` + `notion-fetch` 조합으로 대체:

**1단계 — 시멘틱 검색으로 row 목록 확보**:

```
mcp__...__notion-search
  query: "프로모션"
  data_source_url: "collection://${NOTION_DB_ID}"
  filters: {}
  page_size: 25
```

누락 의심 시 추가 쿼리(`"이벤트"`, 게임명 등) 시도 후 `url` 기준 dedupe.

**2단계 — 각 row의 properties 병렬 fetch**:

검색 결과 각 row에 대해 `notion-fetch` 호출. 단일 메시지에 모든 fetch 동시 호출 (병렬).

```
mcp__...__notion-fetch  id: <row URL>
```

각 fetch에서 추출:
- 프로모션명, 게임명, 담당자, 상태
- 게시물 도구, 배너 도구 (Route 결정용 — STEP 1-D 참고)
- HERO 컨펌 / CONTENT 컨펌 / 테스트 배포 / 라이브 배포 (`__YES__` / `__NO__` / NULL)
- 이미지 확인
- 라이브 날짜, 비고

`게시물 도구`와 `배너 도구` 필드는 Route 결정에 사용 (STEP 1-D 참고).

### 1-C: 처리 가능한 row 분류 (단계)

각 row의 다음 단계 결정:

| 현재 상태 | 컨펌 | 다음 단계 |
|---|---|---|
| ⏳대기 | - | INGESTION + HERO 생성 |
| ▶️진행가능 | - | INGESTION + HERO 생성 (⏳대기와 동일 처리) |
| ⚠️HERO컨펌대기 | HERO ✅ | CONTENT 생성 |
| ⚠️CONTENT컨펌대기 | CONTENT ✅ | 결과물 저장 |
| ✅생성완료 | 테스트 ✅ | 테스트 배포 |
| 🧪테스트배포 | 라이브 ✅ | 라이브 배포 |

**스킵**:
- 🎨HERO생성 / 📝CONTENT생성 (다른 세션에서 진행 중)
- 🚀라이브 (완료)
- ❌실패 (사용자가 ⏳대기 또는 ▶️진행가능으로 되돌려야 재시도)
- 컨펌 미체크 (다음 단계 진입 못 함)

처리 가능한 row가 0건이면 다음 출력 후 종료:
```
📋 처리 가능한 작업 없음. /promo-status로 현황 확인.
```

### 1-D: Route 자동 분기 (UI vs Claude)

각 row의 `게시물 도구` 필드 값으로 처리 경로 결정:

| `게시물 도구` 값 | Route | 설명 |
|---|---|---|
| `프로모 에디터` | **Route 1** | INGESTION만 Claude, HERO/CONTENT/배너는 promo-editor UI에서 사용자가 수동 진행 |
| `피그마` | **Route 2** | 모든 단계 Claude가 자동 진행 (인터랙티브 5단계 게이트) |
| (값 없음/NULL) | **Route 2** | 기본값 = Claude 자동 |

배너 도구도 동일 분기:
| `배너 도구` 값 | 처리 |
|---|---|
| `배너 스튜디오` | banner-studio/index.html UI에서 사용자가 진행 |
| `피그마` | Claude가 banner-studio/banner-l 자동 호출 |

**중요**: 동일 row 안에서 `게시물 도구`는 프로모 에디터, `배너 도구`는 피그마 같은 혼합 가능. 각 도구 필드를 독립 평가.

### 1-E: Route별 그룹핑

처리 가능한 row를 Route별로 분류해서 사용자에게 표시:

```
📋 처리 시작 (담당자: <필터>, 전체 N건):

[Route 1 — 프로모 에디터 UI] M1건
  - <프로모션명> (<게임명>) → INGESTION 후 UI 진입
  - ...

[Route 2 — Claude 자동] M2건
  - <프로모션명> (<게임명>) → HERO 생성부터 자동
  - ...

▶ 모두 별개 세션으로 spawn (Recents 좌측에서 클릭)
```

---

## STEP 2: 각 row를 spawn_task로 분리 세션 생성 (Route별 prompt 분기)

처리 가능한 row 각각에 대해 `mcp__ccd_session__spawn_task` 호출:

### spawn_task 파라미터

```
title: <프로모션명>                          ← Recents에 표시될 이름
tldr: [Route N] <게임명> - <다음 단계>        ← 호버 시 설명
prompt: <Route별 프롬프트 — STEP 3-A(Route 1) 또는 STEP 3-B(Route 2)>
```

**중요**:
- 단일 메시지에 모든 spawn_task를 동시 호출 (병렬 dispatch)
- Route 1 row → STEP 3-A의 프롬프트 사용
- Route 2 row → STEP 3-B의 프롬프트 사용

### dispatch 결과 사용자에게 표시

```
📤 N건 dispatched. Recents 좌측에서 각 작업을 클릭해주세요:

[Route 1 — 프로모 에디터 UI] M1건
  1. <프로모션명> (<게임명>) → INGESTION 후 UI 진입
  2. <프로모션명> (<게임명>) → INGESTION 후 UI 진입

[Route 2 — Claude 자동] M2건
  3. <프로모션명> (<게임명>) → HERO 생성 단계
  4. <프로모션명> (<게임명>) → CONTENT 생성 단계
  5. <프로모션명> (<게임명>) → 결과물 저장 단계

각 세션은 독립적으로 진행됩니다.
- Route 1 세션: INGESTION 후 promo-editor/index.html 열도록 안내, 세션 종료
- Route 2 세션: 5단계 게이트 인터랙티브 진행

▶ 다음에 새로 추가된 row가 있으면 /promo-run 다시 입력
▶ 현황 보기: /promo-status
```

메인 dispatcher 세션은 여기서 종료. 추가 작업 없음.

---

## STEP 3-A: Route 1 (프로모 에디터 UI) 세션 프롬프트 템플릿

`게시물 도구` = `프로모 에디터`인 row의 spawn_task에 사용:

```
당신은 PROMO-STUDIO Route 1 (프로모 에디터 UI 모드) 단일 프로모션 세션입니다.

## 대상
- 프로모션명: <프로모션명>
- 게임명: <게임명>
- 노션 URL: <row URL>
- 모드: Route 1 — INGESTION만 Claude가, HERO/CONTENT/배너는 promo-editor UI에서 사용자가 진행

## 작업 디렉토리 (격리)
~/.claude/promo-studio/promo-editor/.cache/parallel/<프로모션명_safe>/

## 워크플로우

### 0단계: 설정 로드
`~/.claude/memory/promo-studio.md` 를 읽어 NOTION_URL, GITHUB_RAW, GEMINI_API_KEY 값 확보. 파일 없으면 사용자에게 요청. LOCAL_PATH는 `~/.claude/promo-studio/` 고정.

### 1단계: 가이드 읽기 (1회)
다음 문서 read (부분 grep 금지):
- promo-editor/CLAUDE.md
- promo-editor/rules/INDEX.md (룩업 후 컨텐츠 feature 별 대상 rules/*.md 만 parallel Read — rules/ 전체 통독 금지)
- promo-editor/notion_parsing_rules.md
- promo-editor/orchestration_contract.md
- promo-editor/image_pipeline_contract.md

### 2단계: INGESTION (Claude 수행)
- 위에서 전달받은 `노션 URL`로 **즉시** notion-fetch 호출 (사용자 입력 대기 없이 자동 실행):
  ```
  notion-fetch id: <row URL>
  ```
- fetch 결과에서 [기본 정보], [HERO_SECTION], [CONTENT_SECTION], [BANNER_SECTION] 전체 파싱
- 컨텐츠_에셋 폴더 확인/생성 (`기본 정보.컨텐츠 에셋 경로` 우선, 없으면 `로컬 저장 경로/컨텐츠_에셋/`)
- S3 이미지 다운로드 (원본 파일명 유지, 충돌 시 8자 해시 suffix)
- promo-editor/notion_data.json 갱신 (UI가 읽는 단일 파일)
- 마커 ↔ 파일 매칭 검증
- 결과 표시:
  ```
  🔍 INGESTION 결과
  - 노션 마커 수: N
  - 컨텐츠_에셋 파일: N
  - 매칭 결과: <표>
  - 누락: <있으면 빨간색 경고>
  - notion_data.json 갱신 완료 ✅
  
  ✅ 응답해주세요:
  - "ok" → UI 진입 안내로 넘어감
  - "재파싱" → 다시 시도
  - "수정: <지시>" → 수동 조정
  ```
- 사용자 응답 대기

### 3단계: UI 진입 안내 (사용자 "ok" 후)
- 노션 상태 → ⚠️HERO컨펌대기 (UI 작업 대기 상태)
- 사용자에게 안내 출력:
  ```
  ✅ INGESTION 완료. 다음 단계는 promo-editor UI에서 진행합니다.
  
  📂 UI 열기:
     1. 브라우저에서 file://<프로젝트경로>/promo-editor/index.html 열기
     2. 또는 로컬 서버 실행 후 http://localhost:8765/promo-editor/index.html
  
  🎯 UI에서 진행할 4 체크포인트:
     1. HERO 이미지 생성 (Gemini 호출 + 컬러 추출 + 로고 합성)
     2. CONTENT HTML 생성 (rules/INDEX.md 가이드 따라 대상 룰 100% 준수)
     3. banner-studio 기본 배너
     4. banner-l 다규격 배너 (langVari=Y 항목)
  
  📋 UI 작업 흐름:
     - 우측 상단에서 게임명 / 작업 모드 확인
     - 노션 데이터 로드 (이미 notion_data.json 갱신됨)
     - 각 체크포인트마다 UI에서 결과 검토 → 다음 단계로
  
  📝 노션 동기화:
     - UI에서 작업 완료 시 결과물을 산출물 저장 경로에 저장
     - 노션 상태/미리보기 URL은 사용자가 노션에서 수동 갱신
       (또는 UI에서 자동 갱신되는 부분이 있으면 활용)
  
  ⏹ 이 세션은 UI 작업 동안 대기하지 않습니다. 닫으셔도 됩니다.
     UI 작업 끝나면 노션 상태를 ✅생성완료로 직접 변경해주세요.
  ```
- 세션 종료 (Claude 추가 작업 없음)

### 핵심 원칙
- INGESTION만 Claude. 나머지는 UI 사용자.
- UI 작업 진행 동안 Claude 세션은 대기 안 함.
- 결과물은 사용자가 UI에서 산출물 저장 경로에 직접 저장.
```

---

## STEP 3-B: Route 2 (Claude 자동) 세션 프롬프트 템플릿

`게시물 도구` = `피그마` 또는 NULL인 row의 spawn_task에 사용:

```
당신은 PROMO-STUDIO Route 2 (Claude 자동 모드) 단일 프로모션 세션입니다.

## 대상
- 프로모션명: <프로모션명>
- 게임명: <게임명>
- 노션 URL: <row URL>
- 시작 단계: <다음 단계>

## 작업 디렉토리 (격리)
~/.claude/promo-studio/promo-editor/.cache/parallel/<프로모션명_safe>/

## 단계별 워크플로우 (인터랙티브)

### 0단계: 설정 로드
`~/.claude/memory/promo-studio.md` 를 읽어 NOTION_URL, GITHUB_RAW, GEMINI_API_KEY 값 확보. 파일 없으면 사용자에게 요청. LOCAL_PATH는 `~/.claude/promo-studio/` 고정.

### 1단계: 가이드 읽기 (1회)
다음 문서 read (부분 grep 금지):
- promo-editor/CLAUDE.md
- promo-editor/rules/INDEX.md (룩업 후 컨텐츠 feature 별 대상 rules/*.md 만 parallel Read — rules/ 전체 통독 금지)
- promo-editor/notion_parsing_rules.md
- promo-editor/orchestration_contract.md
- promo-editor/image_pipeline_contract.md

### 2단계: INGESTION (시작 단계가 HERO 생성일 때)
- 위에서 전달받은 `노션 URL`로 **즉시** notion-fetch 호출 (사용자 입력 대기 없이 자동 실행):
  ```
  notion-fetch id: <row URL>
  ```
- fetch 결과에서 [기본 정보], [HERO_SECTION], [CONTENT_SECTION], [BANNER_SECTION] 전체 파싱
- 컨텐츠_에셋 폴더 확인/생성
- S3 이미지 다운로드 (원본 파일명 유지)
- 격리 디렉토리에 notion_data.json 작성
- 마커 ↔ 파일 매칭 검증
- 결과 표시:
  ```
  🔍 INGESTION 결과
  - 노션 마커 수: N
  - 컨텐츠_에셋 파일: N
  - 매칭 결과: <표>
  - 누락: <있으면 빨간색 경고>
  
  ✅ 이미지 확인 후 응답해주세요:
  - "ok" → HERO 생성 진행
  - "재파싱" → 다시 시도
  - "수정: <지시>" → 수동 조정
  ```
- 사용자 응답 대기

### 3단계: HERO 생성
- 사용자 "ok" 받으면 진행
- 노션 상태 → 🎨HERO생성
- generate_hero.py 실행 (격리 NOTION_DATA env)
- 색상 추출 + 로고 합성
- 결과 표시:
  ```
  🖼 HERO 생성 완료
  [이미지 인라인 표시]
  컬러 팔레트: <시각화>
  
  ✅ 검토 후 응답:
  - "ok" → CONTENT 생성 진행 + 노션 HERO 컨펌 ✅ 자동 체크
  - "재생성" → 다시 시도
  - "수정: <지시>" → 스타일/구도 수정 후 재생성
  ```
- 사용자 응답 대기

### 4단계: CONTENT 생성
- 사용자 "ok" 받으면 진행
- 노션 상태 → 📝CONTENT생성
- rules/INDEX.md 룩업 후 대상 rules/*.md 100% 준수해 HTML 작성
- 격리 디렉토리에 output.html 저장
- 검증: <img> 수 = 마커 수, 잔존 마커 = 0
- 로컬 미리보기 서버에 업로드 (localhost:8765)
- 결과 표시:
  ```
  📄 CONTENT 생성 완료
  미리보기: http://localhost:8765/<프로모션명>/output.html
  검증: <img> N개, 마커 잔존 0개
  
  ✅ 미리보기 확인 후 응답:
  - "ok" → 저장 진행 + 노션 CONTENT 컨펌 ✅ 자동 체크
  - "재생성" → 다시 시도
  - "수정: <지시>" → 부분 수정
  ```
- 사용자 응답 대기

### 5단계: FINALIZE (결과물 저장)
- 사용자 "ok" 받으면 진행
- 산출물 폴더 결정 (노션 [기본 정보].산출물 저장 경로 우선, 없으면 로컬 폴백)
- 16자 해시 폴더 + 8자 해시 파일명
- index_불러오기용.html + index_cdn.html
- 노션 상태 → ✅생성완료
- 노션 미리보기 필드에 최종 경로 입력
- 결과 표시:
  ```
  💾 저장 완료
  경로: <산출물 경로>
  
  ✅ 다음 단계:
  - "테스트" → 테스트 서버 업로드 + 노션 테스트 배포 ✅ 자동 체크
  - "스킵" → 여기서 마침 (수동 배포)
  ```

### 6단계: 테스트 배포
- 사용자 "테스트" 받으면 진행
- 테스트 서버 경로 (기본 정보) 확인 후 업로드
- 노션 상태 → 🧪테스트배포
- 노션 테스트 URL 입력
- 결과 표시:
  ```
  🧪 테스트 배포 완료
  URL: <테스트 URL>
  
  ✅ 검수 후 응답:
  - "라이브" → 라이브 배포 + 노션 라이브 배포 ✅ 자동 체크
  - "보류" → 여기서 멈춤 (다음에 /promo-resume으로 이어서)
  ```

### 7단계: 라이브 배포
- 사용자 "라이브" 받으면 진행
- 라이브 서버 업로드
- 노션 상태 → 🚀라이브
- 노션 라이브 URL 입력
- 결과 표시:
  ```
  🚀 라이브 완료
  URL: <라이브 URL>
  📍 노션: <노션 row URL>
  
  🎉 모든 작업 완료. 이 세션은 종료합니다.
  ```

## 핵심 원칙
- 매 단계마다 사용자 응답 대기 (자동 진행 금지)
- 격리 디렉토리에서만 작업 (다른 세션과 충돌 없음)
- 각 단계 완료 시 노션 상태/체크박스 자동 갱신
- 실패 시 노션 상태 ❌실패 + 비고에 에러
- 사용자 "보류" 시 현재 상태 유지 후 종료
```

---

## STEP 4: 요약 안내

dispatcher 메인 세션은 STEP 2에서 dispatch 결과 출력 후 종료. 추가 작업 없음.

각 spawned 세션이 독립적으로 진행되며, 사용자는 좌측 Recents에서 원하는 세션을 클릭해 작업.

---

## 핵심 원칙

- **Recents 좌측 = 프로모션 리스트**: 각 row가 별개 세션, 타이틀=프로모션명
- **세션 독립성**: 각 세션은 자기 row만 처리, 격리 디렉토리 사용
- **인터랙티브**: 각 세션 안에서 단계마다 사용자 응답 대기
- **노션 자동 갱신**: 각 단계 완료 시 노션 상태/체크박스/URL 업데이트
- **메인 세션은 dispatcher만**: dispatch 후 즉시 종료, 토큰 절약

---

## 주의

- spawn_task는 백그라운드 세션으로 시작됨. 사용자가 Recents에서 클릭해서 활성화해야 작업 진행.
- 한 번에 너무 많이 spawn하면 (예: 20건) Recents가 복잡해짐. 권장 5~10건.
- 동일 프로모션명이 두 번 dispatch되면 Recents에 중복 표시. `/promo-status`로 진행 중 확인 후 dispatch.
- 사용자가 spawned 세션을 닫으면 그 세션은 영구 종료. 이어서 진행하려면 `/promo-resume <프로모션명>`으로 새 세션.

---

## 단계별 게이트 (각 spawned 세션 안에서)

각 세션은 다음 5개 게이트를 차례대로 통과:

| # | 게이트 | 사용자 응답 | 자동 처리 |
|---|---|---|---|
| 1 | INGESTION 검증 | "ok" / "재파싱" / "수정" | 노션 `이미지 확인` ✅ |
| 2 | HERO 검토 | "ok" / "재생성" / "수정" | 노션 `HERO 컨펌` ✅ |
| 3 | CONTENT 검토 | "ok" / "재생성" / "수정" | 노션 `CONTENT 컨펌` ✅ |
| 4 | 테스트 배포 | "테스트" / "스킵" | 노션 `테스트 배포` ✅ |
| 5 | 라이브 배포 | "라이브" / "보류" | 노션 `라이브 배포` ✅ |
