// promo-editor/js/slicer.js — 슬라이서 모달 + 캡처 + 슬라이스 export
//
// app.js 에서 분리 (Stage 7 — 2026-05-28). 단일 블록 L522-1460.
// 포함:
//   - augmentSlicerCapture (회귀 방지 — slicerLinks/slicerPopups selector 누락 보강),
//   - openSlicerModal (전체 캡처 → slicerImg 생성 + 좌표 측정),
//   - closeSlicerModal, drawSlicer (캔버스 미리보기),
//   - calculateVerticalSliceLines (자동 분할 라인 계산),
//   - executeSliceAndExport (슬라이스 + 팝업 캡처 + ZIP 생성 + index_불러오기용.html).
//
// 의존:
// - state.js: slicerImg, slicerLinks, slicerPopups, autoSliceCount,
//             currentHashFolder, childPanels, activeLayer, logoBase64,
//             contentAssetLibrary, _promoPreservedBlocks, videoObjectUrlMap
// - utils.js: getById, generateHashString, savePromoFile, downscaleCanvas
// - color-palette.js: isDarkColor, blendHex
// - export.js: prepareSheetForCapture, convertImagesToBase64, sanitizeBrokenImages
//              (export.js 가 먼저 로드되어야 함 — load order: export → slicer)
// - popup-builder.js: buildPopupTriggerOnclick
// - app.js (runtime): showToast, recordState, applyTargetBlankToLinks,
//                     convertRgbToHex, expandHexColors, ensureLayoutCompliance,
//                     ensureEventVideoScript (video.js), compositeHeroWithLogo (video.js),
//                     htmlToImage (CDN), JSZip (CDN)
//
// 주의: 슬라이서 1.3x 캡처 + 슬라이서 렌더 에러 사람-읽기 가능 로깅 safety net 포함.

        // [regression-fix 2026-05-12] slicer 누락 요소 보강 — additive only.
        //   기존 slicerLinks/slicerPopups selector 가 못 잡은 케이스 push (selector·기존 객체 0줄 수정).
        function augmentSlicerCapture(sheet, sheetRect, targetScale) {
            const _diag = {
                '[data-popup]': sheet.querySelectorAll('[data-popup]').length,
                '.popup-trigger': sheet.querySelectorAll('.popup-trigger').length,
                '기존 slicerPopups': slicerPopups.length,
                '기존 slicerLinks': slicerLinks.length
            };
            console.log('[slicer-augment]', _diag);
            try { if (typeof showToast === 'function') showToast('[slicer] popup-trigger=' + _diag['.popup-trigger'] + ' / data-popup=' + _diag['[data-popup]']); } catch(_) {}

            const existingIds = new Set(slicerPopups.map(p => p.id));
            sheet.querySelectorAll('[data-popup]').forEach(el => {
                const id = el.getAttribute('data-popup');
                if (!id || existingIds.has(id)) return;
                let rect = el.getBoundingClientRect();
                let x = (rect.left - sheetRect.left) * targetScale;
                let y = (rect.top - sheetRect.top) * targetScale;
                let w = rect.width * targetScale;
                let h = rect.height * targetScale;
                if (w <= 0 || h <= 0) {
                    let p = el.parentElement, depth = 0;
                    while (p && depth < 5) {
                        const pr = p.getBoundingClientRect();
                        if (pr.width > 0 && pr.height > 0) {
                            x = (pr.left - sheetRect.left) * targetScale;
                            y = (pr.top - sheetRect.top) * targetScale;
                            w = 28 * targetScale; h = 28 * targetScale;
                            break;
                        }
                        p = p.parentElement; depth++;
                    }
                }
                if (w <= 0 || h <= 0) return;
                slicerPopups.push({ id, x, y, w: Math.max(w, 28), h: Math.max(h, 28), style: el.getAttribute('style') || '' });
                existingIds.add(id);
            });
        }



        async function openSlicerModal() {
            const sheet = getById('documentSheet');
            if (!sheet || sheet.innerText.includes('DESIGN ENGINE IDLE')) return showToast("\ubd84\ud560\ud560 \ucee8\ud150\uce20\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.");
            if (activeLayer) activeLayer.classList.remove('active-layer');
            getById('slicerModal').classList.remove('hidden');
            getById('slicerLoading').classList.remove('hidden');
            getById('slicerCanvas').classList.add('hidden');
            getById('autoSliceCountBadge').innerText = "\ub80c\ub354\ub9c1 \ubc0f \ubd84\uc11d \uc911...";

            setTimeout(async () => {
                let capture;
                try {
                    capture = await prepareSheetForCapture();
                    const { targetScale, bgColor } = capture;

                    // [coord-align 2026-05-13 r2] 슬라이서 측정·렌더링 정합성 보정.
                    // html-to-image 는 skipFonts:true 로 캡처하면 Pretendard 를 임베드하지 않아
                    //   캔버스 SVG 렌더링이 시스템 폴백 한글 폰트(Apple SD Gothic Neo / Malgun Gothic)로 떨어진다.
                    // 그런데 위치 측정은 라이브 documentSheet (Pretendard 적용) 기준으로 했었다 →
                    //   한글 탭 텍스트가 Pretendard 가 더 넓게 렌더되면서 오버레이 좌표가
                    //   실제 캡처 이미지보다 우측으로 ~15-20% 어긋났고, 일부 탭은 100% 를 넘어
                    //   이미지 밖에 위치 → 클릭 자체가 안 되는 버그.
                    // 픽스 r2: <style> 주입 + 클래스 셀렉터 + !important 로 cascade 강제.
                    //   AI 생성 HTML 의 버튼들에는 인라인 `font: inherit` shorthand 가 있어서
                    //   element.style.setProperty(font-family, ..., 'important') 가 의도대로 안 먹는 케이스가
                    //   관찰됨 (탭 좌표가 여전히 100%+ 로 측정). stylesheet !important + class selector 는
                    //   shorthand 인라인을 확실히 이긴다 (author !important > inline regular).
                    //   클론 root + 모든 자손 → 폴백 폰트 강제 → html-to-image 의 캡처와 동일한 측정.
                    const _FALLBACK_FONT = '"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
                    const _SLICER_FONT_STYLE_ID = '__slicer_font_override_style__';
                    const _SLICER_CLONE_CLASS = '__slicer_fallback_font_clone__';
                    let _slicerFontStyleEl = document.getElementById(_SLICER_FONT_STYLE_ID);
                    if (!_slicerFontStyleEl) {
                        _slicerFontStyleEl = document.createElement('style');
                        _slicerFontStyleEl.id = _SLICER_FONT_STYLE_ID;
                        _slicerFontStyleEl.textContent =
                            '.' + _SLICER_CLONE_CLASS + ', .' + _SLICER_CLONE_CLASS + ' * { ' +
                            'font-family: ' + _FALLBACK_FONT + ' !important; ' +
                            '}';
                        document.head.appendChild(_slicerFontStyleEl);
                    }
                    capture.sheet.classList.add(_SLICER_CLONE_CLASS);

                    // [hero-visibility 2026-05-13] 클론의 히어로 가시성 강제.
                    // 라이브 mainHeroImg 가 src 는 있는데 .hidden 클래스가 남아있는 경우
                    //   (불러오기 시 이미지 onload 미발화·이전 세션 잔존 상태 등) → 클론에도 그대로 복제
                    //   → 캔버스가 heroDiv 의 bg-slate-900 (#0f172a) 어두운 영역만 캡처하고 히어로 안 나옴.
                    // 라이브 자연 치수가 있으면 클론을 명시적으로 visible 로 풀어주고
                    //   heroDiv 의 aspectRatio 도 라이브와 동일하게 맞춤.
                    const _liveHero = getById('mainHeroImg');
                    const _cloneHero = capture.sheet.querySelector('#mainHeroImg');
                    const _cloneHeroDiv = capture.sheet.querySelector('#heroDiv');
                    const _clonePlaceholder = capture.sheet.querySelector('#heroPlaceholder');
                    if (_cloneHero && _cloneHero.getAttribute('src')) {
                        _cloneHero.classList.remove('hidden');
                        _cloneHero.style.display = 'block';
                        _cloneHero.style.width = '100%';
                        _cloneHero.style.height = 'auto';
                        _cloneHero.style.position = 'relative';
                        if (_cloneHeroDiv) {
                            _cloneHeroDiv.style.minHeight = '0';
                            _cloneHeroDiv.style.height = 'auto';
                            const natW = _liveHero?.naturalWidth;
                            const natH = _liveHero?.naturalHeight;
                            if (natW && natH) _cloneHeroDiv.style.aspectRatio = natW + ' / ' + natH;
                        }
                        if (_clonePlaceholder) _clonePlaceholder.style.display = 'none';
                    }

                    // 강제 리플로우 — 폰트 변경 후 새 레이아웃 확정
                    void capture.sheet.offsetWidth;

                    const measureSheet = capture.sheet;
                    const measureRect = measureSheet.getBoundingClientRect();

                    // id 속성 있는 엘리먼트의 Y좌표 수집 (탭 타겟 섹션 위치)
                    const anchorTargetMap = {};
                    measureSheet.querySelectorAll('[id]').forEach(el => {
                        const rect = el.getBoundingClientRect();
                        anchorTargetMap[el.id] = (rect.top - measureRect.top) * targetScale;
                    });
                    // slicerLinks에 anchorTargetMap 포함해서 저장
                    // a.href 대신 getAttribute('href') 사용 → 절대URL 변환 방지
                    slicerLinks = Array.from(measureSheet.querySelectorAll('a')).map(a => {
                        const rect = a.getBoundingClientRect();
                        const rawHref = a.getAttribute('href') || '';
                        const hash = rawHref.startsWith('#') ? rawHref.slice(1) : '';
                        return {
                            url: rawHref,
                            x: (rect.left - measureRect.left) * targetScale,
                            y: (rect.top - measureRect.top) * targetScale,
                            w: rect.width * targetScale,
                            h: rect.height * targetScale,
                            targetY: hash && anchorTargetMap[hash] !== undefined ? anchorTargetMap[hash] : null,
                            isPopupTrigger: a.classList.contains('popup-trigger')
                        };
                    }).filter(l => l.w > 0 && l.h > 0);

                    // 탭 버튼(<button onclick="...getElementById('tabN')...scrollIntoView">) 수집
                    // convertTabAnchorsForCdn 으로 <a href="#id"> 가 <button> 으로 변환되었기 때문에 별도 감지 필요
                    Array.from(measureSheet.querySelectorAll('button[onclick]')).forEach(btn => {
                        if (btn.classList.contains('popup-trigger')) return; // 팝업 트리거는 별도
                        const oc = btn.getAttribute('onclick') || '';
                        const m = oc.match(/getElementById\(['"]([\w-]+)['"]\)/);
                        if (!m) return; // 앵커 이동 onclick 아니면 스킵
                        const hash = m[1];
                        const rect = btn.getBoundingClientRect();
                        const w = rect.width * targetScale;
                        const h = rect.height * targetScale;
                        if (w <= 0 || h <= 0) return;
                        slicerLinks.push({
                            url: '#' + hash,
                            x: (rect.left - measureRect.left) * targetScale,
                            y: (rect.top - measureRect.top) * targetScale,
                            w, h,
                            targetY: anchorTargetMap[hash] !== undefined ? anchorTargetMap[hash] : null,
                            isPopupTrigger: false
                        });
                    });

                    // 팝업 트리거 버튼 위치 수집 (슬라이스 HTML에 onclick 오버레이로 삽입)
                    slicerPopups = Array.from(measureSheet.querySelectorAll('.popup-trigger[data-popup]')).map(btn => {
                        const rect = btn.getBoundingClientRect();
                        const id = btn.getAttribute('data-popup');
                        const btnStyle = btn.getAttribute('style') || '';
                        return {
                            id,
                            x: (rect.left - measureRect.left) * targetScale,
                            y: (rect.top - measureRect.top) * targetScale,
                            w: Math.max(rect.width * targetScale, 28),
                            h: Math.max(rect.height * targetScale, 28),
                            style: btnStyle
                        };
                    }).filter(p => p.id && p.w > 0 && p.h > 0);

                    // [regression-fix 2026-05-12] 누락된 popup 보강 (push 만, 기존 0줄 수정)
                    augmentSlicerCapture(measureSheet, measureRect, targetScale);

                    // 로고 합성: 클론의 히어로 이미지에만 합성 (원본 DOM 불변)
                    if (logoBase64) {
                        const composited = await compositeHeroWithLogo();
                        if (composited) {
                            const cloneHero = capture.sheet.querySelector('#mainHeroImg');
                            if (cloneHero) cloneHero.src = composited;
                        }
                    }

                    // [retina-fix 2026-05-20 r2] 1.5x 캡 (이전 2x → 1.5x).
                    //   원리: 2x retina 는 화질 최고지만 PNG 파일 크기 2x 캡처 = 5~10MB/ZIP 으로 부담.
                    //   1.5x 도 표시 폭(840) 대비 1.5배 오버샘플링이라 다운스케일 영역 → 픽셀 이미지 깨짐 없음.
                    //   화질-용량 균형점. 일반 DPR=1 화면은 1.3x 그대로.
                    const _dpr = Math.min(window.devicePixelRatio || 1, 1.5);  // 2x → 1.5x cap (용량 절감)
                    let _effectiveRatio = Math.max(targetScale, _dpr);
                    // [2026-05-31] 캔버스 높이 한계(16000px) 를 "실제 픽셀비율(_effectiveRatio)" 기준으로 보장.
                    //   회귀: export 의 MAX_CANVAS_PX 캡은 targetScale 에만 걸리는데, 실제 캡처 pixelRatio 는
                    //   max(targetScale, dpr=1.5) 라 캡이 무력화됨 → 긴 페이지에서 clone높이×1.5 > 16384 →
                    //   Chrome 가 하단(대버튼/마지막 섹션)을 잘라냄. effectiveRatio 를 직접 캡해 canvas ≤ 16000 보장.
                    //   (좌표는 아래 scale-resync(L332~)가 actualScale 로 재정렬하므로 정합성 유지)
                    const _CANVAS_MAX_PX = 16000;
                    const _cloneH = capture.sheet.scrollHeight || capture.sheet.offsetHeight || 0;
                    if (_cloneH > 0 && _cloneH * _effectiveRatio > _CANVAS_MAX_PX) {
                        _effectiveRatio = _CANVAS_MAX_PX / _cloneH;
                        console.log('[slicer] effectiveRatio capped to', _effectiveRatio.toFixed(3),
                                    '(cloneH=' + _cloneH + ') — 긴 페이지 하단 잘림 방지');
                    }

                    // [diag 2026-05-20] 캡처 직전 IMG src 전수 로그 — html-to-image 내부에서 IMG 생성하는 케이스 진단용
                    //   sanitizer 다 통과한 후 어떤 src 들이 남아있는지 확인. 이걸로 data:text/html 의 출처 추적.
                    try {
                        const _allImgs = Array.from(capture.sheet.querySelectorAll('img'));
                        const _summary = { total: _allImgs.length, dataImage: 0, blob: 0, http: 0, relative: 0, dataOther: 0, empty: 0, other: 0 };
                        _allImgs.forEach(im => {
                            const s = (im.getAttribute('src') || im.src || '').trim();
                            if (!s) _summary.empty++;
                            else if (s.startsWith('data:image/')) _summary.dataImage++;
                            else if (s.startsWith('blob:')) _summary.blob++;
                            else if (s.startsWith('http')) _summary.http++;
                            else if (s.startsWith('data:')) { _summary.dataOther++; console.warn('[capture-diag] non-image data IMG survived sanitize:', s.slice(0, 80)); }
                            else if (s.startsWith('./') || s.startsWith('/') || !s.includes(':')) { _summary.relative++; console.warn('[capture-diag] relative IMG src survived (will fetch → potential 404):', s.slice(0, 80)); }
                            else _summary.other++;
                        });
                        console.log('[capture-diag] IMG inventory before htmlToImage:', _summary);
                    } catch(_) {}

                    // 1x1 투명 PNG dataURL (image fetch 실패 시 fallback). html-to-image 의 imagePlaceholder
                    //   옵션 — fetch 가 404/HTML 응답 받아도 이걸로 대체되어 data:text/html dataURL 생성 안 함.
                    const TRANSPARENT_1PX_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

                    const toCanvasOpts = {
                        pixelRatio: _effectiveRatio,
                        backgroundColor: bgColor,
                        skipFonts: true,
                        useCORS: true,
                        allowTaint: false,
                        cacheBust: false,
                        // [defense 2026-05-20] 핵심 — html-to-image 내부 fetch 가 실패(404→HTML 응답 등) 했을 때
                        //   응답 body 를 그대로 data: URL 화하는 라이브러리 폴백 동작 차단. 이게 없으면 404 HTML 응답이
                        //   `data:text/html;base64,<!DOCTYPE html>...` 로 인코딩돼 IMG 에 박혀 onerror → 1차 캡처 reject.
                        imagePlaceholder: TRANSPARENT_1PX_PNG,
                        style: { transform: 'none', margin: '0', padding: '0' },
                        filter: node => {
                            if (!node.classList) return true;
                            if (node.classList.contains('resizer-handle')) return false;
                            if (node.id === 'heroLogoOverlay') return false;
                            // [defense 2026-05-20] IMG 3차 방어 — sanitizer 가 못 잡은 케이스 (race/library-internal) 차단.
                            //   허용: data:image/*, blob:, 빈 인라인 (다른 단계에서 처리). 그 외 (data:text/*, http, 등) 제외.
                            if (node.tagName === 'IMG') {
                                const _s = (node.getAttribute('src') || node.src || '').trim();
                                if (!_s) return false;
                                if (_s.startsWith('data:image/') || _s.startsWith('blob:')) return true;
                                console.warn('[capture-filter] IMG excluded by safety filter:', _s.slice(0, 60));
                                return false;
                            }
                            return true;
                        }
                    };
                    // 렌더링 헬퍼: 타임아웃 포함 (hang 방지) — 클론에 적용
                    const RENDER_TIMEOUT = 50000;
                    const renderWithTimeout = (opts) => Promise.race([
                        htmlToImage.toCanvas(capture.sheet, opts),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('렌더링 시간 초과(50s)')), RENDER_TIMEOUT))
                    ]);
                    const fallbackFilter = node => {
                        if (!node.classList) return true;
                        if (node.classList.contains('resizer-handle')) return false;
                        if (node.id === 'heroLogoOverlay') return false;
                        // popup-trigger 버튼은 이미지에 포함
                        if (node.tagName === 'IMG') {
                            const s = node.getAttribute('src') || '';
                            if (s.startsWith('http')) return false;
                        }
                        return true;
                    };
                    // [diag 2026-05-19] 에러를 사람이 읽을 수 있게 포맷 (Event 객체는 type + target 정보 추출)
                    const _fmtErr = (e) => {
                        if (!e) return '(no error)';
                        if (e.message) return e.message;
                        if (e instanceof Event) {
                            const t = e.target || {};
                            const tagName = t.tagName || '?';
                            const src = t.src || t.href || t.currentSrc || '';
                            const shortSrc = src.length > 100 ? src.slice(0, 60) + '...' + src.slice(-30) : src;
                            return `Event:${e.type}@${tagName}${shortSrc ? ' src=' + shortSrc : ''}`;
                        }
                        return String(e);
                    };
                    let canvas;
                    try {
                        canvas = await renderWithTimeout(toCanvasOpts);
                    } catch(renderErr) {
                        console.warn('1차 렌더링 실패, 동일 해상도 재시도(공격적 필터):', _fmtErr(renderErr), renderErr);
                        getById('slicerLoading').innerHTML = `<div style="color:#fbbf24;font-size:13px;padding:20px;text-align:center;line-height:2;">⚠️ 1차 렌더 실패<br><span style="color:#94a3b8;font-size:11px;">동일 해상도로 재시도 중...</span></div>`;
                        // [retry-quality 2026-05-20] 이전엔 retry 가 0.55x 로 떨어져 캡처가 600px 로 작아짐 → 업스케일 뭉개짐.
                        //   변경: retry 도 1차와 동일 pixelRatio + 동일 강한 필터 유지. imagePlaceholder 가 fetch 실패를
                        //   감싸므로 같은 설정으로도 2차에서 자주 성공. 그래도 실패하면 retry2 (0.7x, fallbackFilter) 로
                        //   한 단계만 더 낮춤. 0.5x 미만 폴백은 제거 — 차라리 완전 실패 표시가 낫지 600px 뭉개짐은 안 됨.
                        try {
                            canvas = await renderWithTimeout(toCanvasOpts);  // 동일 설정 그대로 재시도
                        } catch(retryErr) {
                            console.warn('2차 렌더링도 실패, 마지막 시도 (0.7x + fallback filter):', _fmtErr(retryErr));
                            try {
                                canvas = await renderWithTimeout({ ...toCanvasOpts, pixelRatio: Math.max(_effectiveRatio * 0.7, 1.0), filter: fallbackFilter });
                            } catch(retry2Err) {
                                console.error('3차 렌더링도 실패:', _fmtErr(retry2Err), retry2Err);
                                throw new Error('렌더링 완전 실패: ' + _fmtErr(retry2Err));
                            }
                        }
                    }

                    // [scale-resync 2026-05-13] html-to-image 가 1차 렌더 실패 후 retry 로 pixelRatio 를
                    //   낮춰 캔버스를 만들면(targetScale*0.55), 캔버스 실제 스케일이 측정 시 사용한
                    //   targetScale 과 달라진다. → slicerLinks/slicerPopups 의 (x,y,w,h,targetY) 가
                    //   캔버스 픽셀계와 어긋나 슬라이스 HTML 의 오버레이 좌표가 ~1.8배 부풀어
                    //   left:100%+ 로 이미지 밖으로 나가는 회귀가 발생.
                    //   해결: 캔버스 완성 후 실제 스케일 측정 → 측정값들 일괄 리스케일.
                    const _actualScale = canvas.width / (capture.sheet.offsetWidth || (capture.mw || 840));
                    if (_actualScale > 0 && Math.abs(_actualScale - targetScale) > 0.01) {
                        const _rescale = _actualScale / targetScale;
                        console.log('[slicer] scale resync', { targetScale, actualScale: _actualScale, factor: _rescale });
                        slicerLinks.forEach(l => {
                            l.x *= _rescale; l.y *= _rescale; l.w *= _rescale; l.h *= _rescale;
                            if (l.targetY != null) l.targetY *= _rescale;
                        });
                        slicerPopups.forEach(p => {
                            p.x *= _rescale; p.y *= _rescale; p.w *= _rescale; p.h *= _rescale;
                        });
                    }

                    // 클론 방식이므로 원본 heroImg 복원 불필요 (원본은 건드리지 않음)
                    const BASE_SLICE_HEIGHT = 4000;
                    autoSliceCount = Math.max(1, Math.ceil(canvas.height / BASE_SLICE_HEIGHT));
                    getById('autoSliceCountBadge').innerText = `\uc790\ub3d9 \ubd84\ud560: ${autoSliceCount}\uc7a5`;
                    slicerImg = new Image();
                    slicerImg.onload = () => {
                        getById('slicerLoading').classList.add('hidden');
                        const sCanvas = getById('slicerCanvas');
                        sCanvas.classList.remove('hidden');
                        drawSlicer();
                        // CSS 높이를 비율에 맞게 명시적으로 설정 (height:auto가 canvas에서 미동작 방지)
                        const container = getById('slicerCanvasContainer');
                        const displayW = Math.min(840, (container ? container.offsetWidth : 840) - 64);
                        const displayH = Math.round(slicerImg.height * (displayW / slicerImg.width));
                        sCanvas.style.width = displayW + 'px';
                        sCanvas.style.height = displayH + 'px';
                        sCanvas.style.maxWidth = '100%';
                    };
                    // [quality 2026-05-20] JPEG → PNG 무손실 전환. 이전엔 canvas→JPEG→slice→JPEG 이중 압축으로
                    //   텍스트 edge 에 ringing artifact 발생 ("뿌옇게 보임"). PNG 는 무손실이라 캡처 픽셀 그대로 보존.
                    //   htmlToImage 캡처 / slicerLinks resync / 슬라이싱 좌표 로직은 그대로 유지.
                    slicerImg.src = canvas.toDataURL('image/png');
                } catch (e) {
                    console.error("Dynamic Slicer Rendering Failed", e);
                    getById('slicerLoading').innerHTML = `<div style="color:#f87171;font-size:13px;padding:20px;text-align:center;line-height:2;">\u274c \ub80c\ub354\ub9c1 \uc2e4\ud328<br><span style="color:#94a3b8;font-size:11px;">${e.message || '\uc54c \uc218 \uc5c6\ub294 \uc624\ub958'}</span></div>`;
                } finally {
                    if (capture) capture.restore();
                }
            }, 100);
        }
        
        function closeSlicerModal() {
            getById('slicerModal').classList.add('hidden');
            getById('slicerLoading').classList.remove('hidden');
            getById('slicerCanvas').classList.add('hidden');
        }

        function drawSlicer() {
            if (!slicerImg) return;
            const sCanvas = getById('slicerCanvas');
            const sCtx = sCanvas.getContext('2d');
            
            sCanvas.width = slicerImg.width;
            sCanvas.height = slicerImg.height;

            sCtx.clearRect(0, 0, sCanvas.width, sCanvas.height);
            sCtx.drawImage(slicerImg, 0, 0);

            sCtx.lineWidth = 4;
            slicerLinks.forEach(link => {
                sCtx.fillStyle = 'rgba(59, 130, 246, 0.4)';
                sCtx.fillRect(link.x, link.y, link.w, link.h);
                sCtx.strokeStyle = '#2563eb';
                sCtx.strokeRect(link.x, link.y, link.w, link.h);
                
                sCtx.fillStyle = 'white';
                sCtx.font = 'bold 36px Pretendard';
                sCtx.shadowColor = 'black';
                sCtx.shadowBlur = 6;
                sCtx.fillText("\ud83d\udd17 \ub9c1\ud06c \uc601\uc5ed", link.x + 15, link.y + 40);
                sCtx.shadowBlur = 0;
                sCtx.shadowColor = 'transparent';
            });

            const lines = calculateVerticalSliceLines(slicerImg.height, autoSliceCount, slicerLinks);
            
            sCtx.strokeStyle = '#ef4444';
            sCtx.lineWidth = 4;
            sCtx.setLineDash([20, 20]);
            lines.forEach(y => {
                sCtx.beginPath();
                sCtx.moveTo(0, y);
                sCtx.lineTo(sCanvas.width, y);
                sCtx.stroke();
            });
            sCtx.setLineDash([]);
        }

        function calculateVerticalSliceLines(height, count, links) {
            let lines = [];
            let idealH = height / count;
            for (let i = 1; i < count; i++) {
                let y = idealH * i;
                for (let link of links) {
                    if (y >= link.y - 20 && y <= link.y + link.h + 20) {
                        y = link.y + link.h + 30;
                    }
                }
                lines.push(y);
            }
            return [...new Set(lines)].sort((a,b) => a-b).filter(y => y > 0 && y < height);
        }

        async function executeSliceAndExport() {
            if (!slicerImg) return;

            const pathType = document.querySelector('input[name="slicerPathType"]:checked').value;
            if (!currentHashFolder) currentHashFolder = generateHashString(16);
            const hashFolder = currentHashFolder;
            // 항상 상대경로로 빌드 — CDN URL 입력 시 사후 치환으로 절대경로 버전 추가 생성
            const baseUrl = `./${hashFolder}/`;

            let slicerCdnUrl = null;
            if (pathType === 'absolute') {
                const rawCdn = (getById('slicerCdnUrl')?.value || '').trim();
                if (!rawCdn) { showToast("절대경로(CDN) 이미지 서버 URL을 입력해주세요."); return; }
                slicerCdnUrl = rawCdn.endsWith('/') ? rawCdn : rawCdn + '/';
            }

            const btn = getById('exportSpinner');
            btn.classList.remove('hidden');
            showToast('팝업 캡처 및 슬라이스 중...');

            const bgColor  = getById('bgPicker').value   || '#ffffff';
            const acColor  = (getById('accentPicker')?.value || '#7c3aed');
            const acTextColor = isDarkColor(acColor) ? '#ffffff' : '#000000';
            const mw       = parseInt(getById('pageWidthInput').value) || 840;

            const zip = new JSZip();
            // 이미지 데이터 수집기 — 폴더별로 분리
            // sliceImgRegistry: 슬라이스 이미지 + 팝업 캡처 → PROMO_SLICED/hashFolder/
            // contentImgRegistry: 콘텐츠 이미지(generateLocalHtml) → PROMO_html/hashFolder/
            const sliceImgRegistry = [];  // {name, data, opts}
            const contentImgRegistry = []; // {name, data, opts}
            // 슬라이스 루프 + 팝업 캡처에서 사용하는 imgFolder
            const imgFolder = { file: function(name, data, opts) { sliceImgRegistry.push({name, data, opts: opts||{}}); } };
            // generateLocalHtml에서 사용하는 contentImgFolder
            const contentImgFolder = { file: function(name, data, opts) { contentImgRegistry.push({name, data, opts: opts||{}}); } };

            // ── 1단계: 팝업 패널 이미지 캡처 (childSheet 전체 — 위지윅과 동일한 디자인) ──
            const popupImagePaths = {};
            if (childPanels.length > 0) {
                const bgColPopup = getById('bgPicker')?.value || '#1e293b';
                for (const panel of childPanels) {
                    const childSheet = getById('childSheet_' + panel.id);
                    const childArea  = getById('childArea_' + panel.id);
                    if (!childArea) continue;
                    const text = childArea.innerText.trim().replace(/\[툴팁\d*\]/g, '').replace(/\[팝업\d*\]/g, '').trim();
                    if (!text || text.includes('팝업') && text.length < 10) continue;
                    // 팝업도 클론 방식 — 원본 childArea DOM 불변
                    // position:fixed+left:negative를 클론에 직접 주면 htmlToImage가 빈 캔버스를 생성하므로
                    // wrapper(_popupWrap)만 off-screen으로 두고 caClone은 자연 CSS 유지
                    const caCloneW = childArea.offsetWidth || 640;
                    const _popupWrap = document.createElement('div');
                    _popupWrap.style.cssText = `position:fixed;top:0;left:-${caCloneW + 300}px;width:${caCloneW}px;overflow:hidden;pointer-events:none;z-index:-9999;`;
                    const caClone = childArea.cloneNode(true);
                    caClone.style.width = caCloneW + 'px';
                    caClone.style.background = bgColor;
                    // AI가 생성한 닫기 버튼 제거 (슬라이스 이미지에 × 중복 노출 방지)
                    caClone.querySelectorAll('button, [role="button"], a').forEach(el => {
                        const txt = (el.textContent || '').trim();
                        if (['×', '✕', '✗', 'X', '닫기', 'Close', 'CLOSE'].includes(txt)) el.remove();
                    });
                    // 테이블 기본 속성 보장 — border 색은 AI 생성 인라인 스타일 그대로 유지
                    caClone.querySelectorAll('table').forEach(tbl => {
                        tbl.style.borderCollapse = 'collapse';
                        if (!tbl.style.width) tbl.style.width = '100%';
                        if (!tbl.style.tableLayout) tbl.style.tableLayout = 'fixed';
                        tbl.querySelectorAll('td, th').forEach(cell => {
                            if (!cell.style.padding) cell.style.padding = '0.875rem 1rem';
                            cell.style.boxSizing = 'border-box';
                            cell.style.verticalAlign = 'middle';
                            cell.style.lineHeight = '1.4';
                        });
                    });
                    // 폰트 사이즈 최소 13px 보장
                    caClone.querySelectorAll('*').forEach(el => {
                        const fs = parseFloat(window.getComputedStyle(el).fontSize);
                        if (fs && fs < 13) el.style.fontSize = '13px';
                    });
                    // [2026-05-31] 팝업 캡처 클론도 스크롤 컨테이너 overflow 제거 (메인과 동일) — 팝업 이미지에 스크롤바 래스터화 방지
                    caClone.querySelectorAll('*').forEach(el => {
                        if (!el.style) return;
                        const ov = (el.style.overflow || '') + ' ' + (el.style.overflowX || '') + ' ' + (el.style.overflowY || '');
                        if (/auto|scroll/i.test(ov)) { el.style.overflow = 'visible'; el.style.overflowX = 'visible'; el.style.overflowY = 'visible'; }
                    });
                    _popupWrap.appendChild(caClone);
                    document.body.appendChild(_popupWrap);
                    await convertImagesToBase64(caClone);
                    try {
                        const popupCanvas = await htmlToImage.toCanvas(caClone, {
                            pixelRatio: 2, backgroundColor: bgColor,
                            skipFonts: true, useCORS: true
                        });
                        const fname = generateHashString(8) + '.png';
                        imgFolder.file(fname, popupCanvas.toDataURL('image/png').split(',')[1], { base64: true });
                        popupImagePaths[panel.id] = './' + hashFolder + '/' + fname;
                    } catch(e) { console.warn('팝업 캡처 실패:', panel.id, e); }
                    if (_popupWrap.isConnected) _popupWrap.remove();
                }
            }

            // ── 2단계: 슬라이스 루프 ──
            const lines = calculateVerticalSliceLines(slicerImg.height, autoSliceCount, slicerLinks);
            lines.push(slicerImg.height);

            let htmlResult = `<meta charset="UTF-8">\n<div style="max-width:${mw}px;width:100%;margin:0 auto;background-color:${bgColor};position:relative;text-align:center;font-size:0;line-height:0;">`;

            let startY = 0;
            const tempCanvas = document.createElement('canvas');
            const tCtx = tempCanvas.getContext('2d');

            for (let i = 0; i < lines.length; i++) {
                const endY  = lines[i];
                const sliceH = endY - startY;

                tempCanvas.width  = slicerImg.width;
                tempCanvas.height = sliceH;
                tCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
                tCtx.drawImage(slicerImg, 0, startY, slicerImg.width, sliceH, 0, 0, tempCanvas.width, tempCanvas.height);

                // [quality 2026-05-20] JPEG → PNG 무손실. 텍스트 위주 슬라이스는 PNG 압축이 오히려 효율적
                //   (히어로 이미지 영역만 파일 크기 ~2x). 화질 우선 결정 (사용자 요청).
                const fileName = `${generateHashString(8)}.png`;
                imgFolder.file(fileName, tempCanvas.toDataURL('image/png').split(',')[1], { base64: true });

                // 링크 오버레이
                let anchorsHtml = '';
                slicerLinks.forEach(link => {
                    if (link.isPopupTrigger) return; // popup-trigger는 별도 처리
                    const cy = link.y + link.h / 2;
                    if (cy >= startY && cy <= endY) {
                        const relY = link.y - startY;
                        // 클릭 영역을 상하 4px 확장해 위치 오차 보정
                        const expandPx = 4;
                        const adjY = Math.max(0, relY - expandPx);
                        const adjH = link.h + expandPx * 2;
                        const posStyle = `position:absolute;display:block;z-index:10;left:${(link.x/tempCanvas.width*100).toFixed(3)}%;top:${(adjY/sliceH*100).toFixed(3)}%;width:${(link.w/tempCanvas.width*100).toFixed(3)}%;height:${(adjH/sliceH*100).toFixed(3)}%;background-color:transparent;border:none;outline:none;cursor:pointer;padding:0;`;
                        if (link.url.startsWith('#')) {
                            // 앵커 링크: <button onclick="scrollTo"> — 사이냅에디터 target="_blank"/script strip 대응
                            const _targetY = link.targetY !== null ? link.targetY : 0;
                            const _scrollCode = `var c=document.querySelector(&quot;div[style*=max-width]&quot;);if(c){window.scrollTo({top:${_targetY}*(c.offsetWidth/${slicerImg.width}),behavior:&quot;smooth&quot;});}`;
                            anchorsHtml += `\n        <button type="button" onclick="${_scrollCode}" style="${posStyle}"></button>`;
                        } else {
                            // 외부 링크: <a> 유지
                            anchorsHtml += `\n        <a href="${link.url}" target="_blank" style="${posStyle}text-decoration:none;"></a>`;
                        }
                    }
                });

                // ── 팝업 트리거 버튼 오버레이 (슬라이스 위에 투명 버튼) ──
                // CDN 팝업과 동일한 동적 createElement 방식: buildPopupTriggerOnclick 사용
                // (슬라이스 wrapper 는 font-size:0 이므로 font 값을 명시적으로 주입)
                slicerPopups.forEach(popup => {
                    const pcy = popup.y + popup.h / 2;
                    if (pcy < startY || pcy > endY) return;

                    const relY = popup.y - startY;
                    const expandPx = 4;
                    const adjX = Math.max(0, popup.x - expandPx);
                    const adjY = Math.max(0, relY - expandPx);
                    const adjW = popup.w + expandPx * 2;
                    const adjH = popup.h + expandPx * 2;

                    // 팝업 콘텐츠 준비 (이미지 또는 childArea HTML)
                    let _popupContent = '';
                    const _imgPath = popupImagePaths[popup.id];
                    if (_imgPath) {
                        _popupContent = `<img src="${_imgPath}" style="display:block;max-width:100%;height:auto;margin:0 auto;" alt="">`;
                    } else {
                        const _caEl = getById('childArea_' + popup.id);
                        if (_caEl) {
                            const _clone = _caEl.cloneNode(true);
                            _clone.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                            _clone.querySelectorAll('.resizer-handle').forEach(el => el.remove());
                            _clone.querySelectorAll('button,[role="button"],a').forEach(el => {
                                if (['×','✕','✗','X','닫기','Close','CLOSE'].includes((el.textContent||'').trim())) el.remove();
                            });
                            _popupContent = _clone.innerHTML.trim();
                        }
                    }

                    const _slicerSurface = bgColor;
                    const _slicerTxt = (typeof isDarkColor === 'function' && isDarkColor(bgColor)) ? '#ffffff' : '#222222';
                    // 슬라이서 팝업 콘텐츠는 이미지 캡처본(<img>)이므로 폰트 옵션 불필요
                    const safeOc = buildPopupTriggerOnclick(popup.id, _popupContent, {
                        accent: acColor,
                        surface: _slicerSurface,
                        textColor: _slicerTxt
                    }).replace(/"/g, '&quot;');
                    anchorsHtml += `\n        <button type="button" onclick="${safeOc}" style="position:absolute;display:block;z-index:11;left:${(adjX/tempCanvas.width*100).toFixed(3)}%;top:${(adjY/sliceH*100).toFixed(3)}%;width:${(adjW/tempCanvas.width*100).toFixed(3)}%;height:${(adjH/sliceH*100).toFixed(3)}%;background-color:transparent;border:none;outline:none;cursor:pointer;padding:0;" title="팝업 열기"></button>`;
                });

                htmlResult += `\n    <div style="position:relative;width:100%;line-height:0;font-size:0;margin:0;padding:0;">\n        <img src="${baseUrl}${fileName}" alt="slice_${i+1}" style="width:100%;display:block;margin:0;padding:0;">${anchorsHtml}\n    </div>`;
                startY = endY;
            }

            // ── 팝업 사전 렌더 제거됨 ──
            // CDN 과 동일한 동적 createElement 방식으로 통일:
            // 트리거 버튼 onclick 안에 콘텐츠 + 딤드 + 박스 생성 로직 직렬화.
            // 최외곽 <div style="max-width:${mw}px;...position:relative;"> 가 컨테이너 역할.

            htmlResult += `\n</div>`;

            // ── 3단계: 앵커 스크롤 JS ──
            const anchorTargets = {};
            slicerLinks.forEach(link => {
                if (link.url && link.url.includes('#')) {
                    const hash = link.url.split('#')[1];
                    if (hash && !(hash in anchorTargets)) anchorTargets[hash] = link.targetY !== null ? link.targetY : link.y;
                }
            });
            if (Object.keys(anchorTargets).length > 0) {
                const imgW = slicerImg.width;
                let scrollJs = '<script>\n(function(){\nvar anchors=' + JSON.stringify(anchorTargets) + ';\nvar imgW=' + imgW + ';\n';
                scrollJs += 'document.addEventListener("click",function(e){var a=e.target.closest("a")||(e.target.tagName==="AREA"?e.target:null);if(!a)return;var href=a.getAttribute("href")||"";if(!href.startsWith("#"))return;var hash=href.slice(1);if(anchors[hash]===undefined)return;e.preventDefault();var container=document.querySelector("div[style*=\'max-width\']");if(!container)return;var scale=container.offsetWidth/imgW;window.scrollTo({top:anchors[hash]*scale,behavior:"smooth"});});\n})();\n<\/script>';
                htmlResult += '\n' + scrollJs;
            }

            // (이미지맵 제거됨 — CDN 기준 <a href="javascript:..."> 오버레이 방식은
            //  % 기반 position:absolute이므로 반응형 스케일 JS 불필요)

            // ── 5단계: ZIP 저장 ──
            // CDN URL 입력 시 절대경로 버전 추가 생성 (CDN URL + hashFolder/ 포함)
            let cdnHtmlResult = null;
            if (slicerCdnUrl) {
                const _escapedHash = hashFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const cdnBaseUrl = slicerCdnUrl + hashFolder + '/';
                cdnHtmlResult = htmlResult.replace(new RegExp('\\.\\/'+_escapedHash+'\\/', 'g'), cdnBaseUrl);
            }

            // ── index_불러오기용.html: HTML 코드 저장과 동일한 구조 (프로모에디터 재불러오기 전용) ──
            // contentArea HTML + 이미지 파일 추출(상대경로) → 에디터 없이 바로 열람 가능
            // HTML 문자열을 반환 (ZIP 저장은 아래 구조 확정 후 수행)
            // [2026-06-02] 팝업 인라인 이미지 CDN URL 치환용 — generateLocalHtml 의 base64→파일명 맵을 외부로 노출.
            //   파일명이 랜덤 해시라 재생성 불가 → 같은 맵을 CDN 팝업 빌드(L960)에서 재사용해야 함.
            const _contentImgMap = new Map();
            const localHtmlResult = (function generateLocalHtml() {
                const _ca = getById('contentArea');
                const _hi = getById('mainHeroImg');
                if (!_ca) return null;

                // 1) 클린 복사
                const _d = document.createElement('div');
                _d.innerHTML = _ca.innerHTML;
                // [regression-fix 2026-05-12] AI가 <thead> 없이 <tr><th>로 뽑으면 브라우저가 <tbody>로 auto-wrap →
                //   export(index_불러오기용.html / index_cdn.html)에 비-thead <th>가 남음.
                //   fixTableThs는 (1) 비-thead <th>→<td> 변환 (2) 빈 셀 정리 (3) idempotent 스타일을 다 갖춤.
                if (typeof fixTableThs === 'function') fixTableThs(_d);
                // [defense 2026-05-21] 탭 바 box-sizing 강제 (export 본문에 적용 → 사이냅 뷰에서도 안 뚫림)
                if (typeof fixTabBarOverflow === 'function') fixTabBarOverflow(_d);
                _d.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                _d.querySelectorAll('.resizer-handle').forEach(el => el.remove());
                _d.querySelectorAll('.se-popup-content').forEach(el => el.remove());
                _d.querySelectorAll('.tbl-scroll-wrap').forEach(wrap => { wrap.style.overflowX = 'auto'; });

                // [회귀 방지 2026-04-23] export 직전 마지막 방어선 — 빈 테이블 헤더·선두 행 제거
                //   감시자(installEmptyRowGuard)·fixTableThs 가 놓친 경우에도 export 물에는 절대 남지 않도록
                (function stripEmptyRowsOnExport(root){
                    // [fix 2026-05-28] event-video / \uc774\ubbf8\uc9c0\ub9cc \uc788\ub294 \uc140(\ud14d\uc2a4\ud2b8 0)\ub3c4 "\ube44\uc5c8\uc74c" \ud310\uc815\ub418\uc5b4
                    //   export \uc2dc\uc810\uc5d0 \uc601\uc0c1 \uadf8\ub9ac\ub4dc row \uac00 \uc81c\uac70\ub418\ub294 \ud68c\uadc0 \ucc28\ub2e8.
                    //   fixTableThs / installEmptyRowGuard \uc758 _isCellEmpty \uc640 \ub3d9\uc77c \ub85c\uc9c1.
                    const isCellEmpty = c => {
                        const hasText = !!(c.textContent || '').replace(/\u00a0|\s/g, '');
                        if (hasText) return false;
                        return !c.querySelector('video,img,iframe,audio,source,canvas,svg,button,a,input');
                    };
                    const isRowEmpty = tr => {
                        const cells = tr.querySelectorAll('th,td');
                        return cells.length === 0 || Array.from(cells).every(isCellEmpty);
                    };
                    let removed = 0;
                    root.querySelectorAll('table').forEach(tbl => {
                        tbl.querySelectorAll('thead tr').forEach(tr => { if (isRowEmpty(tr)) { tr.remove(); removed++; } });
                        tbl.querySelectorAll('thead').forEach(th => { if (th.children.length === 0) th.remove(); });
                        const tb = tbl.querySelector('tbody');
                        if (tb) {
                            while (tb.firstElementChild && isRowEmpty(tb.firstElementChild)) { tb.firstElementChild.remove(); removed++; }
                        }
                        while (tbl.firstElementChild && tbl.firstElementChild.tagName === 'TR' && isRowEmpty(tbl.firstElementChild)) {
                            tbl.firstElementChild.remove(); removed++;
                        }
                    });
                    if (removed > 0) console.log('[export] empty table rows stripped:', removed);
                })(_d);

                // 2) 이미지 스캔 → contentImgRegistry에 수집 (PROMO_html/hashFolder/ 전용)
                const _imgMap = _contentImgMap; // 외부 노출 (CDN 팝업 이미지 치환에 재사용)
                let _imgIdx = 1;
                _d.querySelectorAll('img').forEach(img => {
                    const src = img.getAttribute('src') || '';
                    if (src.startsWith('data:image') && !_imgMap.has(src)) {
                        const ext = src.substring('data:image/'.length, src.indexOf(';base64'));
                        _imgIdx++;
                        const fn = `${generateHashString(8)}.${ext}`;
                        _imgMap.set(src, fn);
                        contentImgFolder.file(fn, src.split(',')[1], { base64: true });
                    }
                });
                childPanels.forEach(panel => {
                    const _pca = getById('childArea_' + panel.id);
                    if (!_pca) return;
                    _pca.querySelectorAll('img[src]').forEach(img => {
                        const src = img.getAttribute('src') || '';
                        if (src.startsWith('data:image') && !_imgMap.has(src)) {
                            const ext = src.substring('data:image/'.length, src.indexOf(';base64'));
                            _imgIdx++;
                            const fn = `${generateHashString(8)}.${ext}`;
                            _imgMap.set(src, fn);
                            contentImgFolder.file(fn, src.split(',')[1], { base64: true });
                        }
                    });
                });

                // 2-b) 영상 스캔 — blob URL(videoObjectUrlMap) + data URL 모두 처리
                const _videoMap = new Map();
                let _videoIdx = 1;
                const _scanForVideo = [_d];
                childPanels.forEach(panel => { const ca = getById('childArea_' + panel.id); if (ca) _scanForVideo.push(ca); });
                _scanForVideo.forEach(root => {
                    root.querySelectorAll('video[src]').forEach(vid => {
                        const src = vid.getAttribute('src') || '';
                        const resolvedSrc = src.startsWith('blob:') ? (videoObjectUrlMap.get(src) || src) : src;
                        if (resolvedSrc.startsWith('data:video') && !_videoMap.has(src)) {
                            const mime = resolvedSrc.substring('data:video/'.length, resolvedSrc.indexOf(';base64'));
                            const ext = mime.split('+')[0] || 'mp4';
                            _videoIdx++;
                            const fn = `${generateHashString(8)}.${ext}`;
                            _videoMap.set(src, fn);
                            contentImgFolder.file(fn, resolvedSrc.split(',')[1], { base64: true });
                        }
                    });
                });

                // [2026-05-31] http/CDN URL → 로컬 상대경로 변환기.
                //   불러오기용은 무조건 로컬 폴더 기준(./folder/file). 마지막 두 경로 세그먼트(folder/file) 사용 →
                //   URL 자신의 폴더명을 보존하므로 사용자가 받아둔 동일명 폴더와 그대로 매칭.
                //   index_cdn 은 이 결과의 ./hashFolder/ 를 다시 cdnUrl 로 치환해 파생(L920~).
                const _httpToLocal = (u) => {
                    if (!/^https?:\/\//i.test(u)) return null;
                    const segs = u.split('?')[0].split('#')[0].split('/').filter(Boolean);
                    if (segs.length < 2) return null;
                    return './' + segs[segs.length - 2] + '/' + segs[segs.length - 1];
                };

                // 3) src 치환 (이미지 + 영상)
                _d.querySelectorAll('img').forEach(img => {
                    const src = img.getAttribute('src') || '';
                    if (_imgMap.has(src)) { img.setAttribute('src', baseUrl + _imgMap.get(src)); return; }
                    const _loc = _httpToLocal(src);
                    if (_loc) img.setAttribute('src', _loc);
                });
                _d.querySelectorAll('video[src]').forEach(vid => {
                    const src = vid.getAttribute('src') || '';
                    if (_videoMap.has(src)) vid.setAttribute('src', baseUrl + _videoMap.get(src));
                });

                // 4) 히어로 이미지 삽입
                const _heroSrc = _hi?.getAttribute('src') || '';
                let _heroFn = '';
                if (_heroSrc && _heroSrc.startsWith('data:image')) {
                    if (_imgMap.has(_heroSrc)) {
                        _heroFn = _imgMap.get(_heroSrc);
                    } else {
                        const ext = _heroSrc.substring('data:image/'.length, _heroSrc.indexOf(';base64'));
                        _heroFn = `${generateHashString(8)}.${ext}`;
                        contentImgFolder.file(_heroFn, _heroSrc.split(',')[1], { base64: true });
                    }
                }
                // [2026-05-31] 히어로도 http/CDN URL 이면 로컬 상대경로로 (불러오기용 = 무조건 로컬)
                let _heroFinal = _heroFn ? baseUrl + _heroFn : _heroSrc;
                if (!_heroFn) { const _hl = _httpToLocal(_heroSrc); if (_hl) _heroFinal = _hl; }
                if (_heroFinal) {
                    const heroTag = `<img src="${_heroFinal}" style="width:100%;display:block;margin:0;padding:0;border:none;">`;
                    const _sc = _d.querySelector('.se-contents');
                    if (_sc) {
                        const _fd = _sc.querySelector(':scope > .se-div:first-child');
                        if (_fd && (_fd.style.fontSize === '0' || !_fd.innerHTML.trim())) {
                            _fd.innerHTML = heroTag;
                            _fd.style.fontSize = '0'; _fd.style.lineHeight = '0';
                            _fd.style.display = 'block'; // 재불러오기 시 박힌 display:none 복원
                        } else {
                            const _hd = document.createElement('div');
                            _hd.className = 'se-div';
                            _hd.style.cssText = 'margin:0;padding:0;font-size:0;line-height:0;display:block;width:100%;box-sizing:border-box;';
                            _hd.innerHTML = heroTag;
                            _sc.insertBefore(_hd, _sc.firstChild);
                        }
                    }
                }

                // 5) 버튼 링크 target="_blank" 적용 후 팝업 인라인 변환
                applyTargetBlankToLinks(_d);

                // [회귀 방지 2026-05-20] event-video div → <video> 최종 보강 (export 마지막 방어선)
                //   AI 단계의 ensureEventVideoScript 가 이미 실행됐어도, 중간 처리에서 <video> 가 stripped 되거나
                //   div 가 빈 채 contentArea 에 남은 케이스를 잡는다. <video> 가 이미 있으면 skip → 멱등.
                _d.querySelectorAll('.event-video[data-src]').forEach(_evEl => {
                    if (_evEl.querySelector('video')) return;
                    const _vsrc = _evEl.getAttribute('data-src');
                    if (!_vsrc) return;
                    // [2026-05-29] video.js SSOT buildEventVideoEl 로 4옵션 모델 honor (data-stop/once/sound/controls + 백워드 player).
                    _evEl.innerHTML = '';
                    _evEl.appendChild(buildEventVideoEl(_vsrc, _evEl));
                });

                let _rawHtml = _d.innerHTML;
                _rawHtml = convertRgbToHex(_rawHtml);
                _rawHtml = expandHexColors(_rawHtml);
                // 인라인 font-family: Pretendard 선언 제거 — 외부 <style>에서 일괄 적용
                _rawHtml = _rawHtml.replace(/font-family\s*:\s*['"]?Pretendard['"]?[^;"']*;?/gi, '');
                let _localHtml = '<meta charset="UTF-8">\n<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">\n<style>body,div,p,span,a,button,li,td,th,h1,h2,h3,h4,h5,h6{font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;}</style>\n' + _rawHtml;
                // se-contents 에 position:relative 강제 (팝업 오버레이의 position:absolute 기준점)
                _localHtml = ensureSeContentsRelative(_localHtml);
                // popup-trigger 버튼 기존 onclick 제거 (display 토글 onclick 으로 교체 예정)
                _localHtml = _localHtml.replace(/(<(?:button|a)[^>]*class="popup-trigger"[^>]*)\s+onclick="[^"]*"/gi, '$1');

                // ── 사이냅 호환 사전 렌더 팝업 ──
                // 1) se-popup-content 숨김 데이터 블록 (re-import 전용) 유지
                // 2) se-popup-overlay 사전 렌더 + 트리거 onclick display 토글
                if (childPanels.length > 0) {
                    const _slAc = (getById('accentPicker')?.value || '#7c3aed');
                    const _slBg = getById('bgPicker')?.value || '#ffffff';
                    const _slTxt = getById('textPicker')?.value || (isDarkColor(_slBg) ? '#ffffff' : '#222222');
                    const _slSurface = getById('surfacePicker')?.value || _slBg;

                    childPanels.forEach(panel => {
                        const ca = getById('childArea_' + panel.id);
                        if (!ca) return;
                        const txt = ca.innerText.trim();
                        if (!txt || (txt.includes('팝업') && txt.length < 10)) return;
                        const clone = ca.cloneNode(true);
                        clone.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                        clone.querySelectorAll('.resizer-handle').forEach(el => el.remove());
                        const popupInner = clone.innerHTML;
                        // se-popup-content (re-import 전용 데이터 블록) 유지
                        _localHtml += `\n<div class="se-div se-popup-content" data-popup="${panel.id}" style="display:none;overflow:hidden;width:0;height:0;margin:0;padding:0;border:none;">${popupInner}</div>`;

                        // 트리거 onclick: 클릭 시 createElement (사이냅 호환)
                        const safeOc = buildPopupTriggerOnclick(panel.id, popupInner, {
                            accent: _slAc, surface: _slSurface, textColor: _slTxt
                        }).replace(/"/g, '&quot;');
                        _localHtml = _localHtml.replace(
                            new RegExp(`<button([^>]*\\bdata-popup="${panel.id}"[^>]*)>([^<]*)</button>`, 'i'),
                            (m, attrs, inner) => `<button${attrs} onclick="${safeOc}">${inner}</button>`
                        );
                    });

                    // [회귀 방지 2026-05-19] popup-trigger 최종 fallback (index_불러오기용.html 경로 전용)
                    //   Gemini 가 [팝업N] 마커는 emit 했지만 콘텐츠는 본문에 인라인으로 박은 경우,
                    //   childArea 가 비어있어 위 forEach 가 해당 popup 을 skip → trigger 가 onclick 없이 남음.
                    //   _localHtml 안의 정상 popup-trigger onclick 1개를 donor 로 잡아 panelId swap 으로 복사.
                    try {
                        const donorMatch = _localHtml.match(/<button[^>]*class="popup-trigger"[^>]*data-popup="([^"]+)"[^>]*onclick="([^"]*createElement[^"]*)"/);
                        if (donorMatch) {
                            const donorPid = donorMatch[1];
                            const donorOnclick = donorMatch[2];
                            _localHtml = _localHtml.replace(/<button([^>]*class="popup-trigger"[^>]*data-popup="([^"]+)"[^>]*)>/g, (m, attrs, pid) => {
                                if (/onclick\s*=/.test(attrs) || pid === donorPid) return m;
                                const swapped = donorOnclick.split(donorPid).join(pid);
                                console.warn('[index_불러오기용] onclick fallback from donor', donorPid, '→', pid);
                                return `<button${attrs} onclick="${swapped}">`;
                            });
                        }
                    } catch (e) {
                        console.warn('index_불러오기용 popup onclick fallback fail:', e);
                    }
                }
                // 탭 앵커 링크에 onclick 인라인 삽입 (새창 열림 방지 → 위치 이동)
                _localHtml = _localHtml.replace(
                    /<a([^>]*\bhref="#([a-zA-Z0-9_-]+)"[^>]*)>/gi,
                    (m, attrs, hash) => {
                        if (/\bonclick=/i.test(attrs)) return m;
                        return `<a${attrs} onclick="event.preventDefault();var t=document.getElementById('${hash}');if(t)t.scrollIntoView({behavior:'smooth',block:'start'});">`;
                    }
                );
                // 레이아웃 보정 — 히어로·2번 블록 max-width + 좌우 패딩 (브라우저에서 바로 열어도 정상 렌더)
                _localHtml = ensureLayoutCompliance(_localHtml);
                return '\uFEFF' + _localHtml;
            })();

            // ── 5단계: ZIP 폴더 구조 확정 및 저장 ──
            // ZIP 구조:
            //   PROMO_SLICED/ ← 슬라이스 이미지 기반 HTML
            //     ├── index.html        (상대경로, 항상)
            //     ├── index_cdn.html    (CDN 입력 시에만)
            //     └── {hashFolder}/     (슬라이스 이미지 + 팝업 캡처)
            //   PROMO_html/ ← 콘텐츠 HTML 코드 저장
            //     ├── index_불러오기용.html  (상대경로, 항상 — 프로모에디터 재불러오기 전용)
            //     ├── index_cdn.html    (CDN 입력 시에만)
            //     └── {hashFolder}/     (콘텐츠 이미지)

            // PROMO_SLICED 폴더
            const slicedFolder = zip.folder('PROMO_SLICED');
            const slicedImgF = slicedFolder.folder(hashFolder);
            sliceImgRegistry.forEach(({name, data, opts}) => { slicedImgF.file(name, data, opts); });
            slicedFolder.file('index.html', '\uFEFF' + htmlResult);
            if (slicerCdnUrl && cdnHtmlResult) {
                slicedFolder.file('index_cdn.html', '\uFEFF' + cdnHtmlResult);
            }

            // PROMO_html 폴더
            const htmlFolder = zip.folder('PROMO_html');
            const htmlImgF = htmlFolder.folder(hashFolder);
            contentImgRegistry.forEach(({name, data, opts}) => { htmlImgF.file(name, data, opts); });
            if (localHtmlResult) {
                // 불러오기용 (onclick 없음, se-popup-content 포함)
                htmlFolder.file('index_불러오기용.html', localHtmlResult);
                // 게시용 CDN: onclick 포함, se-popup-content 제거
                if (slicerCdnUrl) {
                    const _escapedHash2 = hashFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const contentCdnUrl = slicerCdnUrl + hashFolder + '/';
                    let contentCdnHtml = localHtmlResult.replace(
                        new RegExp('\\.\\/'+_escapedHash2+'\\/', 'g'), contentCdnUrl
                    );
                    // 게시용: onclick 추가 + se-popup-content 제거
                    if (childPanels.length > 0) {
                        // [2026-06-02] 팝업 인라인 base64 이미지 → CDN URL 치환 (본문 이미지와 동일). 미전달 시 base64 유지.
                        const _cdnPopupImgMap = {};
                        _contentImgMap.forEach((fn, b64) => { _cdnPopupImgMap[b64] = contentCdnUrl + fn; });
                        contentCdnHtml = buildInlinePopupHtml(contentCdnHtml, undefined, false, _cdnPopupImgMap);
                    }
                    contentCdnHtml = convertTabAnchorsForCdn(contentCdnHtml);
                    contentCdnHtml = ensureLayoutCompliance(contentCdnHtml);
                    // se-popup-content DOM 기반 제거 (중첩 div 있어도 안전)
                    if (contentCdnHtml.includes('se-popup-content')) {
                        const _tmpClean = document.createElement('div');
                        _tmpClean.innerHTML = contentCdnHtml;
                        _tmpClean.querySelectorAll('.se-popup-content').forEach(el => el.remove());
                        contentCdnHtml = _tmpClean.innerHTML;
                    }
                    htmlFolder.file('index_cdn.html', contentCdnHtml);
                }
            }

            zip.generateAsync({ type: 'blob' }).then(async content => {
                // 노션 작업 시: window.__promoName (프로모션명) 으로 파일명. 없으면 timestamp.
                const _safeName = (window.__promoName || '').replace(/[\\/:*?"<>|]/g, '_').trim();
                const fn = _safeName ? `${_safeName}_SLICED.zip` : `PROMO_SLICED_${Date.now()}.zip`;
                const r = await savePromoFile(fn, content);
                btn.classList.add('hidden');
                closeSlicerModal();
                const where = r.mode === 'fsa' ? '산출물 저장 경로' : '다운로드';
                const toastMsg = slicerCdnUrl
                    ? `PROMO_SLICED + PROMO_html (CDN 포함) → ${where} 저장 완료`
                    : `PROMO_SLICED + PROMO_html → ${where} 저장 완료`;
                showToast(toastMsg);
            });
        }
