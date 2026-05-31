---
id: 09-section-card
title: 섹션 카드 구조 (모든 섹션 동일)
purpose: 섹션 카드 템플릿 + 일관성 규칙
---

# [섹션 구조 — 모든 섹션 동일 ⚠️ 일관성 위반 시 FAIL]

<div class="se-div" style="background-color:${surfaceColor};border-radius:0.875rem;padding:2rem 2rem;">
  <!-- ⚠️ 섹션 카드 padding 고정: TB=2rem / LR=2rem (32px). 내부 컨텐츠가 카드 가장자리에 붙지 않도록 LR 필수. -->
  <!-- 섹션 타이틀 -->
  <div class="se-div" style="margin-bottom:1rem;">
    <span style="display:inline-block;width:1.75rem;height:1.75rem;background-color:${accentColor};border-radius:50%;text-align:center;line-height:1.75rem;font-weight:900;color:#ffffff;font-size:0.875rem;margin-right:0.625rem;vertical-align:middle;">N</span>
    <span style="font-size:clamp(1.25rem,2.5vw,1.375rem);font-weight:700;color:${textColor};vertical-align:middle;">섹션제목</span>
  <!-- ⚠️ 섹션제목에서 앞 번호(예: "1." "2." "1. " "2. ") 반드시 제거. 배지(N)가 번호 역할을 하므로 중복 금지. -->
  </div>
  <!-- 섹션 내용 -->
  <div class="se-div" style="padding:0.75rem 0;border-top:1px solid ${borderColor};">
    <p style="color:${textColor};margin:0;line-height:1.8;">내용</p>
  </div>
</div>
<p style="height:24px;margin:0;"></p>

## 섹션 일관성 규칙 (위반 시 FAIL)
- **모든 섹션 카드는 위 템플릿과 100% 동일한 구조를 사용해야 한다.** 섹션마다 border/border-radius/padding/background-color가 다르면 즉시 FAIL.
- **모든 내부 div에 class="se-div" 필수.** class 없는 div 절대 금지.
- 섹션 사이 간격: <p style="height:24px;margin:0;"></p> 로만 처리.
- 테이블은 섹션 se-div 안에 직접 배치. **추가 래퍼 div 금지.**
- ❌ **섹션 카드에 border 절대 금지.** 배경색(${surfaceColor}) 과 페이지 배경(${bgColor}) 의 명도 차이만으로 경계 표현. `border:1px solid` 추가 시 즉시 FAIL (페이지 탁해짐).
- **어떤 섹션은 border-radius 있고 어떤 섹션은 없는 불일치 절대 금지.** 모든 섹션에 `border-radius:0.875rem` 통일.
- **어떤 섹션은 background-color 있고 어떤 섹션은 없는 불일치 절대 금지.** 모든 섹션에 `background-color:${surfaceColor}` 통일.
- 작업 완료 후 자가 검증: 모든 섹션 se-div의 style 속성이 동일한지 확인. 하나라도 다르면 재작업.
