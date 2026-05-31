# Template Mode — Figma + 템플릿 가이드

`rules/INDEX.md` 룩업 후 대상 `rules/*.md` 룰은 그대로 적용. 이 파일은 **두 가지 흐름의 추가 룰만**.

---

## 1. 템플릿 생성 (Figma → HTML, 1회성)

### 호출
```
/figma-template <출력경로>
```

### 처리 순서
1. Figma MCP 호출:
   - `get_code` — 레이아웃 구조
   - `get_variable_defs` — 컬러/타이포 토큰
   - `get_image` — 에셋 export
2. **무조건 Read**: `rules/INDEX.md` 룩업 → 대상 `rules/*.md` parallel Read / image_pipeline_contract.md / style.css 통째
3. **app.js grep 추출** (475KB 통째 읽지 말 것):
   - `buildPopupTriggerOnclick` — 팝업 onclick 패턴
   - `convertTabAnchorsForCdn` — 탭 a→button 변환
4. 컨텐츠 영역만 placeholder로 작성, 디자인/스타일은 Figma 그대로

### Placeholder 명명 규칙
- `{{TITLE}}` / `{{SUBTITLE}}` — 헤드 텍스트
- `{{HERO_IMAGE}}` — 히어로 이미지 src
- `{{CONTENT_SECTIONS}}` — 본문 섹션 반복 영역 (n개 → for 루프)
- `{{POPUP_TRIGGERS}}` — 팝업 트리거 버튼 묶음
- `{{TAB_NAMES}}` — 탭 이름 배열
- `{{TABLE_<id>}}` — 표 영역 (id 별 구분)
- `{{COLOR_ACCENT}}` / `{{COLOR_BG}}` / `{{COLOR_TEXT}}` / `{{COLOR_BORDER}}` — 컬러 토큰

### 출력 검증
- preamble 3줄 (charset + Pretendard CDN + font-family) 최상단 필수
- 모든 `rules/*.md` 룰 준수 (인라인 style only / 팝업 dim 1번+2번 / a태그 금지 등)

---

## 2. 템플릿 적용 (노션 row + 템플릿 → 결과물, 반복)

### 호출
```
/promo-resume <프로모션명>
또는
/promo-resume <이름>
```
**기존 양식 그대로. 사용자 변경 없음.**

### 분기 로직
노션 row 본문 [기본 정보] → "템플릿" 칸 확인:
- **경로 있음** → 템플릿 모드 (이 파일 적용)
- **비어있음** → from-scratch 모드 (`rules/INDEX.md` 룩업 후 대상 룰만 적용, 5단계 게이트)

### 처리 순서 (템플릿 모드)
1. INGESTION (기존과 동일 — 노션 [기본 정보]/[HERO_SECTION]/[CONTENT_SECTION]/[BANNER_SECTION] 파싱)
2. 템플릿 파일 Read
3. **이미지 옵션 자동 판별**:
   | 조건 | 옵션 | 동작 |
   |---|---|---|
   | 템플릿에 hero 박혀있음 + 노션 에셋 없음 | A. 템플릿 그대로 | 그대로 사용, Gemini 호출 X |
   | 노션 에셋 있음 + 디자인 스타일 비어있음 | B. 노션 에셋 직접 | 에셋을 hero로 사용, Gemini 호출 X |
   | 노션 디자인 스타일 채워짐 | C. 새 생성 | Gemini IMAGE_MODEL 호출 |
4. Placeholder 치환 (한 글자도 누락 금지 — 컨텐츠 100% 보존):
   - `{{TITLE}}` → [HERO_SECTION] 타이틀
   - `{{HERO_IMAGE}}` → 옵션 A/B/C 결과
   - `{{CONTENT_SECTIONS}}` → [CONTENT_SECTION] 반복 적용
   - `{{POPUP_TRIGGERS}}` → 본문 [팝업N] 마커 자리
5. 검토 게이트 (대화창 인라인 표시 → ok/수정/재생성) **1회**
6. 저장 + 노션 상태 → ✅생성완료

### 게이트 비교

| 모드 | 단계 | 사용자 클릭 |
|---|---|---|
| from-scratch | HERO 생성 → 컨펌 → CONTENT 생성 → 컨펌 → 저장 | 5회 |
| 템플릿 | 이미지 옵션 결정 → 검토 → 저장 | 1~2회 |

---

## 모드 우선순위

작업 요청 받으면 다음 순서로 모드 판별:
1. `/figma-template` 슬래시 → **템플릿 생성 모드** (위 #1)
2. 노션 row + 템플릿 칸 경로 있음 → **템플릿 적용 모드** (위 #2)
3. 노션 row + 템플릿 칸 비어있음 → **from-scratch 모드** (`rules/INDEX.md` 룩업 결과만)

---

## 변경 이력
- 2026-04-28 신규 작성 (Figma MCP 도입 + 템플릿 모드 분기 추가)
