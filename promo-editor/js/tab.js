// promo-editor/js/tab.js — 탭 시스템 처리 (← rules/13-tab.md)
//
// app.js 에서 분리 (Stage 3 — 2026-05-28).
// 포함: convertTabAnchorsForCdn (CDN export 시 <a href="#id"> → <button onclick="scrollIntoView">),
//       fixTabBarOverflow (탭 바 컨테이너 box-sizing 강제).
//
// 의존: getById (utils.js)
//
// 주의: 탭 safety net (unhideTabSections, removeDuplicateTabLabels, unhideTabSectionsOnImport) 은
//       generateContent / loadHtmlFile 내부 IIFE 라 app.js 잔류.

// ────────────────────────────────────────────────────────────────
// convertTabAnchorsForCdn (원본 L5781 → Stage 1,2 후 L5104)
// ────────────────────────────────────────────────────────────────
        // 탭 앵커 <a href="#id"> → <button onclick="scrollIntoView"> 변환 (CDN 게시용)
        // 사이냅에디터가 <a href="#...">에 target="_blank" 추가하여 새창 열림 방지
        function convertTabAnchorsForCdn(html) {
            return html.replace(
                /<a\b([^>]*)href="#([a-zA-Z0-9_-]+)"([^>]*)>([\s\S]*?)<\/a>/gi,
                function(m, before, hash, after, inner) {
                    // 팝업 트리거는 이미 buildInlinePopupHtml에서 처리됨
                    if (/data-popup/i.test(before + after)) return m;
                    // 기존 style 추출 + button 리셋 추가
                    var styleMatch = (before + after).match(/style="([^"]*)"/i);
                    var style = styleMatch ? styleMatch[1] : '';
                    style = style.replace(/text-decoration:\s*[^;]+;?/gi, '');
                    style = 'border:none;cursor:pointer;background:inherit;font:inherit;color:inherit;' + style;
                    // class 추출
                    var classMatch = (before + after).match(/class="([^"]*)"/i);
                    var cls = classMatch ? ' class="' + classMatch[1] + '"' : '';
                    return '<button type="button"' + cls + ' style="' + style + '" onclick="var t=document.getElementById(\'' + hash + '\');if(t)t.scrollIntoView({behavior:\'smooth\',block:\'start\'});">' + inner + '</button>';
                }
            );
        }

// ────────────────────────────────────────────────────────────────
// fixTabBarOverflow (원본 L9780 → Stage 1,2 후 L9091)
// ────────────────────────────────────────────────────────────────
        // [defense 2026-05-21] 탭 바 컨테이너 overflow 방지 — width:100% + padding 좌우 + content-box 기본값
        //   조합에서 실폭이 부모를 뚫고 나가는 버그 (탭 바 우측 잘림 / 가로 스크롤 발생).
        //   감지: scrollIntoView('tab*') onclick 을 가진 button 의 직속 부모 se-div.
        //   처리: box-sizing:border-box 강제 주입. 좌우 padding 은 그대로 둠 (border-box 면 안전).
        function fixTabBarOverflow(root) {
            const rootEl = root || getById('contentArea');
            if (!rootEl) return;
            const tabBars = new Set();
            rootEl.querySelectorAll('button[onclick*="scrollIntoView"], a[href^="#tab"]').forEach(el => {
                const parent = el.parentElement;
                if (parent && parent.classList && parent.classList.contains('se-div')) {
                    // 직속 자식이 모두 탭 버튼/링크인지 확인 (안전 가드 — 일반 본문 div 오인식 방지)
                    const kids = Array.from(parent.children);
                    const allTabish = kids.every(k => {
                        if (k.tagName === 'BUTTON' && /scrollIntoView/.test(k.getAttribute('onclick') || '')) return true;
                        if (k.tagName === 'A' && /^#tab/.test(k.getAttribute('href') || '')) return true;
                        if (k.tagName === 'BR') return true;
                        return false;
                    });
                    if (allTabish && kids.length > 0) tabBars.add(parent);
                }
            });
            tabBars.forEach(bar => {
                const st = bar.getAttribute('style') || '';
                if (/box-sizing\s*:\s*border-box/i.test(st)) return; // 이미 OK
                // box-sizing 항목이 다른 값으로 있으면 교체, 없으면 append
                let newSt = /box-sizing\s*:/i.test(st)
                    ? st.replace(/box-sizing\s*:\s*[^;]+;?/gi, 'box-sizing:border-box;')
                    : (st.replace(/;?\s*$/, '') + ';box-sizing:border-box;');
                newSt = newSt.replace(/;;+/g, ';').replace(/^;+/, '');
                bar.setAttribute('style', newSt);
            });
        }

// ────────────────────────────────────────────────────────────────
// Gemini 출력 / import 후처리 — 탭 safety net (app.js 에서 이전 2026-05-29)
// ────────────────────────────────────────────────────────────────

        // [regression-fix 2026-05-12] 탭 버튼 컨테이너 직후의 라벨 텍스트 중복 제거 (rules/13-tab.md §탭 시스템).
        //   AI 가 탭을 만들고 그 다음에 같은 라벨들을 "A | B | C" 식 텍스트로 한 번 더 출력하는 케이스 정리.
        function removeDuplicateTabLabels(area) {
            area.querySelectorAll('div').forEach(div => {
                const tabBtns = div.querySelectorAll(':scope > button[onclick*="getElementById"], :scope > button[onclick*="scrollIntoView"]');
                if (tabBtns.length < 2) return;
                const labels = Array.from(tabBtns).map(b => (b.textContent || '').trim()).filter(Boolean);
                if (labels.length === 0) return;
                let sib = div.nextElementSibling;
                let checked = 0;
                while (sib && checked < 3) {
                    const text = (sib.textContent || '').replace(/\s+/g, ' ').trim();
                    const allLabelsPresent = labels.every(l => text.includes(l));
                    // 라벨 다 빼고 남는 게 거의 없으면 (구분자만 남으면) 중복 → 제거
                    let residue = text;
                    labels.forEach(l => { residue = residue.split(l).join(''); });
                    residue = residue.replace(/[\s|·•/,.;:]+/g, '');
                    if (allLabelsPresent && residue.length < 5) {
                        const next = sib.nextElementSibling;
                        sib.remove();
                        sib = next;
                    } else {
                        break; // 의미 있는 콘텐츠 나오면 멈춤
                    }
                    checked++;
                }
            });
        }

        // [회귀 방지 2026-05-27] 탭 섹션 hide/show 토글 패턴 강제 무력화 (생성 마지막 방어선).
        //   Gemini 가 종종 탭 섹션에 display:none + tab-content 클래스 + scrollIntoView onclick 조합으로
        //   show/hide 토글 탭 패턴을 출력 → 사용자에겐 1번 탭만 보이고 2~N번 컨텐츠가 통째로 누락된 것처럼 인지됨
        //   (영상/이미지/표 다 들어있어도 숨겨짐). 룰에 명시했지만 모델 변동성 대비 후처리 안전망.
        //   처리: id=tabN se-div 의 display:none/visibility:hidden/opacity:0 인라인 스타일 제거 + tab-content/tab-panel 클래스 strip.
        function unhideTabSections(area) {
            area.querySelectorAll('[id^="tab"]').forEach(el => {
                const id = el.id || '';
                if (!/^tab\d+$/i.test(id)) return; // tab01, tab02 등만 — popup_N 등 다른 id 패턴 보호
                let s = el.getAttribute('style') || '';
                const orig = s;
                s = s.replace(/(?:^|;)\s*display\s*:\s*none\s*;?/gi, ';')
                     .replace(/(?:^|;)\s*visibility\s*:\s*hidden\s*;?/gi, ';')
                     .replace(/(?:^|;)\s*opacity\s*:\s*0\s*;?/gi, ';')
                     .replace(/;;+/g, ';').replace(/^;+/, '').replace(/;+$/, '');
                if (s !== orig) {
                    if (s) el.setAttribute('style', s); else el.removeAttribute('style');
                    console.warn('[tab-safety] unhid tab section', id, '(stripped display:none/visibility:hidden/opacity:0)');
                }
                // tab-content / tab-panel 클래스 제거 (시스템이 hide/show 패턴으로 오인할 여지 차단)
                ['tab-content', 'tab-panel', 'tab-pane'].forEach(c => {
                    if (el.classList.contains(c)) {
                        el.classList.remove(c);
                        console.warn('[tab-safety] stripped class', c, 'from', id);
                    }
                });
            });
        }

        // [회귀 방지 2026-05-27] 재불러오기 시에도 탭 hide/show 패턴 자동 복구.
        //   생성 시 안전망(unhideTabSections)이 잡지 못한 이전 산출물 / 외부 HTML import 케이스 커버.
        function unhideTabSectionsOnImport(ca) {
            ca.querySelectorAll('[id^="tab"]').forEach(el => {
                if (!/^tab\d+$/i.test(el.id || '')) return;
                let s = el.getAttribute('style') || '';
                const orig = s;
                s = s.replace(/(?:^|;)\s*display\s*:\s*none\s*;?/gi, ';')
                     .replace(/(?:^|;)\s*visibility\s*:\s*hidden\s*;?/gi, ';')
                     .replace(/(?:^|;)\s*opacity\s*:\s*0\s*;?/gi, ';')
                     .replace(/;;+/g, ';').replace(/^;+/, '').replace(/;+$/, '');
                if (s !== orig) {
                    if (s) el.setAttribute('style', s); else el.removeAttribute('style');
                    console.warn('[tab-safety:import] unhid', el.id);
                }
                ['tab-content', 'tab-panel', 'tab-pane'].forEach(c => el.classList.remove(c));
            });
        }
