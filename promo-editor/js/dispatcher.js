// promo-editor/js/dispatcher.js — 룰 동적 번들링 (← rules/INDEX.md)
//
// 2026-05-28 재작성: master_guidelines.md build artifact 제거.
//   이전: fetch('./master_guidelines.md') 1회 (1102줄 합본) → split → select → bundle
//   현재: Promise.all 로 rules/*.md 21개 병렬 fetch → 각 파일 frontmatter strip + split
//         → 통합 sections 배열 → select → bundle
//   효과: build-guidelines.sh 불필요, 룰 수정 즉시 반영, SSOT = rules/ 디렉토리만.
//
// 포함:
//   - RULES_FILE_LIST: build-guidelines.sh 의 concat 순서와 동일 (01-20 + 99)
//   - rulesCache: { filename: { text, sections, prelude } }
//   - stripFrontmatter: YAML frontmatter 제거 (build-guidelines.sh 의 awk 동등)
//   - loadAllRules: 페이지 로드 직후 자동 실행 (Promise.all 병렬 fetch)
//   - splitGuidelinesIntoSections, CORE_SECTION_KEYWORDS, FEATURE_DETECTORS,
//     selectRulesForContent: 이전과 동일 (재사용)
//   - buildGuidelineBundle(content): 시그니처 변경 — masterText 인자 제거, rulesCache 에서 읽음
//
// 의존:
// - state.js: masterGuidelineText (legacy 호환 — loadAllRules() 가 자동 채움 → hero-image.js 등 read site 보호)
// - app.js (runtime 호출자): generateContent → buildGuidelineBundle
// - hero-image.js (runtime): masterGuidelineText 직접 read (legacy)

        // ────────────────────────────────────────────────────────────────
        //  rules/*.md 직접 fetch (master_guidelines.md 대체)
        //  build-guidelines.sh 의 concat 순서와 동일 (97-snippets / INDEX / harness / skills 제외, 99 끝에)
        // ────────────────────────────────────────────────────────────────
        const RULES_FILE_LIST = [
            '01-roles-and-modes.md', '02-principles.md', '03-prohibitions.md',
            '04-html-preamble.md', '05-html-structure.md',
            '06-color-system.md', '07-typography.md', '08-spacing.md',
            '09-section-card.md',
            '10-image.md', '11-table.md', '12-button.md',
            '13-tab.md', '14-popup.md', '15-video.md',
            '16-responsive.md', '17-layout-patterns.md', '18-section-grouping.md',
            '19-notion-parsing.md', '20-self-verify.md',
            '99-overrides.md'
        ];

        // build-guidelines.sh 가 master_guidelines.md 첫 줄에 박는 헤더
        const RULES_BUNDLE_HEADER = '[System Prompt: High-End HTML Render Engine v4.0]\n\n';

        // 캐시: { filename: { text: <frontmatter 제거된 본문>, sections: [...], prelude: '...' } }
        const rulesCache = {};

        // YAML frontmatter (---\n...\n---\n) 제거. build-guidelines.sh 의 awk 와 동등.
        function stripFrontmatter(text) {
            return text.replace(/^---\n[\s\S]*?\n---\n+/, '');
        }

        // 페이지 로드 직후 즉시 호출 — Promise.all 로 21개 rules/*.md 병렬 fetch.
        // file:// 환경은 미지원 (HTTP 서버 / GitHub Pages 사용).
        async function loadAllRules() {
            const start = Date.now();
            try {
                const fetched = await Promise.all(
                    RULES_FILE_LIST.map(name =>
                        fetch(`./rules/${name}`)
                            .then(r => r.ok ? r.text() : '')
                            .catch(() => '')
                    )
                );
                let totalChars = 0, ok = 0;
                const concatTexts = [];
                RULES_FILE_LIST.forEach((name, i) => {
                    const raw = fetched[i] || '';
                    if (!raw) {
                        console.warn('[dispatcher] rules/' + name + ' fetch 실패 또는 빈 파일');
                        return;
                    }
                    ok++;
                    const stripped = stripFrontmatter(raw);
                    const parsed = splitGuidelinesIntoSections(stripped);
                    rulesCache[name] = {
                        text: stripped,
                        sections: parsed.sections,
                        prelude: parsed.prelude
                    };
                    totalChars += stripped.length;
                    concatTexts.push(stripped);
                });
                // legacy 호환: hero-image.js 등이 masterGuidelineText 를 직접 read 하므로
                // build-guidelines.sh 출력과 동일한 합본을 채워줌 (read site 코드 변경 불요).
                masterGuidelineText = RULES_BUNDLE_HEADER + concatTexts.join('\n---\n\n');
                console.log('[dispatcher] loaded', ok + '/' + RULES_FILE_LIST.length, 'rules,',
                            (totalChars / 1024).toFixed(1) + 'KB,', (Date.now() - start) + 'ms');
            } catch (e) {
                console.error('[dispatcher] rules fetch 실패:', e.message);
                console.error('  → file:// 로 열었거나 rules/ 디렉토리 접근 불가. HTTP 서버 사용 필요.');
                masterGuidelineText = '';
            }
        }
        // ⚠️ 동적 script 주입 환경에선 DCL 이 이미 발사된 후에 listener 등록되는 경우가 있어
        //    즉시 호출 (Promise 무시 — 사용자가 generate 누를 때까지 fetch 충분히 끝남).
        loadAllRules();

        // ────────────────────────────────────────────────────────────────
        //  Dispatcher — 룰 동적 번들링 (변경 없음, 이전 로직 그대로)
        //  목적: Gemini 가 받는 룰을 컨텐츠 기반으로 축소 → attention 집중 → 룰 준수율 향상.
        //  - core 섹션: 항상 포함 (구조/색/원칙/메타 ─ 모든 컨텐츠 공통)
        //  - feature 섹션: 컨텐츠에 패턴 있을 때만 (영상/탭/팝업/이미지/테이블/버튼)
        // ────────────────────────────────────────────────────────────────
        function splitGuidelinesIntoSections(text) {
            const lines = text.split('\n');
            const sections = [];
            const preludeLines = [];
            let current = null;
            for (const line of lines) {
                const m = /^#\s*\[([^\]]+)\]\s*$/.exec(line);
                if (m) {
                    if (current) sections.push(current);
                    current = { title: m[1].trim(), header: line, body: [] };
                } else if (current) {
                    current.body.push(line);
                } else {
                    preludeLines.push(line);
                }
            }
            if (current) sections.push(current);
            return { prelude: preludeLines.join('\n'), sections };
        }

        // Core: 모든 컨텐츠에 공통으로 필요한 섹션 (제목 substring 매칭)
        const CORE_SECTION_KEYWORDS = [
            '작업 모드', 'PRE-FLIGHT', '자동 FAIL',
            '제0원칙', '제0.5원칙', '구조 우선',
            '절대 금지',
            'HTML preamble', 'HTML 구조',
            '컬러 시스템', '타이포그래피', '간격',
            '섹션 구조',
            '반응형',
            '레이아웃 패턴',
            '에디터 파서',
            '섹션 분리',
            '메타 클리닝',
            '자가 검증',
            '노션 파싱',
        ];

        // Feature: 컨텐츠에 패턴 발견 시 해당 섹션 로드
        const FEATURE_DETECTORS = [
            { sectionKw: '이미지 규칙', regex: /\([\w가-힣_-]+\.(?:png|jpg|jpeg|gif|webp)\)|\(item[_\d]|\(img[_\d]|<img\b|!\[\]/i, name: 'image' },
            { sectionKw: '테이블 규칙', regex: /<table\b|^\s*\|[^|\n]*\|/m, name: 'table' },
            { sectionKw: '버튼', regex: /\[\[?(?:대|중|소)버튼\]\]?/, name: 'button' },
            { sectionKw: '탭 시스템', regex: /\b[Tt]ab\d+\b|\[[Tt]ab\d|href="#tab\d|id="tab\d/, name: 'tab' },
            { sectionKw: '팝업', regex: /\[팝업\d+\]|\[툴팁\d+\]|popup-trigger|data-popup="popup_/, name: 'popup' },
            { sectionKw: '영상', regex: /\[영상[\]\|]|\[루프영상\]|\[루프\]|\[loop\]|\[자동재생\]|event-video|\.(?:mp4|webm|mov)\b|\[\[PROMO_PRESERVE_\d+\]\]/i, name: 'video' },
        ];

        function selectRulesForContent(content, allSections) {
            const includeTitles = new Set();
            for (const sec of allSections) {
                for (const kw of CORE_SECTION_KEYWORDS) {
                    if (sec.title.includes(kw)) { includeTitles.add(sec.title); break; }
                }
            }
            const matchedFeatures = [];
            for (const det of FEATURE_DETECTORS) {
                if (det.regex.test(content || '')) {
                    matchedFeatures.push(det.name);
                    for (const sec of allSections) {
                        if (sec.title.includes(det.sectionKw)) includeTitles.add(sec.title);
                    }
                }
            }
            return { selected: allSections.filter(s => includeTitles.has(s.title)), matchedFeatures };
        }

        // 시그니처 변경: 이전 buildGuidelineBundle(content, masterText) → buildGuidelineBundle(content)
        // rulesCache 에서 직접 읽음 (cross-file masterGuidelineText 의존 제거).
        function buildGuidelineBundle(content) {
            // RULES_FILE_LIST 순서대로 모든 섹션 통합 (build-guidelines.sh 의 concat 순서 보장)
            const allSections = [];
            for (const name of RULES_FILE_LIST) {
                const cached = rulesCache[name];
                if (cached) allSections.push(...cached.sections);
            }
            if (allSections.length === 0) {
                console.warn('[dispatcher] rulesCache 비어있음 — fetch 가 아직 안 끝났거나 모두 실패');
                return '';
            }
            if (!content) {
                // fallback: 전체 룰 번들
                return RULES_BUNDLE_HEADER + allSections.map(s => s.header + '\n' + s.body.join('\n')).join('\n---\n\n');
            }
            try {
                const { selected, matchedFeatures } = selectRulesForContent(content, allSections);
                const bundle = RULES_BUNDLE_HEADER + selected.map(s => s.header + '\n' + s.body.join('\n')).join('\n---\n\n');
                const origLen = allSections.reduce((s, sec) => s + sec.header.length + sec.body.join('\n').length + 1, 0);
                const skipped = allSections.filter(s => !selected.includes(s)).map(s => s.title);
                console.log('[dispatcher] features:', matchedFeatures.length ? matchedFeatures.join(',') : '(core only)');
                console.log('[dispatcher] sections:', selected.length + '/' + allSections.length,
                            '|', (origLen / 1024).toFixed(1) + 'KB →', (bundle.length / 1024).toFixed(1) + 'KB',
                            '(' + Math.round((1 - bundle.length / Math.max(origLen, 1)) * 100) + '% reduction)');
                if (skipped.length) console.log('[dispatcher] skipped:', skipped);
                return bundle;
            } catch (e) {
                console.warn('[dispatcher] failed, fallback to all rules:', e.message);
                return RULES_BUNDLE_HEADER + allSections.map(s => s.header + '\n' + s.body.join('\n')).join('\n---\n\n');
            }
        }
