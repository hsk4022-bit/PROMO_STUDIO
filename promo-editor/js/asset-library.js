// promo-editor/js/asset-library.js — 에셋 라이브러리 + 이미지 매칭
//
// app.js 에서 분리 (Stage 8 — 2026-05-28). 단일 블록 L3069-3313.
// 포함: runMatchWithFiles, runImageMatching, renderHeroAssets,
//       renderContentAssets, clearLibrary.
//
// 의존:
// - state.js: contentAssetLibrary, uploadedAssets
// - utils.js: getById, isImageFile
// - app.js (runtime): showToast, recordState

        // 드래그 파일로 텍스트 마커 매칭 (contentArea + 모든 팝업 childArea 공통)
        function runMatchWithFiles(fileMap) {
            const area = getById('contentArea'); if (!area) return 0;
            const matchPairs = [];
            Object.entries(fileMap).forEach(([fname, b64]) => {
                const baseName = fname.includes('.') ? fname.substring(0, fname.lastIndexOf('.')) : fname;
                const addPair = (n) => {
                    matchPairs.push({ searchStr: `(${n})`.toLowerCase(), url: b64 });
                    matchPairs.push({ searchStr: `[${n}]`.toLowerCase(), url: b64 });
                };
                addPair(baseName); addPair(fname);
                const baseNoSpace = baseName.replace(/\s+/g, '_');
                if (baseNoSpace !== baseName) addPair(baseNoSpace);
                const noUnder = baseName.replace(/_/g, '');
                if (noUnder !== baseName) addPair(noUnder);
            });
            matchPairs.sort((a, b) => b.searchStr.length - a.searchStr.length);

            // 매칭 대상: contentArea + 모든 팝업 childArea
            const allAreas = [area];
            childPanels.forEach(panel => {
                const ca = getById('childArea_' + panel.id);
                if (ca) allAreas.push(ca);
            });

            let count = 0, replacedAny = true, iterations = 0;
            while (replacedAny && iterations < 50) {
                replacedAny = false; iterations++;
                const textNodes = [];
                allAreas.forEach(targetArea => {
                    const walk = document.createTreeWalker(targetArea, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    while (node = walk.nextNode()) textNodes.push(node);
                });
                for (let i = 0; i < textNodes.length; i++) {
                    const textNode = textNodes[i];
                    const text = textNode.nodeValue;
                    const lowerText = text.toLowerCase();
                    const parent = textNode.parentNode;
                    if (!parent || parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') continue;
                    let foundMatch = null;
                    for (let pair of matchPairs) {
                        const idx = lowerText.indexOf(pair.searchStr);
                        if (idx !== -1) { foundMatch = { pair, index: idx, length: pair.searchStr.length }; break; }
                    }
                    if (foundMatch) {
                        const before = text.substring(0, foundMatch.index);
                        const after = text.substring(foundMatch.index + foundMatch.length);
                        const frag = document.createDocumentFragment();
                        if (before) frag.appendChild(document.createTextNode(before));
                        const imgEl = document.createElement('img');
                        imgEl.src = foundMatch.pair.url;
                        imgEl.style.cssText = 'display:inline-block;vertical-align:middle;max-width:100%;height:auto;image-rendering:high-quality;';
                        imgEl.onload = function() {
                            const containerEl = imgEl.closest('[id^="childArea_"]') || getById('contentArea');
                            const cw = containerEl?.offsetWidth || 840;
                            if (imgEl.naturalWidth > cw) { imgEl.style.width = '100%'; imgEl.style.height = 'auto'; }
                            else { imgEl.style.width = imgEl.naturalWidth + 'px'; imgEl.style.height = imgEl.naturalHeight + 'px'; }
                        };
                        frag.appendChild(imgEl);
                        count++;
                        if (after) frag.appendChild(document.createTextNode(after));
                        parent.replaceChild(frag, textNode);
                        replacedAny = true;
                        break;
                    }
                }
            }
            return count;
        }
        function runImageMatching(silent = false) {
            const area = getById('contentArea'); if (!area) return;

            const assetKeys = Object.keys(contentAssetLibrary);
            if(assetKeys.length === 0) return showToast("\ub9e4\uce6d\ud560 \uc5d0\uc14b\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.");

            recordState();
            let count = 0;
            
            const matchPairs = [];
            assetKeys.forEach(key => {
                const baseName = key.includes('.') ? key.substring(0, key.lastIndexOf('.')) : key;
                const addPair = (str) => {
                    // 한글 파일명 NFC/NFD 불일치 방지 — 모든 검색어 NFC 정규화
                    const s = str.toLowerCase().normalize('NFC');
                    matchPairs.push({ searchStr: `(${s})`, url: contentAssetLibrary[key] });
                    matchPairs.push({ searchStr: `[${s}]`, url: contentAssetLibrary[key] });
                };
                // 원본
                addPair(baseName);
                // 확장자 포함
                addPair(key);
                // 공백→언더스코어
                const noSpace = baseName.replace(/\s+/g, '_');
                if (noSpace !== baseName) addPair(noSpace);
                // 언더스코어 제거 (item_01 → item01)
                const noUnder = baseName.replace(/_/g, '');
                if (noUnder !== baseName) addPair(noUnder);
                // 숫자 앞 0 제거 (item_01 → item_1, item01 → item1)
                const noLeadingZero = baseName.replace(/_0+(\d)/g, '_$1').replace(/(\D)0+(\d)/g, '$1$2');
                if (noLeadingZero !== baseName) addPair(noLeadingZero);
            });

            matchPairs.sort((a, b) => b.searchStr.length - a.searchStr.length); 

            let replacedAny = true;
            let iterations = 0;

            // 매칭 대상: contentArea + 모든 팝업 childArea
            const allAreas = [area];
            childPanels.forEach(panel => {
                const ca = getById('childArea_' + panel.id);
                if (ca) allAreas.push(ca);
            });

            while (replacedAny && iterations < 50) {
                replacedAny = false;
                iterations++;

                const textNodes = [];
                allAreas.forEach(targetArea => {
                    const walk = document.createTreeWalker(targetArea, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    while(node = walk.nextNode()) textNodes.push(node);
                });

                for (let i = 0; i < textNodes.length; i++) {
                    let textNode = textNodes[i];
                    // 한글 NFC 정규화 — matchPairs 와 일치시킴 (text/lowerText 동일 정규화로 index 어긋남 방지)
                    let text = (textNode.nodeValue || '').normalize('NFC');
                    let lowerText = text.toLowerCase();
                    let parent = textNode.parentNode;
                    if (!parent || parent.nodeName === 'SCRIPT' || parent.nodeName === 'STYLE') continue;

                    let foundMatch = null;
                    for (let pair of matchPairs) {
                        const index = lowerText.indexOf(pair.searchStr);
                        if (index !== -1) {
                            foundMatch = { pair: pair, index: index, length: pair.searchStr.length };
                            break;
                        }
                    }

                    if (foundMatch) {
                        const before = text.substring(0, foundMatch.index);
                        const after = text.substring(foundMatch.index + foundMatch.length);
                        
                        const frag = document.createDocumentFragment();
                        if (before.length > 0) frag.appendChild(document.createTextNode(before));
                        
                        const imgEl = document.createElement('img');
                        imgEl.src = foundMatch.pair.url;
                        imgEl.style.cssText = 'display:inline-block;vertical-align:middle;max-width:100%;height:auto;image-rendering:high-quality;';
                        imgEl.onload = function() {
                            const containerEl = imgEl.closest('[id^="childArea_"]') || getById('contentArea');
                            const containerW = containerEl?.offsetWidth || 840;
                            if (imgEl.naturalWidth > containerW) {
                                imgEl.style.width = '100%';
                                imgEl.style.height = 'auto';
                            } else {
                                imgEl.style.width = imgEl.naturalWidth + 'px';
                                imgEl.style.height = imgEl.naturalHeight + 'px';
                            }
                        };
                        frag.appendChild(imgEl);
                        count++;
                        
                        if (after.length > 0) frag.appendChild(document.createTextNode(after));
                        
                        parent.replaceChild(frag, textNode);
                        replacedAny = true;
                        break; 
                    }
                }
            }

            // 깨진 img[src] 상대경로도 자산 라이브러리로 교체 (contentArea + childArea 모두)
            allAreas.forEach(targetArea => {
                targetArea.querySelectorAll('img[src]').forEach(img => {
                    const src = img.getAttribute('src') || '';
                    if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) return;
                    const srcFname = src.split('/').pop().split('\\').pop();
                    if (contentAssetLibrary[srcFname]) {
                        img.src = contentAssetLibrary[srcFname];
                        count++;
                    }
                });
            });

            if (count > 0) {
                if (!silent) showToast(`${count}개 이미지 매칭 완료.`);
                recordState();
            } else {
                if (!silent) showToast("위치표에서 매칭되는 텍스트(예: (파일명) 또는 [파일명])를 찾을 수 없습니다.");
            }
            return count;
        }

        function renderHeroAssets() {
            const preview = getById('assetPreview');
            if (!preview) return;
            preview.innerHTML = '';
            uploadedAssets.forEach((asset, idx) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'relative inline-block w-12 h-12 group pointer-events-auto shadow-sm rounded-lg border border-indigo-100 overflow-hidden shrink-0';
                wrapper.innerHTML = `
                    <img src="${asset.b64}" class="w-full h-full object-cover bg-slate-50" title="${asset.name}">
                    <button class="absolute top-0 right-0 bg-red-500/80 hover:bg-red-500 text-white w-4 h-4 flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm rounded-bl-sm" data-idx="${idx}">\u2715</button>
                `;
                wrapper.querySelector('button').addEventListener('click', (e) => {
                    uploadedAssets.splice(parseInt(e.currentTarget.dataset.idx), 1);
                    renderHeroAssets();
                });
                preview.appendChild(wrapper);
            });
        }

        function renderContentAssets() {
            const grid = getById('assetLibraryGrid');
            if (!grid) return;
            grid.innerHTML = '';
            Object.entries(contentAssetLibrary).forEach(([name, src]) => {
                const card = document.createElement('div');
                card.className = 'relative group bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm cursor-pointer';
                card.innerHTML = `
                    <img src="${src}" class="w-full h-24 object-cover bg-slate-100" title="${name}">
                    <p class="text-[9px] font-bold text-slate-500 truncate px-2 py-1">${name}</p>
                    <button class="absolute top-1 right-1 bg-red-500/80 hover:bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" data-name="${name}" title="\uc0ad\uc81c">\u2715</button>
                `;
                card.querySelector('button').addEventListener('click', (e) => {
                    e.stopPropagation();
                    delete contentAssetLibrary[e.currentTarget.dataset.name];
                    renderContentAssets();
                });
                grid.appendChild(card);
            });
        }

        function clearLibrary() {
            if (Object.keys(contentAssetLibrary).length === 0) return showToast("\ub77c\uc774\ube0c\ub7ec\ub9ac\uac00 \uc774\ubbf8 \ube44\uc5b4\uc788\uc2b5\ub2c8\ub2e4.");
            if (!confirm("\ub77c\uc774\ube0c\ub7ec\ub9ac\uc758 \ubaa8\ub4e0 \uc774\ubbf8\uc9c0\ub97c \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?")) return;
            contentAssetLibrary = {};
            renderContentAssets();
            showToast("\ub77c\uc774\ube0c\ub7ec\ub9ac\uac00 \ucd08\uae30\ud654\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
        }
