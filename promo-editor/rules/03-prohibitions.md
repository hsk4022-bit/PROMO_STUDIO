---
id: 03-prohibitions
title: 절대 금지 + 에디터 파서 우회
purpose: 무조건 금지되는 패턴 모음. 발견 시 즉시 FAIL
---

# [절대 금지]
- `<!DOCTYPE>` `<html>` `<head>` `<body>` 태그 생성 금지.
- **`<style>` 태그는 파일 최상단 preamble 1개만 허용. 그 외 위치에 `<style>` 추가 절대 금지** (본문/팝업/슬라이스 HTML 등 어디서든).
- 본문 영역의 모든 스타일은 인라인 `style=""` 만 사용.
- `<script>` 태그는 슬라이드/갤러리 + **영상 변환 스크립트(파일당 1개)** 에만 한정 허용. 영상 변환 스크립트는 `15-video.md` [영상 — event-video div + 자동 변환 script] 섹션 본문을 변형 없이 그대로 HTML 맨 하단(최외곽 닫는 `</div>` 직전)에 1회 emit. 그 외 `<script>` 는 금지.
- class 없는 `<div>` 절대 금지. 모든 div는 반드시 class="se-div" 또는 class="se-para-div" 필수.
- display:flex · display:grid · gap 금지.
- ul / ol / li 금지. 목록은 <p> 또는 <br> 사용.
- box-shadow 금지. background 단축 금지 → background-color 사용.
- rgba() 절대 금지. 색상은 반드시 6자리 hex(#rrggbb)만 사용.
- #fff #000 등 3자리 색상 금지 → #ffffff #000000.
- !important 금지.
- max-width에 px 단위 금지 → rem 사용.
- 마크다운 볼드(**텍스트**) 금지 → <p style="font-weight:900;"> 사용.
- 외부 URL <img> 절대 금지.
- 이미지 마커 (item1) (item2) 등이 원고에 명시되지 않으면 <img> 태그 생성 절대 금지.
- AI가 임의로 이미지 플레이스홀더 생성 금지. 원고에 없는 이미지 삽입 즉시 FAIL.
- **섹션 좌우 2단/3열 구성 절대 금지.** 섹션 카드(se-div)를 `display:inline-block;width:48%/49%/30%` 로 가로 나란히 배치하는 모든 방식 즉시 FAIL. 섹션은 오직 수직(형제 se-div) 적층만 허용. 좌우 배치가 필요한 비교 데이터는 반드시 `<table>` 2열 이상으로 구성.
  - **예외 — 영상 콜아웃 그리드**: 같은 종류의 영상 마커(`[영상...]` + URL)가 2개 이상 연속하면 `<table>` 그리드(2개→1×2, 4개→2×2, 6개→2×3)로 묶어 좌우 배치 허용. 셀 안에 `<div class="se-div event-video" data-src="..." ...>` 를 직접 박는다. 다른 종류 콜아웃(텍스트/이미지/팝업/툴팁)은 본 예외 적용 X — 여전히 수직 적층.
- **번호 배지 일관성 필수.** 한 페이지 안에서 일부 섹션만 원형 배지(①②③)를 달고 일부 섹션은 `"3.제목"` `"4.제목"` 텍스트 프리픽스로 처리하는 불일치 즉시 FAIL. 번호가 붙은 섹션은 **모두** 원형 배지로 통일하고 제목 텍스트에서 `"N."` / `"N. "` / `"N) "` 숫자 프리픽스를 완전 제거.

---

# [에디터 파서 우회 — 절대 준수]
- class 없는 <div> 절대 금지. 에디터가 삭제함.
- 컨테이너·그룹 필요 시: <div class="se-div"> 또는 <div class="se-para-div"> 만 허용.
- 가로 정렬: <div class="se-para-div"> 부모 + 내부 <div class="se-div" style="display:inline-block;vertical-align:middle;"> 조합.
- display:flex · display:grid · <table> 레이아웃 용도 금지.
