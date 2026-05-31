// promo-editor/js/paste-preprocess.js — paste 입력 정규화 + preserve token 시스템
//
// app.js 에서 분리 (Stage 4 — 2026-05-28).
// 포함:
//   - PROMO_PRESERVE_TOKEN_RE (정규식 상수)
//   - resetPromoPreservedBlocks, registerPromoPreservedBlock, restorePromoPreservedBlocks
//     (preserve token: raw HTML → [[PROMO_PRESERVE_N]] 치환 → 복원)
//   - _stripAsideTags, _normalizePipeTableRows
//   - _convertVideoMarkdownTablesToHtml, _convertInlineVideoMarkersInPipeRows
//   - preprocessPasteContent (사용자 paste 정규화 메인 함수)
//
// 의존:
// - state.js: _promoPreservedBlocks (read/write)
// - video.js: _buildVideoGridHtml (paste preprocess 가 호출 → video.js 가 먼저 로드되어야 함)
// - app.js (runtime): generateContent 가 호출 (사용자 클릭 시점)
//
// 흐름: paste → preprocessPasteContent (정규화 + grid 변환 + preserve token 치환)
//      → generateContent (Gemini API 호출) → restorePromoPreservedBlocks (토큰 → raw HTML 복원)

// ────────────────────────────────────────────────────────────────
// paste 경로 전처리 (Stage 3 후 L482-781)
// ────────────────────────────────────────────────────────────────
        // [2026-05-27] preprocessPasteContent 가 만든 raw HTML 블록을 Gemini 에 보내기 전 placeholder 로
        // 치환하기 위한 module-level storage. generateContent 가 호출 시점에 리셋하고, Gemini 출력 후
        // restoreRawHtmlPlaceholders 가 복원.
        // 회귀 차단 목적: Gemini 가 raw <table> + event-video div 를 rules/15-video.md "preserve verbatim"
        // 룰에도 불구하고 자주 누락 (실측: 4/4 URL 드롭). placeholder 토큰은 그냥 텍스트라 누락 가능성 낮음.
        const PROMO_PRESERVE_TOKEN_RE = /\[\[PROMO_PRESERVE_(\d+)\]\]/g;

        function resetPromoPreservedBlocks() {
            _promoPreservedBlocks = [];
        }

        function registerPromoPreservedBlock(html) {
            const id = _promoPreservedBlocks.length;
            _promoPreservedBlocks.push(html);
            return `[[PROMO_PRESERVE_${id}]]`;
        }

        function restorePromoPreservedBlocks(text, wrapFn) {
            if (!text || !_promoPreservedBlocks.length) return text;
            let restored = 0;
            const out = text.replace(PROMO_PRESERVE_TOKEN_RE, (m, idStr) => {
                const id = parseInt(idStr, 10);
                if (id >= 0 && id < _promoPreservedBlocks.length) {
                    restored++;
                    const html = _promoPreservedBlocks[id];
                    // [2026-05-28] wrapFn 으로 섹션 카드 wrap 등 적용 가능. 색상 의존 wrap 은 generateContent
                    // 에서만 만들 수 있어 여기서 콜백으로 받음.
                    return wrapFn ? wrapFn(html) : html;
                }
                return m;
            });
            if (restored) console.log('[promo-preserve] restored', restored, 'raw HTML block(s) from placeholder tokens');
            // 토큰이 일부 누락된 경우 진단 로그
            const expected = _promoPreservedBlocks.length;
            if (restored < expected) {
                const missing = [];
                for (let i = 0; i < expected; i++) {
                    if (!out.includes(_promoPreservedBlocks[i].slice(0, 80))) missing.push(i);
                }
                if (missing.length) console.warn('[promo-preserve] Gemini dropped placeholder token(s):', missing);
            }
            return out;
        }

        // [2026-05-27 fix] 노션 web copy → paste 시 콜아웃은 `<aside>...</aside>` 로 옴.
        // `<aside>` 태그가 마커-URL 사이에 끼어 연속 그리드 run 판정 실패 → 그리드 안 만들어짐 회귀.
        // 태그만 제거하고 내용은 그대로 둠 (콜아웃 본문은 본문 흐름으로 평탄화).
        function _stripAsideTags(text) {
            const out = text.replace(/<\/?aside[^>]*>/gi, '');
            if (out !== text) {
                const removed = (text.match(/<\/?aside\b/gi) || []).length;
                console.log('[paste-preprocess] stripped', removed, '<aside> tag(s)');
            }
            return out;
        }

        // [2026-05-27 fix] markdown pipe table 의 한 row 가 여러 줄에 걸친 경우
        // (셀 안에 줄바꿈이 있으면 노션이 그렇게 export — `| [영상|정지|플레이바]\nhttps://...mp4 | ... |`).
        // line-by-line 처리는 row 를 못 잡으므로 먼저 continuation 줄을 부모 row 에 머지 (셀 안 \n → 공백).
        // 알고리즘:
        //   1) `|` 로 시작하지만 `|` 로 끝나지 않는 줄 발견 → continuation 시작
        //   2) `|` 로 끝나는 줄이 나올 때까지 다음 줄들 수집 (단, 빈 줄 / 새 `|` 시작 줄 / heading 등을 만나면 중단)
        //   3) 수집된 줄을 trim 후 공백으로 join → 한 줄로 머지
        function _normalizePipeTableRows(text) {
            const lines = text.split('\n');
            const out = [];
            let i = 0;
            let merged = 0;
            while (i < lines.length) {
                const line = lines[i];
                const stripped = line.trim();
                if (stripped.startsWith('|') && !stripped.endsWith('|') && stripped.length > 1) {
                    const collected = [line];
                    let j = i + 1;
                    let closed = false;
                    while (j < lines.length) {
                        const next = lines[j];
                        const nextStripped = next.trim();
                        if (nextStripped === '' || nextStripped.startsWith('|') || nextStripped.startsWith('#')) {
                            break;
                        }
                        collected.push(next);
                        if (nextStripped.endsWith('|')) {
                            closed = true;
                            break;
                        }
                        j++;
                    }
                    if (closed) {
                        out.push(collected.map(s => s.trim()).join(' '));
                        merged += collected.length - 1;
                        i = j + 1;
                        continue;
                    }
                }
                out.push(line);
                i++;
            }
            if (merged) {
                console.log('[paste-preprocess] normalized pipe table:', merged, 'continuation line(s) merged');
            }
            return out.join('\n');
        }

        // [2026-05-27 fix] markdown pipe table 안에 event-video div 가 포함되면
        // 표 전체를 raw HTML `<table>` 로 변환. Gemini 가 markdown 셀 안 raw HTML 을 누락하는
        // 회귀 차단 (=완전 결정론). 4-aside 그리드 경로와 동일한 형태로 통일.
        // 변환 대상: event-video div 포함된 markdown pipe table 블록만. 일반 표는 그대로.
        function _convertVideoMarkdownTablesToHtml(text) {
            const lines = text.split('\n');
            const out = [];
            let i = 0;
            let convertedTables = 0;

            const PIPE_LINE_RE = /^\s*\|.*\|\s*$/;
            const SEP_LINE_RE  = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;

            const splitCells = (line) => {
                let s = line.trim();
                if (s.startsWith('|')) s = s.slice(1);
                if (s.endsWith('|'))   s = s.slice(0, -1);
                // backslash-escaped pipe (`\|`) 는 셀 내부 문자열, 분리자 아님
                const cells = [];
                let buf = '';
                for (let k = 0; k < s.length; k++) {
                    if (s[k] === '\\' && s[k + 1] === '|') { buf += '|'; k++; continue; }
                    if (s[k] === '|') { cells.push(buf.trim()); buf = ''; continue; }
                    buf += s[k];
                }
                cells.push(buf.trim());
                // [2026-05-28 fix] 노션이 bold 라벨을 ** 로 export → ** 잔존 방지.
                //   복원이 markdown strip 단계 이후라 여기서 미리 정리.
                return cells.map(c => c.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, ''));
            };

            while (i < lines.length) {
                if (!PIPE_LINE_RE.test(lines[i])) { out.push(lines[i]); i++; continue; }
                // 표 블록 수집: 연속된 pipe 라인
                let j = i;
                while (j < lines.length && PIPE_LINE_RE.test(lines[j])) j++;
                const block = lines.slice(i, j);
                const hasEventVideo = block.some(L => /event-video/.test(L));
                if (!hasEventVideo) {
                    for (const L of block) out.push(L);
                    i = j;
                    continue;
                }
                // 변환 — 영상 그리드는 header/data 구분 없는 "라벨+영상" 균일 그리드.
                //   [2026-05-30 동기화] build_notion_data.py 의 is_video_grid 헤더 끔(headerless)과 동일.
                //   여기 도달한 표는 전부 event-video 포함(위 hasEventVideo 게이트) → 항상 영상 그리드다.
                //   기존 버그: 첫 라벨행 다음 구분선(|---|)이 있으면 그 행을 헤더로 승격 → font-weight:800 볼드.
                //   결과 "미리보기 1·2"만 볼드, "3·4"는 평문이던 불일치 회귀 차단. 구분선 행은 셀 렌더 제외.
                const parsed = block.map(splitCells);
                const allRows = parsed.filter((_, idx) => !SEP_LINE_RE.test(block[idx]));
                const colCount = Math.max(...parsed.map(r => r.length));

                const html = [];
                html.push('<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;"><tbody>');
                for (const row of allRows) {
                    const padded = row.concat(Array(Math.max(0, colCount - row.length)).fill(''));
                    html.push('<tr>' + padded.map(c =>
                        `<td style="padding:0.375rem;vertical-align:top;width:${(100 / colCount).toFixed(2)}%;box-sizing:border-box;">${c}</td>`
                    ).join('') + '</tr>');
                }
                html.push('</tbody></table>');
                out.push('');
                // [2026-05-27 fix] Gemini 가 raw HTML <table> 을 자주 누락 → placeholder 토큰으로 치환.
                out.push(registerPromoPreservedBlock(html.join('')));
                out.push('');
                convertedTables++;
                i = j;
            }
            if (convertedTables) {
                console.log('[paste-preprocess] markdown table(s) with event-video → raw HTML:', convertedTables);
            }
            return out.join('\n');
        }

        // pipe-row 셀 안 영상 마커 → event-video div 인라인 변환 헬퍼.
        // build_notion_data.py 의 _convert_inline_video_markers_in_pipe_rows 와 동등.
        // table_to_pipe 후 셀 안 \n 이 공백 → 그리드 변환은 pipe row 스킵 → 여기서 셀 단위 인라인 치환.
        // 끝나면 event-video 가 박힌 markdown 표를 raw HTML 로 변환해 Gemini 누락 방지.
        function _convertInlineVideoMarkersInPipeRows(text) {
            const VIDEO_INLINE_RE = /\[영상(?:\|([^\]\n]*))?\][\s\n]{1,40}?(https?:\/\/[^\s\n\)\|\\]+\.(?:mp4|webm|mov)(?:\?[^\s\n\)\|\\]*)?)/gi;
            const PIPE_ROW_SEP_RE = /^\|[\s\|:\-]+\|$/;
            const lines = text.split('\n');
            let converted = 0;
            for (let li = 0; li < lines.length; li++) {
                const stripped = lines[li].trim();
                if (!(stripped.startsWith('|') && stripped.endsWith('|'))) continue;
                if (PIPE_ROW_SEP_RE.test(stripped)) continue;
                if (!lines[li].includes('[영상')) continue;
                lines[li] = lines[li].replace(VIDEO_INLINE_RE, (m, opts, url) => {
                    const attrs = _optsToDataAttrs((opts || '').trim());
                    converted++;
                    return `<div class="se-div event-video" data-src="${url}"${attrs ? ' ' + attrs : ''}></div>`;
                });
            }
            if (converted) {
                console.log('[paste-preprocess] pipe-row inline video → event-video div:', converted, 'cell(s)');
            }
            const merged = lines.join('\n');
            // 셀 단위 변환 완료 후 — event-video 가 박힌 markdown 표 전체를 raw HTML 로 변환
            return _convertVideoMarkdownTablesToHtml(merged);
        }

        function preprocessPasteContent(text) {
            if (!text || typeof text !== 'string') return text;
            try {
                // 0a) [2026-05-27 fix] 노션 web copy 콜아웃은 `<aside>` 로 옴 → 태그만 strip.
                //    태그가 마커-URL 사이에 끼면 그리드 run 판정 실패 → 4개 영상이 세로 적층되는 회귀 차단.
                text = _stripAsideTags(text);

                // 0b) [2026-05-27 fix] markdown pipe table row 가 여러 줄에 걸친 경우 머지 (셀 안 \n → 공백).
                //    노션 표 셀 안에 줄바꿈 있으면 `| [영상|정지|플레이바]\nhttps://...mp4 | ... |` 처럼 paste 됨 →
                //    이를 정상 markdown pipe row 1줄로 정규화해야 셀 단위 영상 변환이 동작.
                text = _normalizePipeTableRows(text);

                // 1) markdown link wrap 정리 — `[text](url)` → url 만 남김 (build_notion_data.py 와 동일)
                //    (사용자가 텍스트는 01.mp4 로 적었어도 href 가 02.mp4 면 02.mp4 로 처리 — 노션 컴포지션 동작)
                text = text.replace(/\[([^\]\n]+?)\]\((https?:\/\/[^\s\)]+)\)/g, (m, t, u) => {
                    return t.trim() === u.trim() ? u : u;
                });

                // 2) 연속 영상 마커 → raw HTML <table> 2x2/2x3 그리드
                //    마커와 URL 사이는 공백/줄바꿈 둘 다 허용 (한 줄에 같이 있어도, 빈 줄 사이에 있어도 잡음).
                //    단 200자 이내로만 (너무 멀면 무관한 마커-URL 매칭 방지).
                const VIDEO_RE = /\[영상(?:\|([^\]\n]*))?\][\s\n]{1,200}?(https?:\/\/[^\s\n\)]+\.(?:mp4|webm|mov)(?:\?[^\s\n\)]*)?)/gi;
                const matches = [...text.matchAll(VIDEO_RE)];
                if (matches.length < 2) {
                    console.log('[paste-preprocess] video markers:', matches.length, '— no grid conversion needed');
                    // pipe-row 셀 안 단일 영상도 변환 필요 → 그리드 스킵해도 셀 변환은 항상 실행
                    return _convertInlineVideoMarkersInPipeRows(text);
                }

                // pipe-row 안 마커 (markdown table 셀) 는 건드리지 않음 — 그건 별도 경로
                function inPipeRow(pos) {
                    const ls = text.lastIndexOf('\n', pos - 1) + 1;
                    let le = text.indexOf('\n', pos);
                    if (le < 0) le = text.length;
                    const line = text.slice(ls, le).trim();
                    return line.startsWith('|') && line.endsWith('|');
                }

                const runs = [];
                let i = 0;
                while (i < matches.length) {
                    if (inPipeRow(matches[i].index)) { i++; continue; }
                    const runStart = i;
                    const optsFirst = (matches[i][1] || '').trim();
                    let j = i + 1;
                    while (j < matches.length) {
                        if (inPipeRow(matches[j].index)) break;
                        const optsJ = (matches[j][1] || '').trim();
                        if (optsJ !== optsFirst) break;
                        const prevEnd = matches[j - 1].index + matches[j - 1][0].length;
                        const gap = text.slice(prevEnd, matches[j].index);
                        if (!/^\s*$/.test(gap)) break;
                        j++;
                    }
                    if (j - runStart >= 2) {
                        runs.push([runStart, j, optsFirst]);
                        i = j;
                    } else {
                        i++;
                    }
                }

                if (!runs.length) {
                    console.log('[paste-preprocess] video markers found but not consecutive — no grid');
                    // 그리드 변환 안 됐어도 pipe-row 셀 안 마커는 여전히 변환 필요
                    return _convertInlineVideoMarkersInPipeRows(text);
                }

                // 뒤에서부터 치환
                let newText = text;
                for (let r = runs.length - 1; r >= 0; r--) {
                    const [runStart, runEnd, opts] = runs[r];
                    const firstM = matches[runStart];
                    const lastM = matches[runEnd - 1];
                    const videos = [];
                    for (let k = runStart; k < runEnd; k++) videos.push([opts, matches[k][2]]);
                    newText = newText.slice(0, firstM.index) + _buildVideoGridHtml(videos) + newText.slice(lastM.index + lastM[0].length);
                }
                console.log('[paste-preprocess] converted', runs.length, 'video grid(s):', runs.map(([s, e]) => (e - s) + '개').join(','));

                // 3) markdown pipe table 셀 안의 영상 마커 → event-video div (build_notion_data.py 와 동등)
                return _convertInlineVideoMarkersInPipeRows(newText);
            } catch (e) {
                console.warn('[paste-preprocess] failed:', e.message);
                return text;
            }
        }

        // ── 문서 구조 결정론 분석 → Gemini 프롬프트용 명시 지시 블록 (2026-05-30) ──
        //   문제: 원고가 `■ 소제목` + `N. 번호 섹션` 두 헤딩 체계를 섞어 쓰면, Gemini 가
        //         시각상 상위처럼 보이는 ■(이벤트 기간/이벤트 내용)에 번호 배지를 매기고
        //         진짜 번호 섹션(1~N)을 그 아래 중첩시키는 계층 오해가 잦음 (rules/18 위반).
        //   해결: 원고 텍스트는 건드리지 않고(컨텐츠 보존), 정규식으로 구조를 결정론 추출해
        //         "이게 배지 섹션, 이건 배지 없는 소제목" 을 명시 enumerate → 프롬프트에 주입.
        //         모델은 일반 룰보다 '구체적으로 나열된 목록' 을 훨씬 잘 따른다.
        //   원고 변형 없음 → INGESTION/preserve 토큰/영상 그리드 등 기존 경로와 충돌 없음.
        function buildStructureDirective(text) {
            if (!text || typeof text !== 'string') return '';
            const lines = text.split('\n');
            const subheadings = [];           // ■ / ▶ 구분 소제목 (배지 금지)
            const sections = [];              // N. 번호 독립 섹션 (배지)
            let tabLabels = [];               // TabNN. 라벨
            for (const raw of lines) {
                const line = raw.trim();
                if (!line) continue;
                // 탭 바 줄: 한 줄에 TabNN. 가 2개 이상
                if ((line.match(/\bTab\d{1,2}\./gi) || []).length >= 2) {
                    tabLabels = line.split('|')
                        .map(s => s.replace(/\bTab\d{1,2}\.\s*/i, '').trim())
                        .filter(Boolean);
                    continue;
                }
                // ■ / ▶ 구분 소제목
                const sub = line.match(/^[■▶]\s*(.+)$/);
                if (sub) { subheadings.push(sub[1].trim()); continue; }
                // N. 번호 섹션 — 줄 시작 "1~2자리 숫자 + 점 + 공백". (1순위/1주차/날짜 등은 점+공백 없어 미매칭)
                const sec = line.match(/^(\d{1,2})\.\s+(\S.*)$/);
                if (sec) { sections.push(sec[2].trim()); continue; }
            }
            if (sections.length === 0) return '';   // 번호 섹션 없으면 지시 불필요
            let out = '【문서 구조 — 결정론 분석 결과. 반드시 이 계층 그대로 구성 (rules/18 §헤딩 유형)】\n';
            if (subheadings.length) {
                out += '· 배지 없는 구분 소제목 (원형 번호 배지 생성 절대 금지): '
                     + subheadings.join(' / ') + '\n';
            }
            out += '· 번호 배지 독립 섹션 카드 — 아래 ' + sections.length + '개가 본문 메인 섹션. '
                 + '각각 형제로 수직 적층(서로 중첩 금지), 배지 번호는 이 순서:\n';
            sections.forEach((t, i) => { out += '    ' + (i + 1) + ') ' + t + '\n'; });
            out += '  ⚠️ 위 소제목(예: 이벤트 기간/이벤트 내용)에는 번호 배지를 매기지 말 것. 배지는 오직 위 ' + sections.length + '개 번호 섹션에만.\n';
            if (tabLabels.length) {
                out += '· 탭 바 [' + tabLabels.join(' | ') + '] — 위 번호 섹션 앞 ' + tabLabels.length
                     + '개로 스크롤하는 앵커. 탭 콘텐츠를 소제목 카드 안에 중첩하지 말 것 (탭 바·섹션은 형제).\n';
            }
            return out;
        }
