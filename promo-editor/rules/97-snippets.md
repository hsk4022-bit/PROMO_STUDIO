---
id: 97-snippets
title: HTML 스니펫 (복붙용 정답)
source: 자체 작성 — 위 규칙들을 코드 스니펫으로 정리
purpose: 매번 새로 짜지 말고 여기서 복붙 + 변수만 채우기. 위 규칙들과 100% 동기.
---

# HTML Snippets

## 1. HTML 최상단 preamble (모든 파일 필수)

```html
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<style>body,div,p,span,a,button,li,td,th,h1,h2,h3,h4,h5,h6{font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;}</style>
```

---

## 2. 전체 골격 (1번 + 2번 블록)

```html
<div class="se-contents" style="font-family:'Pretendard',sans-serif;font-size:clamp(14px,1.702vw,16px);line-height:1.8;color:${textColor};letter-spacing:-0.05rem;word-break:keep-all;overflow-wrap:break-word;background-color:transparent;">

  <!-- 1번 블록: 히어로 이미지 (있을 때만) -->
  <div class="se-div" style="position:relative;width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box;padding:0;line-height:0;font-size:0;display:block;">
    <!-- <img> 단독 -->
  </div>

  <!-- 2번 블록: 컨텐츠 전체 래퍼 -->
  <div class="se-div" style="position:relative;width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box;background-color:${bgColor};padding:clamp(24px,3.472vw,50px) clamp(16px,3.472vw,40px);display:block;">
    <!-- 섹션 카드들이 형제로 수직 적층 -->
  </div>

</div>
```

⚠️ `.se-contents` 에는 max-width 금지. 1번·2번 블록 각각이 max-width 책임.

---

## 3. 섹션 카드 (모든 섹션 동일 구조)

```html
<div class="se-div" style="background-color:${surfaceColor};border-radius:0.875rem;padding:2rem 2rem;">

  <!-- 섹션 타이틀 -->
  <div class="se-div" style="margin-bottom:1rem;">
    <span style="display:inline-block;width:1.75rem;height:1.75rem;background-color:${accentColor};border-radius:50%;text-align:center;line-height:1.75rem;font-weight:900;color:#ffffff;font-size:0.875rem;margin-right:0.625rem;vertical-align:middle;">N</span>
    <span style="font-size:clamp(1.25rem,2.5vw,1.375rem);font-weight:700;color:${textColor};vertical-align:middle;">섹션제목</span>
  </div>

  <!-- 섹션 내용 -->
  <div class="se-div" style="padding:0.75rem 0;border-top:1px solid ${borderColor};">
    <p style="color:${textColor};margin:0;line-height:1.8;">내용</p>
  </div>

</div>
<p style="height:24px;margin:0;"></p>
```

---

## 4. 간격 (요소 사이)

```html
<p style="height:16px;margin:0;"></p>   <!-- 소 -->
<p style="height:32px;margin:0;"></p>   <!-- 중 -->
<p style="height:48px;margin:0;"></p>   <!-- 대 -->
```

→ 트리거 매핑은 [08-spacing.md](08-spacing.md) 참고.

---

## 5. 부가정보 카드 (유의사항·면책 등)

⚠️ `${surfaceColor}` 아닌 `${mutedColor}` 사용 (위계 역전 방지).

```html
<div class="se-div" style="background-color:${mutedColor};border-radius:0.875rem;padding:2rem 2rem;">
  <div class="se-div" style="margin-bottom:1rem;">
    <span style="font-size:clamp(1.25rem,2.5vw,1.375rem);font-weight:700;color:${textColor};">유의사항</span>
  </div>
  <div class="se-div" style="padding:0.75rem 0;border-top:1px solid ${borderColor};">
    <p style="color:${subColor};margin:0;line-height:1.8;font-size:clamp(0.8125rem,1.4vw,0.9375rem);">* 이벤트는 사정에 따라 변경될 수 있습니다.</p>
  </div>
</div>
```

---

## 6. 이미지 블록

```html
<div class="se-div" style="margin:0;padding:0;display:block;line-height:0;font-size:0;">
  <img src="..." style="max-width:100%;height:auto;display:block;margin:0 auto;">
</div>
```

금지: width/height 고정, object-fit, position, float, z-index, div/span 으로 wrap.

---

## 7. CTA 버튼 (대버튼)

```html
<div class="se-div" style="padding:0px 0px 0px 0px;margin:0;text-align:center;">
  <a href="${link}" target="_blank" style="display:block;width:100%;padding:1.5rem 0;font-weight:800;border-radius:0.75rem;background-color:${accentColor};color:#000000;text-align:center;text-decoration:none;font-size:inherit;border:none;cursor:pointer;box-sizing:border-box;">지금 시작하기</a>
</div>
```

---

## 8. 수치/날짜 강조 (단독 박스 내 1~2단어 숫자만)

```html
<p style="font-size:clamp(1.5rem,3vw,2rem);font-weight:900;color:${accentColor};margin:0;line-height:1.4;">1,000원</p>
```

❌ 긴 날짜 범위 문장에 1.5rem+ 적용 금지.

---

## 9. 영상 (event-video div)

> 자동 변환 스크립트는 시스템이 1회 삽입. **AI 가 직접 `<script>` emit 금지.**

루핑:
```html
<div class="se-div event-video" data-src="${videoSrc}" data-type="loop"></div>
```

플레이어:
```html
<div class="se-div event-video" data-src="${videoSrc}" data-type="player"></div>
```

→ data-type 판별 우선순위: 명시 마커 > 파일명 키워드 > 기본값 `player`. 자세히는 [15-video.md](15-video.md).

---

## 10. 팝업 트리거 버튼

> `<script>` 추가 없이 onclick 안에서 직접 createElement. 정확한 onclick 코드는 [14-popup.md](14-popup.md) 의 "트리거 버튼 onclick 로직" 섹션을 그대로 복사.
