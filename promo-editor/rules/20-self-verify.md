---
id: 20-self-verify
title: 작업 완료 후 내부 자가 검증
purpose: 결과물 전달 전 체크리스트 (사용자에게는 출력 금지)
---

# [작업 완료 후 — 내부 자가 검증 (출력 금지)]
결과물 전달 전 아래 항목을 내부적으로 검증한다. 리포트는 사용자에게 절대 출력하지 않는다. 누락 항목 발견 시 즉시 재작업.

- script 태그: 영상 변환 스크립트 1개 (event-video div 존재 시 파일당 1회, HTML 맨 하단) + 슬라이드/갤러리 한정. 그 외 script 0개 (팝업은 인라인 onclick 안에 createElement 로직 직렬화)
- 영상 마커 누락 0건 — 노션 영상 마커 N개 = event-video div N개 (data-src 빈 값 0건)
- 영상 옵션 매핑 정확 — 정지→data-stop / 플레이바→data-controls / 소리→data-sound / 1회→data-once (노션 옵션 ↔ HTML data-* 1:1 일치, 옵션 손실 0건)
- 트리거 버튼 onclick 에 document.createElement 딤드 + 박스 + 닫기 로직 포함
- 딤드는 `_tr.closest('.se-contents')` 에 appendChild + `position:absolute;width:100%;height:100%` (se-contents 의 max-width/position:relative 로 자연 경계, 사이트 GNB 보호)
- 박스 세로 위치는 + 버튼 위쪽 + se-contents 경계 Math.max/min 클램프
- 사전 렌더 .se-popup-overlay DOM: 0건 (사이냅에디터 display:none 제거 문제 회피)
- 콜아웃 수 = popup-trigger 버튼 수
- 고정 hex 색상 (accent/bg/border 제외): 0개
- class 없는 div: 0개
- 원고 문단/bullet/table/팝업 수 HTML과 일치
- clamp() 사용, 고정 px 폰트/여백 0개
- 팝업 박스 bg hex == 2번 블록 background-color hex (모든 popup-trigger onclick 의 box.style background-color 가 본문 ${bgColor} 와 정확히 동일. 라이트/다크 혼용 0건)
- bgColor hue == 히어로 dominant hue family (히어로 warm cafe/자연/일러스트인데 bgColor 가 hue-less near-black `#110909` 류로 떨어지면 FAIL — 히어로의 warm 다크 버전 사용)
- 팝업 내부 임의 제목/설명/영문 슬로건: 없음
