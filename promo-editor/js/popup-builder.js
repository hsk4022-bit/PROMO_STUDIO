// promo-editor/js/popup-builder.js — 팝업 패널 + 트리거 + 빌더 (← rules/14-popup.md)
//
// app.js 에서 분리 (Stage 5 — 2026-05-28). 원본 단일 블록 L3377-4190.
// 포함:
//   - addChildPanel (+ 내부 extractTooltipLabel IIFE), deleteChildPanel,
//   - insertPopupTrigger, processPopupMarkers,
//   - showEditorPopup, closeEditorPopup,
//   - 팝업 트리거 click 이벤트 리스너 (top-level document.addEventListener),
//   - renderChildPanelAsImage (htmlToImage 캡처),
//   - buildPopupTriggerOnclick, buildPopupOverlayHtml, ensureSeContentsRelative,
//   - buildInlinePopupHtml (Gemini 출력 → CDN-호환 사전 렌더 팝업).
//
// 의존:
// - state.js: childPanels, nextPopupId, activeEditorPopup, activeLayer
// - utils.js: getById
// - color-palette.js: getLuminance, blendHex, isDarkColor, getPopupBtnStyle
// - table.js: fixTableThs ★ (addChildPanel 내부에서 호출 → table.js 가 popup-builder.js 보다 먼저 로드 필수)
// - app.js (runtime): recordState, showToast, htmlToImage (CDN)
//
// 주의: addChildPanel 안의 extractTooltipLabel IIFE 는 자동으로 따라옴. 팝업 트리거 click 리스너도 그대로.

        // ── 팝업 패널 시스템 ───────────────────────────────────────────────

        function addChildPanel(id, initialHTML) {
            if (!id) id = 'popup_' + (nextPopupId++);
            if (childPanels.find(p => p.id === id)) return id;
            childPanels.push({ id });

            const container = getById('childPanelsContainer');
            if (!container) return id;

            const pageW = parseInt(getById('pageWidthInput')?.value) || 840;
            const childW = Math.min(Math.round(pageW * 0.88), 740);
            const _bgCol  = getById('bgPicker')?.value     || '#1e293b';
            const _acCol  = getById('accentPicker')?.value || '#7c3aed';
            const _isDark = getLuminance(_bgCol) < 128;
            const _headerBg  = blendHex(_bgCol, _isDark ? '#ffffff' : '#000000', 0.06);
            const _borderCol = blendHex(_bgCol, _isDark ? '#ffffff' : '#000000', 0.15);
            const _textCol   = _isDark ? '#e2e8f0' : '#1e293b';
            const num = id.replace('popup_', '');
            const sheet = document.createElement('div');
            sheet.id = 'childSheet_' + id;
            sheet.style.cssText = `width:${childW}px;border-radius:0.75rem;overflow:hidden;`;
            // [2026-05-29] 위지윅 팝업 데이터블록 bg = 저장본 팝업 박스(buildInlinePopupHtml)와 동일 surface 사용.
            //   이전엔 bgPicker.value(bgColor) 사용 → 저장 시 surfaceColor 로 바뀌어 위지윅↔HTML 팝업 색 불일치 회귀.
            const _popBgEl = getById('bgPicker');
            const _popBg = _popBgEl?.dataset?.surface || _popBgEl?.value || '#ffffff';
            const _popText = isDarkColor(_popBg) ? '#f0f0f0' : '#1e293b';
            const _popHeaderBg = isDarkColor(_popBg) ? '#1a1e2e' : '#ffffff';
            sheet.innerHTML = `
                <div id="childPanelHeader_${id}" class="childPanelHeader" style="padding:0.5rem 0.75rem;background:${_popHeaderBg};display:flex;align-items:center;justify-content:space-between;">
                    <span id="childPanelLabel_${id}" contenteditable="plaintext-only" spellcheck="false" style="font-size:0.7rem;font-weight:700;color:${_acCol};letter-spacing:0.05em;outline:none;min-width:2rem;cursor:text;" title="클릭하여 이름 편집">팝업 ${num}</span>
                    <button onclick="deleteChildPanel('${id}')" style="width:1.25rem;height:1.25rem;border-radius:50%;background:${isDarkColor(_popBg)?'#2a2e3e':'#f1f5f9'};color:${isDarkColor(_popBg)?'#94a3b8':'#64748b'};border:1px solid ${isDarkColor(_popBg)?'#374151':'#e2e8f0'};cursor:pointer;font-size:0.65rem;font-weight:900;display:flex;align-items:center;justify-content:center;line-height:1;flex-shrink:0;" title="팝업 삭제">🗑</button>
                </div>
                <div id="childArea_${id}" contenteditable="true" style="outline:none;min-height:5rem;padding:1.25rem 1.5rem;background:${_popBg};font-family:'Pretendard',sans-serif;font-size:clamp(0.875rem,1.702vw,1rem);line-height:1.8;color:${_popText};word-break:keep-all;overflow-wrap:break-word;width:100%;box-sizing:border-box;"></div>`;
            container.appendChild(sheet);

            const wrapper = getById('childPanelsWrapper');
            if (wrapper) {
                wrapper.style.display = 'flex';
                wrapper.style.width = childW + 'px';
            }

            const childArea = getById('childArea_' + id);
            if (initialHTML) {
                childArea.innerHTML = initialHTML;
            } else {
                childArea.innerHTML = `<p id="childPlaceholder_${id}" style="color:#475569;text-align:center;padding:2rem;margin:0;font-size:0.75rem;">팝업 ${num} 내용 입력</p>`;
            }

            // [툴팁N] 레이블 추출 → 패널 헤더에 반영, 컨텐츠에서 제거
            (function extractTooltipLabel() {
                if (!childArea.innerHTML) return;
                // [툴팁N] 또는 [팝업N] 형식 감지 — 공백·추가 문자 허용
                const labelMatch = childArea.innerHTML.match(/\[(툴팁|팝업)\s*(\d+)[^\]]*\]/i);
                if (labelMatch) {
                    const typeStr = labelMatch[1] === '팝업' ? '팝업' : '툴팁';
                    const numStr  = labelMatch[2] || num;
                    const labelEl = getById('childPanelLabel_' + id);
                    if (labelEl) labelEl.textContent = typeStr + ' ' + numStr;
                    childArea.innerHTML = childArea.innerHTML.replace(/\[(툴팁|팝업)\s*\d+[^\]]*\]/gi, '');
                }
                // 재귀적 "실질적 빈 요소" 판별 (빈 span/b/strong 등 포함)
                function isEffEmpty(el) {
                    if (el.textContent.replace(/[\s\u00a0\u200b]/g, '') !== '') return false;
                    return !Array.from(el.childNodes).some(n => {
                        if (n.nodeType !== 1) return false;
                        if (['BR','WBR'].includes(n.tagName)) return false;
                        if (['SPAN','B','STRONG','I','EM','U','S','A','SMALL','MARK'].includes(n.tagName)) return !isEffEmpty(n);
                        return true; // IMG, TABLE 등 실체 요소는 비어있지 않음
                    });
                }
                // 빈 p/div 정리 (재귀 체크 적용)
                childArea.querySelectorAll('p,div').forEach(el => {
                    if (isEffEmpty(el) && !el.querySelector('img,table,video')) el.remove();
                });
                // 테이블 셀 안 빈 인라인 잔여 요소 제거 (span/b 등)
                childArea.querySelectorAll('td,th').forEach(cell => {
                    Array.from(cell.childNodes).forEach(n => {
                        if (n.nodeType === 1 && ['SPAN','B','STRONG','I','EM','U','S'].includes(n.tagName) && isEffEmpty(n)) n.remove();
                    });
                });
            })();

            // 팝업 내 테이블 th → td 정규화 (fixTableThs 적용)
            if (typeof fixTableThs === 'function') fixTableThs(childArea);

            setTimeout(() => sheet.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);

            let childTimer = null;
            childArea.addEventListener('focus', () => { const ph = getById('childPlaceholder_' + id); if (ph) ph.remove(); }, { once: true });
            childArea.addEventListener('paste', e => {
                // 1) HTML 표 붙여넣기 우선 처리 (셀 외부 붙여넣기)
                const htmlDataFirst = e.clipboardData.getData('text/html');
                if (htmlDataFirst && /<table/i.test(htmlDataFirst) && !e.target.closest('td, th')) {
                    e.preventDefault();
                    const ph = getById('childPlaceholder_' + id); if (ph) ph.remove();
                    recordState();
                    const doc2 = new DOMParser().parseFromString(htmlDataFirst, 'text/html');
                    const tbl = doc2.querySelector('table');
                    if (tbl) {
                        tbl.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;';
                        tbl.querySelectorAll('th, td').forEach(cell => {
                            const bgAttr = cell.getAttribute('bgcolor');
                            if (bgAttr) {
                                if (!(cell.getAttribute('style') || '').includes('background-color')) cell.style.backgroundColor = bgAttr;
                                cell.removeAttribute('bgcolor');
                            }
                            cell.removeAttribute('width');
                        });
                        childArea.focus();
                        const sel3 = window.getSelection();
                        const r3 = document.createRange();
                        r3.selectNodeContents(childArea); r3.collapse(false);
                        sel3.removeAllRanges(); sel3.addRange(r3);
                        document.execCommand('insertHTML', false, tbl.outerHTML);
                        setTimeout(() => fixTableThs(childArea), 0);
                        recordState();
                        showToast('표가 팝업에 삽입되었습니다.');
                    }
                    return;
                }
                // 2) 셀 내부 붙여넣기
                const tdTarget = e.target.closest('td, th');
                if (tdTarget && childArea.contains(tdTarget)) {
                    e.preventDefault();
                    const tdHtml = e.clipboardData.getData('text/html');
                    if (tdHtml) {
                        const tmpDoc = new DOMParser().parseFromString(tdHtml, 'text/html');
                        const srcRows = tmpDoc.querySelectorAll('tr');
                        if (srcRows.length > 1) {
                            const table = tdTarget.closest('table');
                            const tbody = table.querySelector('tbody') || table;
                            const allRows = Array.from(tbody.querySelectorAll('tr'));
                            const startRowIdx = allRows.indexOf(tdTarget.closest('tr'));
                            const startColIdx = Array.from(tdTarget.closest('tr').cells).indexOf(tdTarget);
                            recordState();
                            srcRows.forEach((srcRow, ri) => {
                                let targetRow = allRows[startRowIdx + ri];
                                if (!targetRow) {
                                    targetRow = allRows[allRows.length - 1].cloneNode(true);
                                    targetRow.querySelectorAll('td, th').forEach(c => { c.textContent = ''; });
                                    tbody.appendChild(targetRow); allRows.push(targetRow);
                                }
                                Array.from(srcRow.cells).forEach((srcCell, ci) => {
                                    const cell = Array.from(targetRow.cells)[startColIdx + ci];
                                    if (cell) cell.innerHTML = srcCell.innerHTML;
                                });
                            });
                            recordState(); return;
                        } else if (srcRows.length === 1) {
                            const srcTd = tmpDoc.querySelector('td, th');
                            if (srcTd) {
                                if (srcTd.getAttribute('style')) tdTarget.setAttribute('style', srcTd.getAttribute('style'));
                                tdTarget.innerHTML = srcTd.innerHTML;
                                recordState(); return;
                            }
                        }
                    }
                    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                    const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
                    if (rows.length > 1 || rows[0]?.includes('\t')) {
                        const table = tdTarget.closest('table');
                        const tbody = table.querySelector('tbody') || table;
                        const allRows = Array.from(tbody.querySelectorAll('tr'));
                        const startRowIdx = allRows.indexOf(tdTarget.closest('tr'));
                        const startColIdx = Array.from(tdTarget.closest('tr').cells).indexOf(tdTarget);
                        recordState();
                        rows.forEach((row, ri) => {
                            const cols = row.split('\t');
                            let targetRow = allRows[startRowIdx + ri];
                            if (!targetRow) {
                                targetRow = allRows[allRows.length - 1].cloneNode(true);
                                targetRow.querySelectorAll('td, th').forEach(c => { c.textContent = ''; });
                                tbody.appendChild(targetRow); allRows.push(targetRow);
                            }
                            const cells = Array.from(targetRow.cells);
                            cols.forEach((col, ci) => { const cell = cells[startColIdx + ci]; if (cell) cell.textContent = col; });
                        });
                        recordState();
                    } else {
                        const sel = window.getSelection();
                        if (sel.rangeCount) { sel.deleteFromDocument(); sel.getRangeAt(0).insertNode(document.createTextNode(text)); sel.collapseToEnd(); recordState(); }
                    }
                    return;
                }
                // 3) blockClipboard 있으면 HTML로 붙여넣기
                if (blockClipboard) {
                    e.preventDefault();
                    const ph = getById('childPlaceholder_' + id); if (ph) ph.remove();
                    document.execCommand('insertHTML', false, blockClipboard);
                    clearTimeout(childTimer); childTimer = setTimeout(() => recordState(), 800);
                }
            });
            childArea.addEventListener('input', () => {
                const ph = getById('childPlaceholder_' + id); if (ph) ph.remove();
                clearTimeout(childTimer); childTimer = setTimeout(() => recordState(), 800);
            });

            // ── 팝업 패널 이미지 드래그&드롭 (엄마 위지윅과 동일) ──
            // dragstart 차단: contenteditable 내 텍스트/콘텐츠의 네이티브 드래그 방지
            // → 마우스 드래그 중 mousemove 대신 dragstart/drag로 전환되는 문제 해결
            childArea.addEventListener('dragstart', e => { e.preventDefault(); });
            childArea.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); childArea.style.outline = '3px dashed ' + (_acCol || '#7c3aed'); });
            childArea.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
            childArea.addEventListener('dragleave', e => {
                // relatedTarget이 childArea 안에 있는 자식 요소면 dragleave 무시 (false firing 방지)
                if (childArea.contains(e.relatedTarget)) return;
                e.preventDefault(); e.stopPropagation(); childArea.style.outline = '';
            });
            // ── 팝업 패널 테이블 클릭 + 드래그 다중 셀 선택 (contentArea와 동일 방식) ──
            childArea.addEventListener('mousedown', e => {
                const td = e.target.closest('td, th');
                if (!td || !childArea.contains(td)) return;
                const table = td.closest('table');
                if (!table) return;

                // td 안 이미지 클릭 → 테이블 툴바 미표시 (click 핸들러에서 이미지 툴바만 표시)
                if (e.target.tagName === 'IMG') return;

                // preventDefault 없음 → 브라우저 커서 자연 배치 허용
                if (activeLayer) activeLayer.classList.remove('active-layer');
                activeLayer = table;
                table.classList.add('active-layer');
                lastActiveCell = td;
                isSelecting = true;
                selectionStartCell = td;
                clearSelection();
                td.classList.add('selected-cell');
                selectedCells = [td];
                hideImgFloatToolbar();
                setTimeout(() => showTableFloatToolbar(table, td), 0);
            });

            // mouseover 드래그 선택 (contentArea와 동일)
            childArea.addEventListener('mouseover', e => {
                if (!isSelecting || !selectionStartCell) return;
                const td = e.target.closest('td, th');
                if (!td || !childArea.contains(td)) return;
                if (td.closest('table') !== selectionStartCell.closest('table')) return;
                const tbl    = selectionStartCell.closest('table');
                const rows   = Array.from(tbl.rows);
                const startR = selectionStartCell.parentElement.rowIndex;
                const startC = selectionStartCell.cellIndex;
                const endR   = td.parentElement.rowIndex;
                const endC   = td.cellIndex;
                const minR = Math.min(startR, endR), maxR = Math.max(startR, endR);
                const minC = Math.min(startC, endC), maxC = Math.max(startC, endC);
                clearSelection();
                for (let r = minR; r <= maxR; r++) {
                    for (let c = minC; c <= maxC; c++) {
                        const cell = rows[r]?.cells[c];
                        if (cell) { cell.classList.add('selected-cell'); selectedCells.push(cell); }
                    }
                }
                updateTableSelInfo();
                showTableFloatToolbar(tbl, null);
            });

            // ── 팝업 패널 이미지 클릭 → 플로팅 툴바 표시 ──
            childArea.addEventListener('click', e => {
                const img = e.target.closest('img');
                if (!img || !childArea.contains(img)) return;
                // 기존 선택 모두 해제
                document.querySelectorAll('.img-selected').forEach(i => i.classList.remove('img-selected'));
                if (activeLayer) activeLayer.classList.remove('active-layer');
                // 새 이미지 선택
                img.classList.add('img-selected');
                activeLayer = img;
                const imgToolsEl = getById('imgTools');
                if (imgToolsEl) imgToolsEl.style.display = 'flex';
                showImgFloatToolbar(img);
            });

            childArea.addEventListener('drop', e => {
                e.preventDefault(); e.stopPropagation();
                childArea.style.outline = '';
                const files = Array.from(e.dataTransfer.files || []).filter(f => isImageFile(f));
                if (!files.length) return;
                const ph = getById('childPlaceholder_' + id); if (ph) ph.remove();

                // 테이블 셀에 드롭 → 셀에 삽입
                const targetCell = e.target.closest('td, th');
                if (targetCell) {
                    files.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = ev => {
                            const img = document.createElement('img');
                            img.src = ev.target.result;
                            img.style.cssText = 'max-width:100%;height:auto;display:block;margin:0 auto;';
                            targetCell.appendChild(img);
                            clearTimeout(childTimer);
                            childTimer = setTimeout(() => recordState(), 800);
                        };
                        reader.readAsDataURL(file);
                    });
                    showToast('셀에 이미지가 삽입되었습니다.');
                    return;
                }

                // 텍스트 마커 매칭 여부 확인 ((파일명) 또는 [파일명] 패턴)
                const hasMarker = files.some(file => {
                    const base = file.name.replace(/\.[^.]+$/, '');
                    const txt = childArea.innerText || '';
                    return txt.includes(`(${base})`) || txt.includes(`[${base}]`) ||
                           txt.includes(`(${file.name})`) || txt.includes(`[${file.name}]`);
                });

                // 깨진 이미지(상대경로) 존재 여부
                const brokenImgs = Array.from(childArea.querySelectorAll('img[src]')).filter(img => {
                    const s = img.getAttribute('src') || '';
                    return !s.startsWith('data:') && !s.startsWith('http') && !s.startsWith('blob:');
                });

                if (hasMarker || brokenImgs.length > 0) {
                    // 파일명 매칭 모드
                    Promise.all(files.map(file => new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onload = ev => {
                            // 깨진 이미지 src 복원
                            brokenImgs.forEach(img => {
                                const srcFname = (img.getAttribute('src') || '').split('/').pop().split('\\').pop();
                                if (srcFname === file.name) img.src = ev.target.result;
                            });
                            resolve({ fname: file.name, b64: ev.target.result });
                        };
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(file);
                    }))).then(results => {
                        const fileMap = {};
                        results.forEach(r => { if (r) fileMap[r.fname] = r.b64; });
                        const matched = runMatchWithFiles(fileMap);
                        recordState();
                        showToast(matched > 0 ? `이미지 ${matched}개 매칭 완료!` : '매칭되는 파일명이 없습니다.');
                    });
                    return;
                }

                // 일반 삽입 모드: 커서 위치에 이미지 삽입
                files.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = ev => {
                        const img = document.createElement('img');
                        img.src = ev.target.result;
                        img.style.cssText = 'max-width:100%;height:auto;display:block;margin:0 auto;';
                        let inserted = false;
                        if (document.caretRangeFromPoint) {
                            const r = document.caretRangeFromPoint(e.clientX, e.clientY);
                            if (r && childArea.contains(r.startContainer)) {
                                r.insertNode(img); inserted = true;
                            }
                        }
                        if (!inserted) childArea.appendChild(img);
                        clearTimeout(childTimer);
                        childTimer = setTimeout(() => recordState(), 800);
                    };
                    reader.readAsDataURL(file);
                });
                showToast('이미지가 팝업 패널에 추가되었습니다.');
            });

            showToast('💬 팝업 ' + num + ' 패널 생성됨');
            return id;
        }

        function deleteChildPanel(id) {
            const sheet = getById('childSheet_' + id);
            if (sheet) sheet.remove();
            childPanels = childPanels.filter(p => p.id !== id);
            const area = getById('contentArea');
            if (area) area.querySelectorAll('.popup-trigger[data-popup="' + id + '"]').forEach(btn => btn.remove());
            if (childPanels.length === 0) {
                const wrapper = getById('childPanelsWrapper');
                if (wrapper) wrapper.style.display = 'none';
            }
            recordState();
            showToast('팝업 패널 ' + id + ' 삭제됨');
        }

        function insertPopupTrigger(panelId) {
            const area = getById('contentArea');
            if (!panelId) {
                panelId = 'popup_' + nextPopupId;
                nextPopupId++;
            }
            addChildPanel(panelId);
            const triggerHTML = `<button class="popup-trigger" data-popup="${panelId}" style="${getPopupBtnStyle()}" title="${panelId} 팝업 열기">+</button>`;
            area.focus();
            const sel = window.getSelection();
            if (savedRange && area.contains(savedRange.startContainer)) {
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }
            document.execCommand('insertHTML', false, triggerHTML);
            recordState();
        }

        // [팝업N] 마커 → 트리거 버튼, se-popup-content 블록 → 자식 패널에 자동 삽입
        function processPopupMarkers(html) {
            // 1. se-popup-content 블록이 있을 때만 DOM 추출 (없으면 스킵)
            const popupContentMap = {};
            if (html.includes('se-popup-content')) {
                try {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = html;
                    tmp.querySelectorAll('[data-popup]').forEach(el => {
                        if (el.classList.contains('se-popup-content') || el.getAttribute('class')?.includes('se-popup-content')) {
                            const id = el.getAttribute('data-popup');
                            if (id) {
                                let content = '';
                                if (el.tagName === 'SCRIPT') {
                                    // <script type="application/json"> 형식: JSON 디코딩
                                    try { content = JSON.parse(el.textContent.trim()); } catch(e) { content = el.textContent.trim(); }
                                } else {
                                    content = el.innerHTML.trim();
                                }
                                popupContentMap[id] = content;
                                el.remove();
                            }
                        }
                    });
                    // DOM 파싱 결과가 원본보다 크게 달라지면 DOM 버전 사용, 아니면 원본 유지
                    const domResult = tmp.innerHTML;
                    if (Object.keys(popupContentMap).length > 0) {
                        html = domResult; // 팝업 블록 제거된 버전 사용
                    }
                    // 팝업 블록 없으면 원본 html 그대로 유지
                } catch(e) { console.warn('popup extract err:', e); }
            }

            // 2. [팝업N] 텍스트 마커 → 트리거 버튼으로 교체
            const pendingPanels = [];
            html = html.replace(/\[팝업(\d+)\]/g, (m, n) => {
                const id = 'popup_' + n;
                if (parseInt(n) >= nextPopupId) nextPopupId = parseInt(n) + 1;
                if (!pendingPanels.includes(id)) pendingPanels.push(id);
                return `<button class="popup-trigger" data-popup="${id}" style="${getPopupBtnStyle()}" title="${id} 팝업 열기">+</button>`;
            });

            // 3. popupContentMap에서 감지된 ID도 추가
            Object.keys(popupContentMap).forEach(id => {
                if (!pendingPanels.includes(id)) pendingPanels.push(id);
                const n = parseInt(id.replace('popup_', ''));
                if (!isNaN(n) && n >= nextPopupId) nextPopupId = n + 1;
            });

            // 4. 자식 패널 생성 + 내용 채우기
            // [diag 2026-05-20] 팝업 패널 생성 흐름 추적 — 재생성 후 패널이 안 뜨는 회귀 진단용.
            //   pendingPanels: [팝업N] 마커 + se-popup-content 블록에서 추출한 id 목록.
            //   기존 childPanels 와 비교해서 신규/유지/내용교체 케이스 분리 로그.
            console.log('[popup-flow] processPopupMarkers — detected pendingPanels:', pendingPanels, 'popupContentMap keys:', Object.keys(popupContentMap), 'existing childPanels:', childPanels.map(p => p.id));
            if (pendingPanels.length > 0) {
                setTimeout(() => {
                    pendingPanels.forEach(id => {
                        const content = popupContentMap[id] || null;
                        if (!childPanels.find(p => p.id === id)) {
                            console.log('[popup-flow] CREATING new panel:', id, '— hasContent:', !!content);
                            addChildPanel(id, content);
                        } else if (content) {
                            const area = getById('childArea_' + id);
                            if (area) {
                                console.log('[popup-flow] UPDATING existing panel:', id);
                                area.innerHTML = content;
                                if (typeof fixTableThs === 'function') fixTableThs(area);
                            } else {
                                console.warn('[popup-flow] panel in childPanels but childArea_' + id + ' DOM missing!');
                            }
                        } else {
                            console.log('[popup-flow] panel exists, no new content — keeping:', id);
                        }
                    });
                }, 100);
            }
            return html;
        }

        // 에디터 내 팝업 미리보기 시스템

        function showEditorPopup(btn, id) {
            closeEditorPopup();
            const childArea = getById('childArea_' + id);
            if (!childArea) return;

            // 딤드·팝업 경계: .se-contents. 없으면 contentArea fallback.
            const contentArea = getById('contentArea');
            const seContents = contentArea?.querySelector('.se-contents') || contentArea;
            if (!seContents) return;

            const scRect = seContents.getBoundingClientRect();
            const btnRect = btn.getBoundingClientRect();
            const acCol = getById('accentPicker')?.value || '#7c3aed';
            const acText = (typeof isDarkColor === 'function' && isDarkColor(acCol)) ? '#ffffff' : '#000000';

            // .se-contents 를 position:relative 로 (absolute 자식의 기준점)
            if (getComputedStyle(seContents).position === 'static') seContents.style.position = 'relative';

            // +버튼의 .se-contents 내부 상대 좌표 (스크롤 무관)
            const btnTopInSc = btnRect.top - scRect.top;
            const btnLeftInSc = btnRect.left - scRect.left;

            // 딤드 오버레이 — .se-contents 내부 absolute (컨텐츠와 함께 스크롤)
            const overlay = document.createElement('div');
            overlay.id = '__editor_popup_overlay__';
            overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.62);z-index:50000;';
            overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeEditorPopup(); });

            // 팝업 치수 — seContents 폭의 80%, 최대 480
            const boxW = Math.max(280, Math.min(480, scRect.width * 0.80));
            const gap = 10;
            const MAX_H = 420;

            // +버튼 아래 배치 (seContents 좌표계). 경계 보정 없이 버튼 위치 그대로.
            let popTop = Math.round(btnTopInSc + btnRect.height + gap);
            let popLeft = Math.round(btnLeftInSc + btnRect.width / 2 - boxW / 2);
            // 좌우만 seContents 내부로 클램핑 (위아래는 버튼 위치 그대로)
            popLeft = Math.max(8, Math.min(popLeft, scRect.width - boxW - 8));

            const boxMaxH = Math.min(MAX_H, Math.max(160, scRect.height - popTop - 16));

            // 래퍼 (seContents 내부 absolute — 컨텐츠와 함께 스크롤)
            const wrap = document.createElement('div');
            wrap.style.cssText = `position:absolute;top:${popTop}px;left:${popLeft}px;width:${boxW}px;z-index:50001;`;

            // 박스 — [2026-05-29] surface 색 사용 (저장본 팝업 박스/본문 카드와 동일 톤). 이전엔 #ffffff 하드코딩.
            const _epBgEl = getById('bgPicker');
            const _epSurface = _epBgEl?.dataset?.surface || _epBgEl?.value || '#ffffff';
            const _epText = getById('textPicker')?.value || _epBgEl?.dataset?.text || ((typeof isDarkColor === 'function' && isDarkColor(_epSurface)) ? '#f0f0f0' : '#1e293b');
            const box = document.createElement('div');
            box.style.cssText = `background:${_epSurface};border-radius:0.875rem;overflow:hidden;max-height:${boxMaxH}px;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.45);`;

            // 닫기 버튼 — 박스 우측 상단 바깥 모서리
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&#10005;';
            closeBtn.style.cssText = `position:absolute;top:-0.75rem;right:-0.75rem;background:${acCol};color:${acText};border:none;border-radius:50%;width:1.75rem;height:1.75rem;font-size:0.875rem;font-weight:900;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;box-shadow:0 4px 12px rgba(0,0,0,0.35);`;
            closeBtn.onclick = e => { e.stopPropagation(); closeEditorPopup(); };

            // 내용
            const body = document.createElement('div');
            body.style.cssText = `padding:1.5rem;overflow-y:auto;flex:1;font-family:Pretendard,sans-serif;line-height:1.8;font-size:14px;color:${_epText};word-break:keep-all;`;
            const clone = childArea.cloneNode(true);
            const ph = clone.querySelector('[id^="childPlaceholder_"]');
            if (ph) ph.remove();
            clone.innerHTML = clone.innerHTML.replace(/\[툴팁\d*\]/gi, '');
            body.innerHTML = clone.innerHTML;

            box.addEventListener('mousedown', e => e.stopPropagation());
            box.appendChild(body);
            wrap.appendChild(box);
            wrap.appendChild(closeBtn);

            // 둘 다 .se-contents 내부에 삽입 (딤드·팝업 함께 컨텐츠 영역 안)
            seContents.appendChild(overlay);
            seContents.appendChild(wrap);
            activeEditorPopup = { overlay, wrap };

            // +버튼이 뷰포트 밖이면 팝업이 보이도록 scrollIntoView
            const wrapRect = wrap.getBoundingClientRect();
            if (wrapRect.top < 0 || wrapRect.top > window.innerHeight - 100) {
                wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        function closeEditorPopup() {
            if (activeEditorPopup) {
                if (activeEditorPopup.overlay) activeEditorPopup.overlay.remove();
                if (activeEditorPopup.wrap) activeEditorPopup.wrap.remove();
                if (activeEditorPopup.box) activeEditorPopup.box.remove();
                activeEditorPopup = null;
            }
        }

        // 팝업 트리거 클릭 — 에디터에서는 콘텐츠 영역 내에 팝업 미리보기 (딤드)
        document.addEventListener('click', e => {
            const btn = e.target.closest('.popup-trigger');
            if (!btn) return;
            const id = btn.dataset.popup;
            const area = getById('contentArea');
            if (area && area.contains(btn)) {
                e.preventDefault();
                e.stopPropagation();
                // 자식 패널이 없으면 생성
                if (!childPanels.find(p => p.id === id)) addChildPanel(id);
                // 콘텐츠 영역 내 팝업 미리보기 (documentSheet 딤드)
                showEditorPopup(btn, id);
            }
        });

        // 팝업 패널 이미지 렌더링 (내보내기용)
        async function renderChildPanelAsImage(id) {
            const sheet = getById('childSheet_' + id);
            if (!sheet) return null;
            const area = getById('childArea_' + id);
            const bgCol = getById('bgPicker')?.value || area.style.backgroundColor || '#ffffff';
            try {
                const canvas = await htmlToImage.toCanvas(sheet, {
                    pixelRatio: 2, backgroundColor: bgCol,
                    skipFonts: true, useCORS: true,
                    filter: node => {
                        if (node.id && node.id.startsWith('childSheet_') && node.id !== 'childSheet_' + id) return false;
                        return true;
                    }
                });
                return canvas.toDataURL('image/jpeg', 0.92);
            } catch(e) { console.error('popup render failed', e); return null; }
        }

        // ───────────────────────────────────────────────────────────
        // [팝업 — 사이냅 호환: 인라인 onclick + 클릭 시 createElement]
        // 사이냅은 사전 렌더된 div 의 style="display:none" 을 제거하므로 사전 렌더 방식 불가.
        // 반드시 클릭 시점에 document.body 에 createElement 로 DOM 을 만들어야 한다.
        // 딤드는 se-contents 폭만 커버 (getBoundingClientRect 런타임 계산).
        // 박스는 컨텐츠 영역의 80% 폭, 중앙 정렬.
        // ───────────────────────────────────────────────────────────
        function buildPopupTriggerOnclick(panelId, contentInnerHtml, opts) {
            opts = opts || {};
            // opts 값은 전부 single-quoted JS 문자열 안에 들어가므로 ' 이스케이프 (방어)
            const _esc = v => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const accent = _esc(opts.accent || '#7c3aed');
            const accentText = (typeof isDarkColor === 'function' && isDarkColor(opts.accent || '#7c3aed')) ? '#ffffff' : '#000000';
            const surface = _esc(opts.surface || '#ffffff');
            const textColor = _esc(opts.textColor || '#222222');
            const escaped = (contentInnerHtml || '')
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '&quot;')
                .replace(/\n/g, '');
            // 동적 createElement — 박스는 + 버튼 위쪽에 배치 (트리거 좌표 기반 계산)
            return [
                `var lid='__popup_${panelId}__';`,
                `var ex=document.getElementById(lid);if(ex){ex.remove();return;}`,
                `var _tr=this;`,
                `var _cont=_tr.closest('div[style*=max-width]');`,
                `if(!_cont){var _sc=_tr.closest('.se-contents');_cont=(_sc&&_sc.querySelector('div[style*=max-width]'))||_sc||document.querySelector('div[style*=max-width]')||document.body;}`,
                `var _cs=window.getComputedStyle(_cont);`,
                `if(_cs.position==='static')_cont.style.position='relative';`,
                `var d=document.createElement('div');d.id=lid;`,
                // dim — 검정 72% (단순화 — 동적 bg 계산은 onclick string 길이 + 파싱 위험으로 롤백)
                `d.style='position:absolute;top:0;left:0;width:100%;height:100%;background-color:#000000B8;z-index:3;box-sizing:border-box;';`,
                `d.onclick=function(ev){if(ev.target===d)d.remove();};`,
                `var box=document.createElement('div');`,
                // [regression-fix 2026-05-12] 박스에 surface 배경 + padding + border-radius — 사용자 요청.
                `box.style='position:absolute;left:5%;width:90%;max-height:70vh;overflow-y:auto;padding:2.25rem 1.5rem 1.5rem 1.5rem;color:${textColor};background-color:${surface};border-radius:0.875rem;font-size:inherit;line-height:inherit;letter-spacing:inherit;word-break:keep-all;overflow-wrap:break-word;box-sizing:border-box;-webkit-overflow-scrolling:touch;';`,
                `box.innerHTML='${escaped}';`,
                `var cb=document.createElement('button');cb.type='button';cb.innerHTML='\\u2715';`,
                // 닫기 버튼: 박스 상단 거터 내부 우측 (컨텐츠 위쪽 빈 공간, 겹침 없음)
                `cb.style='position:absolute;top:0.25rem;right:0.25rem;background-color:${accent};color:${accentText};border:none;border-radius:50%;width:1.75rem;height:1.75rem;font-size:0.875rem;font-weight:900;cursor:pointer;line-height:1;z-index:10;display:inline-flex;align-items:center;justify-content:center;';`,
                `cb.onclick=function(ev){ev.stopPropagation();d.remove();};`,
                `box.appendChild(cb);d.appendChild(box);_cont.appendChild(d);`,
                // + 버튼 위쪽에 박스 배치 + 딤드(se-contents) 경계 내 클램프
                `var _recalc=function(){var _br=_tr.getBoundingClientRect(),_cr=_cont.getBoundingClientRect();var _bh=box.offsetHeight,_ch=_cont.offsetHeight;var _t=(_br.top-_cr.top)-_bh-8;var _minT=8,_maxT=Math.max(_minT,_ch-_bh-8);if(_t<_minT)_t=_minT;if(_t>_maxT)_t=_maxT;box.style.top=_t+'px';};`,
                `_recalc();`,
                // 이미지 로드 후 재계산 (슬라이서 팝업처럼 <img> 콘텐츠일 때 첫 클릭 시 높이 오차 보정)
                `Array.from(box.querySelectorAll('img')).forEach(function(im){if(!im.complete||!im.naturalHeight){im.addEventListener('load',_recalc);im.addEventListener('error',_recalc);}});`
            ].join('');
        }
        // (호환용 스텁) 사전 렌더 오버레이 방식 제거됨
        function buildPopupOverlayHtml() { return ''; }
        function ensureSeContentsRelative(html) { return html; }

        // 자식 패널 HTML → 인라인 onclick 팝업으로 변환 (사이냅에디터 호환)
        // 사이냅에디터는 <script> 블록을 strip하므로 반드시 onclick 인라인 방식 사용
        // 팝업 콘텐츠는 se-popup-content div에서 읽지 않고 onclick에 직접 인코딩
        function buildInlinePopupHtml(exportHtml, popupImagePaths, forPreview) {
            if (!childPanels.length) return exportHtml;
            popupImagePaths = popupImagePaths || {};
            // accentPicker가 기본값(#888888)일 경우 생성된 HTML에서 accent 색상 직접 추출
            let _acColor = getById('accentPicker')?.value || '#7c3aed';
            if (!_acColor || _acColor === '#888888') {
                // 번호 배지(border-radius:50% + background-color)에서 accent 추출 — 배경색 오탐지 방지
                const _badgeMatch = exportHtml.match(/border-radius:\s*50%[^"]*background-color:\s*(#[0-9a-fA-F]{6})/i)
                    || exportHtml.match(/background-color:\s*(#[0-9a-fA-F]{6})[^"]*border-radius:\s*50%/i);
                if (_badgeMatch) {
                    _acColor = _badgeMatch[1];
                } else {
                    // 폴백: popup-trigger 버튼의 background-color
                    const _triggerMatch = exportHtml.match(/popup-trigger[^"]*background-color:\s*(#[0-9a-fA-F]{6})/i);
                    if (_triggerMatch) _acColor = _triggerMatch[1];
                }
            }

            let result = exportHtml;

            const _bgPickerEl = getById('bgPicker');
            const _bgColor = _bgPickerEl?.value || '#ffffff';
            const _txtColor = getById('textPicker')?.value || _bgPickerEl?.dataset?.text || (isDarkColor(_bgColor) ? '#ffffff' : '#222222');
            // 본문 카드와 동일한 surface 사용 — 생성 시점 저장값이 1순위, 없으면 bg 폴백
            const _surfaceColor = getById('surfacePicker')?.value || _bgPickerEl?.dataset?.surface || _bgColor;

            // 사전 렌더할 팝업 div 들 모음
            const popupHtmls = [];

            childPanels.forEach(panel => {
                const id = panel.id;
                const imgPath = popupImagePaths[id];

                // 팝업 내용 추출
                let contentInner = '';
                if (imgPath) {
                    contentInner = `<img src="${imgPath}" style="display:block;max-width:100%;height:auto;margin:0 auto;">`;
                } else {
                    const area = getById('childArea_' + id);
                    if (!area) return;
                    const text = area.innerText.trim();
                    if (!text || text.includes('내용을 여기에 입력하세요')) return;
                    const clone = area.cloneNode(true);
                    clone.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                    clone.querySelectorAll('.resizer-handle').forEach(el => el.remove());
                    clone.querySelectorAll('button, [role="button"], a').forEach(el => {
                        const txt = (el.textContent || '').trim();
                        if (['×', '✕', '✗', 'X', '닫기', 'Close', 'CLOSE'].includes(txt)) el.remove();
                    });
                    contentInner = clone.innerHTML.trim();
                }
                if (!contentInner) return;

                // 팝업 내부 폰트를 본문과 동일하게 — 모든 텍스트 요소에 본문 기준 font 속성을 명시 인라인으로 강제 주입
                // (inherit 에 의존하지 않고 무조건 인라인 값으로 반영)
                if (!imgPath) {
                    try {
                        const POPUP_FS = 'clamp(14px,1.702vw,16px)';
                        const POPUP_LH = '1.8';
                        const POPUP_LS = '-0.05rem';
                        const _tmp = document.createElement('div');
                        _tmp.innerHTML = contentInner;
                        // 팝업 안 nested popup-trigger 강제 normalize — accent 색 반영 (옛 hardcoded 색이나 surface 색 fallback 차단)
                        _tmp.querySelectorAll('.popup-trigger[data-popup], button[data-popup], a[data-popup]').forEach(btn => {
                            const _btnExtra = btn.tagName === 'A' ? 'text-decoration:none;' : '';
                            btn.setAttribute('style', getPopupBtnStyle() + _btnExtra);
                        });
                        // 텍스트 요소 전부: p, span, td, th, li, div, h1~h6, a, button, strong, em, b, i
                        // font-family 는 .se-contents 에서 이미 상속되므로 주입하지 않음 (중복 금지)
                        const TEXT_SEL = 'p,span,td,th,li,div,h1,h2,h3,h4,h5,h6,a,button,strong,em,b,i';
                        _tmp.querySelectorAll(TEXT_SEL).forEach(el => {
                            // popup-trigger 는 위에서 이미 처리 — 폰트 주입 스킵
                            if (el.classList && el.classList.contains('popup-trigger')) return;
                            let s = el.getAttribute('style') || '';
                            // 기존 font-size/line-height/letter-spacing 제거 (font-family 는 건드리지 않음)
                            s = s.replace(/font-size\s*:[^;]*;?/gi, '')
                                 .replace(/line-height\s*:[^;]*;?/gi, '')
                                 .replace(/letter-spacing\s*:[^;]*;?/gi, '')
                                 .replace(/;;+/g, ';').replace(/^;+/, '');
                            // spacer 태그 (height:Npx 만 있는 <p>) 는 폰트 주입하지 않음 — 간격 망가짐 방지
                            const isSpacer = /^<p\b/i.test(el.outerHTML) && /height\s*:\s*\d+px/i.test(s) && !el.textContent.trim();
                            if (!isSpacer) {
                                s = `font-size:${POPUP_FS};line-height:${POPUP_LH};letter-spacing:${POPUP_LS};` + (s ? s + (s.endsWith(';') ? '' : ';') : '');
                            }
                            if (s) el.setAttribute('style', s); else el.removeAttribute('style');
                        });
                        contentInner = _tmp.innerHTML;
                    } catch (e) { console.warn('popup font normalize fail:', e); }
                }

                // 트리거 버튼 변환: 단순 display 토글 onclick
                const triggerRe = new RegExp(
                    `<(?:button|a)[^>]*data-popup="${id}"[^>]*>[\\s\\S]*?<\\/(?:button|a)>`,
                    'g'
                );
                result = result.replace(triggerRe, () => {
                    const btnStyle = `display:inline-flex;align-items:center;justify-content:center;width:1.375rem;height:1.375rem;border-radius:50%;background-color:${_acColor};color:#ffffff;font-size:0.75rem;font-weight:900;border:none;cursor:pointer;vertical-align:middle;margin:0 0.25rem;line-height:1;text-decoration:none;`;
                    const safeOnclick = buildPopupTriggerOnclick(id, contentInner, {
                        accent: _acColor, surface: _surfaceColor, textColor: _txtColor
                    }).replace(/"/g, '&quot;');
                    return `<button type="button" class="popup-trigger" data-popup="${id}" onclick="${safeOnclick}" style="${btnStyle}">+</button>`;
                });

                // 동적 createElement 방식 — 사전 렌더 div 제거됨.
                // (onclick 안에서 document.createElement 로 딤드+박스+닫기 생성)
            });

            // 팝업 div들을 .se-contents 닫는 태그 바로 앞에 삽입 (DOM 기반 안전 삽입)
            if (popupHtmls.length > 0) {
                try {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = result;
                    const seCont = tmp.querySelector('.se-contents');
                    if (seCont) {
                        // .se-contents 에 position:relative 보장 (팝업 absolute 기준점)
                        const existingStyle = seCont.getAttribute('style') || '';
                        if (!/position\s*:/i.test(existingStyle)) {
                            seCont.setAttribute('style', existingStyle + ';position:relative;');
                        }
                        // 팝업들을 .se-contents 맨 끝에 append
                        const popWrap = document.createElement('div');
                        popWrap.innerHTML = popupHtmls.join('');
                        while (popWrap.firstChild) seCont.appendChild(popWrap.firstChild);
                        result = tmp.innerHTML;
                    } else {
                        // .se-contents 없으면 맨 끝에 그냥 추가 (fallback)
                        result += popupHtmls.join('');
                    }
                } catch (e) {
                    console.warn('popup inject fail:', e);
                    result += popupHtmls.join('');
                }
            }

            // [회귀 방지 2026-05-19] popup-trigger 최종 fallback —
            //   Gemini 가 [팝업N] 마커만 emit 하고 콘텐츠를 본문에 인라인으로 박은 경우,
            //   buildInlinePopupHtml 의 main forEach 가 해당 popup 을 skip → 그 trigger 는 onclick 없이 남음.
            //   여기서 result 문자열을 한 번 더 스캔: onclick 없는 popup-trigger 발견 시
            //   동일 result 안의 정상 popup-trigger onclick (createElement 포함) 을 복사 + panelId swap.
            try {
                const donorMatch = result.match(/<button[^>]*class="popup-trigger"[^>]*data-popup="([^"]+)"[^>]*onclick="([^"]*createElement[^"]*)"/);
                if (donorMatch) {
                    const donorPid = donorMatch[1];
                    const donorOnclick = donorMatch[2];
                    // onclick 없는 popup-trigger 찾기 — data-popup 은 있고 onclick 은 없음
                    result = result.replace(/<button([^>]*class="popup-trigger"[^>]*data-popup="([^"]+)"[^>]*)>/g, (m, attrs, pid) => {
                        if (/onclick\s*=/.test(attrs) || pid === donorPid) return m;
                        const swapped = donorOnclick.split(donorPid).join(pid);
                        console.warn('[buildInlinePopupHtml] onclick fallback from donor', donorPid, '→', pid);
                        return `<button${attrs} onclick="${swapped}">`;
                    });
                }
            } catch (e) {
                console.warn('popup onclick fallback fail:', e);
            }

            return result;
        }

        // [회귀 방지 2026-05-19] popup-trigger 출력 복원기 (app.js generateContent 에서 이전 2026-05-29).
        //   팝업 동작/구조 (createElement + se-popup-content) 는 안 건드림 — 룰 그대로 유지.
        //   Gemini 가 룰을 어겨 콘텐츠를 button 내부에 인라인으로 박은 케이스만 정상 형태로 되돌림:
        //     a) 깨진 attribute 제거
        //     b) 인라인 콘텐츠 → 같은 pid 의 se-popup-content 로 이동 (HTML 보존)
        //     c) button textContent → '+'
        //     d) onclick 누락 시 동일 문서 다른 popup-trigger 의 onclick 복사 + panelId swap
        //   root = out 을 파싱한 임시 DOM 노드 (in-place 변형, 호출자가 직렬화).
        function sanitizeBrokenPopupTriggers(root) {
            const triggers = Array.from(root.querySelectorAll('button.popup-trigger'));
            if (triggers.length === 0) return;
            const donor = triggers.find(b => (b.getAttribute('onclick')||'').includes('createElement'));
            const donorOnclick = donor ? donor.getAttribute('onclick') : '';
            const donorPid = donor ? donor.getAttribute('data-popup') : '';

            triggers.forEach(btn => {
                // a) 깨진 attribute 제거 — 이름이 영문이 아닌 것 (예: `"="" `)
                //    또는 CSS 패턴이 attr 이름으로 들어간 leftover (`width:100%;display:block;...`)
                Array.from(btn.attributes).forEach(attr => {
                    const n = attr.name;
                    if (/^[^a-zA-Z]/.test(n) || /[:;]/.test(n)) btn.removeAttribute(n);
                });
                const pid = btn.getAttribute('data-popup');
                if (!pid) return;

                // b) 인라인 콘텐츠 검사
                const hasNested = btn.querySelector('table,div,p,ul,ol,hr,img');
                const txt = (btn.textContent || '').replace(/\s/g, '');
                const isPolluted = hasNested || (txt && txt !== '+');

                if (isPolluted) {
                    console.warn('[popup sanitize] inline content recovered for', pid);
                    let block = root.querySelector(`.se-popup-content[data-popup="${pid}"]`);
                    if (!block) {
                        block = document.createElement('div');
                        block.className = 'se-div se-popup-content';
                        block.setAttribute('data-popup', pid);
                        block.setAttribute('style', 'display:none;overflow:hidden;width:0;height:0;margin:0;padding:0;border:none;');
                        (root.querySelector('.se-contents') || root).appendChild(block);
                    }
                    const blockTxt = (block.textContent || '').trim();
                    // 기존 block 이 빈약(<50자)하거나 markdown 표(`| .. |`)면 button 의 인라인 콘텐츠로 교체
                    if (blockTxt.length < 50 || /^\s*\|[^\n]*\|/.test(blockTxt)) {
                        block.innerHTML = btn.innerHTML;
                    }
                    while (btn.firstChild) btn.removeChild(btn.firstChild);
                    btn.textContent = '+';

                    // [회귀 방지 2026-05-19] 본문 끝 orphan 콘텐츠 흡수.
                    //   Gemini 가 popup 콘텐츠 일부를 button 내부에 박고, 나머지(추가 테이블 등)를
                    //   .se-contents 바깥 본문 끝에 떨어뜨리는 패턴 관찰됨.
                    //   .se-contents 의 형제 노드 중 .se-popup-content 가 아닌 element 를 popup data block 으로 흡수 + 본문에서 제거.
                    const seContents = root.querySelector('.se-contents');
                    if (seContents) {
                        let node = seContents.nextSibling;
                        let absorbed = 0;
                        while (node) {
                            const next = node.nextSibling;
                            if (node.nodeType === 1) {
                                const tagName = node.tagName;
                                const isPopupContent = node.classList && node.classList.contains('se-popup-content');
                                const isScriptStyle = tagName === 'SCRIPT' || tagName === 'STYLE';
                                if (!isPopupContent && !isScriptStyle) {
                                    block.appendChild(node);
                                    absorbed++;
                                }
                            }
                            node = next;
                        }
                        if (absorbed > 0) {
                            console.warn('[popup sanitize] absorbed', absorbed, 'orphan block(s) into popup', pid);
                        }
                    }
                }

                // c) onclick 누락 보완 — donor 의 onclick 에서 panelId swap
                if (!btn.getAttribute('onclick') && donorOnclick && donorPid && donorPid !== pid) {
                    btn.setAttribute('onclick', donorOnclick.split(donorPid).join(pid));
                    console.warn('[popup sanitize] onclick restored for', pid, 'from donor', donorPid);
                }
            });
        }
        // ── 팝업 패널 시스템 끝 ─────────────────────────────────────────────
