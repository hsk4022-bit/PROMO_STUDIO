---
id: 15-video
title: 영상 (event-video div + 자동 변환 스크립트)
purpose: 루프/플레이어 영상 마커 처리, data-type 판별 우선순위
---

# [영상 — event-video div + 자동 변환 script]

영상이 있는 row는 `<video>` 태그 직접 박지 말고 **placeholder div + 하단 변환 스크립트** 방식 사용 (추가 2026-04-28, 옵션 매핑 갱신 2026-05-19).

## placeholder div 기본 형식

```html
<div class="se-div event-video" data-src="영상주소.mp4"></div>
```

⛔ **wrapper div 에 인라인 style 절대 금지 (위반 시 즉시 FAIL).** 특히 다음 속성을 박으면 안 됨:
- `aspect-ratio:16/9` 등 — 세로 영상(portrait)을 16:9 검은 박스로 잘라버림 → 영상 잘림으로 인지
- `background-color`, `background` — 변환 후 `<video>` 가 자체 #000 배경을 가지므로 중복·충돌
- `position:relative/absolute` — 변환된 video 가 단순 block 으로 배치돼야 함, position 박으면 레이아웃 깨짐
- `border-radius`, `overflow:hidden` — 변환 후 video 가 자체 처리, wrapper 에 박으면 영상이 클립됨
- `isolation:isolate`, `transform`, `height`, `width` 등 모든 시각·레이아웃 속성 일체 금지

✅ wrapper 는 오직 `class="se-div event-video"` + `data-src="..."` + (선택적) `data-stop|data-controls|data-sound|data-once` 만. 시각 스타일은 시스템 변환 스크립트가 처리.

❌ 절대 안 됨:
```html
<div class="se-div event-video" data-src="x.mp4" style="background-color:#000;aspect-ratio:16/9;position:relative;border-radius:0.5rem;overflow:hidden;"></div>
```

✅ 정답:
```html
<div class="se-div event-video" data-src="x.mp4"></div>
```

⛔ **wrapper 안에 절대 다른 자식 요소 (p / div / video / span) 넣지 말 것.** 비어있어야 함 (`<div ...></div>`). 자식 두면 시스템 변환이 nested markup 으로 인식 → 깨진 출력 (literal `&gt;` 텍스트 노출, 영상 중복 등).

옵션을 안 붙이면 **배경 영상형** (기본 동작): autoplay + loop + muted + playsinline, 클릭 시 소리 ON, 플레이바 숨김.

옵션은 `data-stop` / `data-controls` / `data-sound` / `data-once` 4가지를 자유 조합.

## 옵션 4가지 (modifier — 기본 동작에서 빼는 방식)

| 노션 마커 | data-* 속성 | 변환 후 동작 |
|---|---|---|
| (옵션 없음) | (없음) | autoplay + loop + muted, 클릭 시 소리 ON (배경 영상) |
| `[영상\|정지]` | `data-stop` | 자동재생 OFF (사용자 클릭 시 재생) |
| `[영상\|플레이바]` | `data-controls` | 플레이바/볼륨 UI 표시 |
| `[영상\|소리]` | `data-sound` | 소리 ON (muted 제거) |
| `[영상\|1회]` | `data-once` | 1회 재생 후 정지 (loop 제거) |

### 조합 예시

```html
<!-- 기본 (배경 영상) -->
<div class="se-div event-video" data-src="bg.mp4"></div>

<!-- 정지 시작 + 플레이바 (사용자가 직접 클릭하여 재생) -->
<div class="se-div event-video" data-src="tutorial.mp4" data-stop data-controls></div>

<!-- 한 번만 재생 + 플레이바 + 소리 ON -->
<div class="se-div event-video" data-src="trailer.mp4" data-once data-controls data-sound></div>
```

## 변환 스크립트 (HTML 맨 하단, 마지막 닫는 div 바로 직전에 1회만 삽입)

**변형 금지. 그대로 복사:**

```html
<script>
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".event-video").forEach(function (el) {
    var src = el.getAttribute("data-src");
    if (!src) return;
    el.innerHTML = "";

    var hasStop = el.hasAttribute("data-stop");
    var hasControls = el.hasAttribute("data-controls");
    var hasSound = el.hasAttribute("data-sound");
    var hasOnce = el.hasAttribute("data-once");

    // 백워드 호환: data-type="player" → 정지 + 플레이바
    if (el.getAttribute("data-type") === "player") {
      hasStop = true;
      hasControls = true;
    }

    var video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("preload", "metadata");
    video.style.cssText =
      "max-width:100%;height:auto;display:block;margin:0 auto;background:#000;";

    if (!hasStop) video.setAttribute("autoplay", "");
    if (!hasOnce) video.setAttribute("loop", "");
    if (!hasSound) {
      video.setAttribute("muted", "");
      video.muted = true;
      // muted 상태에서 클릭하면 소리 ON
      video.addEventListener("click", function () {
        video.muted = false;
      });
    }
    if (hasControls) video.setAttribute("controls", "");

    var source = document.createElement("source");
    source.setAttribute("src", src);
    source.setAttribute("type", "video/mp4");
    video.appendChild(source);
    el.appendChild(video);
  });
});
</script>
```

## 규칙

- 영상 1개든 여러 개든 변환 스크립트는 **파일 1개당 1번만 삽입** (모든 `.event-video` div 일괄 처리).
- `<script>` 위치는 HTML 맨 하단, 최외곽 닫는 `</div>` 직전 (preamble의 `<style>` 다음 위치 X).
- 영상 div는 본문 어디든 배치 가능 (다른 섹션과 동일한 자리).
- `data-src` 누락 시 스크립트가 자동 무시 (안전).
- `<video>` 태그 직접 박는 방식 금지 — 무조건 `event-video` div 방식.
- 사이즈는 스크립트가 자동 처리 (원본 사이즈 표시, 컨테이너보다 넓으면 비율 유지하며 축소). 별도 사이즈 옵션 없음.

## 영상 소스 처리

`data-src` 값은 소스 형태에 따라 두 가지만 있음. **외부 URL은 다운로드하지 않고 그대로 사용** (이미지 처리와 다름).

| 소스 | INGESTION 처리 | `data-src` 값 |
|---|---|---|
| **외부 URL** (노션 첨부 S3 / CDN 등 절대경로) | 다운로드 안 함, URL 그대로 | 절대 URL (예: `https://vod.example.com/.../02.mp4`) |
| **로컬 폴더 영상** (사용자가 미리 준비) | 컨텐츠_에셋 폴더에서 파일명 매칭 | 로컬 파일명 (예: `event_video1.mp4`) |

### 노션 본문에서의 영상 마커

- `[영상]` 또는 `[영상|옵션...]` 마커 + 바로 아래 줄에 URL/파일명
- callout 안에 동일한 형태도 영상 마커
- 마커 + URL 사이에 다른 블록이 있으면 안 됨
- 상세 파싱 규칙은 `notion_parsing_rules.md` 참조

### ⚠️ 옵션 마커 → data-* 매핑 (절대 누락 금지)

노션 마커의 파이프(`|`) 분리 키워드를 다음과 같이 data-* 속성으로 매핑:

| 노션 옵션 키워드 | HTML data-* 속성 |
|---|---|
| `정지` | `data-stop` |
| `플레이바` | `data-controls` |
| `소리` | `data-sound` |
| `1회` | `data-once` |

옵션이 여러 개면 data-* 속성도 모두 추가 (조합 가능). **노션 마커에 있는 옵션이 HTML에서 빠지면 즉시 FAIL.**

### 작성 예시 (노션 기획서 권장 양식)

```markdown
[영상] https://cdn.example.com/event/intro_loop.mp4
[영상|정지|플레이바] https://vod.example.com/.../gameplay.mp4
[영상|1회|플레이바|소리] event_video1.mp4
```

→ 첫 번째: 배경 영상 (옵션 없음)
→ 두 번째: 정지 시작 + 플레이바
→ 세 번째: 1회 + 플레이바 + 소리 ON (로컬 파일)

### 사용자가 명시 지정 시

사용자가 직접 옵션을 지시한 경우 그 지시 최우선 (마커 자동 판별 무시).

### 마커 보존 룰 (이미지와 동일)

- 노션 영상 마커 N개 = HTML `event-video` div N개. 누락 시 FAIL.
- 노션 옵션 키워드 = HTML data-* 속성 1:1 일치. 옵션 손실 시 FAIL.
- 영상 매칭 결과는 INGESTION 결과 표에 이미지 매칭과 함께 표기.

## 복수 영상 그리드 배치 (추가 2026-05-26)

⚠️ **INGESTION 단계에서 연속 영상 마커는 이미 raw HTML `<table>` 그리드로 변환되어 본문에 들어옴 (2026-05-27 추가).** 본문에서 `<table>` + `<div class="se-div event-video" data-src="...">` 조합 블록을 발견하면:
- ⛔ **1글자도 수정하지 말고 그대로 출력.** style 추가 금지. wrapper 에 aspect-ratio/bg/position 추가 금지. 셀 width/padding 변경 금지. 셀 안 div 에 어떤 자식 요소도 추가 금지.
- 그리드 앞뒤로 `<p style="height:16px;margin:0;"></p>` 간격만 추가 허용.

⚠️ **노션 마커가 같은 줄 (`[영상] https://....mp4`) 이든 다른 줄에 있든 둘 다 INGESTION 이 그리드로 묶음 (2026-05-27 fix).** 마커-URL 사이 거리 200자 이내 + 동일 옵션 + 사이에 다른 컨텐츠 없을 때만.

⚠️ **markdown pipe table 셀 안의 영상 마커도 INGESTION 이 자동으로 event-video div 로 치환 (2026-05-27 fix).** 다음 형태의 셀이 본문에 들어오면 그대로 보존:
```
| 라벨1 | 라벨2 |
|---|---|
| <div class="se-div event-video" data-src="URL_1" data-stop data-controls></div> | <div class="se-div event-video" data-src="URL_2" data-stop data-controls></div> |
```
이 markdown pipe table 은 그대로 두거나 raw HTML `<table>` 로 변환 가능 — 셀 안 event-video div 는 절대 수정 금지 (자식 요소 추가 금지, style 추가 금지, src 변경 금지). 변환 후 HTML 은 [테이블 규칙] 섹션 준수.

평면 시퀀스에서 INGESTION 이 못 잡은 케이스 (callout 옆에 텍스트가 끼어있어 인접성 판정 실패 등) 가 있으면 AI 가 직접 `<table>` 그리드로 묶음:
- 같은 종류의 영상 마커가 **2개 이상 연속**하면 (노션 column_list 안이든 평면 시퀀스든) 무조건 `<table>` 그리드로 좌우 배치. 4개를 세로로 펼치지 말 것 — **사용자 의도는 항상 그리드**.

| 영상 개수 | 그리드 구성 |
|---|---|
| 2 | 1행 2열 |
| 3 | 1행 3열 |
| 4 | 2행 2열 (2x2) |
| 5~6 | 2행 3열 또는 3행 2열 (긴 쪽이 위) |
| 7~ | 2~3열 유지, 행 추가 |

### 기본 그리드 마크업 (2x2 예시)

```html
<div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;display:block;">
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;box-sizing:border-box;margin:0;">
    <tbody>
      <tr>
        <td style="padding:0.5rem;border:0;vertical-align:top;width:50%;box-sizing:border-box;">
          <div class="se-div event-video" data-src="URL_1" data-stop data-controls></div>
        </td>
        <td style="padding:0.5rem;border:0;vertical-align:top;width:50%;box-sizing:border-box;">
          <div class="se-div event-video" data-src="URL_2" data-stop data-controls></div>
        </td>
      </tr>
      <tr>
        <td style="padding:0.5rem;border:0;vertical-align:top;width:50%;box-sizing:border-box;">
          <div class="se-div event-video" data-src="URL_3" data-stop data-controls></div>
        </td>
        <td style="padding:0.5rem;border:0;vertical-align:top;width:50%;box-sizing:border-box;">
          <div class="se-div event-video" data-src="URL_4" data-stop data-controls></div>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### 라벨 헤더가 필요한 경우 (예: "미리보기 1/2/3/4")

라벨 행과 영상 행을 **번갈아** 배치 (라벨 1행 + 영상 1행 + 라벨 1행 + 영상 1행). 영상은 셀 안에 `event-video` div 그대로.

```html
<table style="width:100%;border-collapse:collapse;table-layout:fixed;">
  <tbody>
    <tr><td style="padding:0.75rem;background-color:${surfaceColor};font-weight:800;text-align:center;">미리보기 1</td>
        <td style="padding:0.75rem;background-color:${surfaceColor};font-weight:800;text-align:center;">미리보기 2</td></tr>
    <tr><td style="padding:0.5rem;"><div class="se-div event-video" data-src="URL_1" data-stop data-controls></div></td>
        <td style="padding:0.5rem;"><div class="se-div event-video" data-src="URL_2" data-stop data-controls></div></td></tr>
    <tr><td style="padding:0.75rem;background-color:${surfaceColor};font-weight:800;text-align:center;">미리보기 3</td>
        <td style="padding:0.75rem;background-color:${surfaceColor};font-weight:800;text-align:center;">미리보기 4</td></tr>
    <tr><td style="padding:0.5rem;"><div class="se-div event-video" data-src="URL_3" data-stop data-controls></div></td>
        <td style="padding:0.5rem;"><div class="se-div event-video" data-src="URL_4" data-stop data-controls></div></td></tr>
  </tbody>
</table>
```

### 규칙

- 셀 안 영상은 하단 변환 스크립트가 자동으로 `<video>` 로 변환 (특수 케이스 없음).
- 그리드 `<table>` 자체에는 외곽 `border` 권장 X (영상끼리 시각적으로 분리되도록 셀 padding 만).
- 같은 그리드 안에 영상과 텍스트/이미지를 섞지 말 것. 영상 전용 그리드.
- 라벨 행을 둘 때만 헤더 스타일(`background-color:${surfaceColor}; font-weight:800`)을 라벨 셀에 적용.
- 노션 기획서에 같은 영상 세트가 (1) 평면 콜아웃 + (2) 표 둘 다 작성된 경우, **둘 중 하나만** 출력. 보통 표 쪽이 라벨까지 가지므로 표를 우선 채택, 평면 콜아웃은 dedupe.
