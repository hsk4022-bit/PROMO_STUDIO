// promo-editor/js/clipboard.js — 에디터 클립보드 + copy/cut/paste
//
// app.js 에서 분리 (Stage 8 — 2026-05-28). 2 비연속 블록.
// 포함:
//   ① cloneToClipboard (Stage 7 후 L50-57)
//   ② copyActiveLayer, deleteActiveLayer, refreshPasteBtn,
//      imgCopyAction, imgCutAction, imgPasteAction (Stage 7 후 L576-708)
//
// 의존:
// - state.js: activeLayer, imgClipboard
// - utils.js: getById
// - image-editor.js: showImgFloatToolbar
// - app.js (runtime): recordState, showToast, setBlockClipboard, addResizerHandles

// ────────────────────────────────────────────────────────────────
// ① cloneToClipboard (Stage 7 후 L50-57)
// ────────────────────────────────────────────────────────────────
        // 이미지 클립보드 복사 (copy/cut 공통)
        function cloneToClipboard() {
            const clone = activeLayer.cloneNode(true);
            clone.classList.remove('active-layer');
            clone.querySelectorAll('.resizer-handle').forEach(h => h.remove());
            imgClipboard = { outerHTML: clone.outerHTML, styleWidth: activeLayer.style.width };
            refreshPasteBtn();
        }

// ────────────────────────────────────────────────────────────────
// ② copy/cut/paste/delete (Stage 7 후 L576-708)
// ────────────────────────────────────────────────────────────────
        function copyActiveLayer() {
            // 텍스트 선택 상태면 시스템 복사
            const sel = window.getSelection();
            const selText = sel ? sel.toString().trim() : '';
            if (selText) {
                try { document.execCommand('copy'); } catch(e) {}
                showToast('텍스트 복사됨');
                return;
            }
            if (!activeLayer) return showToast("복사할 블록을 에디터에서 클릭하세요.");
            // HTML 클립보드에 저장 (div 전체 구조 보존)
            const clone = activeLayer.cloneNode(true);
            clone.classList.remove('active-layer');
            clone.querySelectorAll('.resizer-handle').forEach(h => h.remove());
            setBlockClipboard(clone.outerHTML); // blockPasteBtn도 같이 활성화
            refreshPasteBtn();
            // 시스템 클립보드에도 텍스트 복사 (fallback)
            try {
                activeLayer.classList.remove('active-layer');
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNode(activeLayer);
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('copy');
                activeLayer.classList.add('active-layer');
            } catch(e) {}
            showToast("블록 복사됨 — 붙여넣기 버튼으로 삽입하세요");
        }

        function deleteActiveLayer() {
            // 텍스트 선택 상태면 선택 텍스트 삭제
            const sel = window.getSelection();
            const selText = sel ? sel.toString().trim() : '';
            if (selText) {
                recordState();
                document.execCommand('delete');
                recordState();
                showToast('텍스트 삭제됨');
                return;
            }
            if (!activeLayer) return showToast("삭제할 요소를 에디터에서 클릭하세요.");
            // se-contents 또는 contentArea 직계 최상위는 삭제 금지
            const area = getById('contentArea');
            if (activeLayer.classList.contains('se-contents')) return showToast("최상위 컨테이너는 삭제할 수 없습니다.");
            if (activeLayer.parentElement === area && area.querySelectorAll(':scope > *').length <= 1) {
                return showToast("마지막 섹션은 삭제할 수 없습니다.");
            }
            recordState();
            if (activeLayer.tagName === 'IMG' && activeLayer.closest('td, th')) {
                const parentTd = activeLayer.closest('td, th');
                activeLayer.remove();
                activeLayer = null;
                hideAllTools();
                hideImgFloatToolbar();
                lastActiveCell = parentTd;
                recordState();
                showToast("이미지가 삭제되었습니다.");
                return;
            }
            activeLayer.remove();
            activeLayer = null;
            hideAllTools();
            recordState();
            showToast("선택된 요소가 삭제되었습니다.");
        }


        function refreshPasteBtn() {
            const btn = getById('imgBtnPaste');
            if (!btn) return;
            if (imgClipboard) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            } else {
                btn.style.opacity = '0.35';
                btn.style.pointerEvents = 'none';
            }
        }

        function imgCopyAction() {
            if (!activeLayer) return showToast("\uc774\ubbf8\uc9c0\ub97c \uba3c\uc800 \uc120\ud0dd\ud558\uc138\uc694.");
            const isResizer = activeLayer.classList.contains('custom-resizer');
            if (!isResizer && activeLayer.tagName !== 'IMG') return showToast("\uc774\ubbf8\uc9c0\ub97c \uba3c\uc800 \uc120\ud0dd\ud558\uc138\uc694.");
            cloneToClipboard();
            showToast("\uc774\ubbf8\uc9c0\uac00 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4. (Ctrl+V \ub610\ub294 \ubd99\uc5ec\ub123\uae30 \ubc84\ud2bc\uc73c\ub85c \ubd99\uc5ec\ub123\uc73c\uc138\uc694)");
        }

        function imgCutAction() {
            if (!activeLayer) return showToast("\uc774\ubbf8\uc9c0\ub97c \uba3c\uc800 \uc120\ud0dd\ud558\uc138\uc694.");
            const isResizer = activeLayer.classList.contains('custom-resizer');
            if (!isResizer && activeLayer.tagName !== 'IMG') return showToast("\uc774\ubbf8\uc9c0\ub97c \uba3c\uc800 \uc120\ud0dd\ud558\uc138\uc694.");
            cloneToClipboard();
            recordState();
            activeLayer.remove();
            activeLayer = null;
            hideImgFloatToolbar();
            getById('imgTools').style.display = 'none';
            recordState();
            showToast("\uc774\ubbf8\uc9c0\ub97c \uc798\ub77c\ub0c8\uc2b5\ub2c8\ub2e4. \ubd99\uc5ec\ub123\uc744 \uc704\uce58\ub97c \ud074\ub9ad \ud6c4 Ctrl+V \ud558\uc138\uc694.");
        }

        function imgPasteAction() {
            if (!imgClipboard) return showToast("복사하거나 잘라낸 이미지가 없습니다.");
            const area = getById('contentArea');
            if (!area) return;

            recordState();
            area.focus();

            if (savedRange && area.contains(savedRange.commonAncestorContainer)) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
                document.execCommand('insertHTML', false, imgClipboard.outerHTML);
            } else {
                area.insertAdjacentHTML('beforeend', imgClipboard.outerHTML);
            }

            const allResizers = area.querySelectorAll('.custom-resizer');
            const lastResizer = allResizers[allResizers.length - 1];
            if (lastResizer && lastResizer.querySelectorAll('.resizer-handle').length === 0) {
                addResizerHandles(lastResizer);
                if (activeLayer) activeLayer.classList.remove('active-layer');
                activeLayer = lastResizer;
                activeLayer.classList.add('active-layer');
                getById('imgTools').style.display = 'flex';
                showImgFloatToolbar(activeLayer);
            }

            recordState();
            showToast("\uc774\ubbf8\uc9c0\ub97c \ubd99\uc5ec\ub123\uc5c8\uc2b5\ub2c8\ub2e4.");
        }
