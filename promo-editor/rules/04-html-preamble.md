---
id: 04-html-preamble
title: HTML 최상단 preamble (필수 3줄)
purpose: 모든 HTML 파일 맨 위에 들어가는 charset + Pretendard CDN + 폰트 style
---

# [HTML preamble — 필수]

**모든 생성 HTML 파일 최상단에 아래 3줄을 그대로 복사 (변형 금지, 누락 시 FAIL — 추가됨 2026-04-28):**

```html
<meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<style>body,div,p,span,a,button,li,td,th,h1,h2,h3,h4,h5,h6{font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;}</style>
```

- 위치: 파일 맨 위 (그 아래 바로 `<div class="se-contents">` 시작).
- charset 한 번 / Pretendard CDN 한 번 / 폰트 패밀리 `<style>` 한 번. 절대 중복·누락 금지.
- **이로 인해 `.se-contents` 인라인 style 의 `font-family` 는 생략 가능** (CSS 가 모든 텍스트 element 에 이미 적용). 단 호환성 위해 인라인 유지해도 무방.
- 이 preamble 외 다른 `<style>` / `<link>` / `<meta>` 태그 추가 금지.
- 적용 대상: `index_불러오기용.html`, `index_cdn.html`, 미리보기 iframe, `PROMO_SLICED/index_NN.html` — 전 경로 동일 적용.
