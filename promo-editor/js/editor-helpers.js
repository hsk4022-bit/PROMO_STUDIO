// promo-editor/js/editor-helpers.js — 에디터 UI 헬퍼 (toolbar 숨김 / 미리보기 / div 스타일 등)
//
// app.js 에서 분리 (Stage 9 — 2026-05-28). 5 비연속 블록.
// 포함:
//   ① hideAllTools, positionAddLineBtn, clearActiveLayer, addResizerHandles (Stage 8 후 L3-48)
//   ② applyTargetBlankToLinks, openPreviewPopup (Stage 8 후 L287-515)
//   ③ applyDivStyle (Stage 8 후 L518-563)
//   ④ setAspectRatio (Stage 8 후 L638-650)
//   ⑤ setPreviewMode, alignContent (Stage 8 후 L1061-1115)
//
// 의존:
// - state.js: activeLayer, historyStack
// - utils.js: getById
// - color-palette.js: isDarkColor (사용 가능 시)
// - image-editor.js: hideImgFloatToolbar
// - table.js: hideTableFloatToolbar
// - video.js: hideVideoOptToolbar
// - app.js (runtime): recordState, showToast

// ────────────────────────────────────────────────────────────────
// ① toolbar/resizer 기본 헬퍼 (Stage 8 후 L3-48)
// ────────────────────────────────────────────────────────────────
        function hideAllTools() {
            getById('tableTools').style.display = 'none';
            getById('imgTools').style.display = 'none';
            getById('divTools').style.display = 'none';
            const btn = getById('addLineBtn');
            if (btn) btn.style.display = 'none';
        }

        // addLineBtn을 activeLayer 바로 아래에 위치시키기
        function positionAddLineBtn() {
            const btn = getById('addLineBtn');
            if (!btn || !activeLayer) return;
            const sheet = getById('documentSheet');
            if (!sheet) return;
            const sheetRect = sheet.getBoundingClientRect();
            const layerRect = activeLayer.getBoundingClientRect();
            // accent 색상 기반 배경 + 명도 기반 자동 텍스트 색상
            const ac = getById('accentPicker')?.value || '#7c3aed';
            const tc = getLuminance(ac) < 128 ? '#ffffff' : '#1e293b';
            btn.style.backgroundColor = ac;
            btn.style.color = tc;
            btn.style.top = (layerRect.bottom - sheetRect.top) + 'px';
            btn.style.bottom = 'auto';
            btn.style.display = 'block';
        }

        // activeLayer 선택 해제 + 툴 숨기기
        function clearActiveLayer() {
            if (activeLayer) { activeLayer.classList.remove('active-layer'); activeLayer = null; }
            document.querySelectorAll('.img-selected').forEach(el => el.classList.remove('img-selected'));
            hideAllTools();
            hideImgFloatToolbar();
            hideTableFloatToolbar();
        }

        // 테이블 셀 복제 (빈 셀)

        // resizer 핸들 4개 생성
        function addResizerHandles(wrap) {
            ['nw','ne','sw','se'].forEach(pos => {
                const h = document.createElement('div');
                h.className = `resizer-handle resizer-${pos}`;
                h.dataset.pos = pos;
                wrap.appendChild(h);
            });
        }

// ────────────────────────────────────────────────────────────────
// ② applyTargetBlankToLinks + openPreviewPopup (Stage 8 후 L287-515)
// ────────────────────────────────────────────────────────────────
        // 내보내기 HTML의 버튼 링크에 target="_blank" 일괄 적용
        // 팝업 트리거, 탭 버튼, 앵커(#) 링크는 제외
        function applyTargetBlankToLinks(rootEl) {
            rootEl.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href') || '';
                if (!href || href.startsWith('#') || href === 'javascript:void(0)' || href.startsWith('javascript:')) return;
                if (a.classList.contains('popup-trigger')) return;
                if (a.closest('.se-tab-nav, .se-tabs, [class*="tab-nav"], [class*="tabs"]')) return;
                if (a.getAttribute('target')) return; // 이미 target 있으면 유지
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener');
            });
        }

        // ── 미리보기 (내보내기 HTML을 레이어 팝업 iframe으로 표시) ──
        function openPreviewPopup() {
            const area = getById('contentArea');
            if (!area || !area.innerHTML.trim()) return showToast('미리볼 컨텐츠가 없습니다.');
            const hi = getById('mainHeroImg');

            // 클린 HTML 생성 (buildCleanDiv 로직 인라인)
            const d = document.createElement('div');
            d.innerHTML = area.innerHTML;
            d.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
            d.querySelectorAll('[class=""]').forEach(el => el.removeAttribute('class'));
            d.querySelectorAll('.custom-resizer').forEach(r => {
                r.style.border = 'none'; r.style.resize = 'none'; r.style.outline = 'none';
                r.classList.remove('active-layer');
                r.querySelectorAll('.resizer-handle').forEach(h => h.remove());
                const media = r.querySelector('img, video');
                if (media) media.style.pointerEvents = 'auto';
            });
            // 영상 처리: 속성 동기화 + 포스터 생성
            d.querySelectorAll('video').forEach(v => {
                const src = v.getAttribute('src') || '';
                const origVideo = area.querySelector(`video[src="${src}"]`);
                if (origVideo) {
                    ['autoplay','loop','muted','controls','playsinline'].forEach(attr => {
                        if (origVideo.hasAttribute(attr)) v.setAttribute(attr, '');
                        else v.removeAttribute(attr);
                    });
                }
                // 포스터 이미지 생성 — 원본 video에서 현재 프레임 캡처
                if (origVideo && origVideo.videoWidth > 0 && !v.hasAttribute('poster')) {
                    try {
                        const cvs = document.createElement('canvas');
                        cvs.width = origVideo.videoWidth;
                        cvs.height = origVideo.videoHeight;
                        cvs.getContext('2d').drawImage(origVideo, 0, 0);
                        v.setAttribute('poster', cvs.toDataURL('image/jpeg', 0.85));
                    } catch(e) {}
                }
                // custom-resizer 안의 video: pointerEvents 복원
                if (v.style.pointerEvents === 'none') v.style.pointerEvents = 'auto';
            });
            d.querySelectorAll('.se-popup-content').forEach(el => el.remove());
            // 대버튼 래퍼: div에 세로 padding이 있고 자식 버튼에도 세로 padding이 있을 때만 div padding 제거
            // + 사이냅이 단축 `padding:0` 무시하고 기본 25px 주입하는 케이스 방지 — longhand 4면 0 강제
            d.querySelectorAll('.se-div').forEach(div => {
                const child = div.querySelector('a[style*="width:100%"], a[style*="width: 100%"], button[style*="width:100%"], button[style*="width: 100%"]');
                if (!child) return;
                const divPT = parseFloat(window.getComputedStyle(div).paddingTop) || 0;
                const divPB = parseFloat(window.getComputedStyle(div).paddingBottom) || 0;
                const childHasPad = child.getAttribute('style')?.match(/padding\s*:/);
                // 래퍼 div에 세로 여백이 있고 + 자식도 padding이 있을 때만 래퍼 세로 여백 제거
                if ((divPT > 8 || divPB > 8) && childHasPad) {
                    div.style.paddingTop = '0'; div.style.paddingBottom = '0';
                }
                // 사이냅 대응: padding 을 longhand 4면 0 으로 명시 (단축 `padding:0` 무시 방지)
                let s = div.getAttribute('style') || '';
                s = s.replace(/(?:^|;)\s*padding\s*:[^;]*;?/gi, ';')
                     .replace(/(?:^|;)\s*padding-(?:top|right|bottom|left)\s*:[^;]*;?/gi, ';')
                     .replace(/;;+/g, ';').replace(/^;+/, '').replace(/;+$/, '');
                s = 'padding:0px 0px 0px 0px;' + (s ? s + ';' : '');
                div.setAttribute('style', s.replace(/;+$/, ''));
            });

            // (hero.png) 텍스트 마커 + 깨진 hero img 제거
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
            // popup-trigger ? → +
            d.querySelectorAll('.popup-trigger[data-popup]').forEach(btn => {
                const t = btn.textContent.trim();
                if (t === '?' || t === '❓' || t === '＋') btn.textContent = '+';
            });

            // 히어로 이미지 삽입
            const heroSrc = hi?.getAttribute('src') || '';
            if (heroSrc && !heroSrc.endsWith('undefined')) {
                const heroTag = `<img src="${heroSrc}" style="width:100%;display:block;margin:0;padding:0;border:none;">`;
                const sc = d.querySelector('.se-contents');
                if (sc) {
                    const firstSeDiv = sc.querySelector(':scope > .se-div:first-child');
                    if (firstSeDiv && (parseFloat(firstSeDiv.style.fontSize) === 0 || !firstSeDiv.innerHTML.trim())) {
                        firstSeDiv.innerHTML = heroTag;
                        firstSeDiv.style.fontSize = '0'; firstSeDiv.style.lineHeight = '0';
                        firstSeDiv.style.display = 'block'; // display:none 복원
                    }
                }
            }

            // 팝업 콘텐츠 블록 추가
            let htmlStr = d.innerHTML;
            if (childPanels.length > 0) {
                childPanels.forEach(panel => {
                    const ca = getById('childArea_' + panel.id);
                    if (!ca) return;
                    const txt = ca.innerText.trim();
                    if (!txt || (txt.includes('팝업') && txt.length < 10)) return;
                    const clone = ca.cloneNode(true);
                    clone.querySelectorAll('.active-layer').forEach(el => el.classList.remove('active-layer'));
                    clone.querySelectorAll('.resizer-handle').forEach(el => el.remove());
                    htmlStr += `\n<div class="se-div se-popup-content" data-popup="${panel.id}" style="display:none;overflow:hidden;width:0;height:0;margin:0;padding:0;border:none;">${clone.innerHTML}</div>`;
                });
                htmlStr = buildInlinePopupHtml(htmlStr, {}, true); // forPreview=true: onclick 방식
            }

            // 레이아웃 보정 — .se-contents 직계 자식 se-div 에 max-width 주입 + 2번 블록 좌우 패딩
            htmlStr = ensureLayoutCompliance(htmlStr);

            // rgb() → hex 변환
            htmlStr = convertRgbToHex(htmlStr);
            htmlStr = expandHexColors(htmlStr);

            const previewScript = `<script>
document.addEventListener('click',function(e){
var a=e.target.closest('a[href]');
if(!a)return;
var h=a.getAttribute('href')||'';
// 앵커 링크(#tab01 등): iframe 내 스크롤, 외부 이동 방지
if(h.startsWith('#')){e.preventDefault();var t=document.querySelector(h);if(t)t.scrollIntoView({behavior:'smooth'});}
// javascript: href(팝업): 그대로 실행
else if(h.startsWith('javascript:')){}
// 외부 링크: 새 탭으로 열기 (iframe 탈출 방지)
else{e.preventDefault();window.open(h,'_blank');}
});
<\/script>`;
            const fullHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');body{margin:0;padding:0;display:flex;justify-content:center;background:#f1f5f9;font-family:'Pretendard',sans-serif;}img{max-width:100%;height:auto;}</style></head><body>${htmlStr}${previewScript}</body></html>`;

            // 레이어 팝업 오버레이 생성
            const overlay = document.createElement('div');
            overlay.id = '__preview_overlay__';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:700000;display:flex;align-items:center;justify-content:center;';
            overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });

            const container = document.createElement('div');
            container.style.cssText = 'position:relative;width:90%;max-width:900px;height:90vh;background:#ffffff;border-radius:1rem;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.5);display:flex;flex-direction:column;';

            // 헤더
            const header = document.createElement('div');
            header.style.cssText = 'padding:0.5rem 1rem;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:0.75rem;flex-shrink:0;';

            const titleSpan = document.createElement('span');
            titleSpan.style.cssText = 'font-size:0.8rem;font-weight:900;color:#4f46e5;';
            titleSpan.textContent = '미리보기';
            header.appendChild(titleSpan);

            // PC / Mobile 전환 버튼
            const viewToggle = document.createElement('div');
            viewToggle.style.cssText = 'display:flex;border:1px solid #e2e8f0;border-radius:0.5rem;overflow:hidden;';
            const btnPC = document.createElement('button');
            btnPC.textContent = '🖥 PC';
            btnPC.style.cssText = 'padding:0.25rem 0.75rem;font-size:10px;font-weight:900;border:none;cursor:pointer;background:#4f46e5;color:#ffffff;';
            const btnMobile = document.createElement('button');
            btnMobile.textContent = '📱 Mobile';
            btnMobile.style.cssText = 'padding:0.25rem 0.75rem;font-size:10px;font-weight:900;border:none;cursor:pointer;background:#ffffff;color:#64748b;';
            viewToggle.appendChild(btnPC);
            viewToggle.appendChild(btnMobile);
            header.appendChild(viewToggle);

            // 우측 여백 채우기 + 닫기 버튼
            const spacer = document.createElement('div');
            spacer.style.cssText = 'flex:1;';
            header.appendChild(spacer);

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = 'background:#f1f5f9;border:1px solid #e2e8f0;border-radius:50%;width:2rem;height:2rem;font-size:1rem;font-weight:900;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
            closeBtn.onclick = () => overlay.remove();
            header.appendChild(closeBtn);

            // iframe
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'flex:1;border:none;width:100%;';
            iframe.sandbox = 'allow-scripts allow-same-origin';

            // PC/Mobile 전환 로직
            const mw = parseInt(getById('pageWidthInput')?.value) || 840;
            btnPC.onclick = () => {
                container.style.maxWidth = '900px';
                container.style.width = '90%';
                iframe.style.maxWidth = '';
                btnPC.style.background = '#4f46e5'; btnPC.style.color = '#ffffff';
                btnMobile.style.background = '#ffffff'; btnMobile.style.color = '#64748b';
            };
            btnMobile.onclick = () => {
                container.style.maxWidth = '375px';
                container.style.width = '375px';
                iframe.style.maxWidth = '375px';
                btnMobile.style.background = '#4f46e5'; btnMobile.style.color = '#ffffff';
                btnPC.style.background = '#ffffff'; btnPC.style.color = '#64748b';
            };

            container.appendChild(header);
            container.appendChild(iframe);
            overlay.appendChild(container);
            document.body.appendChild(overlay);

            // iframe에 HTML 로드 — blob URL document로 생성 (영상 blob URL 접근 보장)
            const htmlBlob = new Blob([fullHtml], { type: 'text/html' });
            const htmlBlobUrl = URL.createObjectURL(htmlBlob);
            iframe.src = htmlBlobUrl;
            // overlay 제거 시 blob URL 해제
            const origRemove = overlay.remove.bind(overlay);
            overlay.remove = function() { URL.revokeObjectURL(htmlBlobUrl); origRemove(); };

            showToast('미리보기 — PC/Mobile 전환 가능');
        }

// ────────────────────────────────────────────────────────────────
// ③ applyDivStyle (Stage 8 후 L518-563)
// ────────────────────────────────────────────────────────────────
        function applyDivStyle(type, value) {
            if (!activeLayer || activeLayer.tagName !== 'DIV') return;
            
            if (type === 'radius') {
                if (value == 0 || value === '') {
                    activeLayer.style.borderRadius = '';
                    activeLayer.style.borderTopLeftRadius = '';
                    activeLayer.style.borderTopRightRadius = '';
                    activeLayer.style.borderBottomLeftRadius = '';
                    activeLayer.style.borderBottomRightRadius = '';
                    activeLayer.style.overflow = '';
                } else {
                    const rv = value + 'px';
                    activeLayer.style.borderRadius = rv;
                    activeLayer.style.borderTopLeftRadius = rv;
                    activeLayer.style.borderTopRightRadius = rv;
                    activeLayer.style.borderBottomLeftRadius = rv;
                    activeLayer.style.borderBottomRightRadius = rv;
                    activeLayer.style.overflow = 'hidden';
                }
            } 
            else if (type === 'padding') {
                const pv = (value == 0 || value === '') ? '' : value + 'px';
                activeLayer.style.paddingTop    = pv;
                activeLayer.style.paddingBottom = pv;
                activeLayer.style.paddingLeft   = pv;
                activeLayer.style.paddingRight  = pv;
            } 
            else if (type === 'shadow') {
                if (value) {
                    activeLayer.style.boxShadow = '0 10px 25px #00000026';
                } else {
                    activeLayer.style.boxShadow = '';
                }
            }
            else if (type === 'bgColor') {
                if (value) {
                    activeLayer.style.backgroundColor = value;
                } else {
                    activeLayer.style.removeProperty('background-color');
                }
                const picker = getById('divBgColorInput');
                if (picker && value) picker.value = value;
            }
            recordState();
        }

// ────────────────────────────────────────────────────────────────
// ④ setAspectRatio (Stage 8 후 L638-650)
// ────────────────────────────────────────────────────────────────
        function setAspectRatio(ratio) {
            window._heroAspectRatio = ratio;
            const btnMap = { '1:1': 'ratioBtn11', '3:4': 'ratioBtn34', '4:3': 'ratioBtn43' };
            Object.entries(btnMap).forEach(([r, id]) => {
                const btn = getById(id);
                if (!btn) return;
                if (r === ratio) {
                    btn.className = 'px-3 py-1 text-[10px] font-black rounded-lg border border-indigo-400 bg-indigo-500 text-white transition-colors';
                } else {
                    btn.className = 'px-3 py-1 text-[10px] font-black rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors';
                }
            });
        }

// ────────────────────────────────────────────────────────────────
// ⑤ setPreviewMode + alignContent (Stage 8 후 L1061-1115)
// ────────────────────────────────────────────────────────────────
        function setPreviewMode(mode) {
            const sheet = getById('documentSheet');
            const btnPC = getById('btnViewPC');
            const btnMob = getById('btnViewMobile');
            if (!sheet) return;
            const mw = parseInt(getById('pageWidthInput')?.value)||840;
            if (mode === 'mobile') {
                sheet.style.width = '375px';
                sheet.style.maxWidth = '375px';
                sheet.style.minWidth = '320px';
                // 팝업 패널도 모바일 크기로 동기화
                document.querySelectorAll('[id^="childSheet_"]').forEach(el => {
                    el.style.width = '375px';
                    el.style.maxWidth = '100%';
                });
                const wrapper = getById('childPanelsWrapper');
                if (wrapper) { wrapper.style.width = '375px'; wrapper.style.maxWidth = '100%'; }
                if (btnPC)  btnPC.style.cssText  = 'font-size:11px;font-weight:700;padding:8px 12px;background:#f8fafc;color:#475569;';
                if (btnMob) btnMob.style.cssText = 'font-size:11px;font-weight:700;padding:8px 12px;background:#4f46e5;color:#fff;';
                showToast('\ud83d\udcf1 \ubaa8\ubc14\uc77c \ubdf0 (375px)');
            } else {
                sheet.style.width = mw + 'px';
                sheet.style.maxWidth = mw + 'px';
                // 팝업 패널도 PC 크기로 복원 (childSheet는 엄마보다 약간 작게)
                const childW = Math.min(Math.round(mw * 0.88), 740);
                document.querySelectorAll('[id^="childSheet_"]').forEach(el => {
                    el.style.width = childW + 'px';
                    el.style.maxWidth = '100%';
                });
                const wrapper = getById('childPanelsWrapper');
                if (wrapper) { wrapper.style.width = childW + 'px'; wrapper.style.maxWidth = '100%'; }
                if (btnPC)  btnPC.style.cssText  = 'font-size:11px;font-weight:700;padding:8px 12px;background:#4f46e5;color:#fff;';
                if (btnMob) btnMob.style.cssText = 'font-size:11px;font-weight:700;padding:8px 12px;background:#f8fafc;color:#475569;';
                showToast('\ud83d\udda5 PC \ubdf0 (' + mw + 'px)');
            }
        }

        function alignContent(dir) {
            recordState();
            if (activeLayer) {
                activeLayer.style.textAlign = dir;
                if (activeLayer.tagName === 'IMG' || activeLayer.classList.contains('custom-resizer')) {
                    activeLayer.style.display = 'block';
                    if (dir === 'center') { activeLayer.style.marginLeft='auto'; activeLayer.style.marginRight='auto'; }
                    else if (dir === 'right') { activeLayer.style.marginLeft='auto'; activeLayer.style.marginRight='0'; }
                    else { activeLayer.style.marginLeft='0'; activeLayer.style.marginRight='auto'; }
                }
            } else {
                const cmds = {left:'justifyLeft', center:'justifyCenter', right:'justifyRight'};
                document.execCommand(cmds[dir]||'justifyLeft', false, null);
            }
            recordState();
        }

        // ── 페이지 너비 적용 (app.js bootstrap 에서 분리, 2026-05-29) ──
        //   documentSheet + 팝업 패널(childSheet/childArea) 폭을 입력값에 동기화. 순수 DOM 조작.
        function applyPageWidth(w) {
            const sheet = getById('documentSheet');
            const wrapper = getById('childPanelsWrapper');
            if (sheet) sheet.style.width = w + 'px';
            if (wrapper) { wrapper.style.width = w + 'px'; wrapper.style.maxWidth = '100%'; }
            // childSheet 패널 너비도 동기화 (모바일/PC 전환 시 팝업도 같이 변경)
            document.querySelectorAll('[id^="childSheet_"]').forEach(el => {
                el.style.width = w + 'px';
                el.style.maxWidth = '100%';
            });
            document.querySelectorAll('[id^="childArea_"]').forEach(area => {
                area.style.width = '100%';
                area.style.minWidth = '';
                area.style.boxSizing = 'border-box';
            });
        }

        // ── 스마트 업데이트 헬퍼 ────────────────────────────────────────────
