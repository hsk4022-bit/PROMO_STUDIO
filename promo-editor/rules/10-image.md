---
id: 10-image
title: 이미지 규칙 (img 태그 + 마커 위임)
purpose: img 인라인 스타일 + image_pipeline_contract.md 위임 명시
---

# [이미지 규칙]
- <img> 필수 style: max-width:100%;height:auto;display:block;margin:0 auto;
- **width · height 고정값 절대 금지** (px, rem, em, vh, vw, % 모두). object-fit · object-position 금지.
  - ❌ `style="width:35px;height:29px"` — 작은 고정 사이즈 = 화면 좁아져도 안 줄어듦 + 큰 화면에서도 그 크기로 고정 → 양쪽 다 손해
  - ❌ `width="100" height="80"` HTML 속성도 금지
  - ✅ `max-width:100%;height:auto;` 만 — **원본 사이즈로 표시, 컨테이너 좁으면 자동 반응형 축소**
- img를 div·span으로 감싸지 말 것. 단독 사용.
- position:absolute/fixed/relative · float · z-index 금지.
- 이미지 블록 se-div: style="margin:0;padding:0;display:block;line-height:0;font-size:0;"

## ⚠️ 이미지 사이즈 동작 (위반 시 FAIL)

**원칙**: 이미지는 **원본(natural) 사이즈로 표시**, 컨테이너 폭보다 크면 자동으로 컨테이너에 맞게 축소.

| 시나리오 | 동작 | 필요 CSS |
|---|---|---|
| 컨테이너 폭 > 이미지 원본 폭 | 원본 폭 그대로 표시 (확대 안 함) | `width:auto` (기본값) |
| 컨테이너 폭 < 이미지 원본 폭 | 컨테이너 폭에 맞춰 축소, 비율 유지 | `max-width:100%; height:auto` |
| 모바일 (좁은 화면) | 자동 축소 | 동일 |

**금지 패턴**:
- ❌ `width:35px;height:29px` (고정) — 원본 사이즈 손실 + 모바일 축소 안 됨
- ❌ `width:100%` (강제 풀폭) — 작은 이미지가 강제로 늘어남 (해상도 손실 + 디자인 의도 위배)
- ❌ `width:50%` (강제 반폭) — 컨테이너 따라 변하지만 원본 의도 무시

**정답 패턴**:
- ✅ `<img src="..." style="max-width:100%;height:auto;display:block;margin:0 auto;">`
- ✅ 인라인 (테이블 셀 안): `<img src="..." style="display:inline-block;vertical-align:middle;max-width:100%;height:auto;">`
- 두 경우 모두 **width 속성/스타일 없음** — 브라우저가 자연 사이즈로 표시 + max-width 가 안전망

## ⚠️ [이미지 마커 전량 반영 — 서브계약 위임]
**이미지 수집·치환·검증·해시 처리는 `image_pipeline_contract.md` 에 정의된 3단계 파이프라인을 무조건 따른다.**

- 1단계 INGESTION 완수 전 HTML 생성 금지
- 텍스트 마커 잔존 시 즉시 FAIL
- 해시 폴더 실물 파일 수 < 노션 마커 수 → 즉시 FAIL
- 작업 종료 전 `image_pipeline_contract.md §3.4 최종 검증 리포트` 무조건 출력

세부 규칙·FAIL 조건·검증 리포트 포맷은 `image_pipeline_contract.md` 원본 참조.
