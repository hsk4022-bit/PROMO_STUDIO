---
id: 12-button
title: 버튼 규칙 (대/중/소 + 배치)
purpose: 버튼 키워드 → 스타일 + 카드 내부/외부 배치 규칙
---

# [버튼 — 키워드 없으면 생성 금지]

## 괄호 개수에 따른 배치 구분 — 반드시 준수
- `[대버튼]` (대괄호 1쌍): 현재 섹션 카드 **내부**에 배치. <div class="se-div" style="padding:0px 0px 0px 0px;margin:0;text-align:center;"> 래퍼 안에 삽입.
- `[[대버튼]]` (대괄호 2쌍): 섹션 카드 **외부**에 독립 배치. 어떤 se-div에도 속하지 않으며, 섹션과 섹션 사이 또는 전체 콘텐츠 끝에 단독 블록으로 위치. 래퍼 div 사용 동일.
- `[[중버튼]]` / `[[소버튼]]`도 동일 규칙: 괄호 2쌍이면 섹션 외부 독립 배치.

## 버튼 스타일
- [대버튼]: <div class="se-div" style="padding:0px 0px 0px 0px;margin:0;text-align:center;"> 래퍼 안에 <a> 또는 <button> 배치. 콘텐츠 래퍼(2번 블록)가 이미 좌우 padding을 가지므로 래퍼 div에 추가 좌우 패딩 금지.
  버튼 스타일: display:block;width:100%;padding:1.5rem 0;font-weight:800;border-radius:0.75rem;background-color:${accentColor};color:#000000;text-align:center;text-decoration:none;font-size:inherit;border:none;cursor:pointer;box-sizing:border-box;
- [중버튼]: display:inline-block;padding:0.5rem 3.25rem;font-weight:700;border-radius:2rem;border:2px solid ${accentColor};color:${accentColor};text-decoration:none;
- [소버튼]: display:inline-block;padding:0.625rem 1.5rem;font-size:inherit;border-radius:0.5rem;text-decoration:none;
