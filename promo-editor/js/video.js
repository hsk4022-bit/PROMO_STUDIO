// promo-editor/js/video.js — 영상 runtime + grid builder + safety net (← rules/15-video.md)
//
// app.js 에서 분리 (Stage 4 — 2026-05-28).
// 포함:
//   - _VIDEO_OPT_TO_DATA_ATTR, _optsToDataAttrs, _gridDimensions, _buildVideoGridHtml
//     (paste-preprocess.js 가 호출 → video.js 가 먼저 로드되어야 함)
//   - getActiveVideo, showVideoOptToolbar, hideVideoOptToolbar, toggleVideoAttr
//     + 영상 옵션 버튼 이벤트 바인딩 forEach IIFE (top-level 즉시 실행)
//   - insertVideoToEditor, setLogoPos, updateLogoOverlay, compositeHeroWithLogo,
//     renderLogoOverlay, loadLogoFile (영상 + 로고 오버레이)
//   - ensureEventVideoScript (Gemini 출력 후처리 safety net)
//
// 의존:
// - state.js: activeLayer, _lastVideoRef, videoObjectUrlMap, logoBase64, logoPos, logoSize, savedRange
// - utils.js: getById, isImageFile, generateHashString, downscaleCanvas
// - color-palette.js: isDarkColor, blendHex (runtime)
// - app.js (runtime): recordState, showToast, showImgFloatToolbar, registerPromoPreservedBlock,
//   currentImgMode (state via app.js); applyHeroImage (runtime)
//
// 주의: L2715 forEach IIFE 는 영상 옵션 버튼 이벤트 바인딩. defer+async=false 로 DOM ready 후 실행.

// ────────────────────────────────────────────────────────────────
// video grid builder (Stage 3 후 L437-480)
// paste-preprocess.js 가 호출 → video.js 가 먼저 로드되어야 함
// ────────────────────────────────────────────────────────────────
        const _VIDEO_OPT_TO_DATA_ATTR = {
            '정지': 'data-stop',
            '플레이바': 'data-controls',
            '소리': 'data-sound',
            '1회': 'data-once'
        };

        function _optsToDataAttrs(optsStr) {
            if (!optsStr) return '';
            return optsStr.split('|').map(o => o.trim()).filter(o => _VIDEO_OPT_TO_DATA_ATTR[o]).map(o => _VIDEO_OPT_TO_DATA_ATTR[o]).join(' ');
        }

        function _gridDimensions(n) {
            if (n <= 1) return [1, 1];
            if (n === 2) return [1, 2];
            if (n === 3) return [1, 3];
            if (n === 4) return [2, 2];
            if (n === 5 || n === 6) return [2, 3];
            return [Math.ceil(n / 3), 3];
        }

        function _buildVideoGridHtml(videos) {
            const n = videos.length;
            const [rows, cols] = _gridDimensions(n);
            const cellWidth = (100 / cols).toFixed(2);
            const cells = [];
            for (let i = 0; i < rows * cols; i++) {
                let inner = '';
                if (i < n) {
                    const [opts, url] = videos[i];
                    const attrs = _optsToDataAttrs(opts);
                    inner = `<div class="se-div event-video" data-src="${url}"${attrs ? ' ' + attrs : ''}></div>`;
                }
                cells.push(`<td style="padding:0.375rem;vertical-align:top;width:${cellWidth}%;box-sizing:border-box;">${inner}</td>`);
            }
            const trs = [];
            for (let r = 0; r < rows; r++) {
                trs.push('<tr>' + cells.slice(r * cols, (r + 1) * cols).join('') + '</tr>');
            }
            const tableHtml = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;"><tbody>${trs.join('')}</tbody></table>`;
            // [2026-05-27 fix] Gemini 가 raw HTML <table> + event-video div 를 누락하는 회귀가 다발 →
            // placeholder 토큰으로 치환해 입력. generateContent 가 출력에서 다시 raw HTML 로 복원.
            return `\n${registerPromoPreservedBlock(tableHtml)}\n`;
        }

// ────────────────────────────────────────────────────────────────
// event-video → <video> SSOT 빌더 (rules/15-video.md / script.js 4옵션 모델)
//   기본: autoplay + loop + muted, 클릭 시 소리 ON.
//   data-stop → autoplay 제거 / data-once → loop 제거 / data-sound → muted 제거 / data-controls → controls.
//   백워드 호환: data-type="player" → 정지 + 플레이바.
//   promo-editor 는 주입 스크립트 대신 정적 <video> 사용(contentEditable innerHTML 에선 주입 <script> 미실행, v4 2026-05-20).
//   "클릭 시 소리 ON" 은 script.js 의 addEventListener('click') 동치로 인라인 onclick 재현.
//   buildEventVideoHtml: 문자열 빌더(ensureEventVideoScript). buildEventVideoEl: DOM 빌더(slicer export).
// ────────────────────────────────────────────────────────────────
        const VIDEO_RUNTIME_STYLE = 'max-width:100%;height:auto;display:block;margin:0 auto;background:#000;';

        // source: Element(hasAttribute) | attr-string(regex) → {stop,controls,sound,once}
        function _readVideoOpts(source) {
            const isEl = source && typeof source.hasAttribute === 'function';
            const has = isEl
                ? (n) => source.hasAttribute(n)
                : (n) => new RegExp('\\b' + n + '\\b', 'i').test(String(source || ''));
            const legacyPlayer = isEl
                ? source.getAttribute('data-type') === 'player'
                : /\bdata-type\s*=\s*["']?player\b/i.test(String(source || ''));
            let stop = has('data-stop'), controls = has('data-controls');
            if (legacyPlayer) { stop = true; controls = true; }
            return { stop, controls, sound: has('data-sound'), once: has('data-once') };
        }

        // 결정된 옵션 → <video> 속성명 배열 (muted 여부는 opts.sound 로 판단)
        function _videoAttrList(opts) {
            const attrs = [];
            if (!opts.stop) attrs.push('autoplay');
            if (!opts.once) attrs.push('loop');
            if (!opts.sound) attrs.push('muted');
            if (opts.controls) attrs.push('controls');
            attrs.push('playsinline', 'webkit-playsinline');
            return attrs;
        }

        // 정지(autoplay 없음) 영상 첫 프레임 poster 대체:
        //   증상: 에디터 WYSIWYG 은 영상이 디코드돼 첫 프레임이 보이지만, 다운로드한 단독 HTML 을
        //         새로 열면 preload="metadata" 만으론 프레임이 안 그려져 검은 박스 + 플레이버튼만 보임.
        //   해결: source URL 에 media fragment #t=0.001 추가 → 브라우저가 해당 시각으로 seek·paint 하여 첫 프레임 노출.
        //   autoplay 영상은 재생으로 프레임이 그려지므로 불필요 → skip. 이미 #t= 있으면 멱등 skip.
        function _withPosterFragment(src, opts) {
            if (!opts.stop) return src;        // autoplay → 재생이 프레임을 그림
            if (!src || /#t=/.test(src)) return src; // 멱등
            return src + '#t=0.001';
        }

        function buildEventVideoHtml(src, optsSource) {
            const opts = _readVideoOpts(optsSource);
            const attrs = _videoAttrList(opts);
            const onclick = !opts.sound ? ' onclick="this.muted=false"' : '';
            return `<video ${attrs.join(' ')} preload="metadata"${onclick} style="${VIDEO_RUNTIME_STYLE}"><source src="${_withPosterFragment(src, opts)}" type="video/mp4"></video>`;
        }

        function buildEventVideoEl(src, optsSource) {
            const opts = _readVideoOpts(optsSource);
            const v = document.createElement('video');
            _videoAttrList(opts).forEach(a => v.setAttribute(a, ''));
            if (!opts.sound) v.setAttribute('onclick', 'this.muted=false');
            v.setAttribute('preload', 'metadata');
            v.style.cssText = VIDEO_RUNTIME_STYLE;
            const s = document.createElement('source');
            s.setAttribute('src', _withPosterFragment(src, opts));
            s.setAttribute('type', 'video/mp4');
            v.appendChild(s);
            return v;
        }

// ────────────────────────────────────────────────────────────────
// 영상 옵션 툴바 (Stage 3 후 L2648-2722, 끝에 forEach IIFE 즉시 실행)
// ────────────────────────────────────────────────────────────────
        // ── 영상 옵션 툴바 ──
        function getActiveVideo() {
            if (activeLayer) {
                if (activeLayer.tagName === 'VIDEO') { _lastVideoRef = activeLayer; return activeLayer; }
                const v = activeLayer.querySelector?.('video');
                if (v) { _lastVideoRef = v; return v; }
            }
            // fallback: activeLayer가 풀렸어도 마지막 참조된 video가 DOM에 있으면 사용
            if (_lastVideoRef && _lastVideoRef.isConnected) return _lastVideoRef;
            return null;
        }
        function showVideoOptToolbar(el) {
            const tb = getById('videoOptToolbar');
            if (!tb) return;
            const video = el.tagName === 'VIDEO' ? el : el.querySelector?.('video');
            if (!video) { tb.style.display = 'none'; return; }
            _lastVideoRef = video; // fallback 참조 저장
            // 상태 동기화
            ['autoplay','loop','muted','controls'].forEach(attr => {
                const btn = getById('vOpt' + attr.charAt(0).toUpperCase() + attr.slice(1));
                if (btn) btn.classList.toggle('vopt-on', video.hasAttribute(attr));
            });
            tb.style.display = 'flex';
            // 위치: imgFloatToolbar 바로 아래
            requestAnimationFrame(() => {
                const imgTb = getById('imgFloatToolbar');
                if (imgTb && imgTb.style.display !== 'none') {
                    const r = imgTb.getBoundingClientRect();
                    tb.style.left = r.left + 'px';
                    tb.style.top = (r.bottom + 4) + 'px';
                } else {
                    const r2 = el.getBoundingClientRect();
                    tb.style.left = r2.left + 'px';
                    tb.style.top = (r2.bottom + 4) + 'px';
                }
            });
        }
        function hideVideoOptToolbar() {
            const tb = getById('videoOptToolbar');
            if (tb) tb.style.display = 'none';
        }
        function toggleVideoAttr(attr) {
            const video = getActiveVideo();
            if (!video) return;
            // 속성 토글
            if (video.hasAttribute(attr)) {
                video.removeAttribute(attr);
                if (attr === 'muted') video.muted = false;
                if (attr === 'autoplay') { video.pause(); }
                if (attr === 'loop') video.loop = false;
                if (attr === 'controls') video.controls = false;
            } else {
                video.setAttribute(attr, '');
                if (attr === 'muted') video.muted = true;
                if (attr === 'autoplay') { video.autoplay = true; video.play().catch(()=>{}); }
                if (attr === 'loop') video.loop = true;
                if (attr === 'controls') video.controls = true;
            }
            // 버튼 상태 갱신
            const btn = getById('vOpt' + attr.charAt(0).toUpperCase() + attr.slice(1));
            if (btn) btn.classList.toggle('vopt-on', video.hasAttribute(attr));
            // 툴바 유지 — activeLayer가 살아있으면 위치 재조정
            if (activeLayer) {
                showImgFloatToolbar(activeLayer);
            }
        }

        // 영상 옵션 버튼 이벤트 바인딩 (app.js 로드 후 실행되므로 toggleVideoAttr 사용 가능)
        ['autoplay','loop','muted','controls'].forEach(attr => {
            const id = 'vOpt' + attr.charAt(0).toUpperCase() + attr.slice(1);
            const btn = getById(id);
            if (!btn) return;
            btn.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
            btn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); toggleVideoAttr(attr); });
        });

// ────────────────────────────────────────────────────────────────
// 영상 insert + 로고 오버레이 (Stage 3 후 L4756-4896)
// ────────────────────────────────────────────────────────────────
        function insertVideoToEditor(file) {
            const reader = new FileReader();
            reader.onload = function(ev) {
                const dataUrl = ev.target.result;
                // 재생: blob URL 사용 (data URL은 대용량 영상에서 재생 안 됨)
                const blobUrl = URL.createObjectURL(file);
                videoObjectUrlMap.set(blobUrl, dataUrl); // 내보내기용 매핑 저장

                const area = getById('contentArea');
                // wrapper에서 font-size:0;line-height:0 제거 — 영상 높이 정상 표시
                const videoHTML = `<div class="se-div" style="margin:0;padding:0;"><video src="${blobUrl}" autoplay loop muted playsinline style="display:block;margin:0 auto;" preload="metadata"></video></div>`;
                recordState();
                area.focus();
                if (savedRange) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(savedRange);
                    document.execCommand('insertHTML', false, videoHTML);
                } else {
                    area.insertAdjacentHTML('beforeend', videoHTML);
                }
                // 원본 사이즈 적용: 메타데이터 로드 후 videoWidth/Height로 크기 설정
                const insertedVideo = area.querySelector(`video[src="${blobUrl}"]`);
                if (insertedVideo) {
                    insertedVideo.addEventListener('loadedmetadata', function() {
                        if (this.videoWidth > 0) {
                            const containerW = area.offsetWidth || 840;
                            const useW = Math.min(this.videoWidth, containerW);
                            const ratio = this.videoHeight / this.videoWidth;
                            this.style.width = useW + 'px';
                            this.style.height = Math.round(useW * ratio) + 'px';
                            this.style.maxWidth = '100%';
                        }
                    }, { once: true });
                }
                // 사이드바 미리보기
                const preview = getById('videoPreview');
                if (preview) {
                    preview.innerHTML = `<div class="flex items-center gap-2 p-2 bg-violet-50 rounded-lg border border-violet-100">
                        <span class="text-[10px] font-bold text-violet-600">🎬 ${file.name}</span>
                        <button onclick="getById('videoPreview').innerHTML=''" class="ml-auto text-[9px] text-red-400 font-bold">✕</button>
                    </div>`;
                }
                recordState();
                showToast('영상이 에디터에 삽입되었습니다.');
            };
            reader.readAsDataURL(file);
        }

        function setLogoPos(pos) {
            logoPos = pos;
            const btnL = getById('logoPosLeft');
            const btnR = getById('logoPosRight');
            if (btnL) btnL.className = pos === 'left'
                ? 'px-3 py-1 text-[10px] font-black rounded-lg border border-indigo-400 bg-indigo-500 text-white transition-colors'
                : 'px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors';
            if (btnR) btnR.className = pos === 'right'
                ? 'px-3 py-1 text-[10px] font-black rounded-lg border border-indigo-400 bg-indigo-500 text-white transition-colors'
                : 'px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors';
            updateLogoOverlay();
        }

        function updateLogoOverlay() {
            const slider = getById('logoSizeSlider');
            const label  = getById('logoSizeLabel');
            if (slider) { logoSize = parseInt(slider.value); }
            if (label)  { label.textContent = logoSize + '%'; }
            renderLogoOverlay();
        }

        // 히어로 이미지 + 로고 캔버스 합성
        async function compositeHeroWithLogo() {
            const heroImg = getById('mainHeroImg');
            if (!heroImg || !heroImg.src || heroImg.classList.contains('hidden')) return null;
            if (!logoBase64) return heroImg.src; // 로고 없으면 히어로만

            return new Promise(resolve => {
                const canvas = document.createElement('canvas');
                const hw = heroImg.naturalWidth || heroImg.offsetWidth;
                const hh = heroImg.naturalHeight || heroImg.offsetHeight;
                canvas.width = hw;
                canvas.height = hh;
                const ctx = canvas.getContext('2d');

                // 히어로 이미지 그리기
                const hi = new Image();
                hi.crossOrigin = 'anonymous';
                hi.onload = () => {
                    ctx.drawImage(hi, 0, 0, hw, hh);

                    // 로고 그리기
                    const li = new Image();
                    li.onload = () => {
                        const lw = Math.round(hw * logoSize / 100);
                        const lh = Math.round(li.naturalHeight * (lw / li.naturalWidth));
                        const lx = logoPos === 'left' ? Math.round(hw * 0.03) : Math.round(hw * 0.97) - lw;
                        const ly = Math.round(hh * 0.03);
                        ctx.drawImage(li, lx, ly, lw, lh);
                        resolve(canvas.toDataURL('image/jpeg', 0.95));
                    };
                    li.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.95));
                    li.src = logoBase64;
                };
                hi.onerror = () => resolve(heroImg.src);
                hi.src = heroImg.src.startsWith('data:') ? heroImg.src : heroImg.src;
            });
        }

        function renderLogoOverlay() {
            const heroDiv = getById('heroDiv');
            if (!heroDiv) return;
            // 기존 로고 오버레이 제거
            const old = heroDiv.querySelector('#heroLogoOverlay');
            if (old) old.remove();
            if (!logoBase64) return;
            const overlay = document.createElement('img');
            overlay.id = 'heroLogoOverlay';
            overlay.src = logoBase64;
            overlay.style.cssText = `position:absolute;top:3%;${logoPos === 'left' ? 'left:3%' : 'right:3%'};width:${logoSize}%;height:auto;pointer-events:none;z-index:10;`;
            heroDiv.appendChild(overlay);
        }

        function loadLogoFile(file) {
            if (!file || !isImageFile(file)) return;
            const r = new FileReader();
            r.onload = ev => {
                logoBase64 = ev.target.result;
                // 미리보기
                const preview = getById('logoPreview');
                if (preview) preview.innerHTML = `
                    <div class="relative w-full h-full group">
                        <img src="${logoBase64}" class="w-full h-full object-contain p-1.5">
                        <button onclick="logoBase64=null;getById('logoPreview').innerHTML='';getById('logoControls').classList.add('hidden');renderLogoOverlay();"
                            class="absolute top-0 right-0 bg-red-500/80 text-white w-4 h-4 flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-bl-sm rounded-tr-xl">✕</button>
                    </div>`;
                getById('logoControls').classList.remove('hidden');
                renderLogoOverlay();
                showToast('로고가 등록되었습니다.');
            };
            r.readAsDataURL(file);
        }

// ────────────────────────────────────────────────────────────────
// ensureEventVideoScript (Stage 3 후 L5167-5254) — safety net
// ────────────────────────────────────────────────────────────────
        // ─────────────────────────────────────────────────────────────
        // 영상 정적 <video> 치환 (2026-05-20)
        //   기존 v1: event-video div + DOMContentLoaded script → 다운로드 후 일부 환경에서 영상 미노출
        //   v2 (취소): 비탐욕 regex `[\s\S]*?</div>` → 탭/API 영역의 </div> 까지 먹는 회귀
        //   v3 (취소): DOMParser 라운드트립 → 브라우저가 inline style 의 #hex → rgb() 정규화 → 색상 규칙 위반
        //   v4 (현재): 빈 event-video div 만 매칭 (`>\s*<\/div>`). spec 상 leaf 이므로 안전.
        //     - 내용 있는 div 는 손대지 않음 → 탭/API 영역 안전
        //     - 문자열 치환 → 색상 정규화 안 일어남
        //     - 모든 영상 autoplay+loop+muted+playsinline 통일, max-width:100%;height:auto 반응형
        //     - 멱등: 이미 <video> 가 들어간 wrapper 는 빈 div 가 아니므로 재매칭 안 됨 (그대로 유지)
        // ─────────────────────────────────────────────────────────────
        function ensureEventVideoScript(html) {
            if (!html || typeof html !== 'string') return html;
            if (!/\bevent-video\b/i.test(html)) return html;

            // 4옵션 모델 변환은 buildEventVideoHtml (top-level SSOT) 이 담당.
            const buildVideo = (src, attrs) => buildEventVideoHtml(src, attrs);

            // [회귀 방지 2026-05-27] event-video div wrapper 의 잡스러운 인라인 스타일 strip.
            //   Gemini 가 종종 wrapper 에 aspect-ratio:16/9 + background-color + position + border-radius 등을 박는데,
            //   - aspect-ratio:16/9 : 세로 영상(portrait)을 16:9 검은 박스로 잘라버림 → 사용자가 잘림 호소
            //   - background-color/position/border-radius : 변환 후 <video> 와 중복·충돌
            //   wrapper 는 단순 컨테이너여야 하고, 스타일은 변환된 <video> 에만 있어야 함.
            //   처리: event-video div 의 style 속성에서 위 속성들만 제거 (다른 속성은 보존).
            const STRIP_PROPS = /(?:^|;)\s*(?:aspect-ratio|background-color|background|position|border-radius|overflow|isolation)\s*:[^;]*;?/gi;
            html = html.replace(
                /(<div\b[^>]*?\bclass="[^"]*\bevent-video\b[^"]*"[^>]*?\bstyle=")([^"]*)("[^>]*>)/gi,
                (m, pre, styleVal, post) => {
                    const cleaned = styleVal.replace(STRIP_PROPS, ';').replace(/;;+/g, ';').replace(/^;+/, '').replace(/;+$/, '').trim();
                    return cleaned ? `${pre}${cleaned}${post}` : pre.replace(/\s*style="$/i, '') + post.replace(/^"/, '');
                }
            );
            // 데이터-src 가 먼저, class 가 뒤인 경우도 같은 처리
            html = html.replace(
                /(<div\b[^>]*?\bdata-src="[^"]+"[^>]*?\bstyle=")([^"]*)("[^>]*?\bclass="[^"]*\bevent-video\b[^"]*"[^>]*>)/gi,
                (m, pre, styleVal, post) => {
                    const cleaned = styleVal.replace(STRIP_PROPS, ';').replace(/;;+/g, ';').replace(/^;+/, '').replace(/;+$/, '').trim();
                    return cleaned ? `${pre}${cleaned}${post}` : pre.replace(/\s*style="$/i, '') + post.replace(/^"/, '');
                }
            );

            // [회귀 방지 2026-05-27] event-video wrapper 안의 literal 텍스트 노이즈 strip.
            //   Gemini 가 nested wrapper 를 만들다 닫는 태그를 escape 한 채 literal 로 남기는 케이스:
            //     `<div class="event-video"...><div class="event-video"...><video/></div>" style="..."&gt;</div>`
            //   wrapper 안에 escape 된 HTML literal (`" ...&gt;`, `&lt;...&gt;` 등) 이 보이면 제거.
            html = html.replace(
                /(<div\b[^>]*?\bclass="[^"]*\bevent-video\b[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/gi,
                (m, open, inner, close) => {
                    // wrapper 안에 또 다른 event-video 가 있거나 literal HTML 텍스트가 보이면 안에 있는 video 만 남김
                    if (/&gt;|&lt;|"\s*style=/.test(inner)) {
                        // 안에 있는 진짜 <video> 또는 nested event-video div 를 추출
                        const videoMatch = inner.match(/<video\b[\s\S]*?<\/video>/i);
                        const nestedMatch = inner.match(/<div\b[^>]*\bevent-video\b[^>]*>[\s\S]*?<\/div>/i);
                        const keep = videoMatch ? videoMatch[0] : (nestedMatch ? nestedMatch[0] : '');
                        return `${open}${keep}${close}`;
                    }
                    return m;
                }
            );

            // (1) class 가 먼저, data-src 가 뒤 — 빈 div 만 매칭 (\s* 만 허용)
            html = html.replace(
                /<div\b([^>]*?\bclass="[^"]*\bevent-video\b[^"]*"[^>]*?\bdata-src="([^"]+)"[^>]*)>\s*<\/div>/gi,
                (m, attrs, src) => `<div${attrs}>${buildVideo(src, attrs)}</div>`
            );
            // (2) data-src 가 먼저, class 가 뒤 — 빈 div 만 매칭
            html = html.replace(
                /<div\b([^>]*?\bdata-src="([^"]+)"[^>]*?\bclass="[^"]*\bevent-video\b[^"]*"[^>]*)>\s*<\/div>/gi,
                (m, attrs, src) => `<div${attrs}>${buildVideo(src, attrs)}</div>`
            );

            // data-src 없이 event-video class 만 emit 된 가짜 케이스 → class 만 제거 (외부 CSS 오매칭 방지).
            // opening tag 만 건드리므로 자식 div 의 </div> 를 절대 먹지 않음.
            html = html.replace(
                /<div\b([^>]*\bclass="[^"]*\bevent-video\b[^"]*"[^>]*)>/gi,
                (m, attrs) => {
                    if (/\bdata-src="[^"]+"/.test(attrs)) return m;
                    const stripped = attrs.replace(/\bclass="([^"]*)"/i, (mm, classes) => {
                        const cleaned = classes.replace(/\bevent-video\b/g, '').replace(/\s+/g, ' ').trim();
                        return cleaned ? `class="${cleaned}"` : '';
                    });
                    return `<div${stripped}>`;
                }
            );

            return html;
        }

// ────────────────────────────────────────────────────────────────
// Gemini 출력 후처리 — 영상 safety net (app.js generateContent 에서 이전, 2026-05-29)
//   recoverVideoMarkers: 텍스트로 남은 [영상|opts] + URL → event-video div 복구
//   wrapVideoGridsInCallout: 영상 그리드 표를 콜아웃 박스로 wrap (DOM 기반)
//   recoverMissingVideoUrls: 입력 occurrence 대비 출력 누락 URL 복구
// ctx = {bgColor, surfaceColor, borderColor, thBgColor, mutedColor, textColor, subColor, accentColor, mw}
// ────────────────────────────────────────────────────────────────

        // [회귀 방지 2026-05-19, 모델 갱신 2026-05-29] 영상 마커 복구 — Gemini 가 [영상|...] 마커 + URL 패턴을 event-video div 로 변환 못 한 케이스 복구.
        //   rules/15-video.md §영상 룰에 따르면 모델이 변환해야 하지만 종종 누락.
        //   원고에 [영상|정지|플레이바] 가 텍스트로 남아있고 .mp4/.webm/.mov URL 이 근처(200자 이내)에 있으면
        //   `<div class="se-div event-video" data-src="URL" data-stop data-controls ...>` 로 자동 변환 (신 4옵션 모델).
        //   [2026-05-20] 노션 markdown 링크 형식 `[URL](URL)` 처리 — URL 문자 셋에서 `]` `(` `)` 제외.
        function recoverVideoMarkers(out) {
            // 마커 옵션 파이프 + URL 모두 캡처. URL 문자: 공백/HTML 특수문자/markdown 브래킷 모두 금지
            const VIDEO_MARKER_RE = /\[(영상|루프영상|루프|loop|자동재생|player)((?:\|[^\]\n]*)?)\][\s\S]{0,200}?(https?:\/\/[^\s<>"'\]\)\(]+\.(?:mp4|webm|mov)(?:\?[^\s<>"'\]\)\(]*)?)/gi;
            let _vidConverted = 0;
            out = out.replace(VIDEO_MARKER_RE, (m, markerType, optsStr, url) => {
                // 옵션 키워드 → data-* (video.js SSOT _optsToDataAttrs 재사용)
                let attrStr = _optsToDataAttrs(optsStr || '');
                // 'player' 리터럴 마커(레거시) + 옵션 없음 → 정지 + 플레이바 (구 data-type="player" 동치)
                if (!attrStr && /player/i.test(markerType)) attrStr = 'data-stop data-controls';
                // 그 외(영상/루프/loop/자동재생 + 옵션 없음) → 배경 영상 기본 동작 (data-* 없음)
                _vidConverted++;
                return `<div class="se-div event-video" data-src="${url}"${attrStr ? ' ' + attrStr : ''}></div>`;
            });
            // 잔여 고아 [영상...] 마커 제거 (URL 매칭 실패해도 마커 텍스트는 화면 노출 방지)
            const _orphanRE = /\[(영상|루프영상|루프|loop|자동재생|player)(?:\|[^\]\n]*)?\]/gi;
            const _orphanCount = (out.match(_orphanRE) || []).length;
            if (_orphanCount > 0) {
                out = out.replace(_orphanRE, '');
                console.warn('[video marker recovery] orphan markers stripped (no URL found):', _orphanCount);
            }
            if (_vidConverted > 0) console.log('[video marker recovery] converted:', _vidConverted);
            return out;
        }

        // [2026-05-28] 영상 그리드/표를 "콜아웃 박스" 로 wrap (DOM 기반).
        //   사용자 의도: 콜아웃 = 자체 bg 컬러 박스 (섹션 카드보다 가벼움) + 50/50 layout.
        //   bg: mutedColor (rules/06-color-system.md 의 BG-3 부가정보 카드 색). 섹션 안/밖 둘 다 동일 처리.
        //   섹션 안 → 그 섹션의 일부로 흡수되되 자체 mutedColor 박스 유지 (시각적 구분).
        //   섹션 카드 판별 — background-color 있는 .se-div + max-width 없음 (콘텐츠 래퍼 제외).
        function wrapVideoGridsInCallout(out, ctx) {
            if (!out.includes('event-video')) return out;
            const mutedColor = ctx.mutedColor, surfaceColor = ctx.surfaceColor;
            const _tmpWrap = document.createElement('div');
            _tmpWrap.innerHTML = out;

            const _isSectionCard = (el) => {
                if (!el || !el.classList || !el.classList.contains('se-div')) return false;
                const s = el.style;
                if (!s.backgroundColor || s.backgroundColor === 'transparent' || s.backgroundColor === 'inherit') return false;
                if (s.maxWidth) return false; // 콘텐츠 래퍼 제외
                return true;
            };

            const _calloutStyle = `background-color:${mutedColor || surfaceColor};border-radius:0.75rem;padding:1.5rem;`;
            const _makeCalloutWrap = () => {
                const wrap = document.createElement('div');
                wrap.className = 'se-div';
                wrap.setAttribute('style', _calloutStyle);
                return wrap;
            };

            let _wrappedNew = 0, _absorbedWrapped = 0, _alreadyStyled = 0;
            _tmpWrap.querySelectorAll('table').forEach(tbl => {
                if (!tbl.querySelector('.event-video')) return;

                // 이동 단위 — .se-para-div 가 single-child wrapper 면 그 wrapper 자체를 단위로
                let unit = tbl;
                if (tbl.parentElement &&
                    tbl.parentElement.classList.contains('se-para-div') &&
                    tbl.parentElement.children.length === 1) {
                    unit = tbl.parentElement;
                }

                // 이미 mutedColor/surfaceColor bg 가진 박스 안이면 skip (재포장 방지)
                const directParent = unit.parentElement;
                if (directParent && directParent.style &&
                    directParent.style.backgroundColor &&
                    directParent.children.length === 1) {
                    _alreadyStyled++;
                    return;
                }

                // 직전 형제(빈 <p> spacer 건너뛰며)가 섹션 카드면 그 안으로 흡수 + 콜아웃 wrap
                const spacers = [];
                let prev = unit.previousElementSibling;
                while (prev && prev.tagName === 'P' && !(prev.textContent || '').trim()) {
                    spacers.push(prev);
                    prev = prev.previousElementSibling;
                }
                if (prev && _isSectionCard(prev)) {
                    spacers.reverse().forEach(s => prev.appendChild(s));
                    const wrap = _makeCalloutWrap();
                    prev.appendChild(wrap);
                    wrap.appendChild(unit);
                    _absorbedWrapped++;
                    return;
                }

                // 그 외 — 콜아웃 박스로 wrap (in-place, 새 섹션 아님)
                const wrap = _makeCalloutWrap();
                unit.parentNode.insertBefore(wrap, unit);
                wrap.appendChild(unit);
                _wrappedNew++;
            });
            if (_wrappedNew || _absorbedWrapped || _alreadyStyled) {
                console.log('[promo-preserve] callout placement:',
                    _absorbedWrapped, 'absorbed+wrapped into prev section /',
                    _wrappedNew, 'wrapped in-place /',
                    _alreadyStyled, 'already styled');
                out = _tmpWrap.innerHTML;
            }
            return out;
        }

        // [2026-05-27/28 safety net] event-video URL 누락 복구 (occurrence 기반).
        //   기존: unique URL set 비교 → 같은 URL 이 두 번 쓰여도 1번만 카운트해 누락 감지 못함.
        //   현재: 입력의 occurrence 수와 출력의 occurrence 수 비교 → 한 placeholder 블록 통째 누락도 잡힘.
        //   data = 입력 HTML, _promoPreservedBlocks = state.js 전역 (placeholder 로 치환된 raw 블록).
        function recoverMissingVideoUrls(out, data, ctx) {
            const mutedColor = ctx.mutedColor, surfaceColor = ctx.surfaceColor;
            const inputUrls = [];
            const URL_RE_A = /<div\b[^>]*\bclass="[^"]*\bevent-video\b[^"]*"[^>]*\bdata-src="([^"]+)"/gi;
            const URL_RE_B = /<div\b[^>]*\bdata-src="([^"]+)"[^>]*\bclass="[^"]*\bevent-video\b/gi;
            let _m;
            // data 에 raw HTML 로 남은 경우 (안전망) + placeholder 로 치환된 블록 둘 다 검사
            const sources = [data, ..._promoPreservedBlocks];
            for (const src of sources) {
                URL_RE_A.lastIndex = 0;
                URL_RE_B.lastIndex = 0;
                while ((_m = URL_RE_A.exec(src)) !== null) inputUrls.push(_m[1]);
                while ((_m = URL_RE_B.exec(src)) !== null) inputUrls.push(_m[1]);
            }
            if (!inputUrls.length) return out;
            // occurrence count
            const inputCnt = {};
            inputUrls.forEach(u => inputCnt[u] = (inputCnt[u] || 0) + 1);
            const outputCnt = {};
            URL_RE_A.lastIndex = 0;
            URL_RE_B.lastIndex = 0;
            while ((_m = URL_RE_A.exec(out)) !== null) outputCnt[_m[1]] = (outputCnt[_m[1]] || 0) + 1;
            while ((_m = URL_RE_B.exec(out)) !== null) outputCnt[_m[1]] = (outputCnt[_m[1]] || 0) + 1;
            // 누락 = 입력에 N번 있는데 출력에 M (<N) 번만 있음 → (N-M) 번 추가 복구
            const missing = [];
            for (const url in inputCnt) {
                const needed = inputCnt[url];
                const got = outputCnt[url] || 0;
                for (let i = 0; i < Math.max(0, needed - got); i++) missing.push(url);
            }
            if (!missing.length) {
                console.log('[video safety-net] all', inputUrls.length, 'event-video occurrences preserved');
                return out;
            }
            console.warn('[video safety-net] event-video occurrences missing:',
                missing.length, 'of', inputUrls.length, '— inputCnt:', inputCnt, 'outputCnt:', outputCnt);
            const cellW = (100 / Math.min(missing.length, 2)).toFixed(2);
            const cellsHtml = missing.map(u =>
                `<td style="padding:0.375rem;vertical-align:top;width:${cellW}%;box-sizing:border-box;"><div class="se-div event-video" data-src="${u}" data-stop data-controls></div></td>`
            );
            const rowsHtml = [];
            for (let k = 0; k < cellsHtml.length; k += 2) {
                rowsHtml.push('<tr>' + cellsHtml.slice(k, k + 2).join('') + '</tr>');
            }
            const recoveryHtml = `<p style="height:16px;margin:0;"></p><div class="se-div" style="background-color:${mutedColor || surfaceColor};border-radius:0.75rem;padding:1.5rem;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;"><tbody>${rowsHtml.join('')}</tbody></table></div>`;
            // [2026-05-28 fix] DOM 으로 콘텐츠 래퍼(.se-div + max-width + bgColor) 안에 정확히 삽입.
            //   이전엔 out.lastIndexOf('</div>') 가 .se-contents 닫는 div 잡아서 콘텐츠 래퍼 밖에 박힘.
            const _tmpR = document.createElement('div');
            _tmpR.innerHTML = out;
            const _seContents = _tmpR.querySelector('.se-contents');
            const _wrapper = _seContents ? Array.from(_seContents.children).find(el =>
                el.style && el.style.maxWidth && el.style.backgroundColor &&
                el.style.backgroundColor !== 'transparent' &&
                el.style.backgroundColor !== 'inherit'
            ) : null;
            // 마지막 섹션 카드 (5번 등) 가 있으면 그 직전에 삽입. 없으면 wrapper 끝에 append.
            const _isSectionCardLocal = (el) => {
                if (!el || !el.classList || !el.classList.contains('se-div')) return false;
                const s = el.style;
                if (!s.backgroundColor || s.backgroundColor === 'transparent') return false;
                if (s.maxWidth) return false;
                return true;
            };
            if (_wrapper) {
                const sectionCards = Array.from(_wrapper.children).filter(_isSectionCardLocal);
                const lastSection = sectionCards[sectionCards.length - 1];
                if (lastSection && lastSection !== sectionCards[0]) {
                    lastSection.insertAdjacentHTML('beforebegin', recoveryHtml);
                } else {
                    _wrapper.insertAdjacentHTML('beforeend', recoveryHtml);
                }
                out = _tmpR.innerHTML;
            } else {
                // fallback — wrapper 못 찾으면 기존 동작
                const seCloseIdx = out.lastIndexOf('</div>');
                if (seCloseIdx > 0) out = out.slice(0, seCloseIdx) + recoveryHtml + out.slice(seCloseIdx);
                else out += '\n' + recoveryHtml;
            }
            console.log('[video safety-net] injected recovery grid with', missing.length, 'video(s) into content wrapper');
            return out;
        }
