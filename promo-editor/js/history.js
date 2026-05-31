// promo-editor/js/history.js — undo/redo 히스토리
//
// app.js 에서 분리 (Stage 9 — 2026-05-28). 단일 블록 L569-634.
// 포함: recordState, undoAction, redoAction.
//
// 의존:
// - state.js: historyStack, historyIdx
// - utils.js: getById
// - app.js (runtime): showToast, hideAllTools, clearActiveLayer

        function recordState() {
            const area = getById('contentArea');
            if(!area) return;
            const currentState = area.innerHTML;
            if (historyIdx < historyStack.length - 1) {
                historyStack = historyStack.slice(0, historyIdx + 1);
            }
            historyStack.push(currentState);
            if (historyStack.length > 20) {
                historyStack.shift();
            }
            historyIdx = historyStack.length - 1;
        }

        function undoAction() {
            // 타이핑 타이머가 pending 중이면 flush: 현재 상태를 스택에 먼저 기록
            if (typingTimer) {
                clearTimeout(typingTimer);
                typingTimer = null;
                const _area = getById('contentArea');
                if (_area) {
                    const cur = _area.innerHTML;
                    if (historyStack.length === 0 || historyStack[historyIdx] !== cur) {
                        if (historyIdx < historyStack.length - 1) historyStack = historyStack.slice(0, historyIdx + 1);
                        historyStack.push(cur);
                        if (historyStack.length > 20) historyStack.shift();
                        historyIdx = historyStack.length - 1;
                    }
                }
            }
            if (historyIdx > 0) {
                historyIdx--;
                const area = getById('contentArea');
                area.innerHTML = historyStack[historyIdx];
                clearActiveLayer();
                hideAllTools();
                showToast('↩ 되돌리기 (' + historyIdx + '/' + (historyStack.length-1) + ')');
            } else {
                showToast('↩ 더 이상 되돌릴 수 없습니다.');
            }
        }

        function redoAction() {
            // 타이핑 타이머가 pending 중이면 flush: 현재 상태를 스택에 먼저 기록
            if (typingTimer) {
                clearTimeout(typingTimer);
                typingTimer = null;
                const _area = getById('contentArea');
                if (_area) {
                    const cur = _area.innerHTML;
                    if (historyStack.length === 0 || historyStack[historyIdx] !== cur) {
                        if (historyIdx < historyStack.length - 1) historyStack = historyStack.slice(0, historyIdx + 1);
                        historyStack.push(cur);
                        if (historyStack.length > 20) historyStack.shift();
                        historyIdx = historyStack.length - 1;
                    }
                }
            }
            if (historyIdx < historyStack.length - 1) {
                historyIdx++;
                const area = getById('contentArea');
                area.innerHTML = historyStack[historyIdx];
                hideAllTools();
                showToast('↪ 다시 실행 (' + historyIdx + '/' + (historyStack.length-1) + ')');
            }
        }
