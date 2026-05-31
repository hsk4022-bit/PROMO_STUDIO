// promo-editor/js/export.js — HTML export + JPG + 공통 캡처 유틸
//
// app.js 에서 분리 (Stage 7 — 2026-05-28). 4 비연속 블록.
// 포함:
//   ① prepareSheetForCapture (Slicer/JPG 공통, Stage 6 후 L259-394)
//   ② toggleCdnInput, openExportHtmlModal, closeExportHtmlModal,
//      sanitizeBrokenImages, convertImagesToBase64 (Stage 6 후 L427-519)
//   ③ exportToJPG (Stage 6 후 L1462-1581)
//   ④ executeDownloadHtml + 내부 detectExistingHash/buildCleanDiv/buildHtml 클로저
//      (Stage 6 후 L1813-2181)
//
// 의존:
// - state.js: currentHashFolder, contentAssetLibrary, logoBase64/Pos/Size,
//             _promoPreservedBlocks, childPanels, videoObjectUrlMap, activeLayer,
//             isSelecting, selectionStartCell
// - utils.js: getById, generateHashString, savePromoFile, downscaleCanvas, getMimeType
// - color-palette.js: isDarkColor, blendHex, getLuminance
// - table.js: fixTableThs, clearSelection
// - tab.js: fixTabBarOverflow
// - popup-builder.js: buildPopupTriggerOnclick, buildInlinePopupHtml, ensureSeContentsRelative
// - app.js (runtime): showToast, recordState, hideAllTools, hideImgFloatToolbar,
//                     compositeHeroWithLogo (video.js), applyTargetBlankToLinks,
//                     convertRgbToHex, expandHexColors, ensureLayoutCompliance,
//                     ensureEventVideoScript (video.js), html2canvas (CDN), JSZip (CDN)
// - slicer.js: closeSlicerModal (호출됨 — slicer.js 가 뒤에 로드되므로 runtime 만 안전)

// ────────────────────────────────────────────────────────────────
// ① prepareSheetForCapture (Stage 6 후 L259-394)
// ────────────────────────────────────────────────────────────────
        // canvas 캡처 전 sheet 준비 (Slicer/JPG 공통)
        async function prepareSheetForCapture() {
            const sheet = getById('documentSheet');

            // 캡처 전 모든 선택/활성 상태 완전 초기화
            clearSelection();
            clearActiveLayer();
            if (activeLayer) { activeLayer.classList.remove('active-layer'); activeLayer = null; }
            hideAllTools();
            hideImgFloatToolbar();

            const mw = parseInt(getById('pageWidthInput').value) || 840;
            const originalWidth = sheet.style.width, originalMaxWidth = sheet.style.maxWidth;
            const scrollArea = getById('canvasScroll');
            const originalOverflow = scrollArea.style.overflow, originalScrollTop = scrollArea.scrollTop;

            sheet.style.width = mw + 'px'; sheet.style.maxWidth = mw + 'px';
            scrollArea.style.overflow = 'visible'; scrollArea.scrollTop = 0; window.scrollTo(0, 0);

            await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2000))]);

            // [revert 2026-05-20] 이전 시도였던 live-sheet sanitize 제거 — documentSheet 의 IMG 를 영구히 삭제하는
            //   부작용 (편집 중인 DOM 손상). convertImagesToBase64 는 이미 broken IMG 를 data-broken-img 마커로
            //   안전하게 처리하고, 클론에서만 제거함. 라이브 시트 sanitize 는 불필요 + 위험.
            // 원본 DOM에서 상대경로 이미지 → base64 (compositeHeroWithLogo 등 원본 참조용)
            await convertImagesToBase64(sheet);
            await new Promise(r => setTimeout(r, 100));

            // ── 렌더링용 오프스크린 클론 생성 ──
            // htmlToImage는 computed style을 그대로 복사하므로, 클론 자체에 position:fixed + 음수 left를
            // 설정하면 foreignObject 안에서도 콘텐츠가 화면 밖으로 밀려나 빈 캔버스가 된다.
            // 해결: 클론 자체에는 위치 지정 없이, 오프스크린 wrapper container만 화면 밖으로 이동.
            const _clipWrap = document.createElement('div');
            _clipWrap.style.cssText = `position:fixed;top:0;left:-${mw + 300}px;width:${mw}px;overflow:hidden;pointer-events:none;z-index:-9999;`;
            document.body.appendChild(_clipWrap);

            const renderClone = sheet.cloneNode(true);
            renderClone.removeAttribute('id');
            renderClone.style.width = mw + 'px';
            renderClone.style.maxWidth = mw + 'px';
            _clipWrap.appendChild(renderClone);

            // 캡처 실패 방지: convertImagesToBase64 에서 마커 부착한 broken 이미지 제거 + 잘못된 src 다 정리
            //   [defense 2026-05-20] clone 단계에서 2차 sanitize (라이브에서 1차 했어도 cloneNode 후 잔존하는 잘못된 src 제거)
            renderClone.querySelectorAll('img[data-broken-img]').forEach(el => el.remove());
            sanitizeBrokenImages(renderClone, 'clone-post-convert');

            // 테이블 border 강화 — htmlToImage foreignObject 렌더링에서 1px border 손실 방지
            // 클론은 #contentArea 밖이므로 CSS 셀렉터(#contentArea td) 미적용 → 인라인으로 모든 border 강제
            // 테이블 기본 속성 보장 — border 색은 AI 생성 인라인 스타일 그대로 유지
            renderClone.querySelectorAll('table').forEach(tbl => {
                tbl.style.borderCollapse = 'collapse';
                if (!tbl.style.width) tbl.style.width = '100%';
                if (!tbl.style.tableLayout) tbl.style.tableLayout = 'fixed';
                // [2026-05-31] event-video 표는 border 강화/주입 제외 — 슬라이스 캡처에 표 라인 노출 방지.
                //   DOM-time 안전망(standardizeTableStyles/fixTableThs)이 영상표 border 를 스킵하는데,
                //   아래 border-survival 보강이 캡처 클론에 도로 라인을 그려넣던 회귀.
                if (tbl.querySelector('.event-video, video')) {
                    tbl.querySelectorAll('td, th').forEach(cell => {
                        cell.style.border = 'none';
                        cell.style.borderBottom = 'none';
                        cell.style.boxSizing = 'border-box';
                    });
                    tbl.style.boxShadow = 'none';
                    tbl.style.borderBottom = 'none';
                    return;
                }
                tbl.querySelectorAll('td, th').forEach(cell => {
                    if (!cell.style.padding) cell.style.padding = '0.875rem 1rem';
                    cell.style.boxSizing = 'border-box';
                    cell.style.verticalAlign = 'middle';
                    cell.style.lineHeight = '1.4';
                });

                // [last-border-survival 2026-05-13 r2] html-to-image 의 foreignObject → 캔버스
                //   라스터화에서 1px border-bottom 이 sub-pixel rounding 으로 손실됨.
                //   r2 보강:
                //   - 마지막 셀 선택을 DOM 순서 기준으로 변경 (multi-tbody 에서 첫 tbody 헤더행
                //     오선택 방지) — querySelectorAll 결과의 last 사용
                //   - 보더색은 마지막 셀이 아니라 모든 셀 중 valid한 borderBottomColor 우선
                //     (헤더행 강조색 #accent 가 아닌 일반 행 색을 골라야 시각 일치)
                //   - 1px box-shadow + outset 1px box-shadow + table 자체 border-bottom 3중 백업
                //     → retry 시 sub-pixel 손실에도 최소 하나는 살아남음
                try {
                    const _allCells = tbl.querySelectorAll('td, th');
                    if (_allCells.length > 0) {
                        let _bc = '';
                        // 본문 행(thead 아닌) 셀에서 valid border 색 추출 우선
                        for (let i = _allCells.length - 1; i >= 0; i--) {
                            const c = _allCells[i];
                            if (c.closest('thead')) continue;
                            const cs = window.getComputedStyle(c);
                            const col = cs.borderBottomColor || cs.borderColor || '';
                            if (col && col !== 'rgba(0, 0, 0, 0)' && col !== 'transparent') {
                                _bc = col; break;
                            }
                        }
                        // 폴백: 어떤 셀이라도 valid 색
                        if (!_bc) {
                            for (const c of _allCells) {
                                const cs = window.getComputedStyle(c);
                                const col = cs.borderBottomColor || cs.borderColor || '';
                                if (col && col !== 'rgba(0, 0, 0, 0)' && col !== 'transparent') {
                                    _bc = col; break;
                                }
                            }
                        }
                        if (_bc) {
                            // 2중 백업: inset shadow + table 자체 border-bottom (outset 제거 - 다크
                            //   테마에서 표 아래 추가 1px 라인이 보더를 두 배로 보이게 만드는 문제 회피).
                            //   둘 다 정확히 같은 픽셀 위치(테이블 바닥)에서 셀 border 와 collapse 되므로
                            //   정상 렌더 시 시각 차이 0, 라스터화 손실 시 둘 중 하나가 메꿈.
                            const existingShadow = tbl.style.boxShadow ? tbl.style.boxShadow + ', ' : '';
                            tbl.style.boxShadow = existingShadow + 'inset 0 -1px 0 0 ' + _bc;
                            if (!tbl.style.borderBottom || tbl.style.borderBottom === 'none') {
                                tbl.style.borderBottom = '1px solid ' + _bc;
                            }
                        }
                    }
                } catch(_) {}
            });

            // [2026-05-31] 캡처 클론의 스크롤 컨테이너 overflow 제거 — html2canvas/html-to-image 가
            //   스크롤바(가로/세로)를 이미지에 래스터화하는 회귀 방지. 표 가로스크롤 래퍼(overflow-x:auto) +
            //   세로 스크롤 영역의 스크롤바가 슬라이스 PNG 에 찍히던 문제. (table-layout:fixed+width:100% 라
            //   overflow:visible 로 풀어도 레이아웃 변화 없음 — 스크롤바 chrome 만 제거)
            renderClone.querySelectorAll('*').forEach(el => {
                if (!el.style) return;
                const ov = (el.style.overflow || '') + ' ' + (el.style.overflowX || '') + ' ' + (el.style.overflowY || '');
                if (/auto|scroll/i.test(ov)) {
                    el.style.overflow = 'visible';
                    el.style.overflowX = 'visible';
                    el.style.overflowY = 'visible';
                }
            });

            // Chrome 실질 canvas 높이 한계는 16384px. 초과 시 내부적으로 클리핑되어
            // 하단 콘텐츠가 잘리는 버그 발생. 16000 여유로 설정.
            // [scale-change 2026-05-19] 캡처 스케일 supersampling 적용 — 1.3x 캡처 → CSS 100% 표시.
            //   원리: 1.3x 픽셀 밀도로 캡처 → 슬라이스 img 가 width:100% 로 표시될 때
            //   브라우저가 자동 bilinear 다운샘플링 → edge anti-aliasing 으로 선명해짐 (특히 retina).
            //   변천사: 3x (렌더 실패 빈발) → 1.2x (안정+양호) → 1.3x (선명도 추가 향상, 메모리 17% 증가).
            //   16000px 한계는 그대로 유지 (긴 페이지는 자동 다운스케일).
            const MAX_CANVAS_PX = 16000;
            let targetScale = 1.3;
            if (sheet.scrollHeight * targetScale > MAX_CANVAS_PX) {
                targetScale = Math.max(MAX_CANVAS_PX / sheet.scrollHeight, 1.0);
                console.log('[slicer] page too long, scale capped to', targetScale.toFixed(2));
            }

            return {
                sheet: renderClone,     // htmlToImage 호출 시 이 클론 사용
                originalSheet: sheet,   // getBoundingClientRect 위치 계산 전용
                mw, targetScale,
                bgColor: getById('bgPicker').value || '#ffffff',
                restore() {
                    // 원본 크기·스크롤 복원 + 오프스크린 wrapper 제거
                    sheet.style.width = originalWidth; sheet.style.maxWidth = originalMaxWidth;
                    scrollArea.style.overflow = originalOverflow; scrollArea.scrollTop = originalScrollTop;
                    if (_clipWrap.isConnected) _clipWrap.remove();
                }
            };
        }

// ────────────────────────────────────────────────────────────────
// ② 캡처 유틸 (Stage 6 후 L427-519)
// ────────────────────────────────────────────────────────────────

        // ────────────────────────────────────────────────────────────────
        function toggleCdnInput(type) {
            if (type === 'html') {
                const isAbsolute = document.querySelector('input[name="exportPathType"]:checked').value === 'absolute';
                getById('htmlCdnInputArea').style.display = isAbsolute ? 'block' : 'none';
            } else if (type === 'slicer') {
                const isAbsolute = document.querySelector('input[name="slicerPathType"]:checked').value === 'absolute';
                const urlInput = getById('slicerCdnUrl');
                if (isAbsolute) {
                    urlInput.classList.remove('hidden');
                    urlInput.classList.add('block');
                } else {
                    urlInput.classList.add('hidden');
                    urlInput.classList.remove('block');
                }
            }
        }

        function openExportHtmlModal() {
            const area = getById('contentArea');
            if (!area || area.innerText.includes('DESIGN ENGINE IDLE')) return showToast("\uc800\uc7a5\ud560 \ucee8\ud150\uce20\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.");
            getById('exportHtmlModal').classList.remove('hidden');
        }
        
        function closeExportHtmlModal() {
            getById('exportHtmlModal').classList.add('hidden');
        }

        // [defense 2026-05-20] 캡처 직전 IMG sanitize — 잘못된 src 의 IMG 가 html-to-image 1차 캡처를 깨뜨려
        //   0.715x retry fallback (canvas width 600 → 텍스트 뭉개짐) 으로 가는 회귀 차단.
        //   호출 시점: (1) live sheet, convertImagesToBase64 전, (2) renderClone, htmlToImage 직전.
        //   각 IMG 별로 제거 사유를 console 에 남겨서 미래 회귀 진단 가능.
        function sanitizeBrokenImages(rootEl, ctxLabel) {
            if (!rootEl || !rootEl.querySelectorAll) return;
            let removed = 0;
            const reasons = {};
            rootEl.querySelectorAll('img').forEach(el => {
                // 속성 + 프로퍼티 양쪽 확인 (setAttribute 안 쓰고 .src 만 set 한 경우 대응)
                const attrSrc = (el.getAttribute('src') || '').trim();
                const propSrc = (el.src || '').trim();
                const srcSet = el.getAttribute('srcset') || '';
                let reason = null;
                // 1) 빈 src — 브라우저가 현재 페이지 URL 을 image 로 요청
                if (!attrSrc && !propSrc) reason = 'empty-src';
                else if ((attrSrc === '#' || propSrc === '#')) reason = 'hash-src';
                // 2) 외부 http(s) — CORS taint 위험
                else if (attrSrc.startsWith('http') || propSrc.startsWith('http://') || propSrc.startsWith('https://')) reason = 'http-src';
                // 3) data: URI 인데 image/* 가 아님 — 가장 위험 (data:text/html, data:application/* 등)
                else if (attrSrc.startsWith('data:') && !attrSrc.startsWith('data:image/')) reason = 'non-image-data-uri:' + attrSrc.slice(5, 40);
                else if (propSrc.startsWith('data:') && !propSrc.startsWith('data:image/')) reason = 'non-image-data-uri-prop:' + propSrc.slice(5, 40);
                // 4) srcset 에 data:text/* 가 섞여있어도 위험
                else if (/data:(?!image\/)/i.test(srcSet)) reason = 'bad-srcset';
                // 5) blob: 은 허용 (compositeHeroWithLogo 결과 등). 상대경로(./hash/...) 도 허용 (convertImagesToBase64 가 처리)
                if (reason) {
                    reasons[reason] = (reasons[reason] || 0) + 1;
                    removed++;
                    el.remove();
                }
            });
            if (removed > 0) {
                console.log('[capture-sanitize:' + (ctxLabel || '?') + '] removed ' + removed + ' broken IMG(s):', reasons);
            }
        }

        async function convertImagesToBase64(rootEl) {
            const imgs = Array.from(rootEl.querySelectorAll('img'));
            await Promise.all(imgs.map(img => new Promise(resolve => {
                const src = img.getAttribute('src') || '';
                if (!src || src.startsWith('data:')) return resolve();
                const tempImg = new Image();
                tempImg.crossOrigin = 'anonymous';
                tempImg.onload = () => {
                    try {
                        const c = document.createElement('canvas');
                        c.width  = tempImg.naturalWidth  || tempImg.width  || 1;
                        c.height = tempImg.naturalHeight || tempImg.height || 1;
                        c.getContext('2d').drawImage(tempImg, 0, 0);
                        img.src = c.toDataURL('image/png');
                    } catch(e) {
                        // CORS taint → 캡처 실패 방지용 마커 (실제 제거는 clone 에서)
                        img.setAttribute('data-broken-img', '1');
                    }
                    resolve();
                };
                tempImg.onerror = () => {
                    // 로드 실패 → 마커만 부착 (실제 제거는 clone 에서)
                    img.setAttribute('data-broken-img', '1');
                    resolve();
                };
                tempImg.src = src;
            })));
        }

// ────────────────────────────────────────────────────────────────
// ③ exportToJPG (Stage 6 후 L1462-1581)
// ────────────────────────────────────────────────────────────────
        async function exportToJPG() {
            const sheet = getById('documentSheet'); if (!sheet) return;
            showToast('JPG 렌더링 중... 잠시만 기다려주세요.');

            setTimeout(async () => {
                let capture;
                try {
                    capture = await prepareSheetForCapture();
                    const { mw, targetScale, bgColor } = capture;

                    const toCanvasOpts2 = {
                        pixelRatio: targetScale,
                        backgroundColor: bgColor,
                        skipFonts: true,
                        useCORS: true,
                        cacheBust: false,
                        style: { transform: 'none', margin: '0', padding: '0' },
                        filter: node => {
                            if (!node.classList) return true;
                            if (node.classList.contains('resizer-handle')) return false;
                            // popup-trigger 버튼은 이미지에 자연 렌더링
                            return true;
                        }
                    };

                    // 타임아웃 포함 렌더링
                    const JPG_RENDER_TIMEOUT = 50000;
                    let rawCanvas;
                    try {
                        rawCanvas = await Promise.race([
                            htmlToImage.toCanvas(capture.sheet, toCanvasOpts2),
                            new Promise((_, rej) => setTimeout(() => rej(new Error('렌더링 시간 초과(50s)')), JPG_RENDER_TIMEOUT))
                        ]);
                    } catch(renderErr) {
                        console.warn('JPG 1차 실패, 저해상도 재시도:', renderErr?.message || String(renderErr));
                        try {
                            rawCanvas = await htmlToImage.toCanvas(capture.sheet, {
                                ...toCanvasOpts2,
                                pixelRatio: Math.max((toCanvasOpts2.pixelRatio || 2) * 0.55, 0.5),
                                filter: node => {
                                    if (!node.classList) return true;
                                    if (node.classList.contains('resizer-handle')) return false;
                                    if (node.tagName === 'IMG') { const s = node.getAttribute('src') || ''; if (s.startsWith('http')) return false; }
                                    return true;
                                }
                            });
                        } catch(retryErr) {
                            throw new Error('JPG 렌더링 완전 실패: ' + (retryErr?.message || String(retryErr) || '알 수 없는 오류'));
                        }
                    }
                    // 해상도 유지: 2x 이상 scale이면 그대로 사용 (다운스케일 금지)
                    // 원본 canvas가 mw보다 클 때만 목표 너비 = mw*targetScale (2x 보장)
                    const keepWidth = Math.round(mw * Math.max(targetScale, 3));
                    const finalCanvas = downscaleCanvas(rawCanvas, keepWidth);
                    const totalH = finalCanvas.height;
                    const maxH = 8000; // 분할 기준 높이
                    const ts = Date.now();

                    if (totalH <= maxH) {
                        // 짧으면 단일 파일
                        const a = document.createElement('a');
                        a.download = `PROMO_${ts}.jpg`;
                        a.href = finalCanvas.toDataURL('image/jpeg', 0.95);
                        a.click();
                        showToast('JPG 저장 완료!');
                    } else {
                        // 길면 끊어서 분할 저장
                        const parts = Math.ceil(totalH / maxH);
                        showToast(`긴 이미지 감지 — ${parts}개 파일로 분할 저장 중...`);
                        for (let i = 0; i < parts; i++) {
                            const partCanvas = document.createElement('canvas');
                            const startY = i * maxH;
                            const partH = Math.min(maxH, totalH - startY);
                            partCanvas.width = finalCanvas.width;
                            partCanvas.height = partH;
                            partCanvas.getContext('2d').drawImage(finalCanvas, 0, startY, finalCanvas.width, partH, 0, 0, finalCanvas.width, partH);
                            const a = document.createElement('a');
                            a.download = `PROMO_${ts}_${i+1}of${parts}.jpg`;
                            a.href = partCanvas.toDataURL('image/jpeg', 0.93);
                            a.click();
                            await new Promise(r => setTimeout(r, 400));
                        }
                        showToast(`JPG ${parts}개 파일 분할 저장 완료!`);
                    }

                    // 팝업 패널 이미지도 별도 JPG로 저장
                    if (childPanels && childPanels.length > 0) {
                        for (const panel of childPanels) {
                            const childArea = getById('childArea_' + panel.id);
                            if (!childArea) continue;
                            const txt = childArea.innerText.trim();
                            if (!txt || txt.includes('내용 입력')) continue;
                            // 팝업 JPG도 클론 방식 — 원본 childArea DOM 불변
                            const jpgClone = childArea.cloneNode(true);
                            jpgClone.style.cssText = 'position:fixed;top:0;left:-2000px;z-index:-9999;pointer-events:none;width:' + (childArea.offsetWidth || 640) + 'px;background:#1e2a4a;';
                            document.body.appendChild(jpgClone);
                            await convertImagesToBase64(jpgClone);
                            try {
                                const popupCanvas = await htmlToImage.toCanvas(jpgClone, {
                                    pixelRatio: 2, backgroundColor: '#1e2a4a',
                                    skipFonts: true, useCORS: true
                                });
                                const pa = document.createElement('a');
                                pa.download = `POPUP_${panel.id}_${ts}.jpg`;
                                pa.href = popupCanvas.toDataURL('image/jpeg', 0.93);
                                pa.click();
                                await new Promise(r => setTimeout(r, 300));
                            } catch(pe) { console.warn('팝업 JPG 캡처 실패:', panel.id, pe); }
                            if (jpgClone.isConnected) jpgClone.remove();
                        }
                        showToast('팝업 이미지도 저장 완료!');
                    }
                } catch (e) {
                    console.error('JPG 렌더링 실패', e);
                    showToast('렌더링 실패: ' + (e.message || '알 수 없는 오류'));
                } finally {
                    if (capture) capture.restore();
                }
            }, 100);
        }

// ────────────────────────────────────────────────────────────────
// ④ executeDownloadHtml + 내부 클로저 (Stage 6 후 L1813-2181)
// ────────────────────────────────────────────────────────────────
        function executeDownloadHtml() {
            const area = getById('contentArea'); if (!area) return;
            const hi   = getById('mainHeroImg');
            const cdnInput = (getById('htmlCdnUrl')?.value || '').trim();
            const cdnUrl   = cdnInput ? (cdnInput.endsWith('/') ? cdnInput : cdnInput + '/') : null;

            const spinner = getById('htmlExportSpinner');
            if (spinner) spinner.classList.remove('hidden');
            showToast('ZIP 패키징 중...');

            try {

            const zip = new JSZip();

            // 기존 HTML에서 해시 폴더명 감지 (재로드 시 동일 폴더명 유지)
            function detectExistingHash() {
                const imgs = area.querySelectorAll('img[src]');
                for (const img of imgs) {
                    const src = img.getAttribute('src') || '';
                    if (src.startsWith('data:') || src.startsWith('http') || src.startsWith('blob:')) continue;
                    const parts = src.split('/');
                    if (parts.length >= 2 && parts[0].length >= 8) return parts[0];
                }
                return null;
            }
            // currentHashFolder 없으면 감지 or 새 생성, 있으면 재사용
            if (!currentHashFolder) currentHashFolder = detectExistingHash() || generateHashString(16);
            const hashFolder = currentHashFolder;
            const imgFolder  = zip.folder(hashFolder);

            function buildCleanDiv() {
                const d = document.createElement('div');
                d.innerHTML = area.innerHTML;
                // [regression-fix 2026-05-12] AI가 <thead> 없이 <tr><th>로 뽑으면 브라우저가 <tbody>로 auto-wrap →
                //   export에 비-thead <th>가 남음. fixTableThs는 이미 (1) 비-thead <th>→<td> 변환 (2) 빈 셀 정리
                //   (3) idempotent 스타일을 다 갖춤. export 전 한 번 실행 (회귀 방지 add-on).
                if (typeof fixTableThs === 'function') fixTableThs(d);
                // [defense 2026-05-21] 탭 바 box-sizing 강제 (CDN export 본문에도 적용)
                if (typeof fixTabBarOverflow === 'function') fixTabBarOverflow(d);
                d.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                d.querySelectorAll('[class=""]').forEach(el => el.removeAttribute('class'));
                d.querySelectorAll('.custom-resizer').forEach(r => {
                    r.style.border  = 'none';
                    r.style.resize  = 'none';
                    r.style.outline = 'none';
                    r.classList.remove('active-layer');
                    r.querySelectorAll('.resizer-handle').forEach(h => h.remove());
                    const media = r.querySelector('img, video');
                    if (media) media.style.pointerEvents = 'auto';
                });
                // 영상: 속성 동기화 + blob→data 변환 + 포스터
                d.querySelectorAll('video').forEach(v => {
                    const src = v.getAttribute('src') || '';
                    const origVideo = area.querySelector(`video[src="${src}"]`);
                    if (origVideo) {
                        ['autoplay','loop','muted','controls','playsinline'].forEach(attr => {
                            if (origVideo.hasAttribute(attr)) v.setAttribute(attr, '');
                            else v.removeAttribute(attr);
                        });
                    }
                    if (src.startsWith('blob:')) {
                        const dataUrl = videoObjectUrlMap.get(src);
                        if (dataUrl) v.setAttribute('src', dataUrl);
                    }
                    if (origVideo && origVideo.videoWidth > 0 && !v.hasAttribute('poster')) {
                        try {
                            const cvs = document.createElement('canvas');
                            cvs.width = origVideo.videoWidth;
                            cvs.height = origVideo.videoHeight;
                            cvs.getContext('2d').drawImage(origVideo, 0, 0);
                            v.setAttribute('poster', cvs.toDataURL('image/jpeg', 0.85));
                        } catch(e) {}
                    }
                });
                // float 이미지가 컨텐츠와 섞이지 않도록 float 제거
                d.querySelectorAll('img[style*="float"]').forEach(img => {
                    img.style.float = '';
                    img.style.cssFloat = '';
                });
                // 로고 오버레이는 HTML 내보내기에 포함하지 않음
                const logoEl = d.querySelector('#heroLogoOverlay');
                if (logoEl) logoEl.remove();
                // (hero.png) 등 이미지 마커 텍스트 + 깨진 hero img 제거
                d.querySelectorAll('p, span, div').forEach(el => {
                    const t = el.textContent.trim();
                    if (/^\(hero[^)]*\)$/i.test(t)) el.remove();
                });
                d.querySelectorAll('img').forEach(img => {
                    const src = img.getAttribute('src') || '';
                    const alt = img.getAttribute('alt') || '';
                    if ((/hero/i.test(src) || /hero/i.test(alt)) && !src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('./')) {
                        const parent = img.closest('.se-div');
                        if (parent) { parent.style.display = 'none'; parent.innerHTML = ''; }
                        else img.remove();
                    }
                });
                // 테이블 기본 속성 보장 — border 색은 AI 생성 인라인 스타일 그대로 유지
                d.querySelectorAll('table').forEach(tbl => {
                    tbl.style.borderCollapse = 'collapse';
                    if (!tbl.style.width) tbl.style.width = '100%';
                    if (!tbl.style.tableLayout) tbl.style.tableLayout = 'fixed';
                    tbl.querySelectorAll('td, th').forEach(cell => {
                        if (!cell.style.padding) cell.style.padding = '0.875rem 1rem';
                        cell.style.boxSizing = 'border-box';
                        cell.style.verticalAlign = 'middle';
                        cell.style.lineHeight = '1.4';
                        cell.style.wordBreak = 'keep-all';
                        const fs = parseFloat(cell.style.fontSize);
                        if (!cell.style.fontSize || (fs && fs < 13)) cell.style.fontSize = 'clamp(13px,1.5vw,15px)';
                    });
                });
                // popup-trigger 버튼 텍스트 ? → + 통일
                d.querySelectorAll('.popup-trigger[data-popup]').forEach(btn => {
                    const t = btn.textContent.trim();
                    if (t === '?' || t === '❓' || t === '＋') btn.textContent = '+';
                });
                // se-popup-content 블록 제거 (HTML 내보내기 하단에 노출되는 문제 방지)
                d.querySelectorAll('.se-popup-content').forEach(el => el.remove());
                // popup-trigger 버튼은 유지 (buildInlinePopupHtml에서 onclick으로 변환)
                // tbl-scroll-wrap: overflow-x:auto 인라인으로 변환 (내보내기 CSS 없음)
                d.querySelectorAll('.tbl-scroll-wrap').forEach(wrap => {
                    wrap.style.overflowX = 'auto';
                    wrap.style.webkitOverflowScrolling = 'touch';
                    wrap.style.width = '100%';
                    wrap.style.display = 'block';
                });
                // tbl-fixed: min-width 인라인 보장
                d.querySelectorAll('.tbl-fixed').forEach(tbl => {
                    if (!tbl.style.minWidth) tbl.style.minWidth = '400px';
                    tbl.style.width = '100%';
                    tbl.style.borderCollapse = 'collapse';
                    tbl.style.tableLayout = 'fixed';
                });
                // tbl-responsive: width:100% 인라인 보장
                d.querySelectorAll('.tbl-responsive').forEach(tbl => {
                    tbl.style.width = '100%';
                    tbl.style.borderCollapse = 'collapse';
                });
                return d;
            }

            const heroSrc = hi?.getAttribute('src') || '';
            const imageFiles = [];

            let heroFileName = '';
            if (heroSrc && heroSrc.startsWith('data:image')) {
                const ext = heroSrc.substring('data:image/'.length, heroSrc.indexOf(';base64'));
                heroFileName = `${generateHashString(8)}.${ext}`;
                imageFiles.push({ fileName: heroFileName, b64: heroSrc.split(',')[1] });
            }

            const scanDiv = buildCleanDiv();
            let imgIdx = 1;
            const imgMap = new Map();
            scanDiv.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src') || '';
                if (src.startsWith('data:image') && !imgMap.has(src)) {
                    const ext = src.substring('data:image/'.length, src.indexOf(';base64'));
                    imgIdx++;
                    const fn  = `${generateHashString(8)}.${ext}`;
                    imgMap.set(src, fn);
                    imageFiles.push({ fileName: fn, b64: src.split(',')[1] });
                }
            });
            // 영상(video) 스캔 — data URL + blob URL(videoObjectUrlMap) 모두 처리
            const videoMap = new Map();
            let videoIdx = 1;
            const videoFiles = [];
            const scanAllForVideo = [scanDiv];
            childPanels.forEach(panel => { const ca = getById('childArea_' + panel.id); if (ca) scanAllForVideo.push(ca); });
            scanAllForVideo.forEach(root => {
                root.querySelectorAll('video[src]').forEach(vid => {
                    const src = vid.getAttribute('src') || '';
                    // blob URL → videoObjectUrlMap에서 data URL 조회
                    const resolvedSrc = src.startsWith('blob:') ? (videoObjectUrlMap.get(src) || src) : src;
                    if (resolvedSrc.startsWith('data:video') && !videoMap.has(src)) {
                        const mime = resolvedSrc.substring('data:video/'.length, resolvedSrc.indexOf(';base64'));
                        const ext  = mime.split('+')[0] || 'mp4';
                        videoIdx++;
                        const fn   = `${generateHashString(8)}.${ext}`;
                        videoMap.set(src, fn);
                        videoFiles.push({ fileName: fn, b64: resolvedSrc.split(',')[1] });
                    }
                });
            });
            // childArea 이미지도 스캔 (팝업 내부 이미지 포함 — GIF 포함 모든 포맷)
            childPanels.forEach(panel => {
                const ca = getById('childArea_' + panel.id);
                if (!ca) return;
                ca.querySelectorAll('img[src]').forEach(img => {
                    const src = img.getAttribute('src') || '';
                    if (src.startsWith('data:image') && !imgMap.has(src)) {
                        const ext = src.substring('data:image/'.length, src.indexOf(';base64'));
                        imgIdx++;
                        const fn  = `${generateHashString(8)}.${ext}`;
                        imgMap.set(src, fn);
                        imageFiles.push({ fileName: fn, b64: src.split(',')[1] });
                    }
                });
            });

            imageFiles.forEach(f => imgFolder.file(f.fileName, f.b64, { base64: true }));
            videoFiles.forEach(f => imgFolder.file(f.fileName, f.b64, { base64: true }));

            function buildHtml(baseUrl) {
                const d = buildCleanDiv();

                d.querySelectorAll('img').forEach(img => {
                    const src = img.getAttribute('src') || '';
                    if (imgMap.has(src)) img.setAttribute('src', baseUrl + imgMap.get(src));
                });
                d.querySelectorAll('video[src]').forEach(vid => {
                    const src = vid.getAttribute('src') || '';
                    if (videoMap.has(src)) vid.setAttribute('src', baseUrl + videoMap.get(src));
                });

                let heroFinalSrc = '';
                if (heroFileName) {
                    heroFinalSrc = baseUrl + heroFileName;
                } else if (heroSrc && heroSrc !== '' && !heroSrc.endsWith('undefined')) {
                    heroFinalSrc = heroSrc;
                }
                if (heroFinalSrc) {
                    const heroTag = `<img src="${heroFinalSrc}" style="width:100%;display:block;margin:0;padding:0;border:none;">`;
                    const sc = d.querySelector('.se-contents');
                    if (sc) {
                        // 첫번째 se-div가 이미지 블록(font-size:0)인지 확인
                        const firstSeDiv = sc.querySelector(':scope > .se-div:first-child');
                        if (firstSeDiv && (firstSeDiv.style.fontSize === '0' || firstSeDiv.innerHTML.trim() === '')) {
                            firstSeDiv.innerHTML = heroTag;
                            firstSeDiv.style.fontSize = '0';
                            firstSeDiv.style.lineHeight = '0';
                            firstSeDiv.style.display = 'block'; // 재불러오기 시 박힌 display:none 복원
                        } else {
                            // 없으면 맨 앞에 새로 삽입
                            const heroDiv = document.createElement('div');
                            heroDiv.className = 'se-div';
                            heroDiv.style.cssText = 'margin:0;padding:0;font-size:0;line-height:0;display:block;width:100%;box-sizing:border-box;';
                            heroDiv.innerHTML = heroTag;
                            sc.insertBefore(heroDiv, sc.firstChild);
                        }
                    }
                }
                applyTargetBlankToLinks(d);
                // 브라우저가 변환한 rgb() → hex 복원 + 3자리 hex → 6자리 확장
                let finalHtml = d.innerHTML;
                finalHtml = convertRgbToHex(finalHtml);
                finalHtml = expandHexColors(finalHtml);
                // 인라인 font-family: Pretendard 선언 제거 — 외부 <style>에서 일괄 적용
                finalHtml = finalHtml.replace(/font-family\s*:\s*['"]?Pretendard['"]?[^;"']*;?/gi, '');
                return '<meta charset="UTF-8">\n<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">\n<style>body,div,p,span,a,button,li,td,th,h1,h2,h3,h4,h5,h6{font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;}</style>\n' + finalHtml;
            }

            // 팝업 내용을 se-popup-content 블록으로 append (불러오기 시 복원용)
            // <div class="se-div"> 사용: 사이냅에디터가 class 있는 div는 보존함
            function appendPopupBlocks(html) {
                if (!childPanels.length) return html;
                let blocks = '';
                childPanels.forEach(panel => {
                    const ca = getById('childArea_' + panel.id);
                    if (!ca) return;
                    const txt = ca.innerText.trim();
                    if (!txt || (txt.includes('팝업') && txt.length < 10)) return;
                    const clone = ca.cloneNode(true);
                    clone.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                    clone.querySelectorAll('.resizer-handle').forEach(el => el.remove());
                    blocks += `\n<div class="se-div se-popup-content" data-popup="${panel.id}" style="display:none;overflow:hidden;width:0;height:0;margin:0;padding:0;border:none;">${clone.innerHTML}</div>`;
                });
                return html + blocks;
            }

            // ── 불러오기용 + 브라우저 확인용 (index_불러오기용.html) ──
            // 사이냅 호환: se-popup-content (re-import 데이터) + se-popup-overlay (사전 렌더) + 인라인 onclick 토글
            // <script> 없음. createElement 없음.
            let localHtml = buildHtml(`./${hashFolder}/`);
            localHtml = appendPopupBlocks(localHtml);
            // popup-trigger 버튼 기존 onclick 제거
            localHtml = localHtml.replace(/(<(?:button|a)[^>]*class="popup-trigger"[^>]*)\s+onclick="[^"]*"/gi, '$1');

            if (childPanels.length > 0) {
                const _ac = (getById('accentPicker')?.value || '#7c3aed');
                const _bgc = getById('bgPicker')?.value || '#ffffff';
                const _txtc = getById('textPicker')?.value || (isDarkColor(_bgc) ? '#ffffff' : '#222222');
                const _surfc = getById('surfacePicker')?.value || _bgc;

                childPanels.forEach(panel => {
                    const ca = getById('childArea_' + panel.id);
                    if (!ca) return;
                    const txt = ca.innerText.trim();
                    if (!txt || (txt.includes('팝업') && txt.length < 10)) return;
                    const clone = ca.cloneNode(true);
                    clone.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                    clone.querySelectorAll('.resizer-handle').forEach(el => el.remove());
                    const popupInner = clone.innerHTML;
                    // 동적 createElement 방식 onclick 삽입 (사이냅에디터가 display:none 제거 문제 회피)
                    const safeOc = buildPopupTriggerOnclick(panel.id, popupInner, {
                        accent: _ac, surface: _surfc, textColor: _txtc
                    }).replace(/"/g, '&quot;');
                    localHtml = localHtml.replace(
                        new RegExp(`<(button|a)([^>]*\\bdata-popup="${panel.id}"[^>]*)>([^<]*)</\\1>`, 'i'),
                        (m, tag, attrs, inner) => `<${tag}${attrs} onclick="${safeOc}">${inner}</${tag}>`
                    );
                });

                // [회귀 방지 2026-05-19] popup-trigger 최종 fallback (HTML 코드 저장 경로 — PROMO_*.zip)
                //   Gemini 가 [팝업N] 마커만 emit 하고 콘텐츠를 본문에 인라인으로 박은 경우,
                //   childArea 가 비어있어 위 forEach 가 해당 popup 을 skip → trigger 가 onclick 없이 남음.
                //   localHtml 안의 정상 popup-trigger onclick 1개를 donor 로 잡아 panelId swap 으로 복사.
                try {
                    const donorMatch = localHtml.match(/<button[^>]*class="popup-trigger"[^>]*data-popup="([^"]+)"[^>]*onclick="([^"]*createElement[^"]*)"/);
                    if (donorMatch) {
                        const donorPid = donorMatch[1];
                        const donorOnclick = donorMatch[2];
                        localHtml = localHtml.replace(/<button([^>]*class="popup-trigger"[^>]*data-popup="([^"]+)"[^>]*)>/g, (m, attrs, pid) => {
                            if (/onclick\s*=/.test(attrs) || pid === donorPid) return m;
                            const swapped = donorOnclick.split(donorPid).join(pid);
                            console.warn('[PROMO_ZIP] onclick fallback from donor', donorPid, '→', pid);
                            return `<button${attrs} onclick="${swapped}">`;
                        });
                    }
                } catch (e) {
                    console.warn('PROMO_ZIP popup onclick fallback fail:', e);
                }
            }
            // 레이아웃 보정 — 히어로·2번 블록 max-width + 좌우 패딩 (브라우저에서 바로 열어도 정상 렌더)
            localHtml = ensureLayoutCompliance(localHtml);
            zip.file('index_불러오기용.html', '\uFEFF' + localHtml);

            // ── 게시용 (index_cdn.html) ──
            // onclick 포함, se-popup-content 없음 → 사이냅에디터에 바로 붙이는 용도
            if (cdnUrl) {
                const cdnBaseUrl = (cdnUrl.endsWith('/') ? cdnUrl : cdnUrl + '/') + hashFolder + '/';
                let cdnHtml = buildHtml(cdnBaseUrl);
                if (childPanels.length > 0) cdnHtml = buildInlinePopupHtml(cdnHtml);
                cdnHtml = convertTabAnchorsForCdn(cdnHtml);
                cdnHtml = ensureLayoutCompliance(cdnHtml);
                // se-popup-content DOM 기반 제거 (중첩 div 있어도 안전) — 게시용에는 불필요
                if (cdnHtml.includes('se-popup-content')) {
                    const _tmpClean = document.createElement('div');
                    _tmpClean.innerHTML = cdnHtml;
                    _tmpClean.querySelectorAll('.se-popup-content').forEach(el => el.remove());
                    cdnHtml = _tmpClean.innerHTML;
                }
                zip.file('index_cdn.html', '\uFEFF' + cdnHtml);
            }

            zip.generateAsync({ type: 'blob' }).then(async blob => {
                // 노션 작업 시: window.__promoName (프로모션명) 으로 파일명. 없으면 timestamp.
                const _safeName = (window.__promoName || '').replace(/[\\/:*?"<>|]/g, '_').trim();
                const fn = _safeName ? `${_safeName}.zip` : `PROMO_${Date.now()}.zip`;
                const r = await savePromoFile(fn, blob);
                if (spinner) spinner.classList.add('hidden');
                closeExportHtmlModal();
                const where = r.mode === 'fsa' ? '산출물 저장 경로' : '다운로드';
                const msg = cdnUrl
                    ? `index_불러오기용.html + index_cdn.html (CDN) → ${where} 에 ZIP 저장`
                    : `index_불러오기용.html → ${where} 에 ZIP 저장`;
                showToast(msg);
            }).catch(err => {
                console.error('ZIP 생성 실패:', err);
                if (spinner) spinner.classList.add('hidden');
                showToast('ZIP 생성 실패: ' + (err.message || '알 수 없는 오류'));
            });
            } catch(err) {
                console.error('HTML 내보내기 오류:', err);
                if (spinner) spinner.classList.add('hidden');
                showToast('내보내기 실패: ' + (err.message || '알 수 없는 오류'));
            }
        }
