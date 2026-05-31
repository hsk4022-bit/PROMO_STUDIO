// promo-editor/js/drag-drop.js — 미디어 메뉴 + 드롭 핸들러 + 블록 클립보드
//
// app.js 에서 분리 (Stage 8 — 2026-05-28). 단일 블록 L778-943.
// 포함:
//   - toggleMediaMenu, closeMediaMenu, insertMediaByUrl
//   - blockPasteAction, setBlockClipboard, blockCopyAction, blockCutAction,
//     blockDeleteAction
//   - onDropRef, onDropAsset, onDropLogo, onDropContentAsset, onDragOver, onDragLeave
//
// 의존:
// - state.js: activeLayer, uploadedAssets, contentAssetLibrary, referenceImageBase64,
//             logoBase64/Pos/Size, blockClipboard
// - utils.js: getById, isImageFile
// - image-editor.js: applyHeroImage, deleteHeroImage
// - app.js (runtime): recordState, showToast, savedRange,
//                     renderHeroAssets (asset-library.js), renderContentAssets,
//                     compositeHeroWithLogo, renderLogoOverlay, loadLogoFile (video.js)


        // 미디어 드롭다운 메뉴 토글
        function toggleMediaMenu(id, e) {
            e.stopPropagation();
            const menu = getById(id);
            if (!menu) return;
            const isHidden = menu.classList.contains('hidden');
            // 다른 메뉴 닫기
            ['imgMenu','videoMenu','tableInsertMenu'].forEach(m => {
                const el = getById(m);
                if (el && m !== id) el.classList.add('hidden');
            });
            menu.classList.toggle('hidden', !isHidden);
        }
        function closeMediaMenu(id) {
            const menu = getById(id);
            if (menu) setTimeout(() => menu.classList.add('hidden'), 100);
        }
        // 외부 클릭 시 모든 미디어 메뉴 닫기
        document.addEventListener('click', () => {
            ['imgMenu','videoMenu'].forEach(id => {
                const el = getById(id);
                if (el) el.classList.add('hidden');
            });
        });

        // URL로 이미지/영상 삽입
        function insertMediaByUrl(type) {
            const url = prompt(type === 'image' ? '이미지 URL을 입력하세요:' : '영상 URL을 입력하세요 (mp4 등):');
            if (!url || !url.trim()) return;
            const area = getById('contentArea');
            area.focus();
            if (savedRange && area.contains(savedRange.startContainer)) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }
            recordState();
            let html = '';
            if (type === 'image') {
                html = `<img src="${url.trim()}" style="max-width:100%;height:auto;display:block;margin:0 auto;">`;
            } else {
                html = `<div class="se-div" style="margin:0;padding:0;"><video src="${url.trim()}" autoplay loop muted playsinline style="max-width:100%;width:100%;height:auto;display:block;margin:0 auto;" preload="metadata"></video></div>`;
            }
            document.execCommand('insertHTML', false, html);
            recordState();
        }

        // 블록 클립보드

        function blockPasteAction() {
            if (!blockClipboard) return showToast('붙여넣을 내용이 없습니다. 먼저 복사 또는 잘라내기를 하세요.');
            const area = getById('contentArea');
            area.focus();
            if (savedRange && area.contains(savedRange.startContainer)) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }
            recordState();
            document.execCommand('insertHTML', false, blockClipboard);
            recordState();
            showToast('붙여넣기 완료');
        }

        function setBlockClipboard(html) {
            blockClipboard = html;
            const btn = getById('blockPasteBtn');
            if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        }

        function blockCopyAction() {
            if (!activeLayer) return showToast('선택된 블록이 없습니다.');
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNode(activeLayer);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('copy');
            setBlockClipboard(activeLayer.outerHTML);
            showToast('블록이 복사되었습니다.');
        }

        function blockCutAction() {
            // 텍스트 선택 상태면 시스템 잘라내기
            const sel = window.getSelection();
            const selText = sel ? sel.toString().trim() : '';
            if (selText) {
                try { document.execCommand('cut'); } catch(e) {}
                showToast('텍스트 잘라내기됨');
                return;
            }
            if (!activeLayer) return showToast('선택된 블록이 없습니다.');
            const range = document.createRange();
            range.selectNode(activeLayer);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('copy');
            setBlockClipboard(activeLayer.outerHTML);
            recordState();
            activeLayer.remove();
            activeLayer = null;
            hideAllTools();
            recordState();
            showToast('블록이 잘라내기 되었습니다.');
        }

        function blockDeleteAction() {
            if (!activeLayer) return showToast('선택된 블록이 없습니다.');
            recordState();
            activeLayer.remove();
            activeLayer = null;
            hideAllTools();
            recordState();
            showToast('블록이 삭제되었습니다.');
        }

        // 드롭존 래퍼 함수들 (인라인 ondrop에서 호출)
        function onDropRef(e) {
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.classList.remove('active');
            const files = Array.from(e.dataTransfer.files || []);
            const f = files.find(x => isImageFile(x));
            if (!f) return;
            const r = new FileReader();
            r.onload = ev => {
                referenceImageBase64 = ev.target.result;
                getById('refPreview').innerHTML = `<div class="relative inline-block w-12 h-12 group pointer-events-auto shadow-sm rounded-lg border border-indigo-100 overflow-hidden shrink-0"><img src="${ev.target.result}" class="w-full h-full object-cover bg-slate-50"><button onclick="referenceImageBase64=null;getById('refPreview').innerHTML='';" class="absolute top-0 right-0 bg-red-500/80 text-white w-4 h-4 flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 cursor-pointer rounded-bl-sm">✕</button></div>`;
                showToast('레퍼런스 이미지가 등록되었습니다.');
            };
            r.readAsDataURL(f);
        }
        function onDropAsset(e) {
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.classList.remove('active');
            let added = 0;
            Array.from(e.dataTransfer.files || []).forEach(f => {
                if (!isImageFile(f)) return;
                added++;
                const r = new FileReader();
                r.onload = ev => { uploadedAssets.push({b64: ev.target.result, name: f.name || 'asset.png'}); renderHeroAssets(); };
                r.readAsDataURL(f);
            });
            if (added > 0) showToast(added + '개의 에셋이 등록되었습니다.');
        }
        function onDropLogo(e) {
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.classList.remove('active');
            const f = Array.from(e.dataTransfer.files || []).find(x => isImageFile(x));
            if (f) loadLogoFile(f);
        }
        function onDropContentAsset(e) {
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.classList.remove('active');
            let added = 0;
            Array.from(e.dataTransfer.files || []).forEach(f => {
                if (!isImageFile(f)) return;
                added++;
                const r = new FileReader();
                r.onload = ev => { contentAssetLibrary[f.name || `img_${Date.now()}`] = ev.target.result; renderContentAssets(); setTimeout(() => runImageMatching(true), 100); };
                r.readAsDataURL(f);
            });
            if (added > 0) showToast(added + '개의 컨텐츠 이미지가 등록되었습니다.');
        }
        function onDragOver(e) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('active'); }
        function onDragLeave(e) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('active'); }
