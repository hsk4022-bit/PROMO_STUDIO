---
id: 05-html-structure
title: HTML 최상위 골격 (.se-contents + 1번·2번 블록)
purpose: 1번(히어로)·2번(컨텐츠) 블록 구조, max-width 책임 위치
---

# [HTML 구조 — 절대 준수]

<div class="se-contents" style="font-family:'Pretendard',sans-serif;font-size:clamp(14px,1.702vw,16px);line-height:1.8;color:${textColor};letter-spacing:-0.05rem;word-break:keep-all;overflow-wrap:break-word;background-color:transparent;">

  <!-- ⚠️ 사이냅에디터는 .se-contents(자기 클래스)의 width/max-width 를 강제 제거하지만,
       직계 자식 se-div 의 인라인 스타일은 건드리지 않음.
       → max-width + position:relative 는 반드시 직계 자식 (1번·2번 블록) 각각에 박을 것. 내부 래퍼 불필요. -->

  <!-- 1번 블록: 히어로 이미지 (이미지 있을 때만 생성) — max-width + position:relative 필수
       (자체 dim 기준점 — 캐릭터 이미지 영역 단독 덮음) -->
  <div class="se-div" style="position:relative;width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box;padding:0;line-height:0;font-size:0;display:block;"></div>

  <!-- 2번 블록: 컨텐츠 전체 래퍼 — max-width + position:relative 필수
       (자체 dim 기준점 — 컨텐츠 영역 단독 덮음) -->
  <div class="se-div" style="position:relative;width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box;background-color:${bgColor};padding:clamp(24px,3.472vw,50px) clamp(16px,3.472vw,40px);display:block;">
    <!-- 섹션 se-div들이 형제로 수직 적층. 섹션 자체에 별도 좌우 패딩 추가 금지 (래퍼에서 처리) -->
  </div>

</div>

규칙:
- **⚠️ `.se-contents` 에는 max-width/width 넣지 말 것. 사이냅이 어차피 제거함.** 폰트·색상만 둠.
- **⚠️ max-width + position:relative 책임은 `.se-contents` 직계 자식 se-div 각각.** 1번·2번 블록 모두 `position:relative;width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box;` 5개 필수.
- 1번(이미지)·2번(컨텐츠) 블록은 `.se-contents` 의 직계 자식. 내부 래퍼(`data-section-id` 등) 두지 말 것.
- 배경색 ${bgColor}는 2번 블록에만. ${bgColor}는 지정된 값 그대로. 임의 변경 금지.
- **팝업/딤드 absolute 기준점은 1번 블록 + 2번 블록 둘 다** — 팝업 트리거 시 dim 오버레이를 1번·2번에 각각 생성해 양쪽 영역 모두 덮음 (변경 2026-04-28: 캐릭터 이미지도 dim 처리). 팝업 박스 본체는 2번 블록에만 표시.
