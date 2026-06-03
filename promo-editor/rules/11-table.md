---
id: 11-table
title: 테이블 규칙 (border, color, 라인)
purpose: 테이블 인라인 스타일 + 색상 상속 + 라인 정책
---

# [테이블 규칙]
- 표 데이터는 반드시 <table>. div 대체 절대 금지.
- 테이블은 섹션 se-div 안에 직접 배치. **별도 래퍼 div 추가 금지.**
- table: style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;border-top:1px solid ${borderColor};"
- **thead/th (타이틀 행)**: style="padding:1rem 1rem;font-weight:800;color:${textColor};border:none;border-bottom:1px solid ${borderColor};text-align:center;background-color:${thBgColor};word-break:keep-all;line-height:1.4;font-size:inherit;"
- **tbody/td (내용 행)**: style="padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};color:${textColor};text-align:center;vertical-align:middle;word-break:keep-all;overflow-wrap:break-word;line-height:1.4;font-size:inherit;background-color:transparent;"
- **⚠️ `<tr>` 에 인라인 style 금지** — background-color 나 border 를 `<tr>` 에 넣지 말 것. 색/선은 `<th>` / `<td>` 에만. `<tr>` 에 넣으면 렌더러별로 이중선·얼룩 발생 → FAIL.
- **⚠️ 수평 라인 전용 스타일** — 세로줄(border-left/right) 금지, border 단축 금지. 행 구분은 `border-bottom` 으로만. 단 **표 상단 라인은 table 요소에 `border-top:1px solid ${borderColor}` 로 추가** (본문 행 구분선과 동일 — 헤더 bg 없는 표가 상단 경계 없이 떠 보이는 문제 방지, 2026-06-01 정책 변경).
- **⚠️ 헤더 굵은 강조선 금지** — `border-bottom:2px solid ${accentColor}` 같은 굵은 accent 선 절대 금지. 헤더 bg(${thBgColor}) 자체가 이미 강조 역할. 굵은 선 추가 시 즉시 FAIL.
- **⚠️ 마지막 데이터 행 처리** — tbody 의 마지막 tr 의 모든 td 에 `border-bottom:none` 적용 (시스템이 후처리에서 자동 주입). AI 가 직접 분기 작성할 필요 없음.
- **⚠️ 표 상단 라인은 table 요소에만** — `border-top` 은 `<th>`/`<td>` 가 아니라 `<table>` 에 `1px solid ${borderColor}` 로 한 번만. 셀에 border-top 박지 말 것 (행마다 이중선). thead 유무와 무관하게 table 상단 라인 1개.
- **⚠️ 테이블 내부 모든 텍스트 요소에 인라인 color 필수 (브라우저 상속 신뢰 금지):**
  - **th 안 자손**: `<p>` `<span>` 등 모든 자식 요소에 반드시 `color:${textColor}` 인라인 명시 (헤더는 crisp white/text).
  - **td 안 자손**: `<p>` `<span>` 등 모든 자식 요소에 반드시 `color:${subColor}` 인라인 명시 (본문은 약간 dim 톤 — 헤더와 위계 분리).
  - 강조 텍스트만 예외적으로 `color:${accentColor}` 사용 가능.
  - td/th 에만 color 지정하고 내부 `<p>` 에는 생략하면 즉시 FAIL. 일부 랜더러/CMS 가 `<p>` 의 color 를 상속하지 않고 기본값(#000000 등)으로 렌더해서 **어두운 배경에서 글자가 안 보이는 사고** 발생.
  - 팝업 내부 테이블은 특히 엄격히 적용. 팝업은 본문과 다른 컨테이너에서 렌더될 수 있으므로 상속 체인 끊길 위험 높음.
- **⚠️ 테이블 border 규칙 — 일관성 필수:**
  - border 색상은 `${borderColor}` 사용. 시스템이 `${thBgColor}` 와 동일 hue/채도 + 명도만 살짝 어둡게 계산 (alpha 50% 효과).
  - table: `border-top:1px solid ${borderColor}` (상단 라인 — 행 구분선과 동일 색·두께)
  - thead th: `border:none;border-bottom:1px solid ${borderColor}` + `background-color:${thBgColor}` + `color:${textColor}` + `font-weight:800`
  - tbody td: `border:none;border-bottom:1px solid ${borderColor}` + `background-color:transparent` + `color:${subColor}` (헤더와 위계 위해 dim)
  - 마지막 tbody tr 의 td: `border-bottom:none` (후처리 자동 적용)
  - **같은 페이지 내 모든 테이블이 동일한 border 색상·두께·스타일을 사용해야 함.** 한 테이블은 진한 border, 다른 테이블은 연한 border이면 FAIL.
- 짝수 행 배경색 구분 금지. tbody td는 모두 background-color:transparent 통일.
- 모든 th·td에 width% 명시. colspan/rowspan 적극 활용.
- 이미지 마커 (item1) 있을 때만 이미지 셀 생성. 마커 없으면 이미지 셀 생성 금지.
- 데이터 없는 빈 행 생성 금지.
- **테이블 스타일 완전 통일 필수**: 같은 페이지 내 모든 테이블의 th/td 인라인 style 값이 동일해야 함. 섹션마다 다른 스타일 절대 금지. 첫 번째 테이블과 마지막 테이블의 th 색상·배경·폰트가 반드시 일치해야 함.
- **테이블 위아래 간격 필수**: 테이블 앞뒤에 반드시 `<p style="height:16px;margin:0;"></p>` 간격 삽입 (소 16px — 08-spacing 본문↔표와 통일). 텍스트와 테이블이 바로 붙으면 안 됨.
- **연속된 테이블 2개 이상**: 테이블 사이에도 `<p style="height:16px;margin:0;"></p>` 간격 삽입. 테이블끼리 붙이지 말 것.
