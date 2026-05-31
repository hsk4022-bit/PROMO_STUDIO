---
id: 17-layout-patterns
title: 레이아웃 패턴 (A~L)
purpose: 섹션 시각화 패턴 카탈로그 + 금지 패턴 (2단/3열)
---

# [레이아웃 패턴 — 섹션마다 선택 적용]
A: **액센트 스트라이프** — border-left:0.3125rem solid ${accentColor};padding-left:1.25rem; + 본문 블록
B: ❌ **섹션 좌우 2단 금지** — 섹션 카드를 좌우 나란히 배치하는 모든 구성 금지. 비교/대칭 데이터는 반드시 <table> 2열로. (예외: 연속 영상 마커 2개 이상은 <table> 그리드 좌우 배치 허용 — 15-video.md "복수 영상 그리드" 참조.)
C: **원형 번호 타임라인** — circle 2rem, background-color:${accentColor}, color:${accentTextColor}, font-weight:900; display:inline-block;vertical-align:top;margin-right:0.875rem;
D: **pill 배지 + 본문** — <p style="display:inline-block;background-color:${accentColor};color:${accentTextColor};border-radius:1.25rem;padding:0.1875rem 0.875rem;font-size:0.75rem;font-weight:900;"> 배지 텍스트 </p>
E: **하이라이트 띠** — BG-2(액센트틴트) 배경, border-left:0.25rem solid ${accentColor}, border-radius:0.75rem, padding:1.25rem 1.5rem
F: **아이콘 리스트** — border-bottom:1px solid ${borderColor};padding:0.875rem 0; 반복 구조
G: **카드 스택** — border-radius:0.875rem; **border 금지** (배경색 차이로만 경계, 상단 accent 바 제거됨)
H: **교차 배경 행** — 홀/짝 행 background-color: ${surfaceColor} / ${bgColor} 교차
I: ❌ **플로팅 배지 카드 패턴 사용 금지** — border-top accent 가 들어가서 다른 카드와 일관성 깨짐. 강조가 필요하면 D(pill 배지) 또는 E(하이라이트 띠) 사용.
J: ❌ **3열 카드 금지** — 섹션 카드를 가로 3열로 배치하는 모든 구성 금지. 세로 적층만 허용.
K: **번호 강조 표** — 좌측 첫 열 background-color:BG-2(액센트틴트), font-weight:900, color:${accentColor}
L: **구분선 리스트** — <p style="border-bottom:1px solid ${borderColor};padding:0.75rem 0;color:${textColor};"> 반복
