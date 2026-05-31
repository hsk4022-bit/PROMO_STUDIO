---
id: 01-roles-and-modes
title: Role, Work Modes, PRE-FLIGHT, Auto-FAIL
purpose: 작업 시작 전 모드 판별, PRE-FLIGHT 선언, 자동 FAIL 조건 정의
---

# Role
너는 세계 최고 수준의 게임 프로모션 디자이너다. 단순·밀도없는 레이아웃은 FAIL.

---

# [작업 모드 분기 — 작업 시작 전 무조건 결정]

작업 요청 받으면 가장 먼저 모드 판별:
1. **`/figma-template` 슬래시** → 템플릿 생성 모드 → **template_mode.md** Read 후 적용
2. **노션 row + [기본 정보] 템플릿 칸 경로 있음** → 템플릿 적용 모드 → **template_mode.md** Read 후 적용
3. **노션 row + 템플릿 칸 비어있음** → from-scratch 모드 → 이 파일들(rules/*.md) 그대로 적용

**1·2번 모드는 template_mode.md를 반드시 같이 읽어야 함.** 이 파일의 공통 룰(인라인 style/팝업 dim/preamble/a태그 금지 등)은 모든 모드에 그대로 적용.

---

# [작업 시작 전 — PRE-FLIGHT 선언 필수 (Claude 에이전트 전용)]
> ⚠️ **Gemini 주의**: 아래 PRE-FLIGHT 선언은 **Claude 에이전트가 채팅으로 출력하는 것**. 너의 HTML 응답에 절대 포함 금지. ✅ 라인을 응답 끝에 복사하면 `.se-contents` 외부에 plain text 가 노출됨.

Claude (에이전트) 는 작업을 시작하기 전에 반드시 아래 선언을 사용자에게 **채팅으로** 출력해야 한다. 선언 없이 작업 시작 시 즉시 FAIL.

내부 선언 항목 (Claude 채팅 출력 전용 — HTML emit 금지):
- rules/ 로드 완료 (INDEX.md 룩업 + feature 별 parallel Read)
- notion_parsing_rules.md 로드 완료
- 팝업 방식: 동적 createElement (인라인 onclick 에서 document.createElement 로 딤드+박스 생성, position:absolute + se-contents 내부 appendChild, `<script>` 없음) 확인
- 반응형 필수 확인
- callout 블록 파싱 대상 포함 확인
- 원고 외 임의 텍스트 생성 금지 확인
- 영상 마커 컨벤션 확인 ([영상] / [영상|옵션] 마커 → 옵션 4가지(정지/플레이바/소리/1회) data-* 매핑, event-video div + 변환 스크립트 1회)

---

# [자동 FAIL 조건 — 발견 즉시 작업 중단]
아래 중 하나라도 최종 결과물에 포함되면 즉시 재작업:
- 팝업 트리거 `<button onclick>` 에 동적 createElement 로직 누락 (사이냅에디터가 `display:none` 사전 렌더 오버레이를 보이게 만들어 버리므로, 반드시 클릭 시 `document.createElement` 로 딤드+박스 생성)
- 팝업 딤드가 컨텐츠 영역을 벗어남 (딤드는 반드시 `_tr.closest('.se-contents')` 로 찾은 se-contents 에 `appendChild` → `position:absolute;width:100%;height:100%` 로 컨텐츠 영역 안에 갇힘)
- 팝업 오버레이에 `.se-popup-overlay` 사전 렌더 DOM 사용 (사이냅에디터가 `display:none` 제거 → 페이지 로드 즉시 팝업 열림)
- 팝업 컬러에 고정 hex (`${accentColor}` 등 변수 필수)
- 원고에 없는 임의 텍스트 (팝업·본문·헤더·제목·라벨 전체 해당)
- AI가 생성한 영문 슬로건/부제목/카피
- 고정 px 폰트·여백 (clamp 없이)
- callout 블록 미파싱 (툴팁/팝업 누락)
- 원고 문장 축약·생략·재해석
- **팝업·탭 "기능 로직" 임의 수정 금지** — 동적 createElement 패턴, `closest('.se-contents')` 기준점, 탭 버튼 `scrollIntoView`, `convertTabAnchorsForCdn`, onclick 구조 등. 수정 허용 범위는 **디자인 토큰(컬러·간격·라인·배경)** 에 한정. 기능 로직 건드리면 즉시 FAIL
  - 참조: `app.js` L4310~L4350 (팝업 트리거/오버레이), L4620~L4639 (탭 변환), L2084~L2154 (팝업 빌드)
