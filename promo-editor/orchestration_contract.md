# 오케스트레이션 계약 (End-to-End Orchestration Contract)

**진입점**: 모든 자동화 요청은 **Claude** 를 통해 시작된다.
**Route**: 실행 주체에 따라 2가지 — HTML **본문 포맷(태그·인라인 스타일·섹션 구조)** 은 100% 동일, **다운로드 ZIP 구조와 내부 파일 구성**은 Route 별로 다름(§Route 1 / §Route 2 의 "산출물 ZIP 구조" 참조). 체크포인트 UX 도 Route 별로 다름.

- **Route 1 (promo-editor UI)**: Claude → promo-editor / banner-studio / banner-l 를 세션 브리지·URL 파라미터로 원격 제어
- **Route 2 (Claude 단독)**: Claude 가 HTML·이미지·배너까지 직접 생성

---

## 🚨 최상위 원칙

1. **이미지 수집이 끝나기 전에는 HTML 한 줄도 쓰지 않는다.** → `image_pipeline_contract.md` §1 참조
2. **기존 수동 플로우를 절대 훼손하지 않는다.** 자동화는 **add-on** 형태로만 추가. 자동화 진입 조건이 없으면 기존 동작과 100% 동일해야 함.
3. **체크포인트 통과 없이 다음 단계 진입 금지.** 유저 "OK" 없이 자동 진행 금지.
4. **두 Route 의 최종 산출물은 동일 포맷·동일 검증 기준**을 통과해야 한다.

---

## 📐 전체 플로우

```
유저 → Claude
   │
   ▼
[0. Route 결정]  유저 요청 해석 → Route 1 or Route 2
   │
   ▼
[1. INGESTION]   (image_pipeline_contract §1)
   Claude 전담 — 노션 파싱 + 컨텐츠_에셋 폴더 구축 (영구)
     · 노션 기본정보 "컨텐츠 에셋 경로" 있으면 그 경로
     · 없으면 "로컬 저장 경로/컨텐츠_에셋/" 생성
     · 마커 파일: 동명 덮어쓰기 / S3 삽입 이미지: block id suffix 로 공존
   → 수집 완료 검증 통과해야 다음 단계
   │
   ▼
[2. 히어로 생성]
   Route 1: promo-editor UI → IMAGE_MODEL (Gemini)
   Route 2: Claude → IMAGE_MODEL API 직접 호출
   │
   ▼
⏸️ [체크포인트 1 — 히어로 이미지]
   Route 1: UI 프리뷰 → 유저 OK/재생성
   Route 2: 채팅 프리뷰 → 유저 OK/재생성
   │
   ▼ OK
[2-A. 로고 합성 — 로고 있을 때만]
   logo/ 폴더에 파일 존재 시 → 아래 §로고 합성 알고리즘으로 히어로에 합성
   → 합성 결과(JPEG q0.95)가 이후 모든 단계의 최종 히어로 이미지
   → 로고 없으면 이 단계 스킵
   │
   ▼
[2-B. 히어로 이미지 색상 추출 → 컬러 팔레트 확정]
   Route 1: applyHeroImage() → extractColorsFromImage() 자동 실행
   Route 2: Claude 가 히어로 이미지를 분석하여 동일 알고리즘으로 색상 도출
   → 아래 §색상 추출 알고리즘 전체 적용 (생략 금지)
   → 추출 결과: bgColor + accentColor 확정
   → 파생 색상 6종 계산 후 HTML 생성에 사용
   │
   ▼
[3. 컨텐츠 HTML 생성]
   Route 1: promo-editor CONTENT_MODEL
   Route 2: Claude 가 rules/*.md 준수하여 직접 작성 (2-B에서 확정한 색상 변수 사용)
   → 마커 → <img> 치환 (image_pipeline §2)
   │
   ▼
⏸️ [체크포인트 2 — 컨텐츠 HTML]
   │
   ▼ OK
[4. FINALIZE]    (image_pipeline_contract §3)
   로컬 저장 경로/PROMO_<ts>/ 생성
   → 16자 해시 서브폴더에 사용된 이미지만 컨텐츠_에셋에서 **복사**
   → 파일명 8자 해시 rename + HTML src 치환 + ZIP export
   → PROMO_SLICED / PROMO_html 구조
   → 컨텐츠_에셋 폴더는 무변경 (영구 보존)
   │
   ▼
[5. banner-studio 기본 배너 생성]
   BANNER_SECTION 데이터 기반 자동 생성 (규격·파일명·로고 전부 노션 원문)
   │
   ▼
⏸️ [체크포인트 3 — banner-studio 기본 배너]
   │
   ▼ OK (→ 이때 비로소 세션 브리지 발동)
[6. banner-l 다규격 생성]
   langVari=Y 항목을 __PROMO_SESSION__.banners[] 에 push
   → banner-l 이 수신하여 다규격(en/jp/tw + 리사이징) 자동 생성
   │
   ▼
⏸️ [체크포인트 4 — 다규격 배너]
   │
   ▼ OK
[작업 완료]
   최종 결과 폴더 경로 안내 + 각 체크포인트 승인 이력 요약
```

---

## Route 1 — promo-editor UI 사용

### 진입 조건
- 유저가 "프로모 에디터로 작업" 명시
- 또는 Chrome 탭에 promo-editor 가 이미 열려 있는 상태
- 또는 유저가 UI 기반 체크포인트를 선호한다고 밝힘

### UI 원격 제어 인터페이스
| 수단 | 용도 | 예시 |
|---|---|---|
| **세션 브리지** `window.top.__PROMO_SESSION__` | 원고/에셋/상태 전달 | `{ notionPageId, assetDir, outputDir, manuscript, assetsManifest, step }` |
| **URL 파라미터** | 초기 자동 로드 트리거 | `?notion=<pageId>&assetDir=<path>&outputDir=<path>&auto=1` |
| **Chrome MCP** (보조) | DOM 직접 조작이 필요한 경우 | 드래그·드롭, 버튼 클릭 |

### Claude 의 책임
- 1단계 INGESTION 을 완수한 후 세션 브리지에 페이로드 구성
- promo-editor URL 을 유저에게 제공 (또는 Chrome MCP 로 열기)
- 각 체크포인트 전환 시 `step` 필드 갱신
- 체크포인트 응답 대기

### promo-editor(app.js) 의 책임
- 세션 감지 → 원고 입력폼·에셋 영역 자동 채움
- 자동 채움 이후 히어로/컨텐츠/export 단계 실행
- 체크포인트마다 UI 에서 유저 승인 수신
- **기존 수동 플로우 훼손 금지** — 세션·파라미터가 없으면 기존 동작 그대로

### banner-studio / banner-l
- banner-studio: BANNER_SECTION 전부 자동 생성. 체크포인트 3 승인 시까지 세션 브리지 발동 지연
- banner-l: 세션에서 `langVari=true` 항목 수신 후 다규격 자동 생성 (기존 구현 활용)

### 산출물 ZIP 구조 (Route 1 — app.js 기본 동작)
- 파일명: `PROMO_${Date.now()}.zip` 또는 `PROMO_SLICED_${Date.now()}.zip` (내보내기 유형에 따라)
- **순수 HTML 내보내기 경로** (`PROMO_${Date.now()}.zip`): ZIP 루트 직접 배치
  - `index_불러오기용.html` (로컬 경로 `./<hash16>/…`)
  - `index_cdn.html` (CDN 있을 때만)
  - `<hash16>/<hash8>.ext` 에셋
- **슬라이서 내보내기 경로** (`PROMO_SLICED_${Date.now()}.zip`): 두 폴더 구조
  - `PROMO_SLICED/{index.html, [index_cdn.html], <hash16>/슬라이스}`
  - `PROMO_html/{index_불러오기용.html, [index_cdn.html], <hash16>/원본 에셋}`
- CDN URL 소스: **UI 입력 필드**(`cdnInput`). notion `basicInfo` 는 Route 1 에서 참조하지 않음

---

## Route 2 — Claude Code 단독

### 진입 조건
- 유저가 "HTML 만들어줘" / "Claude 가 다 해줘" 명시
- UI 환경이 없거나 언급 없음
- 단순·빠른 결과물 요청

### Claude 의 책임
- 1단계 INGESTION (Route 공통)
- 히어로 이미지 생성: IMAGE_MODEL API 직접 호출
- 컨텐츠 HTML 작성: `rules/INDEX.md` 룩업 후 대상 `rules/*.md` 준수 (팝업 동적 createElement, 반응형, 컬러 시스템 전부)
- 3단계 FINALIZE: 해시 처리·파일 이동·HTML src 치환
- 배너 생성: IMAGE_MODEL API 직접 호출 (banner-studio 의 이미지 생성 로직과 동일 프롬프트 구조)
- 다규격: 다국어 텍스트 치환 로직 적용 후 이미지 재생성

### 체크포인트 UX
- 이미지 프리뷰: 로컬 파일 경로 or 임시 HTTP 서버 (`localhost:8765`) URL 안내
- HTML 프리뷰: 로컬 파일 경로 or 채팅 내 주요 스크린샷
- 유저 응답: "OK" / "재생성" / "수정" 채팅 텍스트
- 각 체크포인트 승인 이력을 결과물 폴더에 `checkpoint_log.json` 으로 기록

### 검증 리포트 출력 의무
- 각 체크포인트 전환 시마다 현재 상태 요약
- 작업 완료 전 `image_pipeline_contract.md §3.4` 검증 리포트 채팅에 출력
- 리포트 없이 "완료" 선언 금지

### 산출물 ZIP 구조 (Route 2 — Claude 방식)
- **파일명**: `PROMO_<ts>.zip` (ts = `int(time.time()*1000)`)
- **루트 구조**: `PROMO_html/` 단일 폴더 (슬라이서 경로 생략 — Claude 는 슬라이스 불필요)
  - `PROMO_html/index_불러오기용.html` — 로컬 경로 `./<hash16>/<hash8>.ext` (promo-editor 재불러오기용)
  - `PROMO_html/index_cdn.html` — CDN 경로 치환 버전 (CDN URL 이 있을 때만 생성)
  - `PROMO_html/<hash16>/<hash8>.ext` — 원본 컨텐츠 이미지 + hero.png
- **해시 규칙**: 16자리 폴더명(`generateHashString(16)`), 8자리 파일명(`generateHashString(8)`)
- **CDN URL 소스**: `notion_data.json` → `basicInfo.게시물 CDN URL`
  - 끝이 `/` 아니면 자동 추가
  - 값이 없거나 빈 문자열이면 `index_cdn.html` 생성 생략
  - UI 입력 필드 참조 금지 (Route 1 방식과 분리)
- **검증 (§3.4 최종 리포트에 반드시 포함)**:
  - `__ASSET__` 마커 잔존 0
  - `<a href=` 잔존 0 (탭 앵커는 `convertTabAnchorsForCdn` 으로 button 변환)
  - `<script>` 잔존 0 (팝업 동적 createElement 만 허용되나 Route 2 는 해당 없을 시 0)
  - 에셋 8자리 리네임 카운트 = `__ASSET__` 원본 카운트
  - CDN URL 반영 여부 (있으면 `index_cdn.html` 존재, 없으면 생략)

---

## 체크포인트 공통 규칙

### 각 체크포인트에서 Claude 의 출력
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏸️ 체크포인트 N — <단계명>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
결과: <경로/URL/프리뷰>
상태: <요약>

확인 후 다음 중 응답:
  ✅ OK       — 다음 단계로
  🔄 재생성   — 같은 단계 다시
  ✏️ 수정     — 구체 지시 (예: "로고 위치를 TL로")
```

### NG 처리
- **재생성**: 동일 파라미터로 다시 실행 (랜덤성 있는 단계는 결과 변동 기대)
- **수정**: 유저 지시 반영 후 재실행
- **재시도 횟수 제한 없음** — 유저가 OK 줄 때까지
- 재시도 시 임시 폴더의 기존 생성물은 덮어쓰기

### 체크포인트 이력 기록
- 최종 결과 폴더에 `orchestration_log.json` 저장:
```json
{
  "notion_page_id": "...",
  "route": "route1_ui" | "route2_claude",
  "started_at": "...",
  "completed_at": "...",
  "checkpoints": [
    { "id": 1, "name": "hero", "attempts": 2, "approved_at": "...", "final_result": "..." },
    { "id": 2, "name": "content_html", "attempts": 1, "approved_at": "..." },
    { "id": 3, "name": "banner_studio", "attempts": 3, "approved_at": "..." },
    { "id": 4, "name": "banner_multi", "attempts": 1, "approved_at": "..." }
  ]
}
```

---

## 🛡️ 회귀 방지 (절대 금지 항목)

- ❌ 기존 수동 입력·업로드·생성 플로우를 제거하거나 변경 금지
- ❌ 기존 함수 시그니처 변경 금지 (`runImageMatching`, `renderContentAssets`, `renderHeroAssets`, export 함수 등)
- ❌ 기존 export 경로 변경 금지 (`PROMO_SLICED/`, `PROMO_html/` 구조·파일명 규칙 유지)
- ❌ 자동화 진입 조건(세션/URL 파라미터)이 없을 때 기존 동작과 다르게 동작 금지
- ❌ 자동화 코드가 기존 경로를 우회·오버라이드 금지 — 항상 옆에 붙는 add-on 형태
- ❌ `IMAGE_MODEL`, `CONTENT_MODEL`, `generateHashString`, `detectExistingHash`, `currentHashFolder` 동작 변경 금지 (확인만 허용)

---

## 로고 합성 알고리즘 (app.js `compositeHeroWithLogo` 완전 동일 적용)

> Route 2(Claude)는 체크포인트 1 OK 직후, 색상 추출 전에 로고 합성을 수행한다.

### 로고 파일 위치
- `이미지 폴더 경로/logo/` 하위 파일 탐색 (png/jpg/webp/svg)
- 파일 없으면 합성 단계 스킵

### 로고 기본값
| 항목 | 기본값 | 설명 |
|---|---|---|
| `logoPos` | `right` | 로고 위치 (left / right) |
| `logoSize` | `14` | 히어로 너비 대비 % |

- 노션 기본 정보에 로고 위치/크기 지정값 있으면 그 값 우선 적용

### 합성 방법 (Canvas)
```
canvas.width  = hero.naturalWidth
canvas.height = hero.naturalHeight

// 1. 히어로 이미지 전체 그리기
ctx.drawImage(hero, 0, 0, hw, hh)

// 2. 로고 크기 계산
lw = Math.round(hw * logoSize / 100)
lh = Math.round(logo.naturalHeight * (lw / logo.naturalWidth))  // 비율 유지

// 3. 로고 위치 계산
lx = logoPos === 'left'  ? Math.round(hw * 0.03)
                         : Math.round(hw * 0.97) - lw
ly = Math.round(hh * 0.03)  // 상단 3% 고정

// 4. 로고 그리기
ctx.drawImage(logo, lx, ly, lw, lh)

// 5. 출력
result = canvas.toDataURL('image/jpeg', 0.95)
```

### 주의사항
- 합성은 **원본 히어로 이미지를 수정하지 않는다** — 새 캔버스에만 합성
- 합성 결과(JPEG base64)가 이후 색상 추출·FINALIZE·슬라이싱의 입력이 됨
- Route 1 에서는 슬라이싱 시점에 합성 (`#heroLogoOverlay` DOM 오버레이는 미리보기 전용 — 내보내기에 포함되지 않음)

### FAIL 조건
- ❌ logo/ 폴더에 파일 있는데 합성 생략
- ❌ 합성 없이 로고 오버레이 DOM을 그대로 HTML에 포함
- ❌ 합성 후 원본 컨텐츠_에셋 로고 파일 삭제/변경

---

## 색상 추출 알고리즘 (app.js `extractColorsFromImage` 완전 동일 적용)

> Route 2(Claude)는 히어로 이미지를 분석해 아래 5단계를 수행한다. 단계 생략 또는 임의 색상 지정 금지.

### 1단계 — 픽셀 파싱 + 평균 밝기
- 이미지를 200×200으로 샘플링
- 전체 픽셀을 RGB → HSL 변환
- 평균 밝기(avgLig) 계산: avgLig > 0.55 이면 `isBrightImage = true`
- 외곽 25% 영역 픽셀은 `isEdge = true` 플래그 (배경색 가중치에 활용)

### 2단계 — BG/AC 버킷 분류 (QSTEP=12, 외곽 픽셀 BG 가중 3배)

| 조건 | isBrightImage=true | isBrightImage=false |
|---|---|---|
| BG 후보 | lig≥0.40, sat≤0.75 | sat≥0.08, lig<0.72 |
| AC 후보 | sat≥0.28, lig 0.22~0.88 | sat≥0.30, lig 0.28~0.85 |
| 순백 제외 | lig>0.97 skip | lig>0.92 skip |

- BG 가중치: `edgeMult = isEdge ? 3 : 1`

### 3단계 — bgColor 결정

- bgEntries 빈도순 정렬 → 1위 색상 원본 추출
- **밝은 이미지**: adjS = min(max(bs,0.35)×1.4, 0.92) / adjL = min(max(bl,0.84), 0.94)
- **어두운 이미지**: adjS = min(bs×1.05, 0.70) / adjL = max(bl×0.95, 0.12)
- 폴백(bgEntries 없음): 밝은→`#f5f0ec` / 어두운→`#1e293b`

### 4단계 — accentColor 결정

- score = sat × (0.4 + hueDiff/180×0.6) × (cnt/topAcCount) → 최고 score 채택
- 폴백1: 전체 픽셀 중 최대 채도 (lig 0.25~0.88)
- 폴백2: BG 색조의 분할보색 `(bgHue+150)%360`, sat=0.65, lig=0.55

### 5단계 — WCAG 4.5:1 대비 보정 + 채도 부스트

- 채도 부스트: `boostedS = min(max(acS, 0.85)×1.18, 0.99)`
- 대비 < 4.5:1 이면 bgIsLight 판별 후 밝기(L)를 ±0.03 step으로 조정
- 대비 충족해도 채도 부스트 적용

---

## 파생 색상 6종 계산 (HTML 생성 전 필수)

bgColor·accentColor 확정 후 아래 7종을 계산해 HTML 색상 변수로 사용. 1순위는 `enforcePaletteHierarchy` (HSL hue-locked), 2순위는 agent 팔레트(있을 때).

```
isDark = bgL < 0.5  // HSL 명도 기준

# 1순위: enforcePaletteHierarchy(bgHex, accentHex) — HSL hue-locked L/S fit
[bgH, bgS, bgL] = hexToHsl(bgHex)
[acH, acS, acL] = hexToHsl(accentHex)

if isDark:
  bg       = hsl(bgH, clamp(bgS,0.30,0.65), clamp(bgL,0.05,0.18))
  surface  = hsl(bgH, clamp(bgS,0.22,0.50), 0.25)
  text     = hsl(bgH, 0.06, 0.96)
  sub      = hsl(bgH, 0.10, 0.72)
  accent   = hsl(acH, clamp(acS,0.60,0.85), clamp(acL,0.50,0.68))
  thBg     = hsl(acH, clamp(acS*0.80, 0.40, 0.70), 0.32)  # 헤더 강조 (accent 톤 dark)
  border   = blendHex(surface, thBg, 0.6)                  # 라인 = thBg 60% over surface (한 톤 패밀리)
else:
  bg       = hsl(bgH, clamp(bgS,0.30,0.55), clamp(bgL,0.92,0.96))
  surface  = hsl(bgH, clamp(bgS,0.20,0.40), 0.97)
  text     = hsl(bgH, 0.20, 0.10)
  sub      = hsl(bgH, 0.18, 0.32)
  accent   = hsl(acH, clamp(acS,0.65,0.85), clamp(acL,0.38,0.55))
  thBgFull = hsl(acH, clamp(acS*0.65, 0.30, 0.55), 0.85)
  thBg     = blendHex(surface, thBgFull, 0.5)              # 헤더 = thBgFull 50% over surface
  thBgDeep = blendHex(thBgFull, text, 0.2)                 # 라인 계산 기준 (헤더보다 약간 짙게)
  border   = blendHex(surface, thBgDeep, 0.6)              # 라인 = thBgDeep 60% over surface

# 모든 테마 공통
mutedColor:
  # bg < muted < surface 위계 — bg 보다 살짝 밝게 (elevation), surface 보다는 어둡게 (less prominent than main cards)
  if isDark: hsl(bgH, bgS, min(0.22, bgL+0.08))   # surface(L 0.25) 와 가깝게 — 너무 강조되지 않도록
  else:      hsl(bgH, bgS, min(0.96, bgL+0.03))   # surface(L 0.97) 보다 어두운 mid 레벨
  # 부가/보조 정보(유의사항·참고) 카드용. text 블렌드 금지 (탁한 회색 발생).
accentTextColor = getLuminance(accentColor)>140 ? '#1a1a1a' : '#ffffff'

# 2순위: agent 팔레트 (Gemini Vision 결과 dataset.agentSurface 등 있을 때)
#   surface/text/sub/border 는 agent 값 사용, thBg = blendHex(bg, accent, 0.25), mutedColor 는 위 공식

blendHex(bg, overlay, alpha):
  각 채널 = round(bg채널×(1-alpha) + overlay채널×alpha)
```

**accent 채도 클램프 (HTML 생성 직전 적용)**:
- accent 채도를 0.45~0.70 범위로 클램프 (원색 방지)
- 밝은 배경(isDark=false)에서 accentLuminance>0.72 이면 밝기를 최대 0.52로 클램프

**accent 미설정 시**: `generatePalette(bgColor)` 자동 생성
- accentH = (bgHue+150)%360, accentS = clamp(0.45~0.65), accentL = dark?0.62:0.42

**색상 역할 고정 (위반 시 FAIL)**:
- `surfaceColor` — 메인 콘텐츠 카드 (bg 보다 elevation)
- `mutedColor` — 유의사항·주의사항·참고·안내 등 부가/보조 정보 카드 (bg 보다 톤다운)
- `thBgColor` — 테이블 헤더 bg (accent 톤)
- `borderColor` — 테이블 행 구분선 (헤더 톤의 60% 강도, 한 톤 패밀리)

---

## FAIL 조건 총정리

| # | 조건 | 조치 |
|---|---|---|
| F1 | 1단계 INGESTION 검증 실패한 채로 2단계 진입 | 즉시 중단 |
| F2 | 체크포인트 통과 없이 다음 단계 자동 진행 | 즉시 중단 |
| F3 | Route 1 에서 자동화 진입 조건 없이 기존 동작 변경 | 즉시 롤백 |
| F4 | Route 2 에서 `rules/*.md` (INDEX 룩업 결과) 위반 | 즉시 재작업 |
| F5 | 두 Route 의 **HTML 본문 포맷**(태그·인라인 스타일·섹션 구조)이 다름 | 즉시 재작업 ※ ZIP 구조·내부 파일명은 Route 별 허용 차이 |
| F6 | 최종 검증 리포트 미출력 후 "완료" 선언 | 즉시 FAIL |
| F7 | 기존 수동 플로우에 회귀 발생 | 즉시 롤백 |
| F8 | 히어로 OK 후 색상 추출 단계 생략하고 HTML 생성 | 즉시 재작업 |
| F9 | 파생 색상 7종(text/sub/surface/border/accentText/thBg/muted) 미계산 후 임의 색상 사용 | 즉시 재작업 |
| F12 | 부가정보(유의사항·참고·안내) 카드를 surfaceColor 로 감쌈 (mutedColor 사용 안 함) | 즉시 재작업 |
| F13 | mutedColor 를 textColor 와 블렌드 (탁한 회색 발생) | 즉시 재작업 — HSL 명도만 조정 |
| F10 | logo/ 폴더에 로고 있는데 히어로 합성 생략 | 즉시 재작업 |
| F11 | 로고 합성 전에 색상 추출 실행 (순서 위반) | 즉시 재작업 |

---

## 연관 계약

- `image_pipeline_contract.md` — 1단계 INGESTION / 3단계 FINALIZE 세부 규칙
- `rules/INDEX.md` + `rules/*.md` — HTML 포맷·팝업·컬러·반응형 규칙 (feature 별 분할, INDEX 룩업)
- `notion_parsing_rules.md` — 노션 입력 파싱 규칙
- `CLAUDE.md` — pre-flight 진입점

---

## 체크리스트 (작업 착수 전)

```
[공통]
□ 4개 규칙 파일 로드: rules/INDEX.md (룩업 후 대상 *.md parallel Read) / parsing / image_pipeline / orchestration
□ Route 판정 완료 (유저 요청 해석)
□ 1단계 INGESTION 완수 + 검증 통과
□ 컨텐츠_에셋 폴더 경로 확인 (기본정보 컨텐츠 에셋 경로 or 로컬 저장 경로/컨텐츠_에셋/)
□ 로컬 저장 경로 확인 (최종 산출물 PROMO_<ts>/ + ZIP)

[Route 1]
□ 세션 브리지 페이로드 구성
□ promo-editor URL + 파라미터 준비
□ 체크포인트마다 UI 응답 수신 확인

[Route 2]
□ IMAGE_MODEL / CONTENT_MODEL 호출 경로 준비
□ 체크포인트마다 채팅 응답 수신 확인
□ rules/INDEX.md 룩업 결과 + 대상 룰 100% 준수
□ 체크포인트 1 OK 후 logo/ 폴더 확인 → 로고 있으면 canvas 합성 (JPEG q0.95)
□ 색상 추출 알고리즘 5단계 수행 (합성된 히어로 이미지 기준)
□ 파생 색상 7종(textColor/subColor/surfaceColor/borderColor/accentTextColor/thBgColor/mutedColor) 계산 완료
□ accent 채도 클램프(0.45~0.70) + 밝은 배경 accentLuminance 보정 적용
□ 확정된 색상 변수 9종으로 HTML 생성 (bg/accent 포함)
□ 카드 bg 선택 — 메인=surfaceColor, 부가정보(유의사항 등)=mutedColor, CTA=accent+bg 틴트

[종료 전]
□ image_pipeline §3.4 검증 리포트 출력
□ orchestration_log.json 저장
□ 회귀 방지 조항 위반 0건 확인
```
