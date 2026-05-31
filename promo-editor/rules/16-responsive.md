---
id: 16-responsive
title: 반응형 (무조건 기본)
purpose: 폰트·패딩·이미지·테이블·팝업·버튼의 반응형 적용 범위 + 검증 기준
---

# [반응형 — 무조건 기본]
**모든 결과물은 반응형이 기본.** 반응형이 아니면 즉시 FAIL. 별도 지시 없어도 무조건 반응형.

## 적용 범위 (전부 필수)
- 본문 폰트 크기: `clamp(min, vw, max)` 사용. 고정 px 금지.
- 좌우 패딩: `clamp(16px, 3.472vw, 50px)` (PC 50px, 모바일 16px).
- 섹션 카드·박스: `width:100%` + `max-width` 로 유동 대응.
- 테이블: 모바일에서 가로 스크롤 가능하도록 `<div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;"><table>...</table></div>` 래핑.
- 이미지: `max-width:100%; height:auto` 필수. 고정 width/height 금지.
- 팝업: 딤드는 se-contents 내부 `position:absolute;width:100%;height:100%`, 박스는 `position:absolute;left:5%;width:90%` (컨텐츠 영역 대비 90% 폭 + 좌우 5% 여백), 폰트는 본문 `.se-contents` 선언값을 상속 (font-family 만). font-size/line-height/letter-spacing 은 인라인 명시값.
- 버튼: `padding`에 `clamp()` 또는 상대 단위(rem) 사용.

## 검증
- 320px 너비(가장 작은 모바일)에서 가로 스크롤이 생기지 않아야 한다.
- 1920px 너비(큰 데스크탑)에서 `max-width:52.5rem` 로 중앙 정렬되어야 한다.
- 모든 인터랙티브 요소(팝업, 버튼, 링크)는 터치 타깃 최소 44x44px 확보.
