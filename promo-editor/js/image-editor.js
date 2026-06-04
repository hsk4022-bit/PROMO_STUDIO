// promo-editor/js/image-editor.js — 이미지 에디터 + 히어로 + 색상 적용 (← rules/10-image.md)
//
// app.js 에서 분리 (Stage 6 — 2026-05-28).
// 포함:
//   ① img toolbar/resizer (Stage 5 후 L2232-2449)
//     showImgFloatToolbar, hideImgFloatToolbar, updateImgModeButtons,
//     updateImgSizeLabel, wrapImgInResizer, applyImgWidth, setImgStyle
//   ② 히어로 + 색상 (Stage 5 후 L2653-3195)
//     applyHeroImage, extractColorsFromImage, extractDominantColor,
//     deleteHeroImage, changeBg, changeAccent, replaceColorInContent,
//     applyTextColor, window._heroAspectRatio (전역 할당)
//
// 의존:
// - state.js: activeLayer, currentImgMode, _lastVideoRef, imgClipboard,
//             이미지 리사이저 6개 state
// - utils.js: getById
// - color-palette.js: getLuminance, blendHex, generatePalette, enforcePaletteHierarchy,
//                     generateAgentPalette, isDarkColor
// - app.js (runtime): recordState, showToast, hideTableFloatToolbar (table.js),
//                     hideVideoOptToolbar (video.js), addResizerHandles
//
// 주의: 이미지 리사이저 mousedown/mousemove/mouseup 이벤트 핸들러는 app.js 잔류
//       (isImgResizing/isSelecting 동시 처리 — bootstrap 코드)

// ────────────────────────────────────────────────────────────────
// ① img toolbar/resizer (Stage 5 후 L2232-2449)
// ────────────────────────────────────────────────────────────────
        function showImgFloatToolbar(el) {
            const tb = getById('imgFloatToolbar');
            if (!tb || !el) return;

            const isResizer = el.classList && el.classList.contains('custom-resizer');
            const isBareImg = el.tagName === 'IMG' || el.tagName === 'VIDEO'; // 래퍼 없는 bare img/video
            const computed = window.getComputedStyle(el);
            const display = computed.display;
            const w = parseInt(computed.width) || 0;
            const pageW = parseInt(getById('pageWidthInput')?.value || 840);

            if (display === 'block' && w >= pageW * 0.92) {
                currentImgMode = 'block';
            } else if (isResizer) {
                currentImgMode = 'resize';
            } else if (isBareImg) {
                // 래퍼 없는 img: display:block → block, 나머지 → inline
                currentImgMode = (display === 'block') ? 'block' : 'inline';
            } else if (display === 'inline-block' || display === 'inline') {
                currentImgMode = 'inline';
            } else {
                currentImgMode = 'resize';
            }

            updateImgModeButtons();

            tb.style.display = 'flex';
            tb.style.left = '-9999px';
            tb.style.top = '-9999px';

            requestAnimationFrame(() => {
                const rect = el.getBoundingClientRect();
                const tbW = tb.offsetWidth || 300;
                const tbH = tb.offsetHeight || 38;

                const imgCenterX = rect.left + rect.width / 2;
                let left = imgCenterX - tbW / 2;
                let top = rect.top - tbH - 10;

                if (left < 6) left = 6;
                if (left + tbW > window.innerWidth - 6) left = window.innerWidth - tbW - 6;
                if (top < 6) top = rect.bottom + 10;

                tb.style.left = left + 'px';
                tb.style.top  = top  + 'px';

                updateImgSizeLabel(el);
                // 너비 입력 인풋 동기화
                const wInp = getById('imgWidthInput');
                if (wInp) wInp.value = Math.round(rect.width) || '';
                // 영상이면 옵션 툴바 표시
                const _videoEl = el.tagName === 'VIDEO' ? el : el.querySelector?.('video');
                if (_videoEl) showVideoOptToolbar(el);
                else hideVideoOptToolbar();
            });
        }

        function hideImgFloatToolbar() {
            const tb = getById('imgFloatToolbar');
            if (tb) tb.style.display = 'none';
            hideVideoOptToolbar();
        }


        function updateImgModeButtons() {
            ['inline','block','resize'].forEach(mode => {
                const btn = getById(`imgBtn${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
                if (btn) btn.classList.toggle('img-mode-active', mode === currentImgMode);
            });
        }

        function updateImgSizeLabel(el) {
            const label = getById('imgSizeLabel');
            if (!label) return;
            const rect = el.getBoundingClientRect();
            label.textContent = `${Math.round(rect.width)} \u00d7 ${Math.round(rect.height)}`;
        }

        function wrapImgInResizer(img, force = false) {
            if (img.closest('.custom-resizer')) return img.closest('.custom-resizer');
            // td/th 셀 또는 childArea 안 이미지는 기본적으로 래퍼 없이 반환 (inline 취급)
            // 단, force=true이면 사용자가 명시적으로 리사이즈 핸들을 요청한 것 → 래퍼 허용
            if (!force && (img.closest('td, th') || img.closest('[id^="childArea_"]'))) return img;
            const wrap = document.createElement('div');
            wrap.className = 'custom-resizer';
            wrap.style.cssText = 'display: inline-block; position: relative; max-width: 100%; vertical-align: middle; min-width: 50px; min-height: 50px; user-select: none;';

            const containerW = img.closest('#contentArea')?.offsetWidth || 840;
            const isVideo = img.tagName === 'VIDEO';
            const natW = isVideo ? (img.videoWidth || 0) : (img.naturalWidth || 0);
            const natH = isVideo ? (img.videoHeight || 0) : (img.naturalHeight || 0);
            // getBoundingClientRect()로 실제 렌더링된 크기 사용 (CSS 제약 포함)
            const rect = img.getBoundingClientRect();
            const rendW = Math.round(rect.width) || img.offsetWidth || 0;
            const rendH = Math.round(rect.height) || img.offsetHeight || 0;
            // 렌더링 크기가 자연 크기보다 작거나 같으면 렌더링 크기 사용 (이미지 확대 방지)
            const useW = (rendW > 0 && (natW === 0 || rendW <= natW)) ? rendW : (natW || 300);
            const useH = (rendH > 0 && (natH === 0 || rendH <= natH)) ? rendH : natH;

            if (useW > 0 && useW <= containerW) {
                wrap.style.width = useW + 'px';
                if (useH > 0) wrap.style.height = useH + 'px';
                img.style.width  = '100%';
                img.style.height = '100%';
                img.style.maxWidth = '100%';
            } else {
                wrap.style.width = '100%';
                img.style.width = '100%';
                img.style.height = 'auto';
                img.style.maxWidth = '100%';
            }
            if (!isVideo) { img.style.objectFit = ''; img.style.imageRendering = ''; }
            img.style.pointerEvents = 'none';
            if (!isVideo) img.classList.remove('img-selected');

            img.parentNode.insertBefore(wrap, img);
            wrap.appendChild(img);
            addResizerHandles(wrap);
            return wrap;
        }

        // 플로팅 툴바 너비 입력 → 비율 유지하며 크기 적용
        function applyImgWidth() {
            const input = getById('imgWidthInput');
            if (!input || !activeLayer) return;
            const newW = parseInt(input.value);
            if (!newW || newW < 10) return;
            recordState();
            const isResizer = activeLayer.classList && activeLayer.classList.contains('custom-resizer');
            const targetImg = activeLayer.tagName === 'IMG' ? activeLayer : activeLayer.tagName === 'VIDEO' ? activeLayer : activeLayer.querySelector('img, video');
            if (isResizer) {
                // 자연 이미지/영상 비율 우선
                const _n = targetImg;
                const _natW = _n ? (_n.naturalWidth || _n.videoWidth || 0) : 0;
                const _natH = _n ? (_n.naturalHeight || _n.videoHeight || 0) : 0;
                const ratio = (_natW > 0) ? _natH / _natW
                            : (activeLayer.offsetHeight / Math.max(activeLayer.offsetWidth, 1));
                const newH = Math.round(newW * ratio);
                activeLayer.style.width  = newW + 'px';
                activeLayer.style.height = newH + 'px';
                if (targetImg) { targetImg.style.width = '100%'; targetImg.style.height = '100%'; }
            } else if (targetImg) {
                const ratio = targetImg.naturalHeight / Math.max(targetImg.naturalWidth, 1);
                const newH  = Math.round(newW * ratio);
                targetImg.style.width  = newW + 'px';
                targetImg.style.height = newH > 0 ? newH + 'px' : 'auto';
            }
            updateImgSizeLabel(activeLayer);
            recordState();
        }

        function setImgStyle(type) {
            if(!activeLayer) return;
            const isResizer = activeLayer.classList && activeLayer.classList.contains('custom-resizer');
            let targetImg = activeLayer.tagName === 'IMG' ? activeLayer : activeLayer.tagName === 'VIDEO' ? activeLayer : activeLayer.querySelector('img, video');
            if (!targetImg) return;
            const _isVid = targetImg.tagName === 'VIDEO';

            recordState();
            currentImgMode = type;
            updateImgModeButtons();

            if (type === 'inline') {
                if (isResizer) {
                    activeLayer.style.display = 'inline-block';
                    activeLayer.style.width = activeLayer.style.width || (targetImg.offsetWidth + 'px');
                } else {
                    targetImg.style.display = 'inline-block';
                    targetImg.style.width = 'auto';
                    targetImg.style.maxWidth = '100%';
                }
                showToast(_isVid ? "영상을 글자처럼 인라인 배치합니다." : "이미지를 글자처럼 인라인 배치합니다.");
            }
            else if (type === 'block') {
                if (isResizer) {
                    // resizer에서 반응형: 고정 너비/높이 초기화 후 100% 설정
                    activeLayer.style.display = 'block';
                    activeLayer.style.width = '100%';
                    activeLayer.style.height = '';      // 고정 높이 완전 제거
                    activeLayer.style.maxWidth = '100%';
                    activeLayer.style.minWidth = '';
                    targetImg.style.display = 'block';
                    targetImg.style.width = '100%';
                    targetImg.style.height = 'auto';
                    targetImg.style.maxWidth = '100%';
                    if (!_isVid) targetImg.style.objectFit = '';
                } else {
                    targetImg.style.display = 'block';
                    targetImg.style.width = '100%';
                    targetImg.style.height = 'auto';
                    targetImg.style.maxWidth = '100%';
                    targetImg.style.margin = '0 auto';
                }
                showToast(_isVid ? "영상을 100% 반응형으로 배치합니다." : "이미지를 100% 반응형으로 배치합니다.");
            }
            else if (type === 'resize') {
                if (!isResizer) {
                    // force=true: td/th·childArea 이미지도 사용자 요청 시 핸들 래퍼 적용
                    const wrap = wrapImgInResizer(targetImg, true);
                    if (wrap !== targetImg) {
                        // 실제로 래퍼가 생성된 경우 — activeLayer 교체
                        wrap.classList.add('active-layer');
                        if (activeLayer !== wrap) activeLayer.classList.remove('active-layer');
                        activeLayer = wrap;
                    } else {
                        // 래퍼 생성 불가(예외 케이스) — 현재 img 유지
                        targetImg.classList.add('active-layer');
                        activeLayer = targetImg;
                    }
                } else {
                    activeLayer.style.display = 'inline-block';
                }
                showToast("모서리 핸들을 드래그해 크기를 조절하세요.");
            }

            updateImgSizeLabel(activeLayer);
            recordState();
        }

// ────────────────────────────────────────────────────────────────
// ② 히어로 + 색상 (Stage 5 후 L2653-3195)
// ────────────────────────────────────────────────────────────────
        function applyHeroImage(src, isAiGenerated = false, aspectCss = null, skipColorExtract = false) {
            const img     = getById('mainHeroImg');
            const heroDiv = getById('heroDiv');
            if (!img || !heroDiv) return;

            img.src = src;
            img.onload = async () => {
                const natW = img.naturalWidth  || 1;
                const natH = img.naturalHeight || 1;

                heroDiv.style.minHeight   = '0';
                heroDiv.style.height      = 'auto';
                heroDiv.style.aspectRatio = natW + ' / ' + natH;

                img.style.position   = 'relative';
                img.style.inset      = '';
                img.style.display    = 'block';
                img.style.width      = '100%';
                img.style.height     = 'auto';
                img.style.objectFit  = '';
                img.classList.remove('hidden');

                getById('heroPlaceholder').style.display = 'none';
                getById('deleteHeroBtn').classList.remove('hidden');

                if (!skipColorExtract && getById('extractColorCheck')?.checked) {
                    // [agent-palette 2026-05-14] 1차: Gemini Vision 으로 mood-aware 팔레트 시도
                    //   AI 가 히어로 보고 디자이너 수준의 6색 팔레트 직접 결정.
                    //   실패 시 2차: 픽셀 추출 + enforcePaletteHierarchy (이전 알고리즘).
                    // [2026-05-20] 빈/잘린 JSON 응답 시 1회 자동 재시도 — Gemini 의 transient empty-response 대응
                    let bgFinal = '', accentFinal = '';
                    let _agentSuccess = false;
                    try {
                        showToast('🎨 AI 가 팔레트 분석 중...');
                        let _ap;
                        try {
                            _ap = await generateAgentPalette(img.src);
                        } catch (firstErr) {
                            if (/empty response|JSON|Unexpected/.test(firstErr.message || '')) {
                                console.warn('[agent-palette] 1차 실패, 재시도:', firstErr.message);
                                showToast('🎨 팔레트 재시도 중...');
                                _ap = await generateAgentPalette(img.src);
                            } else {
                                throw firstErr;
                            }
                        }
                        bgFinal = _ap.bg;
                        // [2026-05-30] accent 는 Vision 의 invent(히어로에 없는 보색 다발) 대신 픽셀 추출값으로 대체.
                        //   Vision 은 bg/surface/text/sub/border/mood(분위기 판단)에 강하지만 accent 는 'pop color' 라며
                        //   히어로에 없는 색을 만들어내는 사고가 잦음 → accent 만 deterministic 픽셀 추출(두드러진 실제 색)로.
                        try {
                            const _px = extractColorsFromImage(img);
                            accentFinal = (_px && /^#[0-9a-fA-F]{6}$/.test(_px.accent || '')) ? _px.accent : _ap.accent;
                        } catch (_) { accentFinal = _ap.accent; }
                        // AI 결과를 bgPicker.dataset 에 저장해 generateContent 가 surface/text/sub/border 재사용
                        const _bp = getById('bgPicker');
                        if (_bp) {
                            _bp.dataset.agentSurface = _ap.surface;
                            _bp.dataset.agentText = _ap.text;
                            _bp.dataset.agentSub = _ap.sub;
                            _bp.dataset.agentBorder = _ap.border;
                            _bp.dataset.agentMood = _ap.mood;
                        }
                        _agentSuccess = true;
                        showToast(`🎨 AI 팔레트: ${_ap.mood || bgFinal}`);
                    } catch(e) {
                        console.warn('[agent-palette] failed, falling back to pixel extraction:', e.message);
                        // 2차 fallback: 픽셀 추출 + hierarchy
                        const { bg, accent } = extractColorsFromImage(img);
                        if (bg && /^#[0-9a-fA-F]{6}$/.test(bg) && accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
                            try {
                                const _p = enforcePaletteHierarchy(bg, accent);
                                bgFinal = _p.bg; accentFinal = _p.accent;
                            } catch(_) { bgFinal = bg; accentFinal = accent; }
                        }
                        // fallback 시엔 agent dataset 클리어 (generateContent 가 hierarchy 로 재계산)
                        const _bp = getById('bgPicker');
                        if (_bp) {
                            delete _bp.dataset.agentSurface;
                            delete _bp.dataset.agentText;
                            delete _bp.dataset.agentSub;
                            delete _bp.dataset.agentBorder;
                            delete _bp.dataset.agentMood;
                        }
                        showToast(`🎨 배경색 자동 추출: ${(bgFinal || '').toUpperCase()}`);
                    }
                    // 유효한 6자리 hex 색상인지 확인 후 적용
                    if (bgFinal && /^#[0-9a-fA-F]{6}$/.test(bgFinal)) {
                        changeBg(bgFinal);
                        const sheet = getById('documentSheet');
                        if (sheet) sheet.style.backgroundColor = bgFinal;
                    }
                    const acPicker = getById('accentPicker');
                    const acSlash = getById('accentSlash');
                    if (acPicker && accentFinal && /^#[0-9a-fA-F]{6}$/.test(accentFinal)) {
                        acPicker.value = accentFinal;
                        acPicker.style.opacity = '1';
                        if (acSlash) acSlash.style.display = 'none';
                        getById('bgPicker').dataset.accent = accentFinal;
                        getById('bgPicker').dataset.prevAccent = accentFinal;
                    }
                }
                // 로고 오버레이 재렌더링
                renderLogoOverlay();
            };
        }

        // 히어로 이미지에서 BG(배경색)와 AC(키컬러)를 동시 추출
        // 밝은 이미지(파스텔/애니/일러스트)와 어두운 이미지 모두 지원
        function extractColorsFromImage(img) {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const w = img.naturalWidth, h = img.naturalHeight;

                canvas.width = 200; canvas.height = 200;
                ctx.drawImage(img, 0, 0, w, h, 0, 0, 200, 200);
                const data = ctx.getImageData(0, 0, 200, 200).data;

                // RGB → HSL 변환 (h: 0~360, s/l: 0~1)
                function rgbToHsl(r, g, b) {
                    r /= 255; g /= 255; b /= 255;
                    const max = Math.max(r,g,b), min = Math.min(r,g,b);
                    let h2 = 0, s = 0, l = (max + min) / 2;
                    if (max !== min) {
                        const d = max - min;
                        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                        switch (max) {
                            case r: h2 = (g - b) / d + (g < b ? 6 : 0); break;
                            case g: h2 = (b - r) / d + 2; break;
                            default: h2 = (r - g) / d + 4;
                        }
                        h2 /= 6;
                    }
                    return [h2 * 360, s, l];
                }

                // HSL → RGB 변환
                function hslToRgb(h, s, l) {
                    h /= 360;
                    const hue2rgb = (p, q, t) => {
                        if (t < 0) t += 1;
                        if (t > 1) t -= 1;
                        if (t < 1/6) return p + (q - p) * 6 * t;
                        if (t < 1/2) return q;
                        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                        return p;
                    };
                    if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
                    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    const p = 2 * l - q;
                    return [
                        Math.round(hue2rgb(p, q, h + 1/3) * 255),
                        Math.round(hue2rgb(p, q, h) * 255),
                        Math.round(hue2rgb(p, q, h - 1/3) * 255)
                    ];
                }

                function toHex(r, g, b) {
                    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
                }

                // ── 1단계: 전체 픽셀 파싱 + 평균 밝기 계산 ──
                // 가장자리 픽셀(이미지 외곽 25%) 여부도 함께 기록 — BG 샘플링에 활용
                const CW = 200, CH = 200;
                const allPixels = [];
                let totalLig = 0;
                for (let py = 0; py < CH; py++) {
                    for (let px = 0; px < CW; px++) {
                        const i = (py * CW + px) * 4;
                        const r = data[i], g = data[i+1], b = data[i+2];
                        const [hue, sat, lig] = rgbToHsl(r, g, b);
                        totalLig += lig;
                        // 외곽 25% 영역이면 isEdge=true (실제 배경색이 집중된 구역)
                        const isEdge = px < CW * 0.25 || px > CW * 0.75 || py < CH * 0.25 || py > CH * 0.75;
                        allPixels.push({ r, g, b, hue, sat, lig, isEdge });
                    }
                }
                const avgLig = totalLig / allPixels.length;
                // 평균 밝기 > 0.55 이면 밝은 이미지
                const isBrightImage = avgLig > 0.55;

                // ── 2단계: BG / AC 버킷 분류 ──
                // QSTEP=12: QSTEP=24보다 2배 세밀 → 크림/베이지/회색을 구별 가능
                // 가장자리 픽셀은 BG 가중치 3배 (캐릭터 등 중앙 오브젝트 오염 방지)
                const bgFreq = {};
                const acFreq = {};
                const QSTEP = 12;

                for (const { r, g, b, hue, sat, lig, isEdge } of allPixels) {
                    const qr = Math.round(r / QSTEP) * QSTEP;
                    const qg = Math.round(g / QSTEP) * QSTEP;
                    const qb = Math.round(b / QSTEP) * QSTEP;
                    const key = toHex(qr, qg, qb);
                    const edgeMult = isEdge ? 3 : 1; // 외곽 픽셀 BG 가중 3배

                    if (isBrightImage) {
                        if (lig > 0.97) continue; // 순백색 제외
                        // BG 후보: 채도 낮~중간 (파스텔/크림/베이지)
                        if (lig >= 0.40 && sat <= 0.75) {
                            const w2 = (1 + (1 - sat) * 3 + Math.max(0, lig - 0.45) * 1.5) * edgeMult;
                            bgFreq[key] = (bgFreq[key] || 0) + w2;
                        }
                        // AC 후보: 채도 높고 중간 밝기 (위치 무관)
                        if (sat >= 0.28 && lig >= 0.22 && lig <= 0.88) {
                            acFreq[key] = (acFreq[key] || 0) + sat * 5;
                        }
                    } else {
                        if (lig > 0.92) continue; // 흰색 스킵
                        // BG 후보: 유채색 + 가장자리 우선
                        if (sat >= 0.08 && lig < 0.72) {
                            const w2 = (1 + Math.max(0, 0.72 - lig) * 4 + sat * 2) * edgeMult;
                            bgFreq[key] = (bgFreq[key] || 0) + w2;
                        }
                        // AC 후보: 선명하고 채도 높은 중간 밝기
                        if (sat >= 0.30 && lig >= 0.28 && lig <= 0.85) {
                            acFreq[key] = (acFreq[key] || 0) + sat * 3;
                        }
                    }
                }

                // ── 3단계: BG 결정 — 우세 색조의 짙은 대표값으로 ──
                const bgEntries = Object.entries(bgFreq).sort((a, b) => b[1] - a[1]);
                let bgColor;

                if (bgEntries.length > 0) {
                    const rawBg = bgEntries[0][0];
                    const br = parseInt(rawBg.slice(1,3), 16);
                    const bg2 = parseInt(rawBg.slice(3,5), 16);
                    const bb = parseInt(rawBg.slice(5,7), 16);
                    const [bh, bs, bl] = rgbToHsl(br, bg2, bb);

                    if (isBrightImage) {
                        // [muddy-zone-fix 2026-05-14] 라이트 테마 bg L 범위 0.84~0.94 → 0.90~0.96.
                        // 가이드라인은 라이트 테마 L ≥ 88 (0.88) 권장이지만, surface 가 더 밝아야 하므로
                        // bg 는 최소 0.90 로 끌어올려 surface 가 0.96~1.00 범위에서 차별화 가능하게.
                        // 더스티 톤도 살리되 muddy zone(L 60~80) 빠지지 않도록 강제.
                        const adjS = Math.min(Math.max(bs, 0.35) * 1.4, 0.92);
                        const adjL = Math.min(Math.max(bl, 0.90), 0.96);
                        const [nr, ng, nb] = hslToRgb(bh, adjS, adjL);
                        bgColor = toHex(nr, ng, nb);
                    } else {
                        // [muddy-zone-fix 2026-05-14] 다크 테마 bg 명도 상한 추가 → max 0.22.
                        // 기존엔 상한이 없어 dark image 인데도 bg L 30~40 이 나와 muddy zone 진입.
                        // 가이드라인 다크 테마 L ≤ 20 (0.20) + 약간의 여유로 0.22.
                        const adjS = Math.min(bs * 1.05, 0.70);
                        const adjL = Math.max(Math.min(bl, 0.22), 0.06);
                        const [nr, ng, nb] = hslToRgb(bh, adjS, adjL);
                        bgColor = toHex(nr, ng, nb);
                    }
                } else {
                    bgColor = isBrightImage ? '#f5f0ec' : '#1e293b';
                }

                // ── 4단계: AC 결정 ──
                // [SSOT 2026-06-04] accent = bg/히어로와 **같은 색 계열** (파란 히어로→파란 accent).
                //   hue-family 게이트는 color-palette.js 의 pickAccentFromCandidates 단일 함수로 통합
                //   (본문 DOM 재감지 경로와 동일 로직 — off-family 주황 로고가 어느 경로에서도 못 뽑히게).
                //   acFreq 후보는 이미 채도 높은 mid-tone 만이라 bg(어두운/옅은)와 채도·명도로 자연 구분됨.
                const acEntries = Object.entries(acFreq).sort((a, b) => b[1] - a[1]);
                let accentColor = pickAccentFromCandidates(
                    acEntries.map(([hex, cnt]) => ({ hex, weight: cnt })),
                    bgColor
                );

                // [SSOT 2026-06-04] 같은 계열 후보 전무 시 폴백 = bg hue 기반 같은-계열 accent 생성.
                //   ⚠️ 기존 "전체 픽셀 중 최고 채도색" 폴백은 hue 게이트를 우회하는 누수였음:
                //   파란 히어로의 파란색은 대부분 옅은 눈/하늘이라 AC 버킷(sat≥0.30)에서 탈락 →
                //   같은계열 후보가 비면 최고채도 폴백이 로고의 금/주황 글로우를 집어 회귀(주황→골드).
                //   bg(파랑)에서 결정론적으로 파랑 accent 를 합성하면 off-family 가 구조적으로 불가능.
                if (!accentColor) {
                    accentColor = generatePalette(bgColor).accent;
                }

                // ── 5단계: WCAG 대비 보정 (최소 4.5:1 확보) ──
                // WCAG 2.1 상대 명도 계산 — sRGB 선형화 후 0~1 범위
                function wcagLum(hex) {
                    const rr = parseInt(hex.slice(1,3),16)/255;
                    const gg = parseInt(hex.slice(3,5),16)/255;
                    const bb = parseInt(hex.slice(5,7),16)/255;
                    const lin = c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
                    return 0.2126*lin(rr) + 0.7152*lin(gg) + 0.0722*lin(bb);
                }
                function contrastRatio(h1, h2) {
                    const l1 = wcagLum(h1), l2 = wcagLum(h2);
                    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
                }
                const acRaw = parseInt(accentColor.slice(1,3),16);
                const acGrn = parseInt(accentColor.slice(3,5),16);
                const acBlu = parseInt(accentColor.slice(5,7),16);
                const [acH, acS, acL] = rgbToHsl(acRaw, acGrn, acBlu);
                let finalAccent = accentColor;

                // 채도 부스트: 원본 채도 최대한 올려서 선명하게 (최소 0.72)
                const boostedS = Math.min(Math.max(acS, 0.85) * 1.18, 0.99);

                const MIN_CONTRAST = 4.5;
                let curContrast = contrastRatio(bgColor, accentColor);
                if (curContrast < MIN_CONTRAST) {
                    const bgIsLight = wcagLum(bgColor) > 0.18;
                    const step = bgIsLight ? -0.03 : 0.03;
                    let bestL = acL, bestContrast = curContrast;
                    for (let trial = acL + step; trial >= 0.04 && trial <= 0.96; trial += step) {
                        const [tr2, tg2, tb2] = hslToRgb(acH, boostedS, trial);
                        const trialHex = toHex(tr2, tg2, tb2);
                        const trialContrast = contrastRatio(bgColor, trialHex);
                        if (trialContrast > bestContrast) { bestContrast = trialContrast; bestL = trial; }
                        if (trialContrast >= MIN_CONTRAST) break;
                    }
                    const [fr, fg, fb] = hslToRgb(acH, boostedS, bestL);
                    finalAccent = toHex(fr, fg, fb);
                } else {
                    // 대비는 충분해도 채도 부스트 적용
                    const [fr, fg, fb] = hslToRgb(acH, boostedS, acL);
                    finalAccent = toHex(fr, fg, fb);
                }

                return { bg: bgColor, accent: finalAccent };
            } catch (e) {
                console.warn('extractColorsFromImage error:', e);
                return { bg: '#f5f0ec', accent: '#e07060' };
            }
        }

        // 구버전 단일 색상 추출 (폴백용으로 유지)
        function extractDominantColor(img) {
            return extractColorsFromImage(img).bg;
        }

        function deleteHeroImage() {
            const img     = getById('mainHeroImg');
            const heroDiv = getById('heroDiv');
            if (!img || !heroDiv) return;

            img.src          = '';
            img.style.cssText = '';
            img.classList.add('hidden');
            img.style.display = 'none';

            heroDiv.style.aspectRatio = '';
            heroDiv.style.minHeight   = '400px';
            heroDiv.style.height      = 'auto';

            getById('heroPlaceholder').style.display = 'flex';
            getById('deleteHeroBtn').classList.add('hidden');
            showToast("메인 히어로 이미지가 삭제되었습니다.");
        }

        // noColorAdjust=true: 불러오기 시 텍스트 색 자동교체 비활성화 (저장된 색 그대로 유지)
        function changeBg(color, noColorAdjust = false) {
            // rgb() 형태로 오면 hex로 변환
            if (color && color.startsWith('rgb')) {
                const m = color.match(/\d+/g);
                if (m && m.length >= 3) {
                    color = '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
                }
            }
            if (!color || !color.startsWith('#')) return;
            const area = getById('contentArea'); const sheet = getById('documentSheet');
            if (!area || !sheet) return;
            area.style.backgroundColor = color;
            sheet.style.backgroundColor = color;

            // se-contents(투명) + 콘텐츠 전체 래퍼(2번 블록)만 배경 변경
            // 섹션 카드(surfaceColor)는 건드리지 않음
            const seContentsEl = area.querySelector('.se-contents');
            if (seContentsEl) {
                seContentsEl.style.backgroundColor = 'transparent';
                // 2번 블록 = se-contents 직계 자식 중 배경이 있는 래퍼
                const contentWrapper = seContentsEl.querySelector(':scope > .se-div:last-child');
                if (contentWrapper) contentWrapper.style.backgroundColor = color;
            }

            // [popup-bg-sync 2026-05-14] 팝업 패널(childArea_*) 도 본문 bg 변경 따라가도록 동기화.
            //   기존엔 팝업 생성 시점의 bg 가 고정돼, 본문 재생성 시 색이 달라도 팝업은 옛 색 유지 → 시각 불일치.
            //   childArea bg/text + 헤더 bg + 삭제 버튼 chrome 까지 본문과 완전 동일하게 갱신.
            const _isDarkBg     = isDarkColor(color);
            const _popHeaderBg  = _isDarkBg ? '#1a1e2e' : '#ffffff';
            const _popTextCol   = _isDarkBg ? '#f0f0f0' : '#1e293b';
            const _delBtnColor  = _isDarkBg ? '#94a3b8' : '#64748b';
            const _delBtnBorder = _isDarkBg ? '#374151' : '#e2e8f0';
            document.querySelectorAll('[id^="childArea_"]').forEach(ca => {
                ca.style.backgroundColor = color;
                ca.style.color = _popTextCol;
            });
            document.querySelectorAll('.childPanelHeader').forEach(hd => {
                hd.style.background = _popHeaderBg;
                // 삭제 버튼 color/border 도 bg darkness 에 맞춰 갱신
                // (background-color 는 accent 색이 덮어쓰므로 건드리지 않음)
                const delBtn = hd.querySelector('button');
                if (delBtn) {
                    delBtn.style.color = _delBtnColor;
                    delBtn.style.borderColor = _delBtnBorder;
                }
            });

            // [2026-05-31] noColorAdjust=true(불러오기) 면 기본 텍스트 색도 건드리지 않는다 — 불러온 HTML 의
            //   색 체계 그대로 보존. 이전엔 이 area/se-contents 기본색 설정이 게이트 밖이라, 불러오기 시
            //   accent 배경 위 텍스트(명시색 없는 상속분: 날짜박스/넘버배지 등)가 어두워지는 회귀가 있었음.
            //   아래 재색칠 루프와 동일하게 게이트.
            if (!noColorAdjust) {
                const finalTextColor = isDarkColor(color) ? '#ffffff' : '#1e293b';
                area.style.color = finalTextColor;
                // se-contents에도 color 명시 — innerHTML로 저장 시 상속 텍스트 색상이 보존되도록
                const seContents = area.querySelector('.se-contents');
                if (seContents) seContents.style.color = finalTextColor;
            }

            // 불러오기 시에는 텍스트 색 자동교체 비활성화 — 저장된 색상 그대로 유지
            if (!noColorAdjust) {
                const textNodes = area.querySelectorAll('*');
                textNodes.forEach(node => {
                    // 버튼·탭 링크·popup-trigger 안의 텍스트는 건드리지 않음 (accent 색 유지)
                    if (node.closest('a[href], button, .popup-trigger, [class*="tab"]')) return;
                    if (node.tagName === 'A' || node.tagName === 'BUTTON') return;
                    if (node.style.color) {
                        const c = node.style.color.replace(/\s/g, '').toLowerCase();
                        if (isDarkColor(color)) {
                             if (c === 'rgb(30,41,59)' || c === '#1e293b' || c === 'black' || c === '#000' || c === '#000000') node.style.color = '#ffffff';
                        } else {
                             if (c === 'rgb(255,255,255)' || c === 'white' || c === '#fff' || c === '#ffffff') node.style.color = '#1e293b';
                        }
                    }
                });
            }

            getById('bgPicker').value = color;
        }

        function changeAccent(color) {
            const area = getById('contentArea');
            if (!area) return;
            // accentPicker 값 저장
            const picker = getById('accentPicker');
            if (picker) picker.value = color;
            getById('bgPicker').dataset.accent = color;

            recordState();
            // contentArea + 모든 팝업 childArea 대상으로 accent 색 교체
            const allAreas = [area];
            childPanels.forEach(panel => {
                const ca = getById('childArea_' + panel.id);
                if (ca) allAreas.push(ca);
            });

            const oldAccent = getById('bgPicker').dataset.prevAccent || null;
            if (oldAccent && oldAccent !== color) {
                allAreas.forEach(targetArea => replaceColorInContent(targetArea, oldAccent, color));
            } else {
                // 이전 색 없으면 전체 스타일 속성 분석 후 가장 많은 색(BG 제외) 교체
                const freq = {};
                const bgColor = getById('bgPicker').value.toLowerCase();
                allAreas.forEach(targetArea => {
                    targetArea.querySelectorAll('[style]').forEach(el => {
                        const m = el.getAttribute('style').match(/#[0-9a-fA-F]{6}/g);
                        if (m) m.forEach(c => { freq[c.toLowerCase()] = (freq[c.toLowerCase()] || 0) + 1; });
                    });
                });
                const detected = Object.entries(freq)
                    .filter(([c]) => c !== bgColor)
                    .sort((a, b) => b[1] - a[1])[0];
                if (detected) allAreas.forEach(targetArea => replaceColorInContent(targetArea, detected[0], color));
            }
            getById('bgPicker').dataset.prevAccent = color;

            // 팝업 트리거 버튼(.popup-trigger) 스타일 전체를 hex로 재설정
            fixPopupTriggerStyles(); protectAccentBars(); protectSectionCards();

            // childPanelHeader 내 레이블 색상 + 삭제 버튼 색상 동기화
            childPanels.forEach(panel => {
                const lbl = getById('childPanelLabel_' + panel.id);
                if (lbl) lbl.style.color = color;
                const hdr = getById('childPanelHeader_' + panel.id);
                if (hdr) {
                    const delBtn = hdr.querySelector('button');
                    if (delBtn) delBtn.style.backgroundColor = color;
                }
            });

            recordState();
            showToast('포인트 컬러가 변경되었습니다.');
        }

        function replaceColorInContent(area, oldColor, newColor) {
            const old = oldColor.toLowerCase();
            area.querySelectorAll('[style]').forEach(el => {
                const s = el.getAttribute('style');
                if (s.toLowerCase().includes(old)) {
                    el.setAttribute('style', s.replace(new RegExp(old.replace('#', '#'), 'gi'), newColor));
                }
            });
        }

        async function apiFetch(url, options) {
            let authKey = getById('apiKeyInput').value;
            if (!authKey) { try { authKey = localStorage.getItem('promo_studio_gemini_api_key') || ''; } catch(e){} }
            authKey = authKey || apiKey;
            const fullUrl = `${url}${url.includes('?') ? '&' : '?'}key=${authKey}`;
            const response = await fetch(fullUrl, options);
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || "API \uc694\uccad \uc2e4\ud328");
            }
            return await response.json();
        }

        window._heroAspectRatio = '1:1'; // 기본값

        function applyTextColor(color) {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
                showToast('색상을 적용할 텍스트를 먼저 선택하세요.');
                return;
            }
            recordState();
            // 선택 범위를 span으로 감싸서 인라인 color 적용
            const range = sel.getRangeAt(0);
            const span = document.createElement('span');
            span.style.color = color;
            try {
                range.surroundContents(span);
            } catch(e) {
                // 범위가 여러 노드에 걸쳐 있을 때 execCommand 사용
                document.execCommand('foreColor', false, color);
                // execCommand가 font 태그를 만들 수 있으므로 span으로 교체
                const area = getById('contentArea');
                area.querySelectorAll('font[color]').forEach(font => {
                    const s = document.createElement('span');
                    s.style.color = font.getAttribute('color');
                    s.innerHTML = font.innerHTML;
                    font.replaceWith(s);
                });
            }
            recordState();
        }
