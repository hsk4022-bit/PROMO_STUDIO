# /html-gen — 프로모션 배치 자동 생성

Notion 대시보드에서 "진행 중" 항목을 전부 감지하고, 히어로 이미지와 HTML을 병렬로 한꺼번에 생성한다.

---

## STEP 1: 진행 중 항목 전체 조회

notion-query-data-sources로 아래 쿼리 실행:
- data_source_url: `collection://${NOTION_DB_ID}`
- query: `SELECT url, 프로모션명, 게임명 FROM "collection://${NOTION_DB_ID}" WHERE 상태 = '진행 중'`

결과가 0건이면 "현재 진행 중인 작업이 없습니다." 출력 후 종료.

결과 목록을 사용자에게 표시:
```
📋 진행 중 작업 N건 감지:
1. [프로모션명] (게임명)
2. [프로모션명] (게임명)
...
▶ 전체 히어로 이미지 병렬 생성을 시작합니다.
```

---

## STEP 2: 필수 가이드 파일 읽기

먼저 `**/promo-editor/rules/INDEX.md` 를 Read 하여 룩업 테이블 확인. 그 다음 컨텐츠를 살펴 매칭되는 rules/*.md 파일들 + 항상 read 파일들을 **단일 메시지 multi-Read** 로 한꺼번에 로드:

- **항상**: `rules/01-roles-and-modes.md`, `rules/02-principles.md`, `rules/03-prohibitions.md`, `rules/04-html-preamble.md`, `rules/05-html-structure.md`, `rules/06-color-system.md`, `rules/07-typography.md`, `rules/08-spacing.md`, `rules/09-section-card.md`, `rules/16-responsive.md`, `rules/99-overrides.md`
- **feature 매칭 시 추가**: 이미지 → 10, 테이블 → 11, 버튼 → 12, 탭 → 13, 팝업 → 14, 영상 → 15
- **추가**: `**/promo-editor/notion_parsing_rules.md`, `**/promo-editor/orchestration_contract.md`

전체 rules/ 통독 금지. INDEX.md 룩업 후 필요한 파일만 parallel Read 가 SSOT.

---

## STEP 3: 히어로 이미지 병렬 생성 (체크포인트 1)

Agent 도구로 각 항목마다 **동시에** 서브에이전트를 실행한다. (단일 메시지에 N개 Agent 호출)

각 서브에이전트가 수행할 작업:
1. notion-fetch로 해당 페이지 읽기 → HERO_SECTION 파싱 (타이틀, 서브타이틀, 에셋, 로고, 디자인 스타일)
2. `**/promo-editor/notion_data.json`에 basicInfo 저장 (게임별로 별도 파일명: `notion_data_{게임명}.json`)
3. `generate_hero.py` 실행하여 히어로 이미지 생성 → `hero_generated_{게임명}.png`
4. 로고 합성 → `hero_with_logo_{게임명}.jpg`
5. 생성된 이미지 파일을 Read 도구로 읽어 채팅창에 인라인 표시

모든 에이전트 완료 후 결과를 한꺼번에 표시:
```
🖼 히어로 이미지 생성 완료:
1. [프로모션명] → hero_with_logo_게임명.jpg [이미지]
2. [프로모션명] → hero_with_logo_게임명.jpg [이미지]
...

✅ 체크포인트 1: 이미지 확인 후 응답해주세요.
- 전체 OK → "ok"
- 특정 항목 재생성 → "1번 재생성" / "2번 수정: [지시사항]"
```

사용자 응답 대기. 재생성/수정 요청 있으면 해당 항목만 다시 처리 후 재표시.

---

## STEP 4: HTML 병렬 생성 (체크포인트 2)

체크포인트 1 통과 후, Agent 도구로 각 항목마다 **동시에** HTML 생성 서브에이전트 실행.

각 서브에이전트가 수행할 작업:
1. `notion_data_{게임명}.json` 읽기 (색상팔레트, CDN URL, contentData, contentAssets 확인)
2. rules/INDEX.md 룩업 결과 + 매칭 feature 룰 준수해 output_{게임명}.html 생성
3. 생성 완료 보고

모든 에이전트 완료 후:
```
📄 HTML 생성 완료:
1. [프로모션명] → output_게임명.html
2. [프로모션명] → output_게임명.html
...

✅ 체크포인트 2: HTML 확인 후 응답해주세요.
- 전체 OK → "ok"
- 특정 항목 수정 → "1번 수정: [지시사항]"
```

사용자 응답 대기. 수정 요청 있으면 해당 항목만 재생성.

---

## STEP 5: 완료

```
🎉 전체 N건 처리 완료
[프로모션명1] → output_게임명1.html
[프로모션명2] → output_게임명2.html
...
```
