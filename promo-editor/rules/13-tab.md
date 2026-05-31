---
id: 13-tab
title: 탭 시스템 (앵커 + 사이냅 호환)
source: rules/*.md (canonical)
purpose: 탭 버튼 스타일 + a 태그 표준 + CDN 변환 규칙
---

# [탭 시스템]
- 탭 버튼 텍스트에 "tab01" 등 지시어 노출 금지. 원고의 실제 탭 제목만.
- <a href="#tab01"> ↔ <div class="se-div" id="tab01"> 1:1 매칭 필수.
- 탭 바 컨테이너: display:block;width:100%;text-align:center;padding:0.5rem 0;**box-sizing:border-box;**
- ⚠️ **탭 바 컨테이너 box-sizing:border-box 필수.** `width:100%` + 어떤 padding 이든 결합 시 `box-sizing` 미지정(기본 content-box) 이면 실폭 = 100% + padding(좌우 합) 으로 부모 영역을 뚫고 나감. 화면 우측이 잘리거나 가로 스크롤 발생 → 즉시 FAIL.
- ⚠️ 탭 바 컨테이너에 좌우 padding 권장 X (수직만). 좌우 padding 이 꼭 필요하면 반드시 `box-sizing:border-box` 동반.
- 탭 버튼(a 태그): display:inline-block;padding:0.625rem 1.5rem;margin:0.25rem;border-radius:2rem;font-weight:700;text-decoration:none;word-break:keep-all;white-space:nowrap;
- 활성 탭: background-color:${accentColor};color:#000000;
- 비활성 탭: background-color:${surfaceColor};color:${subColor};
- 탭 버튼은 반드시 면(fill) 방식. underline/border-bottom 방식 절대 금지.
- 각 탭 섹션 se-div에 id="tab01" 부여. 각 섹션 상단에 탭 바 반복.
- Tab01. / Tab02. 텍스트는 HTML에 절대 노출 금지.
- ⛔ **탭 섹션에 `display:none` / `visibility:hidden` / `opacity:0` 절대 금지 (위반 시 즉시 FAIL).** 모든 탭 섹션(`id="tabN"` div)은 **전부 동시 표시** — 세로 적층 형태. 탭 버튼은 해당 섹션으로 **스크롤만** 하는 앵커. show/hide 토글 탭 패턴 절대 금지. 위반 시 사용자가 첫 번째 탭만 보고 나머지(2~N번) 컨텐츠는 영원히 숨겨져서 안 보임 (영상/이미지/표 포함 통째로 누락된 것처럼 인지됨).
- ⛔ **`tab-content` / `tab-panel` 등 별도 클래스 금지.** 탭 섹션 div 는 정확히 `class="se-div"` + `id="tabN"` 만. 추가 클래스 붙이면 hide/show 토글 패턴으로 오인 → display:none 동반 출력 위험.

## 탭 링크 동작 (사이냅에디터 호환)
- AI 생성 HTML: `<a href="#tab01">` 표준 앵커 링크 그대로 사용.
- **CDN 내보내기 시 promo-editor가 `<a href="#tab01">`을 `<button onclick="scrollIntoView">`로 자동 변환** → 사이냅에디터가 `<a>`에 target="_blank" 추가하는 문제 방지.
- AI가 직접 onclick이나 button을 추가하지 않아도 됨 (promo-editor가 처리).

## ⛔ 슬라이스 HTML 탭 — 절대 준수 (위반 시 즉시 FAIL)

슬라이스 HTML (`PROMO_SLICED/index.html`) 은 본문이 이미지로 변환되므로 `<div id="tab01">` 같은 앵커 타겟 자체가 없음. 탭 클릭 = 이미지 위 투명 오버레이 버튼 클릭 → 정확한 Y 좌표로 `window.scrollTo` 직접 호출. 룰:

### FAIL-1. `<a target="_blank">` 절대 금지
- ❌ `<a href="#tab01" target="_blank">` — 사이냅에디터에 임베드 시 새 창으로 열림. 클릭 핸들러 스크립트가 strip 되면 preventDefault 안 됨.
- ✅ `<button type="button" onclick="...scrollTo...">` — 직접 onclick, script 의존 없음.

### FAIL-2. 별도 `<script>` 의 click delegation 금지
- ❌ `document.addEventListener("click", ...)` 로 클릭 핸들러를 별도 `<script>` 태그에 두는 패턴 — 사이냅에디터가 `<script>` 제거하면 탭 동작 안 함.
- ✅ 각 버튼의 인라인 `onclick=` 속성에 직렬화. 스크립트 의존 0.

### FAIL-3. `scrollIntoView` 사용 금지 (슬라이스 HTML 한정)
- 슬라이스 HTML 에는 `id="tab01"` 같은 타겟 element 가 없음 (전부 이미지).
- ❌ `onclick="scrollIntoView('#tab01')"` — 타겟 없으니 동작 안 함.
- ✅ `onclick="window.scrollTo({top: <originalY * scaleFactor>, behavior:'smooth'})"`
  - `originalY`: 원본 페이지에서 해당 탭의 Y 좌표 (앵커 매핑 시점에 캡처)
  - `scaleFactor`: `container.offsetWidth / slicerImg.width` — 컨테이너 폭 기준 비율
- 본문 HTML (`index_불러오기용.html` / `index_cdn.html`) 은 element 가 살아있으므로 `scrollIntoView` OK.

### FAIL-4. 사이냅 임베드 시 window.scrollTo 한계 인지
- `window.scrollTo` 는 호스트 페이지 (사이냅 admin) 의 window 를 스크롤. 임베드 안 의 스크롤이 별도라면 안 먹을 수 있음.
- 일반 브라우저 standalone 으로 열 때는 정상 작동.
- 사이냅 임베드 환경에서 문제 발생 시 `parent.scrollTo` 또는 `window.parent.postMessage` 패턴으로 확장 가능 (현재 미구현 — 필요 시 추가).

### 구현 위치
- `app.js` 슬라이서 export 로직 (`slicerLinks.forEach` 안의 `<button onclick>` 생성부) — 이미 위 패턴으로 구현됨.
- **변경 금지**: 이 onclick 구조는 `03-prohibitions.md` 의 "기능 로직 임의 수정 금지" 룰에 포함. 디자인 토큰만 수정 가능.

### 자가 검증 (Claude 에이전트 내부 점검용 — HTML 응답 본문에 절대 포함 금지)
> ⚠️ **Gemini 주의**: 아래 체크 항목은 **HTML 출력에 포함하지 말 것**. 너의 응답은 순수 HTML 만. 이 ✅ 라인을 응답 끝에 복사하면 `.se-contents` 외부에 plain text 가 노출됨.
> Claude (에이전트) 만 채팅 메시지로 출력.

내부 점검 항목 (텍스트 emit 금지):
- 슬라이스 HTML 에 `<a href="#">` 0개
- 슬라이스 HTML 에 `<a target="_blank">` 0개 (외부 링크 제외 — 외부 링크는 OK)
- 슬라이스 HTML 의 `<button type="button">` onclick 안에 `window.scrollTo` 또는 `buildPopupTriggerOnclick` 패턴 보유
- 슬라이스 HTML 의 별도 `<script>` 태그 = 영상 변환 1개만 허용 (anchor scroll script 사용 금지)
