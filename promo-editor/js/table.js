// promo-editor/js/table.js — 표 UI + CRUD + 안전망 (← rules/11-table.md)
//
// app.js 에서 분리 (Stage 3 — 2026-05-28).
// 포함: cloneEmptyCell, toggleTableLayout, showTableFloatToolbar, hideTableFloatToolbar,
//       updateTableSelInfo, showTableInsertMenu, insertTable, addTableRow, deleteTableRow,
//       addTableCol, deleteTableCol, smartDeleteAction, mergeSelectedCells, splitMergedCell,
//       clearSelection, fixTableThs (+ 내부 _isCellEmpty / _isRowEmpty 클로저 그대로).
//
// 의존:
// - state.js: activeLayer, selectedCells, lastActiveCell, isSelecting, selectionStartCell
// - utils.js: getById
// - app.js (runtime): recordState, showToast, hideAllTools, blendHex, isDarkColor
//   (table CRUD 는 사용자 클릭 시점에 호출 → runtime 보장)
//
// 주의: table safety net (normalizeTableStructure, normalizeTableStyles) 는 generateContent
//       내부 즉시 실행 IIFE 라 app.js 잔류.
//       fixTableThs 의 내부 _isCellEmpty / _isRowEmpty 는 클로저로 그대로 이동.

// ────────────────────────────────────────────────────────────────
// cloneEmptyCell (Stage 3 후 L39)
// ────────────────────────────────────────────────────────────────
        function cloneEmptyCell(source) {
            const nc = document.createElement(source.tagName);
            nc.style.cssText = source.style.cssText;
            nc.className = source.className.replace('selected-cell','').trim();
            nc.setAttribute('contenteditable','true');
            nc.innerHTML = '&nbsp;';
            return nc;
        }

// ────────────────────────────────────────────────────────────────
// 표 toolbar 그룹 (Stage 3 후 L2591-2702)
// ────────────────────────────────────────────────────────────────
        function toggleTableLayout() {
            if (!activeLayer || activeLayer.tagName !== 'TABLE') return showToast('\ud45c\ub97c \uc120\ud0dd\ud558\uc138\uc694.');
            recordState();
            const tbl = activeLayer;
            const wrap = tbl.closest('.tbl-scroll-wrap');
            const isFixed = tbl.classList.contains('tbl-fixed');
            const btn = getById('tblLayoutBtn');

            if (isFixed) {
                tbl.classList.remove('tbl-fixed');
                tbl.classList.add('tbl-responsive');
                tbl.style.removeProperty('min-width');
                if (wrap) {
                    const parent = wrap.parentNode;
                    parent.insertBefore(tbl, wrap);
                    parent.removeChild(wrap);
                }
                if (btn) btn.textContent = '\ud83d\udcf1 \ubc18\uc751\ud615';
                showToast('\ubc18\uc751\ud615 \ubaa8\ub4dc\ub85c \uc804\ud658\ub410\uc2b5\ub2c8\ub2e4.');
            } else {
                tbl.classList.remove('tbl-responsive');
                tbl.classList.add('tbl-fixed');
                tbl.style.minWidth = '400px';
                if (!tbl.closest('.tbl-scroll-wrap')) {
                    const newWrap = document.createElement('div');
                    newWrap.className = 'tbl-scroll-wrap';
                    newWrap.style.cssText = 'width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;display:block;';
                    tbl.parentNode.insertBefore(newWrap, tbl);
                    newWrap.appendChild(tbl);
                }
                if (btn) btn.textContent = '\ud83d\udda5 \uace0\uc815\ud3ed';
                showToast('\uace0\uc815\ud3ed \ubaa8\ub4dc\ub85c \uc804\ud658\ub410\uc2b5\ub2c8\ub2e4 (\uac00\ub85c \uc2a4\ud06c\ub864 \uc790\ub3d9).');
            }
            recordState();
        }

        function showTableFloatToolbar(tableEl, cellEl) {
            const tb = getById('tableFloatToolbar');
            if (!tb || !tableEl) return;

            const infoEl = getById('tableSelInfo');
            if (infoEl) {
                const rows = tableEl.rows.length;
                const cols = tableEl.rows[0] ? tableEl.rows[0].cells.length : 0;
                const selCount = selectedCells.length;
                infoEl.textContent = selCount > 1 ? `${selCount}\uc140` : `${rows}\u00d7${cols}`;
            }
            // 나누기 버튼: 병합된 셀 선택 시만 표시
            const splitBtn = getById('tblSplitBtn');
            if (splitBtn) {
                const hasColspan = cellEl && parseInt(cellEl.getAttribute('colspan') || '1') > 1;
                const hasRowspan = cellEl && parseInt(cellEl.getAttribute('rowspan') || '1') > 1;
                splitBtn.style.display = (hasColspan || hasRowspan) ? 'inline-block' : 'none';
            }
            const layoutBtn = getById('tblLayoutBtn');
            if (layoutBtn) {
                layoutBtn.textContent = tableEl.classList.contains('tbl-fixed') ? '\ud83d\udda5 \uace0\uc815\ud3ed' : '\ud83d\udcf1 \ubc18\uc751\ud615';
            }

            tb.style.display = 'flex';
            tb.style.left = '-9999px';
            tb.style.top  = '-9999px';

            requestAnimationFrame(() => {
                const targets = selectedCells.length > 0 ? selectedCells : (cellEl ? [cellEl] : []);
                let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;

                if (targets.length > 0) {
                    targets.forEach(cell => {
                        const r = cell.getBoundingClientRect();
                        if (r.left   < minLeft)   minLeft   = r.left;
                        if (r.top    < minTop)     minTop    = r.top;
                        if (r.right  > maxRight)   maxRight  = r.right;
                        if (r.bottom > maxBottom)  maxBottom = r.bottom;
                    });
                } else {
                    const r = tableEl.getBoundingClientRect();
                    minLeft = r.left; minTop = r.top; maxRight = r.right; maxBottom = r.bottom;
                }

                const centerX = (minLeft + maxRight)  / 2;
                const tbW = tb.offsetWidth  || 340;
                const tbH = tb.offsetHeight || 42;

                let left = centerX - tbW / 2;
                let top  = minTop - tbH - 10;

                if (left < 6) left = 6;
                if (left + tbW > window.innerWidth - 6) left = window.innerWidth - tbW - 6;
                if (top  < 6) top  = maxBottom + 10;

                tb.style.left = left + 'px';
                tb.style.top  = top  + 'px';
            });
        }

        function hideTableFloatToolbar() {
            const tb = getById('tableFloatToolbar');
            if (tb) tb.style.display = 'none';
        }

        function updateTableSelInfo() {
            const infoEl = getById('tableSelInfo');
            if (!infoEl) return;
            if (selectedCells.length > 1) {
                infoEl.textContent = selectedCells.length + '\uc140';
            } else if (activeLayer && activeLayer.tagName === 'TABLE') {
                const rows = activeLayer.rows.length;
                const cols = activeLayer.rows[0] ? activeLayer.rows[0].cells.length : 0;
                infoEl.textContent = rows + '\u00d7' + cols;
            }
        }

// ────────────────────────────────────────────────────────────────
// 표 CRUD 그룹 (Stage 3 후 L3200-3428)
// ────────────────────────────────────────────────────────────────
        function showTableInsertMenu(e) {
            e.stopPropagation();
            const menu = getById('tableInsertMenu');
            if (!menu) return;
            const btn = e.currentTarget;
            const rect = btn.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top  = (rect.bottom + 4) + 'px';
            menu.style.left = rect.left + 'px';
            menu.classList.toggle('hidden');
            const close = () => { menu.classList.add('hidden'); document.removeEventListener('click', close); };
            setTimeout(() => document.addEventListener('click', close), 0);
        }

        function insertTable(mode) {
            const menu = getById('tableInsertMenu');
            if (menu) menu.classList.add('hidden');

            recordState();
            const bg = getById('bgPicker')?.value || '#1e293b';
            const rv=parseInt(bg.slice(1,3),16)||30, gv=parseInt(bg.slice(3,5),16)||41, bv=parseInt(bg.slice(5,7),16)||59;
            const isDark = isDarkColor(bg);
            // AI가 결정한 accent 색 우선 사용, 없으면 bgColor 기반 자동 계산
            const accent = getById('accentPicker')?.value ||
                ((bv>rv&&bv>gv&&isDark) ? '#00d4ff' : (isDark ? '#ffd700' : '#4f46e5'));
            const headerBg = blendHex(bg, accent, 0.25);
            // 라인 = headerBg 와 동일 hue/채도, 명도만 살짝 어둡게 (생성 시 enforcePaletteHierarchy 와 동일 컨셉)
            const _surfaceForBlend = blendHex(bg, isDark ? '#ffffff' : '#000000', 0.08);
            const borderClr = blendHex(_surfaceForBlend, headerBg, 0.6);
            const textClr = isDark ? '#f0f0f0' : '#1a1a2e';
            // 본문은 dim — textClr 70% + bg 30% 블렌드 (헤더 crisp 와 위계)
            const subClr = blendHex(textClr, bg, 0.3);

            const cellStyle = `border:none; border-bottom:1px solid ${borderClr}; padding:1rem 1rem; color:${subClr}; font-size:clamp(0.875rem,1.702vw,1rem); line-height:1.8; word-break:keep-all;`;
            const thStyle   = `border:none; border-bottom:1px solid ${borderClr}; padding:1rem 1rem; background-color:${headerBg}; color:${textClr}; font-weight:800; font-size:clamp(0.8125rem,1.4vw,0.9375rem); line-height:1.6; letter-spacing:0.03em; word-break:keep-all;`;

            const tableClass = mode === 'fixed' ? 'tbl-fixed' : 'tbl-responsive';
            const tableStyle = mode === 'fixed'
                ? `width:100%; border-collapse:collapse; table-layout:fixed; min-width:400px;`
                : `width:100%; border-collapse:collapse;`;

            const tableHTML = `<table class="${tableClass}" style="${tableStyle}">
                <thead><tr>
                    <th contenteditable="true" style="${thStyle}">\ud5e4\ub3541</th>
                    <th contenteditable="true" style="${thStyle}">\ud5e4\ub3542</th>
                    <th contenteditable="true" style="${thStyle}">\ud5e4\ub3543</th>
                </tr></thead>
                <tbody>
                    <tr>
                        <td contenteditable="true" style="${cellStyle}">\ub0b4\uc6a9</td>
                        <td contenteditable="true" style="${cellStyle}">\ub0b4\uc6a9</td>
                        <td contenteditable="true" style="${cellStyle}">\ub0b4\uc6a9</td>
                    </tr>
                    <tr>
                        <td contenteditable="true" style="${cellStyle}">\ub0b4\uc6a9</td>
                        <td contenteditable="true" style="${cellStyle}">\ub0b4\uc6a9</td>
                        <td contenteditable="true" style="${cellStyle}">\ub0b4\uc6a9</td>
                    </tr>
                </tbody>
            </table>`;

            const wrapped = mode === 'fixed'
                ? `<div class="tbl-scroll-wrap" style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;display:block;">${tableHTML}</div>`
                : tableHTML;

            document.execCommand('insertHTML', false, wrapped);
            recordState();
            showToast(mode === 'fixed' ? '\uace0\uc815\ud3ed \ud14c\uc774\ube14 \uc0bd\uc785 (\uac00\ub85c \uc2a4\ud06c\ub864 \uc790\ub3d9)' : '\ubc18\uc751\ud615 \ud14c\uc774\ube14 \uc0bd\uc785');
        }

        function insertLink() {
            const area = getById('contentArea');
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString().trim() : '';

            // prompt 전에 range clone — prompt가 포커스를 빼앗으면 range가 사라짐
            const savedRangeClone = savedRange ? savedRange.cloneRange() : null;

            const url = prompt("\uc5f0\uacb0\ud560 URL\uc744 \uc785\ub825\ud558\uc138\uc694:", "https://");
            if (!url || url === "https://") return;

            recordState();
            area.focus();

            if (savedRangeClone) {
                try {
                    selection.removeAllRanges();
                    selection.addRange(savedRangeClone);
                } catch(e) {}
            }

            if (selectedText) {
                document.execCommand('createLink', false, url);
                const links = area.querySelectorAll(`a[href="${CSS.escape ? CSS.escape(url) : url}"]`);
                links.forEach(a => { a.target = '_blank'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; a.style.cursor = 'pointer'; });
            } else {
                const displayText = prompt("\ub9c1\ud06c\ub85c \ud45c\uc2dc\ud560 \ud14d\uc2a4\ud2b8\ub97c \uc785\ub825\ud558\uc138\uc694:", url) || url;
                const safe = displayText.replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const linkHTML = `<a href="${url.replace(/"/g,'&quot;')}" target="_blank" style="color:inherit;text-decoration:underline;cursor:pointer;">${safe}</a>`;
                document.execCommand('insertHTML', false, linkHTML);
            }

            recordState();
            showToast("\ub9c1\ud06c\uac00 \uc124\uc815\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
        }

        function addTableRow() {
            const c = lastActiveCell || (selectedCells.length > 0 ? selectedCells[0] : null);
            if (!c) return showToast("\ud45c \ub0b4\ubd80\ub97c \uc120\ud0dd\ud558\uc138\uc694.");
            recordState();
            const r = c.parentElement;
            const nr = document.createElement('tr');
            Array.from(r.cells).forEach(old => nr.appendChild(cloneEmptyCell(old)));
            r.after(nr);
            recordState();
        }

        function deleteTableRow() {
            const cells = selectedCells.length > 0 ? selectedCells : [lastActiveCell];
            const rowsToDelete = new Set();
            cells.forEach(c => { if(c && c.parentElement) rowsToDelete.add(c.parentElement); });
            rowsToDelete.forEach(r => { if(r.parentElement && r.parentElement.rows.length > 1) r.remove(); });
            clearSelection();
        }

        function addTableCol() {
            const c = lastActiveCell || (selectedCells.length > 0 ? selectedCells[0] : null);
            if (!c) return showToast("\ud45c \ub0b4\ubd80\ub97c \uc120\ud0dd\ud558\uc138\uc694.");
            recordState();
            const t = c.closest('table'); const idx = c.cellIndex;
            Array.from(t.rows).forEach(r => {
                const old = r.cells[idx];
                if (old) {
                    const nc = cloneEmptyCell(old);
                    old.nextSibling ? r.insertBefore(nc, old.nextSibling) : r.appendChild(nc);
                }
            });
            recordState();
        }

        function deleteTableCol() {
            const cells = selectedCells.length > 0 ? selectedCells : [lastActiveCell];
            const colIndices = new Set();
            let table = null;
            cells.forEach(c => { if(c) { colIndices.add(c.cellIndex); table = c.closest('table'); } });
            if (!table) return;
            const sortedIndices = Array.from(colIndices).sort((a, b) => b - a);
            sortedIndices.forEach(idx => {
                if (table.rows[0].cells.length > 1) {
                    Array.from(table.rows).forEach(r => { if(r.cells[idx]) r.deleteCell(idx); });
                }
            });
            clearSelection();
        }

        function smartDeleteAction(type = 'row') {
            if (selectedCells.length === 0) return showToast("\ucc98\ub9ac\ud560 \uc601\uc5ed\uc744 \ub4dc\ub798\uadf8\ud558\uc5ec \uc120\ud0dd\ud558\uc138\uc694.");
            recordState();
            let hasText = false;
            selectedCells.forEach(td => { if(td.innerText.trim().length > 0) hasText = true; });

            if (hasText) {
                selectedCells.forEach(td => td.innerHTML = '&nbsp;');
                showToast("\ud14d\uc2a4\ud2b8\uac00 \uc81c\uac70\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
            } else {
                if (type === 'row') deleteTableRow();
                else deleteTableCol();
                showToast(type === 'row' ? "\ud589\uc774 \uc0ad\uc81c\ub418\uc5c8\uc2b5\ub2c8\ub2e4." : "\uc5f4\uc774 \uc0ad\uc81c\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
            }
            recordState();
        }

        function mergeSelectedCells() {
            if (selectedCells.length < 2) return showToast("\uc601\uc5ed\uc744 \ub4dc\ub798\uadf8\ud558\uc138\uc694.");
            recordState();
            const table = selectedCells[0].closest('table'); const rows = Array.from(table.rows);
            let minR = 999, maxR = -1, minC = 999, maxC = -1;
            selectedCells.forEach(td => {
                const r = td.parentElement.rowIndex; const c = td.cellIndex;
                minR = Math.min(minR, r); maxR = Math.max(maxR, r);
                minC = Math.min(minC, c); maxC = Math.max(maxC, c);
            });
            const main = rows[minR].cells[minC];
            main.setAttribute('rowspan', (maxR - minR) + 1);
            main.setAttribute('colspan', (maxC - minC) + 1);
            selectedCells.forEach(td => { if (td !== main) td.remove(); });
            clearSelection();
            recordState();
        }

        // 병합된 셀 나누기 (colspan/rowspan 해제 → 빈 셀 채우기)
        function splitMergedCell() {
            const cell = lastActiveCell;
            if (!cell) return showToast('나누기할 셀을 클릭하세요.');
            const colspan = parseInt(cell.getAttribute('colspan') || '1');
            const rowspan = parseInt(cell.getAttribute('rowspan') || '1');
            if (colspan <= 1 && rowspan <= 1) return showToast('병합된 셀이 아닙니다.');
            recordState();
            const table = cell.closest('table');
            const rows  = Array.from(table.rows);
            const rowIdx = cell.parentElement.rowIndex;
            const colIdx = cell.cellIndex;
            const baseStyle = cell.style.cssText || '';

            // colspan 해제: 같은 행에 빈 셀 추가
            cell.removeAttribute('colspan');
            cell.removeAttribute('rowspan');
            for (let c = 1; c < colspan; c++) {
                const nd = document.createElement('td');
                nd.style.cssText = baseStyle;
                cell.after(nd);
            }
            // rowspan 해제: 아래 행에 colspan만큼 빈 셀 추가
            for (let r = 1; r < rowspan; r++) {
                const targetRow = rows[rowIdx + r];
                if (!targetRow) continue;
                for (let c = 0; c < colspan; c++) {
                    const nd = document.createElement('td');
                    nd.style.cssText = baseStyle;
                    const ref = targetRow.cells[colIdx + c] || null;
                    targetRow.insertBefore(nd, ref);
                }
            }
            clearSelection();
            recordState();
            showToast('셀이 나누어졌습니다.');
        }

        function clearSelection() { document.querySelectorAll('.selected-cell').forEach(el => el.classList.remove('selected-cell')); selectedCells = []; }

// ────────────────────────────────────────────────────────────────
// fixTableThs + 내부 closure helpers (Stage 3 후 L9125-9318)
// ────────────────────────────────────────────────────────────────
        // tbody 내 th → td 강제 변환 + 각 행의 컬럼 수 정규화
        function fixTableThs(root) {
            (root || getById('contentArea'))?.querySelectorAll('table').forEach(table => {
                // ──────────────────────────────────────────────────────
                // [회귀 방지 2026-04-23] 빈 헤더·빈 선두 행 제거
                //  과거 생성물의 <thead><tr><th></th>...</tr></thead>·<tbody> 선두 빈 행이
                //  렌더 시 빈 줄로 보이는 버그 → 모든 테이블 정규화 시 항상 정리
                // ──────────────────────────────────────────────────────
                // [regression-fix 2026-05-06] strip the boolean `ead` attr from any <th ead>
                table.querySelectorAll('th[ead]').forEach(el => el.removeAttribute('ead'));
                // [fix 2026-05-27] event-video 셀(텍스트 없고 <video>/<img>/<iframe> 만) 도 "비었음" 판정되어
                //   영상 그리드 전체 row 가 통째로 제거되는 회귀 차단. textContent 외에 media element 도 검사.
                const _isCellEmpty = c => {
                    const hasText = !!(c.textContent || '').replace(/ |\s/g, '');
                    if (hasText) return false;
                    return !c.querySelector('video,img,iframe,audio,source,canvas,svg,button,a,input');
                };
                const _isRowEmpty = tr => {
                    const cells = tr.querySelectorAll('th,td');
                    return cells.length === 0 || Array.from(cells).every(_isCellEmpty);
                };
                table.querySelectorAll('thead tr').forEach(tr => { if (_isRowEmpty(tr)) tr.remove(); });
                table.querySelectorAll('thead').forEach(th => { if (th.children.length === 0) th.remove(); });
                const _tbody = table.querySelector('tbody');
                if (_tbody) {
                    while (_tbody.firstElementChild && _isRowEmpty(_tbody.firstElementChild)) {
                        _tbody.firstElementChild.remove();
                    }
                }
                while (table.firstElementChild && table.firstElementChild.tagName === 'TR' && _isRowEmpty(table.firstElementChild)) {
                    table.firstElementChild.remove();
                }

                // 0) td/th 안의 기존 custom-resizer 래퍼 제거 → img를 inline 취급으로 복원
                // 안전: img + resizer-handle만 있는 래퍼만 처리 (다른 콘텐츠 있으면 건드리지 않음)
                table.querySelectorAll('td .custom-resizer, th .custom-resizer').forEach(wrap => {
                    const img = wrap.querySelector('img');
                    if (!img) return; // img 없는 래퍼는 건드리지 않음 (콘텐츠 유실 방지)
                    // img + resizer-handle 이외의 자식이 있으면 보존 (건드리지 않음)
                    const nonHandleChildren = Array.from(wrap.children).filter(
                        c => !c.classList.contains('resizer-handle') && c !== img
                    );
                    if (nonHandleChildren.length > 0) return; // 다른 자식 있으면 스킵
                    img.style.maxWidth = '100%';
                    img.style.height = 'auto';
                    img.style.display = 'block';
                    img.style.margin = '0 auto';
                    img.style.pointerEvents = '';
                    wrap.replaceWith(img);
                });

                // 0-0) 모든 td/th 공통 인라인 스타일 일괄 적용
                // ⚠️ outline/position 은 인라인 적용 금지 — CSS selected-cell 오버라이드 방지
                // [2026-05-28 fix] 영상 그리드 표(event-video div 포함) 셀에는 border 기본값 박지 않음 —
                //   rules/15-video.md: "그리드 <table> 자체에는 외곽 border 권장 X". 회색 테두리 보이는 회귀 차단.
                const _isVideoGridCell = table.querySelector('.event-video') !== null;
                table.querySelectorAll('td, th').forEach(cell => {
                    // border 단축속성은 4면 값이 다르면 빈 문자열을 반환. 개별 사이드도 함께 검사하지 않으면
                    //   normalizeTableStructure 가 박은 `border:none;border-bottom:Xpx solid Y` 위에 회색 보더가 덮인다.
                    const _hasAnyBorder = cell.style.border || cell.style.borderTop || cell.style.borderRight || cell.style.borderBottom || cell.style.borderLeft;
                    if (!_hasAnyBorder && !_isVideoGridCell) cell.style.border = '1px solid #d9d9d9';
                    if (!cell.style.padding)        cell.style.padding       = '0.875rem 1rem';
                    if (!cell.style.minWidth)       cell.style.minWidth      = '2.5rem';
                    cell.style.wordBreak     = 'keep-all';
                    cell.style.overflowWrap  = 'break-word';
                    cell.style.verticalAlign = 'middle';
                    cell.style.lineHeight    = '1.4';
                    if (!cell.style.color)          cell.style.color         = 'inherit';
                    cell.style.boxSizing     = 'border-box';
                    if (!cell.style.fontSize)       cell.style.fontSize      = 'clamp(13px,1.5vw,15px)';
                });
                // 0-1) thead th/td 텍스트 가운데 정렬 + 헤더 하단 구분선
                table.querySelectorAll('thead th, thead td').forEach(cell => {
                    cell.style.textAlign    = 'center';
                    cell.style.fontWeight   = '700';
                    // AI가 설정한 border-bottom 보존, 없을 때만 기본값 적용
                    if (!cell.style.borderBottom) {
                        const ac = getById('accentPicker')?.value;
                        cell.style.borderBottom = '2px solid ' + ((ac && ac !== '#888888') ? ac : '#8b7355');
                    }
                });
                // 0-2) 테이블 자체 인라인 스타일 정규화
                table.style.borderCollapse = 'collapse';
                table.style.width          = '100%';
                table.style.tableLayout    = 'fixed';
                table.style.boxSizing      = 'border-box';

                // 1) thead의 th는 유지, 나머지 th → td 변환
                const theadThs = new Set();
                table.querySelectorAll('thead th').forEach(th => theadThs.add(th));
                table.querySelectorAll('th').forEach(th => {
                    if (theadThs.has(th)) return; // thead 헤더는 유지
                    const td = document.createElement('td');
                    td.innerHTML = th.innerHTML;
                    td.style.cssText = th.style.cssText;
                    if (th.getAttribute('colspan')) td.setAttribute('colspan', th.getAttribute('colspan'));
                    if (th.getAttribute('rowspan')) td.setAttribute('rowspan', th.getAttribute('rowspan'));
                    if (th.className) td.className = th.className;
                    th.replaceWith(td);
                });

                // 2) 컬럼 수 불일치 정규화 — rowspan/colspan 완전 고려 (그리드 시뮬레이션)
                const allRows = Array.from(table.querySelectorAll('tr'));
                if (allRows.length === 0) return;

                // [회귀 방지 2026-05-19] phantom 셀 cascade 방어 1단계
                //   Gemini hallucination 으로 한 행에 빈 <td></td> 가 폭주(수백~수만 개)하면,
                //   그 행의 셀 수가 maxCols 가 되고 → 다른 모든 행이 그만큼 phantom 셀로 채워져 cascade 폭주.
                //   maxCols 계산 전, 각 행 끝의 연속 빈 셀(3개 이상)을 미리 제거해 cascade 차단.
                const _isEffectivelyEmpty = (cell) => {
                    if ((cell.textContent || '').replace(/[\s ]/g, '')) return false;
                    return !cell.querySelector('img,video,button,a,iframe,input,svg,canvas');
                };
                let _phantomStripped = 0;
                allRows.forEach(tr => {
                    const cs = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                    let lastNonEmpty = cs.length - 1;
                    while (lastNonEmpty >= 0 && _isEffectivelyEmpty(cs[lastNonEmpty])) lastNonEmpty--;
                    const trailingEmpty = cs.length - 1 - lastNonEmpty;
                    if (trailingEmpty >= 3) {
                        for (let i = cs.length - 1; i > lastNonEmpty; i--) {
                            cs[i].remove();
                            _phantomStripped++;
                        }
                    }
                });
                if (_phantomStripped > 0) {
                    console.warn('[fixTableThs] phantom trailing cells stripped:', _phantomStripped);
                }

                // 그리드 시뮬레이션: rowspan이 아래 행을 점유하는 것까지 추적
                const occupied = {}; // rowIdx → Set<colIdx>
                const markOccupied = (rowIdx, colIdx, rowspan, colspan) => {
                    for (let r = rowIdx; r < rowIdx + rowspan; r++) {
                        if (!occupied[r]) occupied[r] = new Set();
                        for (let c = colIdx; c < colIdx + colspan; c++) occupied[r].add(c);
                    }
                };
                let maxCols = 0;
                allRows.forEach((tr, rowIdx) => {
                    let colIdx = 0;
                    Array.from(tr.querySelectorAll('td, th')).forEach(cell => {
                        while (occupied[rowIdx]?.has(colIdx)) colIdx++;
                        const cs = parseInt(cell.getAttribute('colspan') || '1') || 1;
                        const rs = parseInt(cell.getAttribute('rowspan') || '1') || 1;
                        markOccupied(rowIdx, colIdx, rs, cs);
                        colIdx += cs;
                    });
                    const rowTotal = occupied[rowIdx] ? occupied[rowIdx].size : colIdx;
                    maxCols = Math.max(maxCols, rowTotal);
                });
                if (maxCols <= 0) return;

                // [회귀 방지 2026-05-19] phantom cascade 방어 2단계 (안전망)
                //   1단계 strip 이 놓친 케이스에 대비. 정상 프로모 테이블은 컬럼 20개 이하.
                //   maxCols 가 비정상적으로 크면 phantom 으로 간주하고 셀 패딩 스킵.
                const MAX_REASONABLE_COLS = 20;
                if (maxCols > MAX_REASONABLE_COLS) {
                    console.warn('[fixTableThs] maxCols', maxCols, '> 20 — phantom row suspected, skipping column padding');
                    return;
                }

                // 부족한 행에만 빈 td 보충 — rowspan으로 덮인 행은 이미 occupiedInRow == maxCols
                table.querySelectorAll('tbody tr, tfoot tr').forEach(tr => {
                    const rowIdx = allRows.indexOf(tr);
                    const occupiedInRow = occupied[rowIdx] ? occupied[rowIdx].size : 0;
                    for (let c = occupiedInRow; c < maxCols; c++) {
                        const td = document.createElement('td');
                        td.style.cssText = 'border:1px solid #d9d9d9;padding:0.875rem 1rem;min-width:2.5rem;word-break:keep-all;overflow-wrap:break-word;vertical-align:middle;line-height:1.4;color:inherit;box-sizing:border-box;font-size:clamp(13px,1.5vw,15px);';
                        tr.appendChild(td);
                    }
                });

                // 3) 빈 행 제거 — 빈 인라인 포매팅 요소(span/b 등)도 비어있음으로 간주
                function isCellEffEmpty(cell) {
                    if (cell.textContent.replace(/[\s\u00a0\u200b]/g, '') !== '') return false;
                    return !Array.from(cell.childNodes).some(n => {
                        if (n.nodeType !== 1) return false;
                        if (['BR','WBR'].includes(n.tagName)) return false;
                        if (['SPAN','B','STRONG','I','EM','U','S','A','SMALL'].includes(n.tagName)) return !isCellEffEmpty(n);
                        return true; // IMG, TABLE 등 실체 요소
                    });
                }
                table.querySelectorAll('tr').forEach(tr => {
                    const cells = Array.from(tr.querySelectorAll('td, th'));
                    if (cells.length === 0) { tr.remove(); return; }
                    if (cells.every(isCellEffEmpty)) tr.remove();
                });
                // 빈 thead / tbody / tfoot 섹션 제거
                table.querySelectorAll('thead, tbody, tfoot').forEach(section => {
                    if (section.querySelectorAll('tr').length === 0) section.remove();
                });
            });
        }

// ────────────────────────────────────────────────────────────────
// Gemini 출력 후처리 — 표 safety net (app.js generateContent 에서 이전 2026-05-29)
//   normalizeTableStructure(root, ctx): 데이터만 추출 → 고정 템플릿 재조립
//   stripEmptyTableRows(root): 빈 tr/thead/tbody DOM 기반 제거
//   standardizeTableStyles(area): 빈도 기반 표 스타일 통일 (영상 그리드 제외)
//   installEmptyRowGuard(): 빈 row 실시간 감시 MutationObserver
// ctx = {borderColor, textColor, thBgColor, subColor, ...}
// ────────────────────────────────────────────────────────────────

        // [regression-fix 2026-05-12] 테이블 구조 강제 정규화 — 데이터만 추출 → 고정 템플릿 재조립.
        //   AI 가 어떤 변종(빈 셀/잘못된 thead/auto-wrapped tbody/<th ead>/두 tbody 등)을 뱉어도
        //   데이터만 살아남고 구조는 항상 동일. rules/11-table.md §테이블 규칙 의 정의 스타일 사용.
        function normalizeTableStructure(root, ctx) {
            const { borderColor, textColor, thBgColor, subColor } = ctx;
            // 헤더: bg는 thBgColor(accent 톤)로 강조, top border 없음, bottom 1px borderColor.
            //       text는 textColor(흑/백) — 헤더 bg 자체가 강조 역할이라 accent 텍스트 중복 제거.
            const TH_STYLE = `padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};font-weight:800;color:${textColor};text-align:center;background-color:${thBgColor};word-break:keep-all;vertical-align:middle;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:inherit;`;
            // 본문: 행 사이 호흡 위해 padding 1rem, 라인은 borderColor 그대로. 헤더(textColor) 와 위계 위해 subColor 사용
            const TD_STYLE = `padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};color:${subColor};text-align:center;vertical-align:middle;word-break:keep-all;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:inherit;background-color:transparent;`;
            // 마지막 데이터 행은 border-bottom 제거 — 카드 바닥과 충돌 방지
            const TD_STYLE_LAST = TD_STYLE.replace(/border-bottom\s*:[^;]+;?/, 'border-bottom:none;');
            const hasContent = c => {
                const text = (c.content || '').replace(/<[^>]*>/g, '').replace(/[\s ]/g, '');
                const hasImg = /<img\s[^>]*src\s*=\s*["'][^"']+["']/i.test(c.content || '');
                return !!(text || hasImg);
            };
            const attrStr = c => (c.colspan ? ` colspan="${c.colspan}"` : '') + (c.rowspan ? ` rowspan="${c.rowspan}"` : '');
            // innermost 부터 처리 (중첩 테이블 안전)
            Array.from(root.querySelectorAll('table')).reverse().forEach(table => {
                // 1. 직접 자식 행만 추출 (중첩 table 의 row 가 섞이지 않도록)
                const allRows = Array.from(table.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr'));
                const extractedRows = allRows.map(tr => {
                    const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
                    return cells.map(c => ({
                        content: c.innerHTML.trim(),
                        isHeader: c.tagName === 'TH' || !!c.closest('thead'),
                        colspan: c.getAttribute('colspan'),
                        rowspan: c.getAttribute('rowspan'),
                        width: c.style.width || ''
                    }));
                }).filter(row => row.length > 0 && row.some(hasContent));
                // 데이터가 전혀 없으면 테이블 제거
                if (extractedRows.length === 0) { table.remove(); return; }
                // 2. 첫 행이 모두 header 이면 thead 로 승격
                const firstIsHeader = extractedRows[0].every(c => c.isHeader);
                const headerRow = firstIsHeader ? extractedRows[0] : null;
                const dataRows  = firstIsHeader ? extractedRows.slice(1) : extractedRows;
                // 3. 고정 템플릿으로 재조립
                let inner = '';
                if (headerRow) {
                    inner += '<thead><tr>' + headerRow.map(c => {
                        const w = c.width ? `width:${c.width};` : '';
                        return `<th style="${w}${TH_STYLE}"${attrStr(c)}>${c.content}</th>`;
                    }).join('') + '</tr></thead>';
                }
                if (dataRows.length > 0) {
                    inner += '<tbody>' + dataRows.map((row, rowIdx) => {
                        const isLast = rowIdx === dataRows.length - 1;
                        const tdStyle = isLast ? TD_STYLE_LAST : TD_STYLE;
                        return '<tr>' + row.map(c => {
                            const w = c.width ? `width:${c.width};` : '';
                            return `<td style="${w}${tdStyle}"${attrStr(c)}>${c.content}</td>`;
                        }).join('') + '</tr>';
                    }).join('') + '</tbody>';
                }
                // 4. table 자체 보존 (wrapper div 안전) + 내부만 교체
                if (!table.getAttribute('style')) {
                    table.setAttribute('style', 'width:100%;border-collapse:collapse;table-layout:fixed;margin:0;');
                }
                table.innerHTML = inner;
            });
        }

        // ─────────────────────────────────────────────────────
        // [회귀 방지 2026-04-23] 빈 판정 기준 강화
        //   이전 버그: innerHTML === '' || '&nbsp;' 만 빈 셀로 간주
        //   → 셀 안에 <span></span>, <p></p>, <div> </div> 같은 빈 래퍼 있으면
        //     '비어있지 않음' 으로 오판 → 빈 선두 헤더 행이 DOM 에 남음
        //   수정: textContent 기반 + 이미지 체크만. 래퍼가 뭐든 **보이는 텍스트·이미지가 없으면** 빈 셀.
        // ─────────────────────────────────────────────────────
        function stripEmptyTableRows(root) {
            const _cellHasImage = (cell) => Array.from(cell.querySelectorAll('img')).some(i => {
                const s = i.getAttribute('src') || '';
                return s && s !== '#' && s.length > 1;
            });
            const _cellIsEmpty = (cell) => {
                const t = (cell.textContent || '').replace(/[\s ]/g, '');
                return t === '' && !_cellHasImage(cell);
            };
            const _rowIsEmpty = (tr) => {
                const cells = tr.querySelectorAll('td, th');
                return cells.length === 0 || Array.from(cells).every(_cellIsEmpty);
            };

            root.querySelectorAll('table').forEach(table => {
                table.querySelectorAll('tr').forEach(tr => {
                    if (_rowIsEmpty(tr)) tr.remove();
                });
                // 빈 thead/tbody 제거
                table.querySelectorAll('thead, tbody').forEach(tb => {
                    if (tb.querySelectorAll('tr').length === 0) tb.remove();
                });
                // <thead> 선두 빈 행 연속 제거 (재보호)
                const thead = table.querySelector('thead');
                if (thead) {
                    while (thead.firstElementChild && _rowIsEmpty(thead.firstElementChild)) {
                        thead.firstElementChild.remove();
                    }
                    if (thead.children.length === 0) thead.remove();
                }
                // <tbody> 선두 빈 행 연속 제거
                const tbody = table.querySelector('tbody');
                if (tbody) {
                    while (tbody.firstElementChild && _rowIsEmpty(tbody.firstElementChild)) {
                        tbody.firstElementChild.remove();
                    }
                }
                // <table> 직속 선두 빈 <tr> 연속 제거
                while (table.firstElementChild && table.firstElementChild.tagName === 'TR' && _rowIsEmpty(table.firstElementChild)) {
                    table.firstElementChild.remove();
                }
            });
        }

        // ── 테이블 스타일 자동 통일 ──
        // AI가 생성한 테이블들의 스타일이 제각각일 때, 가장 많이 쓰인 스타일을 기준으로 전체 통일
        function standardizeTableStyles(area) {
            // contentArea + 모든 팝업 childArea 대상
            const allAreas = [area];
            childPanels.forEach(p => { const ca = getById('childArea_' + p.id); if (ca) allAreas.push(ca); });
            const tables = [];
            allAreas.forEach(a => a.querySelectorAll('table').forEach(t => tables.push(t)));
            if (tables.length === 0) return;
            // [2026-05-28 fix] 영상 그리드 표(event-video div 포함)는 데이터 표가 아니므로 통일 스타일
            // 적용 대상에서 제외. 안 그러면 데이터 표의 borderBottom 이 영상 그리드 셀에 4면 border 로 박힘.
            const isVideoGridTable = (tbl) => !!tbl.querySelector('.event-video');
            const dataTables = tables.filter(t => !isVideoGridTable(t));
            // 1) th border-bottom 색 수집 (가장 빈도 높은 것 = AI가 의도한 기준) — 데이터 표만
            const thBorderFreq = {}, thBgFreq = {}, thColorFreq = {}, tdBorderFreq = {};
            dataTables.forEach(tbl => {
                tbl.querySelectorAll('th').forEach(th => {
                    const s = th.style;
                    if (s.borderBottom) thBorderFreq[s.borderBottom] = (thBorderFreq[s.borderBottom]||0)+1;
                    if (s.backgroundColor) thBgFreq[s.backgroundColor] = (thBgFreq[s.backgroundColor]||0)+1;
                    if (s.color) thColorFreq[s.color] = (thColorFreq[s.color]||0)+1;
                });
                tbl.querySelectorAll('td').forEach(td => {
                    // [2026-05-28 fix] borderBottom 만 수집 — 데이터 표는 rules/11-table.md 상
                    // border:none;border-bottom 만 허용. border 단축으로 모으면 4면 라인이 박힘.
                    const b = td.style.borderBottom || '';
                    if (b) tdBorderFreq[b] = (tdBorderFreq[b]||0)+1;
                });
            });
            const topOf = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
            const stdThBorderBottom = topOf(thBorderFreq);
            const stdThBg = topOf(thBgFreq);
            const stdThColor = topOf(thColorFreq);
            const stdTdBorderBottom = topOf(tdBorderFreq);
            // 2) 데이터 표에만 기준 스타일 일괄 적용 (영상 그리드는 건드리지 않음)
            dataTables.forEach(tbl => {
                tbl.style.borderCollapse = 'collapse';
                if (!tbl.style.width) tbl.style.width = '100%';
                if (!tbl.style.tableLayout) tbl.style.tableLayout = 'fixed';
                // [2026-06-01] 표 상단 라인 — 본문 행 구분선과 동일한 라인을 table 상단에 추가 (사용자 결정).
                //   기존 정책(외곽 상단 라인 없음)에서 변경: 헤더 bg 없는 표가 상단 경계 없이 떠 보이는 문제.
                //   행 구분선(stdTdBorderBottom)과 동일한 1px solid ${borderColor} 라 일관됨. 없으면 th 라인 폴백.
                const _topLine = stdTdBorderBottom || stdThBorderBottom;
                if (_topLine) tbl.style.borderTop = _topLine;
                tbl.querySelectorAll('th').forEach(th => {
                    if (stdThBorderBottom) th.style.borderBottom = stdThBorderBottom;
                    if (stdThBg) th.style.backgroundColor = stdThBg;
                    if (stdThColor) th.style.color = stdThColor;
                    th.style.fontWeight = '700';
                    th.style.textAlign = 'center';
                });
                tbl.querySelectorAll('td').forEach(td => {
                    // [2026-05-28 fix] borderBottom 만 적용 — rules/11-table.md 의 border:none;border-bottom 룰 준수.
                    // 기존엔 `border:` 로 4면 박혀서 격자 무늬처럼 보임 (회귀).
                    if (stdTdBorderBottom) {
                        td.style.border = 'none';
                        td.style.borderBottom = stdTdBorderBottom;
                    }
                });
                // [2026-06-02] 표 상단 라인은 첫 행 셀(th/td)에 직접 border-top — border-collapse:collapse 에서
                //   <table> 요소의 border-top 은 첫 행 셀의 border:none 과 충돌해 렌더가 누락되는 경우가 있어,
                //   첫 행 셀에 직접 박아 확실히 그린다. 위 td 루프의 border:none 이후에 적용해야 덮이지 않음.
                //   table 의 border-top(위)과 같은 위치라 collapse 로 합쳐짐 → 이중선 없음.
                if (_topLine) {
                    const _firstRow = tbl.querySelector('tr');
                    if (_firstRow) _firstRow.querySelectorAll('th, td').forEach(c => { c.style.borderTop = _topLine; });
                }
            });

            // [2026-05-31] 표 위/아래 간격 보장 (콘텐츠 + 팝업 패널 모두). → ensureTableSpacers
            allAreas.forEach(a => ensureTableSpacers(a));
        }

        // [2026-05-31 / 2026-06-01] 표(또는 표만 단독으로 감싼 스크롤/콜아웃 래퍼) 위·아래에 16px spacer 보장.
        //   인접 형제가 실제 콘텐츠면 16px spacer 삽입, 이미 빈 spacer <p> 면 그 높이를 16px 로 정규화.
        //   [2026-06-01] 사용자 결정 — 표 위·아래 간격 16px 통일 (기존 32px 너무 넓음 / 8px·32px 룰 충돌 해소).
        //   기존 spacer 도 정규화하는 이유: Gemini 가 옛 8px 또는 32px spacer 를 이미 출력한 경우, 삽입만으론
        //   안 고쳐짐 → 인접 spacer 높이를 직접 16px 로 맞춰야 실제 간격이 통일됨. 콘텐츠/팝업 패널 양쪽 호출.
        function ensureTableSpacers(rootEl) {
            if (!rootEl || !rootEl.querySelectorAll) return;
            const _isSpacerP = (n) => n && n.nodeType === 1 && n.tagName === 'P'
                && !(n.textContent || '').trim()
                && !n.querySelector('img,table,video,iframe,svg,canvas,button,a');
            const _setH = (p) => p.setAttribute('style', 'height:16px;margin:0;');
            const _mk = () => { const p = document.createElement('p'); _setH(p); return p; };
            rootEl.querySelectorAll('table').forEach(tbl => {
                let unit = tbl;
                const _p = tbl.parentElement;
                if (_p && _p.children && _p.children.length === 1 && _p.firstElementChild === tbl) {
                    const _ps = (_p.getAttribute('style') || '') + ' ' + (_p.className || '');
                    if (/overflow|tbl-scroll-wrap/i.test(_ps)) unit = _p;
                }
                const parent = unit.parentElement;
                if (!parent) return;
                const _prev = unit.previousElementSibling;
                const _next = unit.nextElementSibling;
                if (_prev) { if (_isSpacerP(_prev)) _setH(_prev); else parent.insertBefore(_mk(), unit); }
                if (_next) { if (_isSpacerP(_next)) _setH(_next); else parent.insertBefore(_mk(), _next); }
            });
        }

        // ─────────────────────────────────────────────────────────
        // [회귀 방지 2026-04-23] 빈 테이블 헤더·선두 빈 행 감시자
        //  어떤 경로로 <table> 이 삽입되든 즉시 정리 (render 시점 최종 방어선)
        //  - 호출 시 기존 테이블 정리
        //  - MutationObserver 로 이후 삽입되는 테이블도 감시
        // ─────────────────────────────────────────────────────────
        function installEmptyRowGuard() {
            // [fix 2026-05-28] event-video / 이미지만 있는 셀(텍스트 0)도 "비었음" 판정되어
            //   영상 그리드 row 전부 제거되는 회귀 차단. fixTableThs 의 _isCellEmpty 와 동일 로직.
            const _isCellEmpty = c => {
                const hasText = !!(c.textContent || '').replace(/ |\s/g, '');
                if (hasText) return false;
                return !c.querySelector('video,img,iframe,audio,source,canvas,svg,button,a,input');
            };
            const _isRowEmpty = tr => {
                const cells = tr.querySelectorAll('th,td');
                return cells.length === 0 || Array.from(cells).every(_isCellEmpty);
            };
            const stripTable = (tbl) => {
                let removed = 0;
                // [regression-fix 2026-05-06] HTML parser turned <thead> into <th ead> — strip the boolean attr
                //   only this 1 line; no other changes. cells then fall through existing empty-row logic.
                tbl.querySelectorAll('th[ead]').forEach(el => el.removeAttribute('ead'));
                tbl.querySelectorAll('thead tr').forEach(tr => { if (_isRowEmpty(tr)) { tr.remove(); removed++; } });
                tbl.querySelectorAll('thead').forEach(th => { if (th.children.length === 0) th.remove(); });
                const tbody = tbl.querySelector('tbody');
                if (tbody) {
                    while (tbody.firstElementChild && _isRowEmpty(tbody.firstElementChild)) {
                        tbody.firstElementChild.remove(); removed++;
                    }
                }
                while (tbl.firstElementChild && tbl.firstElementChild.tagName === 'TR' && _isRowEmpty(tbl.firstElementChild)) {
                    tbl.firstElementChild.remove(); removed++;
                }
                return removed;
            };
            // 1) 초기 스위핑
            let initRemoved = 0;
            document.querySelectorAll('#contentArea table, [id^="childArea_"] table').forEach(tbl => { initRemoved += stripTable(tbl); });
            if (initRemoved > 0) console.log('[empty-row-guard] init removed:', initRemoved);
            // 2) 실시간 감시 — <table> 또는 그 내부 <tr> 가 추가되면 해당 테이블 정리
            const target = document.getElementById('contentArea');
            if (target && 'MutationObserver' in window) {
                const mo = new MutationObserver((mutations) => {
                    const touched = new Set();
                    for (const m of mutations) {
                        for (const n of m.addedNodes) {
                            if (n.nodeType !== 1) continue;
                            if (n.tagName === 'TABLE') touched.add(n);
                            if (n.querySelectorAll) n.querySelectorAll('table').forEach(t => touched.add(t));
                            // <tr> 삽입된 경우 부모 테이블도 추적
                            const parentTable = n.closest && n.closest('table');
                            if (parentTable) touched.add(parentTable);
                        }
                    }
                    let r = 0;
                    touched.forEach(tbl => { r += stripTable(tbl); });
                    if (r > 0) console.log('[empty-row-guard] mutation removed:', r);
                });
                mo.observe(target, { childList: true, subtree: true });
            }
            // 3) 글로벌 노출 — 수동 호출 가능
            window.__stripEmptyTableRows = () => {
                let r = 0;
                document.querySelectorAll('table').forEach(tbl => { r += stripTable(tbl); });
                console.log('[empty-row-guard] manual removed:', r);
                return r;
            };
        }

        // ── tbody 내 th → td 강제 변환 자동수정 (app.js bootstrap 에서 분리, 2026-05-29) ──
        //   contentEl 에 MutationObserver 설치: <th> 삽입 감지 시 다음 tick 에 fixTableThs() 1회 실행 (배치).
        //   + 초기 1회 실행 + input 이벤트 디바운스(200ms) 보호. installEmptyRowGuard 와 동일 소유 패턴.
        function initTableHeaderFix(contentEl) {
            if (!contentEl) return;
            let _scheduled = false;
            const schedule = () => {
                if (_scheduled) return;
                _scheduled = true;
                // 브라우저가 DOM 처리를 끝낸 다음 tick에 실행 (즉시 실행 시 th가 아직 확정 안 된 경우 방지)
                Promise.resolve().then(() => { _scheduled = false; fixTableThs(); });
            };
            const observer = new MutationObserver(mutations => {
                let needFix = false;
                for (const m of mutations) {
                    if (m.type === 'childList') {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === 1) {
                                if (node.tagName === 'TH' || node.querySelector?.('th')) {
                                    needFix = true; break;
                                }
                            }
                        }
                    }
                    if (needFix) break;
                }
                if (needFix) schedule();
            });
            observer.observe(contentEl, { childList: true, subtree: true });
            // 초기 로드 시에도 한 번 실행
            fixTableThs();
            // input 이벤트 추가 보호 — 편집 중 th 재발생 방어
            let _timer = null;
            contentEl.addEventListener('input', () => {
                clearTimeout(_timer);
                _timer = setTimeout(() => fixTableThs(), 200);
            });
        }
