---
id: 14-popup
title: 팝업 (동적 createElement + se-contents appendChild)
purpose: 팝업 트리거 onclick 로직, 딤드 경계, 박스 스타일, FAIL 조건, 자가 검증
---

# [팝업 — 동적 createElement + se-contents 내부 appendChild]
**팝업은 반드시 동적 createElement 방식을 따른다.** 사이냅에디터는 `display:none` 인라인 스타일을 제거하거나 숨김 오버레이 DOM 을 보이게 만들어 버리므로, 사전 렌더 `.se-popup-overlay` 방식 금지. `:target`, 체크박스 해킹 금지.

## ⛔ 절대 금지 — 팝업 콘텐츠 배치 (위반 시 즉시 FAIL · 결과물 전체 폐기)

다음 4가지 패턴 중 하나라도 발견 시 즉시 재작업. 변명 없음.

### FAIL-1. `<button>` 태그 내부에 콘텐츠 직접 박기 금지
- ❌ 금지: `<button class="popup-trigger" data-popup="popup_N" ...><table>...</table><p>...</p></button>`
- ✅ 정답: `<button class="popup-trigger" data-popup="popup_N" style="..." onclick="...createElement 로직, box.innerHTML='&lt;table&gt;...&lt;/table&gt;'...">+</button>`
- **button 의 textContent 는 단 한 글자 `+` 만 허용**. 그 외 텍스트 / `<table>` / `<div>` / `<p>` / `<img>` 자식 요소 일체 금지.
- 팝업 콘텐츠는 **onclick 속성 값 안에 escape 된 문자열로** 직렬화하거나, 별도 `se-popup-content` 블록 안에만.

### FAIL-2. `.se-contents` 외부에 콘텐츠 떨어뜨리기 금지
- ❌ 금지: `<div class="se-contents">...본문...</div>\n<table>...</table>` (se-contents 닫힘 뒤에 콘텐츠 떨어짐)
- ✅ 정답: 모든 콘텐츠는 반드시 `.se-contents` 안. 유일한 예외는 `se-popup-content` 블록 (data-popup 속성 + display:none 보유).
- `.se-contents` 닫는 `</div>` 이후에는 `<div class="se-div se-popup-content" data-popup="popup_N" style="display:none;...">팝업 콘텐츠</div>` 형태만 허용.

### FAIL-3. 본문 영역에 popup-only 콘텐츠 노출 금지
- ❌ 금지: section card 안에 popup_N 트리거 버튼이 있고, 그 popup_N 의 콘텐츠가 별도 카드 / 테이블로 본문에도 노출됨 (동일 데이터 본문 + 팝업 양쪽 보임)
- ✅ 정답: 트리거 옆 본문에는 popup 콘텐츠 노출 0. popup 콘텐츠는 onclick 직렬화 또는 se-popup-content 블록에만.
- **본문 데이터와 popup 데이터가 동일 (예: 본문에 요약 표, 팝업에 같은 표 풀버전)** 일 때만 양쪽 보존 허용. 명시적 의도 있을 때만.

### FAIL-4. `[팝업N]` 마커만 emit 하고 콘텐츠 누락 금지
- ❌ 금지: `[팝업N]` 마커 → button 으로 변환 → onclick / se-popup-content 둘 다 없음. 클릭해도 아무것도 안 열림.
- ✅ 정답: `[팝업N]` 마커가 있으면 반드시 (a) onclick 속성에 콘텐츠 직렬화 OR (b) se-popup-content 블록 둘 중 하나는 채움.
- **콘텐츠 출처**: 원고에서 `[팝업N]` 콜아웃/섹션 안의 텍스트·표·이미지를 추출. 원고에 없으면 popup 생성 자체를 금지 (트리거도 만들지 말 것).

### FAIL-5. 팝업 박스 배경색 ≠ 2번 블록 배경색 (${bgColor})
- ❌ 금지: 본문 2번 블록은 `background-color:#110909` (다크 ${bgColor}) 인데 popup-trigger onclick 의 `box.style` 은 `background-color:#f9f3eb` (크림) 처럼 **다른 hex** 사용. 팝업 콘텐츠는 본문용 색(`color:#f5f4f4` 흰색)을 그대로 직렬화하므로, 박스 bg 가 본문 bg 와 다르면 **흰 텍스트 × 크림 박스 = invisible** 같은 가독성 붕괴 발생.
- ✅ 정답: 모든 popup-trigger onclick 안의 `box.style background-color` = 2번 블록 `background-color` = 정확히 동일 hex 의 ${bgColor}. 박스가 본문과 같은 캔버스 위에 떠 있는 느낌 (마스터 가이드라인 L528, L561 의 원칙 강제).
- **변형 금지**: 박스 bg 만 따로 라이트(`#f9f3eb` / `#ffffff` 등) 로 바꿔서 "본문은 다크인데 팝업은 라이트" 만들면 즉시 FAIL. 본문이 다크면 팝업도 다크. 본문이 라이트면 팝업도 라이트.
- **자가 검증**: 본문 2번 블록 `background-color` hex 1개 추출 → 모든 popup-trigger onclick 의 `box.style background-color` hex 와 정확히 일치하는지 비교. 1개라도 다르면 즉시 FAIL.

### 검증 (Claude 에이전트 내부 점검용 — HTML 응답 본문에 절대 포함 금지)
> ⚠️ **Gemini 주의**: 아래 체크 항목은 **HTML 출력에 포함하지 말 것**. 너의 응답은 순수 HTML 만. 이 ✅ 라인을 응답 끝에 복사해 붙이면 `.se-contents` 외부에 plain text 가 노출되어 FAIL-2 자체를 위반함.
> Claude (에이전트) 만 채팅 메시지로 출력. (참고: `20-self-verify.md` 의 "사용자에게는 절대 출력 금지" 와 일치)

내부 점검 항목 (텍스트 emit 금지):
- FAIL-1 무위반: button 내부에 자식 요소 0개, textContent = '+'
- FAIL-2 무위반: .se-contents 외부 콘텐츠 = 0 (se-popup-content 블록만 예외)
- FAIL-3 무위반: 본문에 popup 전용 콘텐츠 노출 0
- FAIL-4 무위반: 모든 popup-trigger 가 onclick 또는 se-popup-content 보유
- FAIL-5 무위반: 모든 popup-trigger box.style background-color = 2번 블록 background-color (동일 hex)

## 핵심 원칙
- **팝업 DOM 은 페이지 로드 시 존재하지 않는다.** 트리거 클릭 순간 `document.createElement` 로 딤드(2개) + 박스 + 닫기 버튼을 생성한다.
- **딤드 오버레이는 2개 생성 (변경 2026-04-28)**:
  - **딤드 #1** → 1번 블록(히어로 이미지)에 `appendChild` — 캐릭터 이미지 영역 덮음.
  - **딤드 #2** → 2번 블록(컨텐츠)에 `appendChild` — 컨텐츠 영역 덮음.
  - 둘 다 `position:absolute` + `top:0;left:0;width:100%;height:100%` + 동일 색상/투명도 (시각적으로 하나의 연속된 dim 처럼 보이게).
  - 팝업 박스 본체와 닫기 버튼은 **2번 블록에만 appendChild** (이전과 동일). 1번 블록에는 dim만.
- **컨테이너 탐색 (양쪽 모두 필요)**:
  - 2번 블록(컨텐츠): `_tr.closest('div[style*=max-width]')` — 트리거의 직접 조상.
  - 1번 블록(이미지): 위에서 찾은 2번 블록의 `previousElementSibling` 중 `style*=max-width` 매칭하는 se-div. 없으면 1번 블록 dim 생략 (이미지 없는 row).
  - **⚠️ `closest('.se-contents')` 단독 사용 금지.** 사이냅 에디터는 게시 시 우리 원본 `.se-contents` 를 `se-div` 로 바꾸고 외부에 자체 `.se-contents` (role=textbox, max-width 없음) 를 감싸기 때문에 잘못된 컨테이너를 잡게 됨.
- 컨테이너가 `position:static` 이면 onclick 에서 `position:relative` 로 강제 주입 (1번·2번 블록 둘 다).
- **닫는 방법은 3가지 — 모두 동일한 cleanup (dim #1, dim #2, 박스 3개 일괄 `remove()`) 수행**:
  1. **닫기 버튼 클릭** — 박스 상단/우측의 X 버튼 onclick → 3개 모두 remove
  2. **dim 클릭** — dim #1 또는 dim #2 onclick (이벤트 버블링 방지) → 3개 모두 remove
  3. **트리거 재클릭** — 트리거 onclick 첫 줄에서 `document.getElementById(lid_box)` 조회 → 존재하면 3개 remove + return
- 3개 element 추적 방법: 동일 prefix ID (`pop_N_dim1`, `pop_N_dim2`, `pop_N_box`) 부여 후 cleanup 시 일괄 조회. 또는 공통 `data-popup-id` 속성 + `querySelectorAll('[data-popup-id="pop_N"]')` 로 일괄 remove.
- **JS `<script>` 블록 사용 금지.** 모든 로직은 트리거 버튼/닫기 버튼/dim 인라인 `onclick` 속성 안에 직렬화.

## 2-부분 구조 (무조건)
1. **트리거 버튼** — `<button class="popup-trigger" data-popup="popup_N" onclick="...">+</button>` 본문 안에 배치. onclick 안에 팝업 생성 전체 로직 포함 (딤드 div 생성 → 박스 div 생성 → 닫기 버튼 생성 → `_tr.closest('.se-contents')` 에 붙이기).
2. **숨김 데이터 블록 (선택)** — `index_불러오기용.html` 에 한해 `<div class="se-div se-popup-content" data-popup="popup_N" style="display:none;...">` 추가. re-import 시 promo-editor 가 팝업 패널로 자동 복원하기 위한 전용 데이터. CDN 내보내기에는 **불포함**.

**내보내기 포맷별 팝업 처리 (전부 동일한 동적 createElement 방식):**
- `index_불러오기용.html` — 트리거 `<button onclick>` (동적 createElement 로직) + `.se-popup-content` (재불러오기 전용). `<script>` 불필요.
- `index_cdn.html` (SynapEditor 배포용) — 트리거 `<button onclick>` 만. `.se-popup-content` 제거. `<script>` 불필요.
- 미리보기 (iframe) — CDN 과 동일 onclick.
- `PROMO_SLICED/index_NN.html` 슬라이스 HTML — 슬라이스 이미지 위의 트리거 버튼 + 동적 createElement. 사전 렌더 `<div id="pop_N">` 없음. 최외곽 `<div style="max-width:${mw}px;...position:relative;">` 가 컨테이너 역할. **팝업 콘텐츠는 이미 이미지로 캡처된 `<img>`** (`popupImagePaths[panel.id]`) 이므로 `buildPopupTriggerOnclick` 에 폰트 옵션 주입 불필요.

**한 가지 방식만 허용:** 모든 내보내기 경로에서 동일한 동적 createElement 패턴을 쓴다. 사전 렌더 `<div id="pop_N" class="evt_pop" style="display:none">` + `document.querySelector().style.display` 토글 방식은 **모든 경로에서 금지** (사이냅이 `display:none` 제거 시 페이지 로드 즉시 팝업 열리는 문제 + 맥락 간 불일치 유발).

---

## 트리거 버튼 onclick 로직 (전 경로 공통, 무조건)
- 원고 `[팝업N]` 마커 위치에 `<button class="popup-trigger" data-popup="popup_N" onclick="...">+</button>` 삽입.
- onclick 내부 로직 (인용부호는 outer `"` / inner `'` / HTML escape `&quot;` 로 처리):
  ```javascript
  var lid='__popup_popup_N__';
  var ex=document.getElementById(lid);if(ex){ex.remove();return;}
  var _tr=this;
  // ⚠️ 사이냅은 게시 시 우리 .se-contents 를 se-div 로 바꾸고 외부에 자체 .se-contents(role=textbox, max-width 없음)를 감싼다.
  // 따라서 closest('.se-contents')는 max-width 없는 사이냅 컨테이너를 잡게 되므로 금지.
  // 반드시 max-width 인라인 스타일을 가진 se-div (2번 블록) 로 탐색.
  var _cont=_tr.closest('div[style*=max-width]');
  if(!_cont){var _sc=_tr.closest('.se-contents');_cont=(_sc&&_sc.querySelector('div[style*=max-width]'))||_sc||document.querySelector('div[style*=max-width]')||document.body;}
  var _cs=window.getComputedStyle(_cont);
  if(_cs.position==='static')_cont.style.position='relative';
  var d=document.createElement('div');d.id=lid;
  d.style='position:absolute;top:0;left:0;width:100%;height:100%;background-color:#000000B8;z-index:3;box-sizing:border-box;';
  d.onclick=function(ev){if(ev.target===d)d.remove();};
  var box=document.createElement('div');
  // ⚠️ 박스는 bgColor 배경 + border-radius 필수 (딤드 위에서 가독성 확보).
  //    본문과 같은 bgColor 를 박스에 명시 → 딤드 투과로 어두워지지 않고 카드로 인지됨.
  //    padding 은 4면 전부 — 상단은 닫기 버튼용 거터, 좌우/하단은 컨텐츠 여백.
  box.style='position:absolute;left:5%;width:90%;max-height:70vh;overflow-y:auto;padding:2.25rem 1.5rem 1.5rem 1.5rem;background-color:${bgColor};border-radius:0.875rem;color:${textColor};font-size:inherit;line-height:inherit;letter-spacing:inherit;box-sizing:border-box;-webkit-overflow-scrolling:touch;';
  box.innerHTML='<팝업 콘텐츠 HTML 이스케이프>';
  var cb=document.createElement('button');cb.type='button';cb.innerHTML='\u2715';
  cb.style='position:absolute;top:0.5rem;right:0.5rem;background-color:${accentColor};color:${accentTextColor};border:none;border-radius:50%;width:1.75rem;height:1.75rem;font-size:0.875rem;font-weight:900;cursor:pointer;line-height:1;z-index:10;display:inline-flex;align-items:center;justify-content:center;';
  cb.onclick=function(ev){ev.stopPropagation();d.remove();};
  box.appendChild(cb);d.appendChild(box);_cont.appendChild(d);
  // 박스 세로 위치: appendChild 후 offsetHeight 실측 → "+ 버튼 바로 위 12px gap" 배치 + se-contents 경계 Math.max/min 클램프.
  // ⚠️ appendChild 이전에 offsetHeight 측정 불가 — 반드시 DOM 부착 후 계산.
  var _br=_tr.getBoundingClientRect(),_cr=_cont.getBoundingClientRect();
  var _trTop=_br.top-_cr.top+_cont.scrollTop;
  var _bh=box.offsetHeight,_ch=_cont.offsetHeight;
  var _fy=Math.max(0,Math.min(_ch-_bh,_trTop-_bh-12));
  box.style.top=_fy+'px';
  ```
- 트리거 버튼 스타일 (인라인):
  ```
  display:inline-flex;align-items:center;justify-content:center;
  width:1.375rem;height:1.375rem;border-radius:50%;
  background-color:${accentColor};color:#ffffff;
  font-size:0.75rem;font-weight:900;border:none;cursor:pointer;
  vertical-align:middle;margin:0 0.25rem;line-height:1;
  ```
- 색상은 `${accentColor}` `${surfaceColor}` `${textColor}` 변수로만. 고정 hex 금지.
- `<a href="#popup-N">`, `<label for>`, `<input type="checkbox">` 사용 금지.
- [툴팁N] 마커 사용 금지. 반드시 [팝업N]으로 대체.

## 딤드 경계 (무조건)
- 딤드 div 는 반드시 `position:absolute` + `top:0;left:0;width:100%;height:100%` 로 **`.se-contents` 의 컨텐츠 박스 내부**에만 드리워진다.
- 붙이는 곳: `_tr.closest('.se-contents').appendChild(d)` — body 가 아니라 se-contents. 따라서 se-contents 의 `max-width:52.5rem` + `position:relative` 덕분에 딤드가 자동으로 컨텐츠 영역에 갇힘 → 사이트 GNB/헤더/좌우 영역 자연스럽게 안 덮음.
- se-contents `position:static` 이면 onclick 에서 `position:relative` 강제 주입 (fallback).
- z-index: `3` (헤더보다 낮게). body append 방식의 `z-index:99999` 금지.

## 박스 (무조건)
- **⚠️ 박스는 카드형 패널.** `background-color:${bgColor}` + `border-radius:0.875rem` 필수. 딤드(반투명 다크) 위에 불투명 bgColor 로 떠올라 가독성 확보. 본문과 같은 bgColor 를 씀으로써 "원래 본문의 일부가 확대되어 보인다"는 인지 부여.
- 포지션: `position:absolute;left:5%;width:90%` (딤드 내부 기준, 컨텐츠 영역의 90% + 좌우 5% 여백).
- 세로 위치: **+ 버튼 바로 위쪽** (12px gap). `top = (triggerRect.top - contRect.top + cont.scrollTop) - box.offsetHeight - 12px`. ⚠️ `appendChild` 이후에 `offsetHeight` 측정 가능 → 반드시 DOM 부착 후 계산. se-contents 경계는 `Math.max(0, Math.min(contHeight - boxHeight, ...))` 로 클램프.
- 높이·스크롤: 박스에 `max-height:70vh;overflow-y:auto` 직접 부여.
- **패딩: `padding:2.25rem 1.5rem 1.5rem 1.5rem` — 상단 거터(닫기 버튼) + 좌우/하단 컨텐츠 여백.** bgColor 배경이 있으므로 패딩 전체가 카드 내부 여백으로 시각 인지됨.
- 폰트: `font-size:inherit;line-height:inherit;letter-spacing:inherit;color:${textColor};` — 본문 `.se-contents` 기본값을 그대로 상속 (팝업 박스가 절대값을 선언해버리면 안쪽 섹션/테이블의 고유 font-size 오버라이드가 본문과 달라져 "팝업 글자만 큼" 현상 발생). font-family 도 .se-contents 에서 상속.
- **닫기 버튼: 박스 상단 거터 내부 우측** (`position:absolute;top:0.5rem;right:0.5rem;width:1.75rem;height:1.75rem;border-radius:50%`). 상단 padding 2.25rem 공간 안에 자연 위치 → 컨텐츠와 겹침 없음. **음수 offset 금지** (박스 경계 잘림).
- border / outline / box-shadow 금지. (**배경색·둥근 모서리는 필수 — 이중 면 아님, 카드형 패널로 의도됨.**)

## 숨김 데이터 블록 (`index_불러오기용.html` 전용)
- 클래스: **`se-div se-popup-content`** (둘 다 필수). `data-popup="popup_N"` 속성 필수.
- 인라인 스타일: `display:none;overflow:hidden;width:0;height:0;margin:0;padding:0;border:none;`
- 위치: `se-contents` 안 어디든 가능.
- **목적**: promo-editor re-import 시 팝업 패널 복원 전용. CDN 내보내기에서는 제거됨.
- 내용: 원고에 있는 텍스트/테이블/이미지를 그대로 삽입. 임의 제목·라벨·헤더 생성 금지.

### ⚠️ 팝업 콘텐츠 placeholder 절대 금지 (위반 시 즉시 FAIL)
원고에 [팝업N] 으로 묶인 영역의 모든 줄·셀·데이터를 **단 한 글자도 빠뜨리지 말고 그대로** se-popup-content div 안에 HTML 로 옮긴다.

❌ **금지 표현 (이런 문자열 emit 즉시 FAIL):**
- "...본문 내용 생략 없이 전체 보존..."
- "...상세 내용..."
- "(상세 데이터 표 형식 유지)"
- "(원고와 동일)"
- "[팝업N의 내용]"
- "..." 만 있는 셀
- "기타 등등", "이하 동일", "etc."
- 원고에 없는 **요약·축약·플레이스홀더·설명문구·메타지시어** 일체

❌ **흔한 실수 패턴:**
- 본문에 같은 표가 있다고 팝업에서 "표 형식 유지" 같은 안내문구로 대체 → FAIL. 본문과 팝업이 같은 데이터여도 **양쪽 모두 풀 데이터로 채워야 함.**
- 행 수가 많다고 첫 1~2행만 쓰고 "..." 처리 → FAIL. 7행이면 7행 다.
- 헤더만 쓰고 데이터 행 생략 → FAIL.

✅ **올바른 처리:** 원고의 [팝업2] 영역에 "월~일 7행 × 3열" 표가 있으면, se-popup-content 안에도 정확히 동일한 7행 × 3열 표를 인라인 스타일까지 풀로 작성. 본문에 이미 같은 표가 있어도 무관 — 팝업 안에 풀 카피본 필수.
- **이미지 마커는 본문/팝업 모두 무조건 모두 반영.** 동일 마커가 본문과 팝업 양쪽에 있으면 양쪽 다 `<img>` 태그로 삽입.
- **팝업 콘텐츠는 본문과 동일한 테마로 작성.** 팝업은 본문과 같은 배경색(`${bgColor}`) 위에 표시되므로:
  - 텍스트 색: 본문과 동일 — `color:${textColor}`
  - 테이블 th 배경: `background-color:${surfaceColor}`
  - 테이블 th 텍스트: `color:${accentColor}`
  - 테이블 td 텍스트: `color:${textColor}`
  - border: `border:1px solid ${borderColor}`
  - 폰트: `font-family:'Pretendard',sans-serif;font-size:clamp(0.875rem,1.702vw,1rem);line-height:1.8;` — **본문과 완전 동일**
  - 최소 폰트 사이즈: **13px 이상** 필수. 팝업 내 모든 텍스트·테이블·라벨에 적용.
  - **핵심 원칙**: 팝업 콘텐츠를 본문에 그대로 붙여넣어도 이질감 없어야 함. 색상·폰트·간격·테이블 스타일 모두 본문 기준 그대로 사용.
- 테이블/이미지의 인라인 style은 본문과 동일한 패턴 사용.

## 스크립트 (무조건 불필요)
- **팝업에 `<script>` 태그 삽입 금지.** 모든 로직은 트리거 버튼 인라인 `onclick` 속성 안에 포함.
- 이유: 사이냅에디터가 `<script>` 태그를 전부 제거함. 인라인 onclick 만 생존.

## 동작 원리
| 요구사항 | 보장 방식 |
|---------|----------|
| 딤드가 사이트 GNB/헤더 덮지 않음 | 딤드를 body 가 아닌 `.se-contents` 에 append + `position:absolute;width:100%;height:100%` → se-contents 의 max-width/position:relative 가 자연 경계 |
| 페이지 로드 시 팝업 안 보임 | 사전 렌더 DOM 없음 (사이냅에디터가 `display:none` 제거해도 문제 없음) |
| 스크롤 점프 없음 | `<button>` + onclick 내부에서 href 변경 없음 |
| 긴 팝업 콘텐츠 스크롤 | 박스 `max-height:70vh;overflow-y:auto` |
| 닫기 버튼 박스 내부 우측 상단 | `position:absolute;top:0.5rem;right:0.5rem` (박스 내부 기준) |
| 배경 클릭 닫기 | 딤드 `onclick = ev => ev.target===d && d.remove()` |
| 동일 트리거 재클릭 시 닫힘 | onclick 첫 줄 `document.getElementById(lid)` 존재 시 `remove()` + return |
| AI 임의 텍스트 금지 | 박스 `innerHTML` 에 원고 콘텐츠만 |
| 색상은 변수 | onclick 내부 style 에 `${accentColor}` `${surfaceColor}` `${textColor}` |

## 절대 금지 (FAIL 조건)
- `:target` 방식 사용 (스크롤 점프 발생)
- `<a href="#popup-N">` 트리거 (URL 변경으로 인한 스크롤)
- 체크박스 해킹 (`<input type="checkbox">` + `<label>`)
- `<style>` 블록 안에 `.popup-trigger` 디자인 정의 (사이냅에서 못 잡음)
- `position:sticky` (Safari 불안정)
- **사전 렌더 `.se-popup-overlay` DOM 사용** (사이냅에디터가 `display:none` 제거 → 페이지 로드 즉시 팝업 열림)
- **팝업 `<script>` 사용** (사이냅이 제거함. 인라인 onclick 만 사용)
- **딤드를 `document.body` 에 append** (사이트 GNB/헤더를 덮어버림 — 반드시 `_tr.closest('.se-contents')` 에 append 하여 컨텐츠 영역 안에 가둠)
- **딤드 `position:fixed` + `z-index:99999` 조합 사용** (사이트 GNB 까지 덮음 — 반드시 `position:absolute` + se-contents 내부 append + `z-index:3` 사용)
- 닫기 버튼 박스 바깥 음수 offset (`top:-0.75rem` 등)
- 박스에 `border` / `outline` / `box-shadow` (배경색·둥근 모서리는 필수이므로 예외)
- 박스에 `background-color` 미지정 (딤드 위에서 어두워져 가독성 파괴 — 반드시 `${bgColor}` 명시)
- 박스에 `border-radius` 미지정 (직각 모서리는 카드 인지 어려움 — 반드시 `0.875rem` 지정)
- 박스 안 임의 헤더 / 제목 / 설명
- 동일 마커 본문/팝업 중 한쪽만 반영하고 한쪽 생략

## 자가 검증 체크리스트 (Claude 에이전트 내부 점검용 — HTML 응답 본문에 절대 포함 금지)
> ⚠️ **Gemini 주의**: 아래 체크 항목은 **HTML 출력에 포함하지 말 것**. 너의 응답은 순수 HTML 만. 이 ✅ 라인을 응답 끝에 복사해 붙이면 `.se-contents` 외부에 plain text 가 노출됨.
> Claude (에이전트) 만 채팅 메시지로 출력.

내부 점검 항목 (텍스트 emit 금지):
- 트리거 = `<button class="popup-trigger" data-popup="popup_N" onclick="...createElement 로직...">` (N개 모두)
- onclick 에 `document.createElement('div')` 딤드 + 박스 + 닫기 버튼 생성 로직 포함
- onclick 첫 줄에 `getElementById` 재클릭 닫힘 가드 포함
- 딤드는 `_tr.closest('.se-contents')` 에 appendChild + `position:absolute;top:0;left:0;width:100%;height:100%` (body append / position:fixed 금지)
- 박스 세로 위치는 + 버튼 위쪽 배치 + se-contents 경계 Math.max/min 클램프 포함
- 사전 렌더 `.se-popup-overlay` DOM 0건
- `<script>` 태그: 영상 변환 스크립트 1개 (event-video div 1개 이상일 때, 파일당 1회) + 슬라이드/갤러리 한정. 그 외 `<script>` 0개
- 영상 마커 누락 0건 — 노션 영상 마커 N개 = event-video div N개 = data-src 채워진 N개
- 영상 옵션 매핑 정확 — 정지→data-stop / 플레이바→data-controls / 소리→data-sound / 1회→data-once (노션 마커 옵션 ↔ HTML data-* 1:1 일치)
- 박스 배경 `${bgColor}` + border-radius:0.875rem 필수 (가독성)
- 박스 배경 hex == 2번 블록 background-color hex (정확히 동일, 본문이 다크면 박스도 다크 / 본문이 라이트면 박스도 라이트)
- `${bgColor}` hue == 히어로 이미지 dominant hue family (히어로 warm 이면 bgColor 도 warm 다크/라이트, near-black `#110909` 같은 hue-less fallback 금지)
- 박스 패딩 2.25rem 1.5rem 1.5rem 1.5rem (상단 닫기 버튼 거터 + 좌우/하단 여백)
- 박스 세로 위치 = (triggerTop - boxHeight - 12px), appendChild 후 offsetHeight 실측
- 박스 컬러는 `${bgColor}` / `${accentColor}` / `${textColor}` 변수 (고정 hex 없음)
- 닫기 버튼 박스 내부 우측 상단 (top:0.5rem; right:0.5rem)
- 박스 border/outline/box-shadow 0건 (bg/radius 는 필수이므로 예외)
- 본문 + 팝업 콘텐츠의 이미지 마커 매칭 = 노션 원본 마커 수
- 모든 섹션 se-div의 border/border-radius/background-color/padding 동일 (일관성)
- 텍스트-배경 대비 확인 (어두운 배경 → 밝은 텍스트 / 밝은 배경 → 어두운 텍스트)
- 팝업 박스 내 모든 텍스트·테이블·폰트가 본문과 동일 테마 (색상·폰트·최소 13px)
