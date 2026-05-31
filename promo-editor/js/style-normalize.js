// promo-editor/js/style-normalize.js — Gemini 출력 후처리 + 스타일 정규화
//
// app.js 에서 분리 (Stage 10 — FINAL — 2026-05-28). 4 비연속 블록.
// 포함:
//   ① ensureLayoutCompliance (Stage 9 후 L255-386)
//   ② extractStyleFingerprint, expandHexColors, convertRgbToHex, processTooltips
//      (Stage 9 후 L391-461)
//   ③ smartUpdate 클러스터: normSectionText, sectionSimilarity, tagSectionsWithId,
//      hasExistingContent, applySmartUpdate (Stage 9 후 L465-523)
//   ④ wrapBareImageFilenames (Stage 9 후 L529-546)
//
// 의존:
// - state.js: activeLayer, historyStack
// - utils.js: getById
// - color-palette.js: blendHex, getLuminance
// - app.js (runtime): generateContent 가 이 함수들을 inline 호출

// ────────────────────────────────────────────────────────────────
// ① ensureLayoutCompliance (Stage 9 후 L255-386)
// ────────────────────────────────────────────────────────────────
        function ensureLayoutCompliance(html) {
            try {
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                const mwPx = parseInt(getById('pageWidthInput')?.value) || 840;
                // ① .se-contents 에서 width/max-width 제거 (사이냅이 어차피 덮어쓰므로 혼란 방지)
                tmp.querySelectorAll('.se-contents').forEach(sc => {
                    let s = sc.getAttribute('style') || '';
                    s = s.replace(/(?:^|;)\s*(?:max-)?width\s*:[^;]*;?/gi, ';');
                    s = s.replace(/^;+/, '').replace(/;;+/g, ';').replace(/;+$/, '');
                    if (s) sc.setAttribute('style', s); else sc.removeAttribute('style');
                });
                // ② 기존 내부 래퍼 [data-section-id="main"] 있으면 언랩 (옛 구조 정리)
                tmp.querySelectorAll('[data-section-id="main"]').forEach(mainWrap => {
                    const parent = mainWrap.parentNode;
                    if (!parent) return;
                    while (mainWrap.firstChild) parent.insertBefore(mainWrap.firstChild, mainWrap);
                    parent.removeChild(mainWrap);
                });
                // ③ .se-contents 의 직계 자식 se-div 각각에 max-width 강제 주입
                //    사이냅은 .se-contents 클래스만 덮어쓰고 자식 se-div 는 건드리지 않으므로 여기에 박으면 살아남음 (검증됨).
                //    2번 블록(배경 있는 자식) 에는 position:relative 추가 — 팝업 딤드 absolute 기준점.
                tmp.querySelectorAll('.se-contents').forEach(sc => {
                    Array.from(sc.children).forEach(child => {
                        if (!child.classList || !child.classList.contains('se-div')) return;
                        let cs = child.getAttribute('style') || '';
                        const hasBg = /background-color\s*:/i.test(cs);
                        cs = cs
                            .replace(/(?:^|;)\s*width\s*:[^;]*;?/gi, ';')
                            .replace(/(?:^|;)\s*max-width\s*:[^;]*;?/gi, ';')
                            .replace(/(?:^|;)\s*margin\s*:[^;]*;?/gi, ';')
                            .replace(/(?:^|;)\s*box-sizing\s*:[^;]*;?/gi, ';');
                        if (hasBg) cs = cs.replace(/(?:^|;)\s*position\s*:[^;]*;?/gi, ';');
                        cs = cs.replace(/^;+/, '').replace(/;;+/g, ';').replace(/;+$/, '');
                        const INJECT = hasBg
                            ? `position:relative;width:100%;max-width:${mwPx}px;margin:0 auto;box-sizing:border-box;`
                            : `width:100%;max-width:${mwPx}px;margin:0 auto;box-sizing:border-box;`;
                        child.setAttribute('style', INJECT + (cs ? cs + ';' : ''));
                    });
                });
                // ④ 2번 블록(컨텐츠 래퍼) 좌우/상하 패딩 강제 주입
                //    판별 우선순위: (1) background-color 보유한 직계 자식 se-div
                //                   (2) 없으면 직계 자식 se-div 중 "히어로가 아닌" 것 (이미지 하나만 담은 것이 아님)
                const WRAPPER_LR = 'clamp(16px,3.472vw,40px)';
                const WRAPPER_TB = 'clamp(24px,3.472vw,50px)';
                const isHeroBlock = (el) => {
                    // 히어로 판별: 직계에 img 만 있고 텍스트 없음 (또는 line-height:0 + 자식 img)
                    const text = (el.textContent || '').trim();
                    const hasImg = !!el.querySelector('img');
                    return hasImg && !text;
                };
                tmp.querySelectorAll('.se-contents').forEach(sc => {
                    const kids = Array.from(sc.children).filter(c => c.classList && c.classList.contains('se-div'));
                    if (!kids.length) return;
                    // 대상 선정
                    let targets = kids.filter(c => /background-color\s*:/i.test(c.getAttribute('style') || ''));
                    if (!targets.length) {
                        // 배경색 판별 실패 시 — 히어로 아닌 모든 se-div 를 대상으로
                        targets = kids.filter(c => !isHeroBlock(c));
                    }
                    targets.forEach(child => {
                        let s = child.getAttribute('style') || '';
                        s = s.replace(/padding\s*:[^;]*;?/gi, '')
                             .replace(/padding-(?:left|right|top|bottom)\s*:[^;]*;?/gi, '')
                             .replace(/;;+/g, ';')
                             .replace(/;?\s*$/, '');
                        child.setAttribute('style', s + `;padding:${WRAPPER_TB} ${WRAPPER_LR};`);
                    });
                });
                // ⑤ 섹션 카드 LR 패딩 보장 — 카드 내부 텍스트가 카드 가장자리에 붙지 않도록
                //    AI가 padding:TB 0 같은 LR=0 을 박아놓는 경우 LR 최소값 주입.
                const CARD_LR = '2rem';
                tmp.querySelectorAll('.se-contents').forEach(sc => {
                    const kids = Array.from(sc.children).filter(c => c.classList && c.classList.contains('se-div'));
                    let wrappers = kids.filter(c => /background-color\s*:/i.test(c.getAttribute('style') || ''));
                    if (!wrappers.length) wrappers = kids.filter(c => !isHeroBlock(c));
                    wrappers.forEach(wrapper => {
                        wrapper.querySelectorAll('.se-div').forEach(card => {
                            const cs = card.getAttribute('style') || '';
                            // 카드 판별: border/border-radius/background-color 중 하나라도 있음
                            const isCard = /(?:border\s*:|border-radius\s*:|background-color\s*:)/i.test(cs);
                            if (!isCard) return;
                            let ns = cs;
                            // padding:TB LR 형태에서 LR=0 이면 CARD_LR 로 교체
                            ns = ns.replace(/padding\s*:\s*([^;]+);?/gi, (m, val) => {
                                const parts = val.trim().split(/\s+/);
                                if (parts.length === 2 && parts[1] === '0') return `padding:${parts[0]} ${CARD_LR};`;
                                if (parts.length === 3 && parts[1] === '0') return `padding:${parts[0]} ${CARD_LR} ${parts[2]};`;
                                if (parts.length === 4 && parts[1] === '0' && parts[3] === '0') return `padding:${parts[0]} ${CARD_LR} ${parts[2]} ${CARD_LR};`;
                                return m;
                            });
                            // padding-left:0 / padding-right:0 → CARD_LR 로 교체
                            ns = ns.replace(/padding-left\s*:\s*0(?:px|rem|em)?\s*;?/gi, `padding-left:${CARD_LR};`);
                            ns = ns.replace(/padding-right\s*:\s*0(?:px|rem|em)?\s*;?/gi, `padding-right:${CARD_LR};`);
                            ns = ns.replace(/;;+/g, ';').replace(/^;+|;+$/g, '');
                            if (ns !== cs) card.setAttribute('style', ns);
                        });
                    });
                });

                // ⑦ 테이블 자손 텍스트 요소 인라인 color 강제 주입
                //    증상: WYSIWYG 에디터에서는 상속으로 보이지만, 다운로드한 단독 HTML 을 브라우저에서 열면
                //    <td> 안의 <p>/<span> 이 color 상속 안 받고 기본값(#000000)으로 떨어져 어두운 배경에서 안 보임.
                //    해결: th 자손은 ${textColor}(헤더 crisp), td 자손은 ${subColor}(본문 dim — 헤더와 위계 분리).
                //          색 소스는 생성 시점 저장된 bgPicker.dataset 우선, 없으면 picker 값, 최종 폴백.
                try {
                    const _bgp = getById('bgPicker');
                    const _txt = _bgp?.dataset?.text || getById('textPicker')?.value || '#222222';
                    const _sub = _bgp?.dataset?.sub  || _txt;
                    const INJECT_TEXT_TAGS = ['p','span','strong','em','b','i','div','small','mark','u','font'];
                    const injectColor = (cell, colorHex) => {
                        INJECT_TEXT_TAGS.forEach(tag => {
                            cell.querySelectorAll(tag).forEach(el => {
                                // 중첩 테이블 안쪽은 건드리지 않음 (각자 td/th 규칙으로 처리)
                                if (el.closest('table') !== cell.closest('table')) return;
                                const s = el.getAttribute('style') || '';
                                if (/(^|;)\s*color\s*:/i.test(s)) return; // 이미 color 있으면 skip
                                const sep = s && !/;\s*$/.test(s) ? ';' : '';
                                el.setAttribute('style', s + sep + 'color:' + colorHex + ';');
                            });
                        });
                    };
                    // 셀 자체 color 주입 — 라벨 텍스트가 <p>/<span> 래퍼 없이 <td> 직접 텍스트 노드인 경우
                    // (예: "미리보기 N" 영상 그리드 라벨) injectColor 의 자손 스캔이 못 잡아 color:inherit →
                    // standalone HTML 에서 #000 으로 떨어져 어두운 배경에 안 보이던 회귀 차단.
                    const injectCellColor = (cell, colorHex) => {
                        const s = cell.getAttribute('style') || '';
                        const m = s.match(/(^|;)(\s*)color\s*:\s*([^;]+)/i);
                        if (m) {
                            // 명시 color 가 'inherit' 면 테마 색으로 치환 (inherit 이 바로 버그 상태). 그 외 명시색은 존중.
                            if (m[3].trim().toLowerCase() === 'inherit') {
                                cell.setAttribute('style', s.replace(/(^|;)(\s*)color\s*:\s*inherit/i, `$1$2color:${colorHex}`));
                            }
                            return;
                        }
                        const sep = s && !/;\s*$/.test(s) ? ';' : '';
                        cell.setAttribute('style', s + sep + 'color:' + colorHex + ';');
                    };
                    tmp.querySelectorAll('td').forEach(td => { injectCellColor(td, _sub); injectColor(td, _sub); });
                    tmp.querySelectorAll('th').forEach(th => { injectCellColor(th, _txt); injectColor(th, _txt); });
                } catch (e) { console.warn('table color injection fail:', e); }

                return tmp.innerHTML;
            } catch (e) {
                console.warn('ensureLayoutCompliance fail:', e);
                return html;
            }
        }

// ────────────────────────────────────────────────────────────────
// ② style normalize 그룹 (Stage 9 후 L391-461)
// ────────────────────────────────────────────────────────────────
        function extractStyleFingerprint() {
            const area = getById('contentArea');
            if (!area || !area.innerHTML.trim()) return null;

            const html = area.innerHTML;

            const colorSet = new Set();
            const colorPattern = /#[0-9a-fA-F]{6}/g;
            let m;
            while ((m = colorPattern.exec(html)) !== null) colorSet.add(m[0]);
            const rgbaPattern = /rgba?\([^)]+\)/g;
            while ((m = rgbaPattern.exec(html)) !== null) colorSet.add(m[0]);
            const colors = [...colorSet].slice(0, 20);

            const radiusSet = new Set();
            const radiusPattern = /border-radius\s*:\s*([^;]+)/g;
            while ((m = radiusPattern.exec(html)) !== null) radiusSet.add(m[1].trim());

            const paddingSet = new Set();
            const paddingPattern = /padding\s*:\s*([^;]+)/g;
            while ((m = paddingPattern.exec(html)) !== null) paddingSet.add(m[1].trim());

            const fontSet = new Set();
            const fontPattern = /font-size\s*:\s*([^;]+)/g;
            while ((m = fontPattern.exec(html)) !== null) fontSet.add(m[1].trim());

            const weightSet = new Set();
            const weightPattern = /font-weight\s*:\s*([^;]+)/g;
            while ((m = weightPattern.exec(html)) !== null) weightSet.add(m[1].trim());

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const seDivs = doc.querySelectorAll('.se-div');
            const sectionStyles = [];
            seDivs.forEach((div, i) => {
                if (i > 0 && i < 8 && div.getAttribute('style')) {
                    sectionStyles.push(div.getAttribute('style').slice(0, 200));
                }
            });

            return {
                colors: colors.join(', '),
                radii: [...radiusSet].slice(0,8).join(' | '),
                paddings: [...paddingSet].slice(0,6).join(' | '),
                fontSizes: [...fontSet].slice(0,8).join(' | '),
                fontWeights: [...weightSet].slice(0,6).join(' | '),
                sectionCount: seDivs.length,
                sectionStyles: sectionStyles.join('\n'),
            };
        }

        function expandHexColors(html) {
            return html.replace(/([:;"'\s,>])(#[0-9a-fA-F]{3})(?![0-9a-fA-F])/g, function(match, pre, hex) {
                const r = hex[1], g = hex[2], b = hex[3];
                return pre + '#' + r+r + g+g + b+b;
            });
        }

        // 브라우저가 인라인 스타일에서 hex → rgb() 변환한 것을 다시 hex로 복원
        // 사이냅에디터 규칙: rgba() / rgb() 금지, 6자리 hex만 허용
        function convertRgbToHex(html) {
            return html.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/gi, function(m, r, g, b) {
                return '#' + [r, g, b].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
            });
        }

        function processTooltips(html, bgColor) {
            // 툴팁 마커([툴팁N])를 완전 제거 (CSS 값 파괴 방지)
            return html.replace(/\[툴팁\d+\][^\[\]]*?(?=\[툴팁|$)/gi, '')
                       .replace(/\[툴팁\d+\]/gi, '');
        }

// ────────────────────────────────────────────────────────────────
// ③ smartUpdate 클러스터 (Stage 9 후 L465-523)
// ────────────────────────────────────────────────────────────────
        function normSectionText(el) {
            return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        }
        function sectionSimilarity(a, b) {
            const at = normSectionText(a), bt = normSectionText(b);
            if (!at && !bt) return 1;
            if (!at || !bt) return 0;
            const aw = at.split(' ').filter(w => w.length > 1);
            const bSet = new Set(bt.split(' ').filter(w => w.length > 1));
            if (!aw.length || !bSet.size) return 0;
            const hits = aw.filter(w => bSet.has(w)).length;
            return hits / Math.max(aw.length, bSet.size);
        }
        function tagSectionsWithId(area) {
            if (!area) return;
            Array.from(area.querySelectorAll(':scope > *')).forEach((el, i) => {
                if (!el.dataset.sectionId) el.dataset.sectionId = 'sec-' + i;
            });
        }
        function hasExistingContent(area) {
            if (!area) return false;
            return Array.from(area.children).some(
                el => el.id !== 'initialNotice' && (el.textContent || '').trim().length > 20
            );
        }
        // 새 HTML과 기존 DOM을 섹션 단위 비교 — 유사 섹션은 유지, 변경 섹션만 교체
        function applySmartUpdate(newHtml, area) {
            const tmp = document.createElement('div');
            tmp.innerHTML = newHtml;
            const oldSecs = Array.from(area.querySelectorAll(':scope > *'))
                .filter(el => el.id !== 'initialNotice');
            const newSecs = Array.from(tmp.children);
            newSecs.forEach((el, i) => { el.dataset.sectionId = 'sec-' + i; });

            let kept = 0, replaced = 0;
            newSecs.forEach((newSec, i) => {
                const oldSec = oldSecs[i];
                if (!oldSec) {
                    // 새로 추가된 섹션
                    area.appendChild(newSec.cloneNode(true));
                    replaced++;
                    return;
                }
                const sim = sectionSimilarity(oldSec, newSec);
                if (sim >= 0.62) {
                    // 내용 유사 → 기존 섹션 유지 (사용자 이미지·편집 보존)
                    if (!oldSec.dataset.sectionId) oldSec.dataset.sectionId = 'sec-' + i;
                    kept++;
                } else {
                    // 내용 변경 → 새 섹션으로 교체
                    newSec.dataset.sectionId = 'sec-' + i;
                    oldSec.replaceWith(newSec.cloneNode(true));
                    replaced++;
                }
            });
            // 초과 기존 섹션 제거 (새 섹션 수보다 많을 때)
            oldSecs.slice(newSecs.length).forEach(el => el.remove());
            return { kept, replaced };
        }

// ────────────────────────────────────────────────────────────────
// ④ wrapBareImageFilenames (Stage 9 후 L529-546)
// ────────────────────────────────────────────────────────────────
        function wrapBareImageFilenames(text) {
            if (!text) return text;
            // 파일명 패턴: 영/한/숫자/_- 1~40자 + 이미지 확장자
            // 경계: 앞 (문자열 시작 | 공백 | 개행 | 쉼표 | 콜론 | 한글구두점) 중 하나
            //       뒤 (문자열 끝 | 공백 | 개행 | 쉼표 | 마침표 | 콜론 | 한글구두점) 중 하나
            //       단, 앞에 ( [ 나 뒤에 ) ] 있으면 이미 마커이므로 제외
            return text.replace(
                /(^|[\s,:;、。·])([A-Za-z0-9가-힣_\-]{1,40}\.(?:png|jpg|jpeg|gif|webp|svg))(?=$|[\s,.:;、。·])/gmi,
                (m, pre, fn, offset, full) => {
                    // 직전 문자가 ( [ 이거나 직후가 ) ] 이면 이미 감싸져 있음 → 그대로
                    const idx = offset + pre.length;
                    const before = full[idx - 1] || '';
                    const after = full[idx + fn.length] || '';
                    if (before === '(' || before === '[' || after === ')' || after === ']') return m;
                    return `${pre}(${fn})`;
                }
            );
        }

        // ⚠️ AI 가 가이드 예시의 script 본문 또는 깨진 onclick 코드가 텍스트로 노출된 경우 강제 제거
        //   (HTML attribute 파싱 깨짐으로 leak 된 text node 까지 잡기 위해 TreeWalker 사용)
        //   app.js generateContent 에서 이전 (2026-05-29). area = contentArea DOM.
        function stripExposedScriptText(area) {
            const KILL_PATTERNS = [
                /document\.addEventListener.*event-video.*appendChild\(video\)/s,
                /cb\.innerHTML\s*=\s*['"]\\?u2715/,
                /querySelectorAll\(['"]\.event-video['"]\)/,
                /box\.style\s*=\s*['"]position:absolute/,
                /_cont\.appendChild\(d\)/,
                /document\.createElement\(['"]button['"]\)[\s\S]*?box\.appendChild/,
                /var\s+_tr\s*=\s*this/
            ];
            // 1. text node 직접 순회 — attribute 파싱 깨짐으로 leak 된 텍스트 잡기
            const _walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
            const _victims = [];
            let _node;
            while ((_node = _walker.nextNode())) {
                const t = (_node.textContent || '').trim();
                if (t.length < 50) continue;
                if (KILL_PATTERNS.some(p => p.test(t))) _victims.push(_node);
            }
            _victims.forEach(n => n.remove());

            // 2. 자식 없는 요소 textContent 검사 (보조)
            area.querySelectorAll('*').forEach(el => {
                if (el.children.length > 0) return;
                const txt = (el.textContent || '').trim();
                if (txt.length < 50) return;
                if (KILL_PATTERNS.some(p => p.test(txt))) {
                    let target = el;
                    while (target.parentElement
                           && target.parentElement !== area
                           && target.parentElement.children.length === 1
                           && (target.parentElement.textContent || '').trim() === txt) {
                        target = target.parentElement;
                    }
                    target.remove();
                }
            });
        }
