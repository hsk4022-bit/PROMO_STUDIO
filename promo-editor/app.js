
        // 모든 편집 툴 패널 숨기기


        // HTML 파일 로드 공통 처리 (drag-drop / file-input 통합)
        function loadHtmlFile(htmlFile, imgMap) {
            imgMap = imgMap || {};
            const reader = new FileReader();
            reader.onload = (ev) => {
                recordState();
                // BOM(U+FEFF) 제거 + 인코딩 보정
                let rawHtml = ev.target.result || '';
                if (rawHtml.charCodeAt(0) === 0xFEFF) rawHtml = rawHtml.slice(1);
                const parser = new DOMParser();
                const doc = parser.parseFromString(rawHtml, 'text/html');
                const seContents = doc.querySelector('.se-contents');

                let htmlStr = '';
                let heroRawSrc = '';

                if (seContents) {
                    const heroSeDiv = seContents.querySelector('.se-div:first-child');
                    const heroImgNode = heroSeDiv ? heroSeDiv.querySelector('img') : null;
                    if (heroImgNode) {
                        heroRawSrc = heroImgNode.getAttribute('src') || '';
                        // 전체 제거 대신 display:none으로 숨김 (내보내기 시 위치 참조용으로 유지)
                        heroSeDiv.style.display = 'none';
                        heroSeDiv.innerHTML = '';
                    }
                    // 재불러오기 시 — 직계 자식 se-div 에 박힌 export 전용 max-width/width/margin 리셋
                    // (에디터에서는 .se-contents 자체 레이아웃 규칙으로 렌더; 내보내기 시 ensureLayoutCompliance 가 다시 주입)
                    Array.from(seContents.children).forEach(child => {
                        if (!child.classList || !child.classList.contains('se-div')) return;
                        let s = child.getAttribute('style') || '';
                        s = s.replace(/(?:^|;)\s*max-width\s*:[^;]*;?/gi, ';')
                             .replace(/(?:^|;)\s*width\s*:[^;]*;?/gi, ';')
                             .replace(/(?:^|;)\s*margin\s*:[^;]*;?/gi, ';')
                             .replace(/;;+/g, ';').replace(/^;+/, '').replace(/;+$/, '');
                        if (s) child.setAttribute('style', s); else child.removeAttribute('style');
                    });
                    htmlStr = seContents.outerHTML;
                } else {
                    const loadedArea = doc.querySelector('.se-div:last-child') || doc.body;
                    htmlStr = loadedArea.innerHTML;
                }

                // HTML 문자열 단계에서 이미지 src 교체 (DOM 파싱 전에 처리)
                if (Object.keys(imgMap).length > 0) {
                    Object.entries(imgMap).forEach(([fname, b64]) => {
                        const escaped = fname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        htmlStr = htmlStr.replace(
                            new RegExp('src="[^"]*' + escaped + '"', 'gi'),
                            `src="${b64}"`
                        );
                    });
                }

                // 테이블 태그 오류 수정 (<th ead> → <thead>, <t body> → <tbody>) — import 경로 누락분
                htmlStr = htmlStr.replace(/<th\s+ead([^>]*)>/gi, '<thead$1>');
                htmlStr = htmlStr.replace(/<\/th\s+ead>/gi, '</thead>');
                htmlStr = htmlStr.replace(/<t\s+body([^>]*)>/gi, '<tbody$1>');
                htmlStr = htmlStr.replace(/<\/t\s+body>/gi, '</tbody>');

                getById('contentArea').innerHTML = htmlStr;
                // 빈 헤더·선두 빈 행은 fixTableThs() 에서 일괄 처리 (line 494 에서 호출됨)
                // se-popup-content 블록을 DOM에서 제거 (이중 렌더링 방지 — 팝업 복원은 doc에서 처리)
                getById('contentArea').querySelectorAll('.se-popup-content').forEach(el => el.remove());
                // [회귀 방지 2026-05-27] 재불러오기 시에도 탭 hide/show 패턴 자동 복구.
                //   생성 시 안전망(line ~7084)이 잡지 못한 이전 산출물 / 외부 HTML import 케이스 커버.
                unhideTabSectionsOnImport(getById('contentArea'));
                // 에디터 로드 시 popup-trigger의 onclick/href 제거
                getById('contentArea').querySelectorAll('[data-popup][onclick]').forEach(el => el.removeAttribute('onclick'));
                getById('contentArea').querySelectorAll('a.popup-trigger[data-popup]').forEach(a => {
                    if (a.getAttribute('href')?.startsWith('javascript:')) a.setAttribute('href', 'javascript:void(0)');
                });
                // popup-trigger 스타일을 hex로 강제 재설정 (브라우저 rgb() 변환 방지)
                fixPopupTriggerStyles(); protectAccentBars(); protectSectionCards();

                // 히어로 이미지 처리
                if (heroRawSrc) {
                    const heroFname = heroRawSrc.split('/').pop().split('\\').pop();
                    applyHeroImage(imgMap[heroFname] || heroRawSrc, false, null, true); // skipColorExtract=true: 불러오기 시 배경색 자동 추출 비활성화
                }

                // 배경색 감지 — transparent/inherit 는 실제 배경이 아니므로 건너뛰고
                //   콘텐츠 래퍼(2번 블록, 예: #fcebd7) 의 실제 색을 찾는다.
                //   [회귀 방지 2026-05-31] 이전엔 .se-contents (background-color:transparent) 를 먼저 잡아
                //   loadedBg='transparent' → changeBg 가 '#' 아니라서 no-op (image-editor.js:632) →
                //   bgPicker 가 기본 다크로 남음 → 직후 addChildPanel 이 팝업 패널을 다크로 렌더하는 버그.
                const _isRealBg = (c) => !!c && c !== 'transparent' && c !== 'inherit' && c !== 'initial';
                let loadedBg = '';
                const _bgCands = [
                    doc.querySelector('.se-contents > .se-div:last-child'),
                    ...doc.querySelectorAll('.se-div[style*="background-color"], div[style*="background-color"]')
                ];
                for (const _el of _bgCands) {
                    if (_el && _isRealBg(_el.style.backgroundColor)) { loadedBg = _el.style.backgroundColor; break; }
                }
                if (!loadedBg && _isRealBg(doc.body.style.backgroundColor)) loadedBg = doc.body.style.backgroundColor;
                // noColorAdjust=true: 불러온 HTML의 텍스트 색상을 그대로 유지 (자동 교체 비활성화)
                if (loadedBg) changeBg(loadedBg, true);

                // 로드된 HTML의 해시 폴더명 감지 (img src에서)
                // 지원 형식: hashFolder/file.jpg  또는  ./hashFolder/file.jpg  또는  https://.../hashFolder/file.jpg
                // [2026-05-31] http/CDN URL 에서도 hashFolder 감지 (파일명 바로 앞 경로 세그먼트).
                //   CDN-URL HTML 을 불러올 때 currentHashFolder 를 못 잡으면, export 의 불러오기용 상대경로화·
                //   index_cdn 파생치환(./hashFolder/→cdn)이 어긋남 → 불러오기용에 절대 CDN URL 이 남는 회귀 방지.
                const allImgs = doc.querySelectorAll('img[src]');
                for (const img of allImgs) {
                    const src = img.getAttribute('src') || '';
                    if (src.startsWith('data:') || src.startsWith('blob:')) continue;
                    let candidate;
                    if (src.startsWith('http')) {
                        const segs = src.split('?')[0].split('#')[0].split('/').filter(Boolean);
                        candidate = segs.length >= 2 ? segs[segs.length - 2] : '';
                    } else {
                        const parts = src.split('/');
                        // ./hashFolder/file → parts[0]='.' parts[1]='hashFolder'
                        // hashFolder/file   → parts[0]='hashFolder'
                        candidate = (parts[0] === '.' || parts[0] === '') ? parts[1] : parts[0];
                    }
                    if (candidate && candidate.length >= 8 && /^[a-z0-9]+$/i.test(candidate)) {
                        currentHashFolder = candidate;
                        break;
                    }
                }

                // 팝업 복원: class 제거 환경 대비 — data-popup 속성 기반으로 감지
                const restoredIds = new Set();
                // 1차: 팝업 내용 블록
                // - 새 포맷: <script type="application/json" data-popup="...">JSON</script>
                // - 구 포맷: <div data-popup="..." style="display:none;">HTML</div>
                doc.querySelectorAll('[data-popup]').forEach(block => {
                    const id = block.getAttribute('data-popup');
                    if (!id || restoredIds.has(id)) return;
                    let content = null;
                    if (block.tagName === 'SCRIPT') {
                        // 새 포맷: JSON 디코딩
                        try { content = JSON.parse(block.textContent.trim()); } catch(e) { content = block.textContent.trim(); }
                    } else if (block.tagName === 'DIV') {
                        // 구 포맷: display:none div
                        const st = block.getAttribute('style') || '';
                        if (!st.includes('display:none') && !st.includes('display: none')) return;
                        content = block.innerHTML;
                    } else {
                        return; // button 등은 2차에서 처리
                    }
                    restoredIds.add(id);
                    const m = id.match(/\d+$/);
                    if (m && parseInt(m[0]) >= nextPopupId) nextPopupId = parseInt(m[0]) + 1;
                    addChildPanel(id, content);
                });
                // 2차 fallback: button[data-popup] — class 무관하게 감지
                doc.querySelectorAll('button[data-popup]').forEach(btn => {
                    const id = btn.getAttribute('data-popup');
                    if (!id || restoredIds.has(id)) return;
                    restoredIds.add(id);
                    const m = id.match(/\d+$/);
                    if (m && parseInt(m[0]) >= nextPopupId) nextPopupId = parseInt(m[0]) + 1;
                    addChildPanel(id, null);
                });

                // 이미지 재매칭 — 에셋 라이브러리에 파일이 있으면 자동으로 마커 교체
                if (Object.keys(contentAssetLibrary).length > 0) {
                    setTimeout(() => runImageMatching(true), 200);
                }

                // th → td 강제 변환 (로드된 HTML에도 적용)
                if (typeof fixTableThs === 'function') fixTableThs(getById('contentArea'));
                // [defense 2026-05-21] 탭 바 box-sizing 강제 (재로드된 HTML 에도 적용)
                if (typeof fixTabBarOverflow === 'function') fixTabBarOverflow(getById('contentArea'));
                // 스마트 업데이트용 섹션 ID 태깅
                tagSectionsWithId(getById('contentArea'));

                // 로드된 HTML에서 accent 감지 → accentPicker 동기화
                setTimeout(function() {
                    const _loadArea = getById('contentArea');
                    if (!_loadArea) return;
                    const _freq = {};
                    _loadArea.querySelectorAll('[style]').forEach(el => {
                        const _m = el.getAttribute('style').match(/#[0-9a-fA-F]{6}/g);
                        if (_m) _m.forEach(c => { _freq[c.toLowerCase()] = (_freq[c.toLowerCase()] || 0) + 1; });
                    });
                    const _bg = (getById('bgPicker').value || '').toLowerCase();
                    // accent 후보 필터 헬퍼는 color-palette.js (colorDistance / isNeutralColor) 공용.
                    const _det = Object.entries(_freq)
                        .filter(([c]) => c !== _bg && colorDistance(c, _bg) > 60 && !isNeutralColor(c))
                        .sort((a,b2) => b2[1]-a[1])[0];
                    if (_det) {
                        const _p = getById('accentPicker');
                        if (_p) { _p.value = _det[0]; _p.style.opacity = '1'; }
                        const _s = getById('accentSlash');
                        if (_s) _s.style.display = 'none';
                        getById('bgPicker').dataset.accent = _det[0];
                        getById('bgPicker').dataset.prevAccent = _det[0];
                        // accentPicker 값 확정 후 popup-trigger 전체 스타일 재적용
                        fixPopupTriggerStyles();
                    }
                }, 300);

                recordState();
                showToast('HTML 로드 완료!' + (restoredIds.size > 0 ? ` (팝업 ${restoredIds.size}개 복원됨)` : ''));
            };
            reader.readAsText(htmlFile, 'UTF-8');
        }

        // ───────────────────────────────────────────────────────────────────

        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const area = getById('contentArea');
                // contentArea 또는 childArea_* 팝업 패널 내부 선택 모두 처리
                const inMain = area && area.contains(range.commonAncestorContainer);
                const inChild = !inMain && !!range.commonAncestorContainer.closest?.('[id^="childArea_"]');
                if (inMain || inChild) {
                    savedRange = range.cloneRange(); // live range 대신 clone 저장 (prompt 등 포커스 이탈 대비)
                    // 선택된 텍스트의 color를 TXT 피커에 반영
                    const anchor = range.startContainer;
                    const el = anchor.nodeType === 3 ? anchor.parentElement : anchor;
                    const rootArea = inChild ? anchor.closest?.('[id^="childArea_"]') : area;
                    if (el && el !== rootArea) {
                        const computed = window.getComputedStyle(el);
                        const col = computed.color;
                        if (col) {
                            const m = col.match(/\d+/g);
                            if (m && m.length >= 3) {
                                const hex = '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
                                const picker = getById('textColorPicker');
                                if (picker) picker.value = hex;
                            }
                        }
                    }
                }
            }
        });

















        // 레이아웃 규칙 자동 보정: se-contents position:relative, 2번 블록 좌우 패딩
        // AI 가 규칙 누락해도 export 시점에 강제 주입해서 md 기준 충족 보장









        // 기획서 내 bare 이미지 파일명 텍스트를 괄호 마커로 자동 감싸기
        // 예: "img.png"  →  "(img.png)"  — AI가 이미지 마커로 인식하고 runImageMatching이 자산 매칭 가능
        // 이미 괄호/대괄호로 감싸진 경우는 건드리지 않음

        async function generateContent() {
            // [2026-05-27] paste 경로 전처리 — 연속 영상 마커 → 결정론적 그리드 변환.
            //   노션 INGESTION 경로는 build_notion_data.py 가 이미 변환했으므로 마커 사라짐 → no-op.
            //   직접 paste 경로는 INGESTION 우회 → 여기서 변환해야 영상 그리드 결정론 보장.
            // raw HTML <table> 블록은 placeholder 토큰으로 치환되어 _promoPreservedBlocks 에 저장됨.
            resetPromoPreservedBlocks();
            const data = preprocessPasteContent(wrapBareImageFilenames(getById('contentData').value.trim()));
            const style = getById('contentStyle').value.trim();
            // ⚠️ API 키 선검증 — 원고 입력 여부보다 먼저 체크
            const apiKeyEl = getById('apiKeyInput');
            let keyVal = (apiKeyEl.value || '').trim();
            if (!keyVal) {
                try { keyVal = (localStorage.getItem('promo_studio_gemini_api_key') || '').trim(); } catch(e){}
                if (keyVal) apiKeyEl.value = keyVal;
            }
            const effectiveKey = keyVal || apiKey || '';
            if (!effectiveKey || effectiveKey.length < 20) {
                alert('⚠️ Gemini API 키를 먼저 등록하세요.\n\n우측 상단 "API Key" 입력란에 키를 입력해야 콘텐츠를 생성할 수 있습니다.\n키는 AIza 로 시작하는 39자 내외 문자열입니다.');
                apiKeyEl.focus();
                apiKeyEl.style.outline = '2px solid #ef4444';
                setTimeout(() => apiKeyEl.style.outline = '', 3000);
                return;
            }
            if (!data) return showToast('데이터를 입력하세요.');

            recordState();
            getById('contentSpinner').style.display = 'block';
            try {
                let bgColor = getById('bgPicker').value || '#0e0b48';
                const mw = getById('pageWidthInput')?.value || 840;
                // [2026-05-27] dispatcher 적용 — content 기반으로 필요 룰만 묶음
                // [2026-05-28] dispatcher 가 rules/*.md 직접 fetch 로 전환 — masterText 인자 제거
                const _guidelineBundle = buildGuidelineBundle(data);
                const injectedGuideline = _guidelineBundle ? ('\n' + _guidelineBundle) : '';
                const hasRef = !!referenceImageBase64;

                const rv = parseInt(bgColor.slice(1,3),16)||14;
                const gv = parseInt(bgColor.slice(3,5),16)||11;
                const bv = parseInt(bgColor.slice(5,7),16)||72;
                const isDark = isDarkColor(bgColor);
                let textColor   = isDark ? '#f0f0f0' : '#2d2d2d';
                // bgPicker에 textColor 저장 (버튼 등 UI에서 활용)
                const bgPickerEl = getById('bgPicker');
                if (bgPickerEl) bgPickerEl.dataset.text = textColor;
                let subColor    = isDark ? '#a0aec0' : '#4a5568';
                const accentPickerVal = getById('accentPicker')?.value || '';
                let accentColor = (accentPickerVal && accentPickerVal !== '#888888') ? accentPickerVal : '';
                // 밝은 배경에서 accent가 매우 밝아 가독성 문제가 될 때만 살짝 조정 (짙어짐 방지)
                if (!isDark && accentColor) {
                    const acLum = getLuminance(accentColor);
                    if (acLum > 0.72) {
                        // 지나치게 밝은 색(파스텔 계열)만 중간 톤으로 조정: 최대 밝기 0.52까지만
                        const ar=parseInt(accentColor.slice(1,3),16), ag=parseInt(accentColor.slice(3,5),16), ab2=parseInt(accentColor.slice(5,7),16);
                        const r2=ar/255,g2=ag/255,b2=ab2/255;
                        const mx=Math.max(r2,g2,b2),mn=Math.min(r2,g2,b2);
                        let hh=0,ss=0,ll=(mx+mn)/2;
                        if(mx!==mn){const d=mx-mn;ss=ll>0.5?d/(2-mx-mn):d/(mx+mn);switch(mx){case r2:hh=(g2-b2)/d+(g2<b2?6:0);break;case g2:hh=(b2-r2)/d+2;break;default:hh=(r2-g2)/d+4;}hh/=6;}
                        const newL=Math.min(ll,0.52);
                        const q2=newL<0.5?newL*(1+ss):newL+ss-newL*ss;
                        const p2=2*newL-q2;
                        const h2r=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
                        const crr=Math.round(h2r(p2,q2,hh+1/3)*255),crg=Math.round(h2r(p2,q2,hh)*255),crb=Math.round(h2r(p2,q2,hh-1/3)*255);
                        accentColor='#'+[crr,crg,crb].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('');
                    }
                }
                // accent 미설정이면 generatePalette로 세련된 색 자동 생성
                if (!accentColor) {
                    const autoPalette = generatePalette(bgColor);
                    accentColor = autoPalette.accent;
                }

                // 사용자 지정 accent: 밝기 보정만 (채도 부스트 제거 — 원색 방지)
                // generatePalette 결과는 이미 채도 제한됨
                (function clampAccentSat() {
                    const [ah, as, al] = hexToHsl(accentColor);
                    // 채도 0.45~0.70 범위로 제한 (원색 방지, 세련된 톤)
                    const clampedS = Math.min(0.70, Math.max(0.45, as));
                    if (Math.abs(clampedS - as) > 0.01) {
                        accentColor = hslToHex(ah, clampedS, al);
                    }
                })();
                // boostAccentSat 결과를 accentPicker UI에도 반영
                (function syncPickerAfterBoost() {
                    const p = getById('accentPicker');
                    if (p && /^#[0-9a-fA-F]{6}$/.test(accentColor)) {
                        p.value = accentColor;
                        p.style.opacity = '1';
                        const sl = getById('accentSlash');
                        if (sl) sl.style.display = 'none';
                    }
                })();

                // [palette SSOT 2026-05-29] 팔레트 최종 결정은 color-palette.js 의 resolvePalette 단일 함수에서 수행.
                //   (이전엔 agent vs hierarchy 분기·muted·thBg·명도 일치 가드가 여기 인라인으로 흩어져 있었음 → 모듈로 통합.)
                //   agent 팔레트(Gemini Vision)가 bg 와 명도 일관되면 사용, 어긋나면 enforcePaletteHierarchy 로 재도출.
                const _pal = resolvePalette(bgColor, accentColor, {
                    surface: bgPickerEl?.dataset?.agentSurface,
                    text:    bgPickerEl?.dataset?.agentText,
                    sub:     bgPickerEl?.dataset?.agentSub,
                    border:  bgPickerEl?.dataset?.agentBorder,
                });
                bgColor     = _pal.bg;
                accentColor = _pal.accent;
                textColor   = _pal.text;
                subColor    = _pal.sub;
                const surfaceColor = _pal.surface;
                const borderColor  = _pal.border;
                const thBgColor    = _pal.thBg;
                const mutedColor   = _pal.muted;
                // UI picker 동기화 — 사용자가 최종 결정된 색을 시각적으로 확인 가능
                if (bgPickerEl) {
                    bgPickerEl.value = bgColor;
                    bgPickerEl.dataset.text = textColor;
                    bgPickerEl.dataset.sub  = subColor;
                    // 본문 카드와 팝업 박스가 동일 surface/border 톤을 공유하도록 저장
                    bgPickerEl.dataset.surface = surfaceColor;
                    bgPickerEl.dataset.border  = borderColor;
                }
                const _acPickerEl = getById('accentPicker');
                if (_acPickerEl) _acPickerEl.value = accentColor;
                // accent 배경 위 텍스트 색: accent 명도 기반으로 흰/검정 자동 선택
                const accentTextColor = getLuminance(accentColor) > 140 ? '#1a1a1a' : '#ffffff';

                // [2026-05-29] 모듈로 이전한 후처리 함수(video.js/table.js/tab.js/popup-builder.js/...)에 색 변수 전달용 ctx.
                const ctx = { bgColor, surfaceColor, borderColor, thBgColor, mutedColor, textColor, subColor, accentColor, mw };

                const systemPrompt = `[System Prompt: High-End HTML Render Engine v4.0]

# Role
너는 세계 최고 수준의 게임 프로모션 디자이너다. 단순·밀도없는 레이아웃은 FAIL.

---

# [제0원칙 — 원고 텍스트 절대 우선]
- 원고의 모든 문장·단어·숫자·특수문자를 단 한 글자도 바꾸지 말고 그대로 출력.
- 요약·압축·윤문·재해석 절대 금지. 원고에 10줄이면 HTML에도 10줄.
- 없는 내용(버튼·메뉴·푸터·저작권·임의설명·영문 부제목·슬로건) 절대 추가 금지.
- AI가 임의로 만든 영문 텍스트("Game Title", "Special Event" 등) 삽입 즉시 FAIL.
- placeholder 절대 금지. 마지막 문장 누락 여부 반드시 확인.

---

# [절대 금지]
- <!DOCTYPE> <html> <head> <body> <style> 태그 생성 금지. (예외: 팝업 기능 있을 때만 <script> 허용)
- class 없는 <div> 절대 금지. 모든 div는 반드시 class="se-div" 또는 class="se-para-div" 필수.
- 모든 스타일은 인라인 style="" 만 사용.
- display:flex · display:grid · gap 금지.
- ul / ol / li 금지. 목록은 <p> 또는 <br> 사용.
- box-shadow 금지. background 단축 금지 → background-color 사용.
- rgba() 절대 금지. 색상은 반드시 6자리 hex(#rrggbb)만 사용.
- #fff #000 등 3자리 색상 금지 → #ffffff #000000.
- !important 금지.
- max-width에 px 단위 금지 → rem 사용.
- 마크다운 볼드(**텍스트**) 금지 → <p style="font-weight:900;"> 사용.
- 외부 URL <img> 절대 금지.
- 이미지 마커 (item1) (item2) 등이 원고에 명시되지 않으면 <img> 태그 생성 절대 금지.
- AI가 임의로 이미지 플레이스홀더 생성 금지. 원고에 없는 이미지 삽입 즉시 FAIL.
- ❌ **섹션 좌우 2단/3열 구성 절대 금지.** 섹션 카드(se-div)를 display:inline-block;width:48%/49%/30% 로 가로 나란히 배치하는 모든 방식 즉시 FAIL. 모든 섹션은 형제 se-div 로 수직 적층. 비교/대칭 데이터는 <table> 2열로.
- ❌ **번호 배지 불일치 절대 금지.** 번호 달린 섹션은 전부 동일한 원형 배지(①②③ span)로 통일. 일부 섹션만 배지 달고 다른 섹션은 "3.제목" "4. 제목" 텍스트 프리픽스로 쓰는 혼용 즉시 FAIL. 제목 텍스트에서 앞의 N. / N. / N) 숫자 프리픽스 반드시 제거 (배지가 번호 역할).

---



# [텍스트 인라인 스타일 — 절대 준수]
- 모든 <p> 태그에 반드시 color, font-size, line-height 인라인 속성 명시.
- 예시: <p style="color:${textColor};font-size:clamp(0.875rem,1.702vw,1rem);line-height:1.8;margin:0;">
- <span> 태그도 color 속성 필수.
- font-size 없으면 FAIL. line-height 없으면 FAIL. color 없으면 FAIL.
- rem 단위 필수. px 고정값 금지.

# [여백 시스템 — 두 가지 패턴 선택]

## 패턴 A — 박스형 섹션 (기본)
섹션이 카드 형태이고 화면 양쪽 여백이 필요할 때:
- 컨텐츠 래퍼 se-div: padding-left:clamp(16px,3.472vw,40px);padding-right:clamp(16px,3.472vw,40px);padding-top:clamp(24px,3vw,48px);padding-bottom:clamp(24px,3vw,48px);
- 섹션 se-div: 좌우 패딩 없음(이미 래퍼에서 처리), 상하 패딩만 사용

<div class="se-div" style="background-color:${bgColor};padding-top:clamp(24px,3vw,48px);padding-bottom:clamp(24px,3vw,48px);padding-left:clamp(16px,3.472vw,40px);padding-right:clamp(16px,3.472vw,40px);display:block;width:100%;box-sizing:border-box;">
  <div class="se-div" style="background-color:${surfaceColor};border-radius:0.875rem;overflow:hidden;padding:2rem 2rem;margin-bottom:1.5rem;">섹션내용</div>
  <div class="se-div" style="background-color:${surfaceColor};border-radius:0.875rem;overflow:hidden;padding:2rem 2rem;margin-bottom:1.5rem;">섹션내용</div>
</div>

⚠️ **섹션 카드(se-div) border 절대 금지** — 위 예시에서 border:1px solid 없음을 확인. 카드 경계는 ${surfaceColor} 와 ${bgColor} 의 명도 차이만으로 표현. border 추가 시 즉시 FAIL.

## 패턴 B — 풀폭형 섹션
섹션 배경색이 화면 전체 폭으로 채워져야 할 때 (톤온톤 배경색 구분):
- 컨텐츠 래퍼 se-div: padding 없음(0)
- 섹션 se-div: width:100%, 좌우 내부 여백은 padding-left:clamp(16px,3.472vw,40px);padding-right:clamp(16px,3.472vw,40px); 직접 보유

<div class="se-div" style="background-color:${bgColor};margin:0;padding:0;display:block;width:100%;box-sizing:border-box;">
  <div class="se-div" style="background-color:${surfaceColor};width:100%;padding-top:2rem;padding-bottom:2rem;padding-left:clamp(16px,3.472vw,40px);padding-right:clamp(16px,3.472vw,40px);border-top:1px solid ${borderColor};">섹션내용</div>
  <div class="se-div" style="background-color:${bgColor};width:100%;padding-top:2rem;padding-bottom:2rem;padding-left:clamp(16px,3.472vw,40px);padding-right:clamp(16px,3.472vw,40px);border-top:1px solid ${borderColor};">섹션내용</div>
</div>

## 선택 기준
- 섹션이 카드/박스 형태 → 패턴 A
- 섹션 배경이 풀폭으로 채워지고 상단 라인으로 구분 → 패턴 B
- 두 패턴을 한 페이지에 혼용 가능


# [❌ 섹션 좌우 2단/3열 배치 절대 금지]
- 섹션 카드를 가로로 나란히 배치하는 모든 구성 금지. display:inline-block;width:48% / width:49% / width:30% 등으로 섹션 se-div 를 좌우/3열로 놓으면 즉시 FAIL.
- 모든 섹션 카드는 반드시 **형제(sibling) se-div 로 수직 적층**. 짧은 섹션이 3개 연속이어도 세로로 쌓을 것.
- 좌우 대칭/비교형 데이터(기존 vs 변경, 전 vs 후, 스펙 비교 등)는 반드시 <table> 2열 이상으로 표현.
- display:flex, display:grid, gap 역시 기존 규칙대로 사용 시 즉시 FAIL.
- 예외(허용되는 inline-block 용도): 섹션 **내부**에서 배지+텍스트 조합(번호 배지, pill 라벨), 탭 바 버튼 정렬, 아이콘+짧은 라벨 쌍 등 **단일 라인 요소 정렬**에 한해 허용. 섹션 카드 자체를 좌우로 나누는 용도로는 금지.

# [HTML 구조 — 절대 준수]

<div class="se-contents" style="font-family:'Pretendard',sans-serif;font-size:clamp(0.875rem,1.702vw,1rem);line-height:1.8;color:${textColor};letter-spacing:-0.05rem;word-break:keep-all;overflow-wrap:break-word;background-color:transparent;">

  <!-- ⚠️ 사이냅은 .se-contents(자기 클래스) 의 width/max-width 를 제거하지만,
       직계 자식 se-div 인라인 스타일은 건드리지 않음. max-width 는 반드시 직계 자식 각각에.
       내부 래퍼 불필요. -->

  <!-- 1번 블록: 히어로 이미지 (이미지 있을 때만 생성) — max-width 필수 -->
  <div class="se-div" style="width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box;padding:0;line-height:0;font-size:0;display:block;"></div>

  <!-- 2번 블록: 컨텐츠 전체 래퍼 — max-width + position:relative 필수 (팝업 기준점). 좌우 여백 여기서 처리 -->
  <div class="se-div" style="position:relative;width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box;background-color:${bgColor};padding:clamp(24px,3.472vw,50px) clamp(16px,3.472vw,40px);display:block;">
    <!-- 섹션 se-div 자체에 별도 좌우 padding 금지 (2번 블록에서 처리됨) -->
  </div>

</div>

규칙:
- ⚠️ .se-contents 에는 max-width/width 넣지 말 것. 사이냅이 제거함.
- ⚠️ max-width 책임은 .se-contents 직계 자식 se-div 각각. 1번·2번 블록 모두 width:100%;max-width:${mw}px;margin:0 auto;box-sizing:border-box; 필수.
- 1번·2번 블록은 .se-contents 직계 자식. 내부 래퍼 두지 말 것.
- 배경색 ${bgColor}는 2번 블록에만. 임의 변경 금지.
- 팝업/딤드 absolute 기준점: 2번 블록 (position:relative + max-width). closest('div[style*=max-width]') 로 탐색.

---

# [컬러 시스템 — 5단계 팔레트]
제공 변수: ${bgColor}(배경) / ${surfaceColor}(서피스 기준) / ${accentColor}(포인트) / ${textColor}(본문) / ${subColor}(서브) / ${borderColor}(테두리) / ${mutedColor}(부가정보 카드)

**섹션 배경 4단계 변주** — 단조로운 동일 배경 반복 절대 금지. 콘텐츠 비중에 따라 선택:
- BG-0 (베이스): ${bgColor} — 전체 래퍼·가장 넓은 영역
- BG-1 (서피스): ${surfaceColor} — 일반 카드·기본 섹션 (bg 보다 밝아 elevation)
- BG-2 (액센트 틴트): accent+bg 혼합 hex — 중요 섹션·CTA 영역에 사용. 계산법: accentColor의 R·G·B 각각 20% + bgColor의 R·G·B 80% 혼합한 6자리 hex. 예) accent=#5b21b6, bg=#0f172a → tint=#1c1539
- BG-3 (뮤티드): ${mutedColor} — **유의사항·주의사항·참고·안내·하단 부가정보** 카드용. bg < muted < surface 위계 (bg 보다 살짝 밝게, surface 보다는 어둡게). bg 와 동일 hue/채도, 명도만 +0.03(라이트) / +0.05(다크). 부가 정보가 본문보다 강조되면 안 되므로, 절대로 ${surfaceColor}(메인 카드) 사용 금지.

**⚠️ 카드 bg 선택 기준 — 위반 시 FAIL:**
- 메인 콘텐츠 (이벤트 내용, 보상, 참여방법 등) → BG-1 (${surfaceColor})
- 핵심 강조 (CTA, 핵심 보상 강조) → BG-2 (액센트 틴트)
- **유의사항·주의사항·참고·안내·면책·기타 보조 정보 → 반드시 BG-3 (${mutedColor})**. surfaceColor 로 감싸면 시각 위계 역전 → FAIL.

**액센트 포인트 규칙**:
- ${accentColor}: 번호아이콘·CTA버튼·헤더 밑줄·섹션 제목에만 한정
- 강조 border: border-left:0.25rem solid ${accentColor} **만** 허용. border-top accent 절대 금지 (섹션 간 일관성 깨짐)
- 모든 텍스트 요소(p span td th h1~h6)에 color 속성 반드시 명시

---

# [타이포그래피 — 5단계 계층]
- **대제목** (이벤트명·페이지 타이틀): font-size:clamp(1.5rem,3vw,2rem);font-weight:900;line-height:1.3;color:${accentColor};letter-spacing:-0.03em;
- **섹션 제목** (■ ▶ 번호 달린 소제목): font-size:clamp(1.125rem,2.2vw,1.375rem);font-weight:900;line-height:1.4;color:${accentColor};
- **서브 레이블** (기간·태그·배지 텍스트): font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${subColor};
- **본문**: font-size:clamp(0.875rem,1.702vw,1rem);font-weight:400;line-height:1.8;color:${textColor};
- **수치·날짜 강조**: font-size:clamp(1.5rem,3vw,2.25rem);font-weight:900;line-height:1.2;color:${accentColor};
- 모든 <p> 태그: margin:0; line-height:1.8;

## ⚠️ 대제목 자동 승격 절대 금지 (위반 시 즉시 FAIL)
- **AI 는 원고 첫 문장을 절대로 "대제목" 으로 키우지 말 것.** 첫 문장이든 둘째 문장이든 마침표(.)로 끝나는 서술형 문장은 무조건 본문 (font-size:clamp(0.875rem,1.702vw,1rem); font-weight:400).
- ❌ **금지 패턴 (이런 텍스트를 1.5rem+ 크기로 키우면 FAIL):**
  - "~기념하여...", "~안내드립니다", "~전해드립니다", "~감사드립니다"
  - "~소개합니다", "~진행됩니다", "~시작합니다", "~함께해 주신..."
  - "오랜 기간..."  "이벤트 기간 동안..."  같은 서술형 도입부
  - 일반적으로 마침표로 끝나는 완전한 문장은 모두 본문
- **대제목 허용 조건은 단 하나**: 원고에 짧은 명사구(예: "○○ 시즌 이벤트", "겨울 시즌 안내")가 **단독 라인**으로 등장하고 마침표 없으며 문장 형태가 아닐 때만. 그 외 모든 경우는 본문.
- **font-weight:900 / font-size 1.25rem 이상 / color:${accentColor} 조합 적용 시 매우 엄격히** — 이 조합은 시각 위계 최상단 강조라 잘못 적용하면 페이지 위계 망가짐.

## ⚠️ 수치·날짜 강조 신중 사용 (위반 시 FAIL)
- "수치·날짜 강조" (clamp(1.5rem,3vw,2.25rem)) 는 **단독 강조 박스 내 핵심 보상 수량** 같은 1-2 단어 숫자에만 적용. 예: "100,000G", "50%"
- 긴 날짜 범위 문장("2025년 12월 24일 ~ 2026년 1월 22일")에는 절대 사용 금지. 본문 사이즈로 표시.
- 이벤트 기간 / 보상 수령 기간 / 정기점검 일정 같은 **시간/기간 안내문**은 본문 또는 살짝 강조(font-weight:700, 본문 사이즈)만 허용. 절대 1.5rem+ 로 키우지 말 것.

---

# [고밀도 디자인 원칙 — 반드시 준수]
1. **정보 밀도**: 빈 공간 낭비 금지. 텍스트가 3줄 이하인 단독 섹션은 인접 섹션과 **합칠 것** (좌우 2단 배치로 해결 금지 — 수직 적층 유지).
2. **시각 계층**: 모든 섹션에 ① 배경색 변주 ② 상단/좌측 accent 라인 ③ 타이포 대비 중 최소 1개 적용.
3. **리듬감**: BG-0 → BG-1 → BG-2 → BG-1 순으로 교차. 같은 배경 3회 연속 금지.
4. **강조 포인트**: 각 섹션에서 핵심 수치·날짜·보상 아이템은 반드시 ${accentColor}로 시각적 강조.
5. **구분 처리**: 섹션 간 간격만 사용. 카드 상단 accent 바 삽입 절대 금지.

---

# [간격 처리 규칙 — 단일 기준]
- 요소 사이 간격: 반드시 <p style="height:Npx;margin:0;"></p> 태그로만 처리.
  - 극소: height:8px / 소: height:16px / 중: height:32px / 대: height:48px / 특대: height:64px
- margin 사용 금지. <br> 단독 사용 금지. <p>&nbsp;</p> 금지.
- 모든 <p> 태그: margin:0; line-height:1.8;

## ⚠️ 간격 트리거-액션 매핑 (위반 시 FAIL)

다음 표 그대로 적용. AI 가 자체 판단으로 다른 값 emit 시 즉시 FAIL.

| 트리거 (위 요소 → 아래 요소) | 강제 간격 |
|---|---|
| 섹션 카드(se-div bg) → 다음 섹션 카드 | **소 16px ~ 중 24~32px** (이전 표준 유지) |
| 섹션 타이틀 (번호 배지 행) → 본문 시작 | **중 32px** |
| 소제목(■ ▶ 굵은 텍스트) → 다음 콘텐츠(테이블/본문) | **중 32px** |
| 이전 콘텐츠(테이블/본문) → 다음 소제목 | **대 48px** (위로 호흡 더 크게) |
| 테이블 → 캡션("*~", "※~") | **소 16px** |
| 캡션 → 다음 소제목/콘텐츠 | **대 48px** |
| 테이블 → 다음 테이블 | **중 32px** |
| 텍스트 단락 → 다음 텍스트 단락 | **소 16px** |
| 본문 → 다음 테이블 | **중 32px** |
| 테이블 → 다음 본문 | **중 32px** |

**핵심 원칙:**
- 같은 그룹 안(헤더-내용 / 테이블-캡션) = 좁게 (16px ~ 32px)
- 다른 그룹 사이(소제목 위 / 섹션 사이) = 시원하게 (48px ~ 64px)
- 의심 시 **더 크게** — 답답한 것보다 시원한 게 항상 낫다

❌ **금지 패턴:**
- 소제목 위에 8px 간격 → 즉시 FAIL (소제목이 위 콘텐츠에 붙어버림)
- 테이블 직후 본문이 8px 이하로 붙음 → 즉시 FAIL
- **섹션 카드 사이는 너무 멀어도 흐름 끊김** — 16~32px 범위 유지. 48px 이상은 카드가 따로 노는 느낌.

---

# [섹션 구조 — 고밀도 패턴]
- 모든 내부 div에 class="se-div" 필수. class 없는 div 절대 금지.
- 테이블은 섹션 se-div 안에 직접 배치. 추가 래퍼 div 금지.
- 위 [여백 시스템] 패턴 A 또는 B 중 하나를 선택해서 사용.
- 패턴 A 카드: border-radius:0.875rem; **border 금지** — 배경색 차이로만 경계. 상단 accent 바 절대 금지.
- 패턴 B 풀폭: 배경색 차이로만 구분. border-top accent 라인 금지 (일관성 위반).
- **⚠️ 절대 규칙: 하나의 콘텐츠 내에서 모든 섹션은 반드시 동일한 디자인 패턴(A 또는 B)만 사용. 섹션마다 다른 패턴(예: 어떤 섹션은 카드형, 다른 섹션은 border-left 액센트)을 혼합하면 FAIL.**
- border-left 액센트 라인은 단독 사용 금지. 패턴 A의 카드 border 안에서만 사용 가능.
- **카드 상단 accent 바(height:0.1875rem 같은 얇은 라인 div) 생성 절대 금지. 사용자 요청으로 제거됨.**

---

# [이미지 규칙]
- <img> 필수 style: max-width:100%;height:auto;display:block;margin:0 auto;
- width · height 고정값 금지. object-fit · object-position 금지.
- img를 div·span으로 감싸지 말 것. 단독 사용.
- position:absolute/fixed/relative · float · z-index 금지.
- 이미지 블록 se-div: style="margin:0;padding:0;display:block;line-height:0;font-size:0;"
- 원고에 (item_01) (img1) 등 이미지 마커가 있으면 반드시 그 위치에 텍스트 그대로 보존. 예: <p style="...">(item_01)</p> — img 태그로 바꾸지 말 것. 시스템이 자동 매칭함.
- 이미지 마커를 설명 텍스트로 바꾸거나 삭제하면 즉시 FAIL.

---

# [테이블 규칙 — 절대 준수]
- 테이블 최상단에 빈 행 생성 절대 금지. 즉시 FAIL.
- <thead>나 <tbody> 시작 전에 빈 행 삽입 금지.
- 데이터가 없는 행 생성 금지.
- 이미지 마커가 있는 경우에만 이미지 셀 생성. 없으면 텍스트 셀만.
- **테이블 구조 필수 패턴** (반드시 이 순서):

<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;">
  <thead>
    <tr>
      <th style="padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};font-weight:800;color:${textColor};text-align:center;background-color:${thBgColor};word-break:keep-all;overflow-wrap:break-word;vertical-align:middle;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:clamp(0.8125rem,1.5vw,0.9375rem);">헤더1</th>
      <th style="padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};font-weight:800;color:${textColor};text-align:center;background-color:${thBgColor};word-break:keep-all;overflow-wrap:break-word;vertical-align:middle;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:clamp(0.8125rem,1.5vw,0.9375rem);">헤더2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};color:${subColor};text-align:center;vertical-align:middle;word-break:keep-all;overflow-wrap:break-word;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:clamp(0.8125rem,1.5vw,0.9375rem);background-color:transparent;">값1</td>
      <td style="padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};color:${subColor};text-align:center;vertical-align:middle;word-break:keep-all;overflow-wrap:break-word;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:clamp(0.8125rem,1.5vw,0.9375rem);background-color:transparent;">값2</td>
    </tr>
  </tbody>
</table>

- <thead> 첫 번째 <tr>은 반드시 헤더 텍스트가 있어야 함. 빈 <tr> 절대 금지.
- <tbody>에는 데이터 행만 포함. 빈 행 절대 금지.
- 표 데이터는 반드시 <table>. div 대체 절대 금지.
- 테이블은 섹션 se-div 안에 직접 배치. **별도 래퍼 div 추가 금지.**
- table: style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;"
- th: style="padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};font-weight:800;color:${textColor};text-align:center;background-color:${thBgColor};word-break:keep-all;overflow-wrap:break-word;vertical-align:middle;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:inherit;"
- td: style="padding:1rem 1rem;border:none;border-bottom:1px solid ${borderColor};color:${subColor};text-align:center;vertical-align:middle;word-break:keep-all;overflow-wrap:break-word;line-height:1.4;box-sizing:border-box;min-width:2.5rem;font-size:inherit;background-color:transparent;"
- ⚠️ **세로 보더(border-left/right) 절대 금지.** 가로 라인(border-bottom) 만 사용. 마지막 데이터 행은 border-bottom:none.
- ⚠️ 헤더 굵은 강조선(border-bottom:2px solid accentColor) 절대 금지 — 헤더 bg(thBgColor)가 이미 강조 역할. 굵은 선 추가 시 즉시 FAIL.
- **⚠️ 세로줄(좌우 border) 금지.** 테이블은 오직 가로 라인(border-top/border-bottom)만으로 행 구분. td/th 에 border-left/right 추가하면 즉시 FAIL.
- **⚠️ \`<tr>\` 에 인라인 style 금지** — background-color 나 border 를 \`<tr>\` 에 넣지 말 것. 색/선은 \`<th>\` / \`<td>\` 에만. \`<tr>\` 에 넣으면 렌더러별로 이중선/얼룩 발생 → FAIL.
- ⚠️ thead 없는 테이블도 첫 행에 border-top 추가 금지 — 외곽 라인 없음 정책 (헤더 bg 가 가시성 담당).
- ⚠️ 테이블 자손 텍스트 요소 인라인 color 필수 (상속 신뢰 금지): th 안 자손은 color:${textColor} (헤더 crisp), td 안 자손은 color:${subColor} (본문 dim — 위계 분리). 생략 시 다운로드 HTML 단독 뷰에서 검정으로 떨어져 안 보이는 사고 발생 → 즉시 FAIL.
- 짝수 행 배경색 구분(스트라이프) 절대 금지. tbody td 는 모두 \`background-color:transparent\` 통일.
- 모든 th·td에 width% 명시. colspan/rowspan 적극 활용.
- 이미지 마커 (item1) 있을 때만 이미지 셀 생성. 마커 없으면 이미지 셀 생성 금지.
- 데이터 없는 빈 행 생성 금지.

---

# [버튼 — 키워드 없으면 생성 금지]

## 괄호 개수에 따른 배치 구분 — 반드시 준수
- [대버튼] (대괄호 1쌍): 현재 섹션 카드 내부에 배치. <div class="se-div" style="padding:0px 0px 0px 0px;margin:0;text-align:center;"> 래퍼 안에 삽입.
- [[대버튼]] (대괄호 2쌍): 섹션 카드 외부에 독립 배치. 어떤 se-div에도 속하지 않으며, 섹션과 섹션 사이 또는 전체 콘텐츠 끝에 단독 블록으로 위치. 래퍼 div 사용 동일.
- [[중버튼]] / [[소버튼]]도 동일 규칙: 괄호 2쌍이면 섹션 외부 독립 배치.

## 버튼 스타일
- [대버튼]: <div class="se-div" style="padding:0px 0px 0px 0px;margin:0;text-align:center;"> 래퍼 안에 <a> 또는 <button> 배치. 래퍼 div에는 반드시 padding:0 — 패딩은 버튼 요소에만 적용.
  버튼 스타일: display:block;width:100%;padding:1.5rem 0;font-weight:800;border-radius:0.75rem;background-color:${accentColor};color:${accentTextColor};text-align:center;text-decoration:none;font-size:inherit;border:none;cursor:pointer;box-sizing:border-box;
- [중버튼]: display:inline-block;padding:0.5rem 3.25rem;font-weight:700;border-radius:2rem;border:2px solid ${accentColor};color:${accentColor};text-decoration:none;
- [소버튼]: display:inline-block;padding:0.625rem 1.5rem;font-size:inherit;border-radius:0.5rem;text-decoration:none;

---

# [탭 시스템]
- 탭 버튼 텍스트에 "tab01" 등 지시어 노출 금지. 원고의 실제 탭 제목만.
- <a href="#tab01"> ↔ <div class="se-div" id="tab01"> 1:1 매칭 필수.
- 탭 바 컨테이너: display:block;width:100%;text-align:center;padding:0.5rem 0;
- 탭 버튼(a 태그): display:inline-block;padding:0.625rem 1.5rem;margin:0.25rem;border-radius:2rem;font-weight:700;text-decoration:none;word-break:keep-all;white-space:nowrap;
- 활성 탭: background-color:${accentColor};color:${accentTextColor};
- 비활성 탭: background-color:${surfaceColor};color:${subColor};
- 탭 버튼은 반드시 면(fill) 방식. underline/border-bottom 방식 절대 금지.
- 각 탭 섹션 se-div에 id="tab01" 부여. 각 섹션 상단에 탭 바 반복.
- Tab01. / Tab02. 텍스트는 HTML에 절대 노출 금지.

---

# [팝업 시스템 — 반드시 준수]
원고에 [팝업1], [팝업2] 등 마커가 있으면 아래 두 가지를 반드시 함께 생성한다.

## ⛔ 절대 금지 — 팝업 콘텐츠 배치 4가지 FAIL 조건 (위반 시 즉시 결과물 폐기)

### FAIL-1. <button> 안에 콘텐츠 자식 요소 박기 금지
- ❌ <button class="popup-trigger" data-popup="popup_N"><table>...</table><p>...</p></button> ← 절대 금지
- ✅ <button class="popup-trigger" data-popup="popup_N" style="...">+</button> ← button textContent 는 '+' 한 글자만
- button 안에 <table>/<div>/<p>/<img>/<ul> 등 자식 요소 1개라도 있으면 즉시 FAIL.

### FAIL-2. .se-contents 외부에 콘텐츠 떨어뜨리기 금지
- ❌ </div></div>\n<table>...</table> (se-contents 닫힘 뒤 본문 외부에 콘텐츠)
- ✅ 모든 콘텐츠는 .se-contents 안. 단 se-popup-content 블록 (data-popup + display:none) 만 외부 허용.
- 출력 끝부분에 .se-contents 닫는 </div> 이후로는 se-popup-content 블록만 등장 가능.

### FAIL-3. 본문 영역에 popup-only 콘텐츠 노출 금지
- ❌ section card 안에 popup_N 트리거 (+) 있는데, popup_N 의 콘텐츠가 본문 다른 위치에 별도 보임
- ✅ popup 콘텐츠는 오직 se-popup-content 블록 안 (display:none). 본문 영역 노출 0.
- 본문 표 + 팝업 표 데이터가 의도적으로 동일한 경우만 양쪽 보존 허용. 그 외에는 본문 노출 금지.

### FAIL-4. [팝업N] 마커 있는데 콘텐츠 누락 금지
- ❌ [팝업N] 마커는 봤지만 se-popup-content 블록 만들지 않음. 클릭해도 아무것도 안 열림.
- ✅ [팝업N] 마커가 있으면 반드시 (a) 트리거 button + (b) se-popup-content 블록 둘 다 생성.
- 원고에 popup 콘텐츠가 없으면 트리거 button 도 만들지 말 것.

## 1. 트리거 버튼 (본문 안에 삽입)
마커 위치에 아래 버튼을 삽입:
<button class="popup-trigger" data-popup="popup_N" style="display:inline-block;width:1.375rem;height:1.375rem;line-height:1;border-radius:50%;background-color:#7c3aed;color:#ffffff;font-size:0.75rem;font-weight:900;border:none;cursor:pointer;vertical-align:middle;margin:0 0.25rem;text-align:center;">+</button>
⚠️ button 의 textContent 는 '+' 단 한 글자. 안에 <table>/<div>/<p>/<img> 자식 요소 절대 금지 (FAIL-1).

## 2. 팝업 내용 블록 (HTML 최하단에 모아서 출력)
팝업 트리거에 대응하는 내용을 원고에서 파악해서 아래 형식으로 HTML 최하단에 출력:
<div class="se-popup-content" data-popup="popup_N" style="display:none;">
  [해당 팝업에 들어갈 원고 내용을 HTML로 작성]
</div>
⚠️ se-popup-content 블록은 반드시 .se-contents 닫는 </div> **이후** 에 배치. 본문 영역 안에는 두지 말 것.

규칙:
- 팝업 내용 블록은 반드시 class="se-popup-content" data-popup="popup_N" 속성 필수.
- style="display:none;" 필수.
- 내용은 원고에서 해당 팝업에 속하는 텍스트/표/목록을 그대로 HTML로 작성.
- [팝업N] 마커 자체는 최종 HTML에서 삭제.
- [툴팁N] 마커 사용 금지. 반드시 [팝업N]으로 대체.
- 팝업 내용 블록 안에 닫기 버튼(×, ✕, 닫기, Close 등) 절대 금지. 닫기 기능은 시스템이 자동 추가.
- <script> 태그: 슬라이드·팝업 기능 있을 때만 허용.

## ⚠️ 팝업 콘텐츠 placeholder 절대 금지 (위반 시 즉시 FAIL)
원고에 [팝업N] 으로 묶인 영역의 모든 줄·셀·데이터를 **단 한 글자도 빠뜨리지 말고 그대로** se-popup-content div 안에 HTML 로 옮긴다.

❌ **금지 표현 (이런 문자열 emit 즉시 FAIL):**
- "...본문 내용 생략 없이 전체 보존..."
- "...상세 내용..."
- "(상세 데이터 표 형식 유지)"
- "(원고와 동일)"
- "[팝업N의 내용]"
- "..." 만 있는 셀
- "기타 등등", "이하 동일", "etc."
- 원고에 없는 **요약·축약·플레이스홀더·설명문구·메타지시어** 일체

❌ **흔한 실수 패턴:**
- 본문에 같은 표가 있다고 팝업에서 "표 형식 유지" 같은 안내문구로 대체 → FAIL. 본문과 팝업이 같은 데이터여도 **양쪽 모두 풀 데이터로 채워야 함.**
- 행 수가 많다고 첫 1~2행만 쓰고 "..." 처리 → FAIL. 7행이면 7행 다.
- 헤더만 쓰고 데이터 행 생략 → FAIL.

✅ **올바른 처리:** 원고의 [팝업2] 영역에 "월~일 7행 × 3열" 표가 있으면, se-popup-content 안에도 정확히 동일한 7행 × 3열 표를 인라인 스타일까지 풀로 작성. 본문에 이미 같은 표가 있어도 무관 — 팝업 안에 풀 카피본 필수.

---

# [레이아웃 패턴 — 섹션마다 선택 적용]
A: **액센트 스트라이프** — border-left:0.3125rem solid ${accentColor};padding-left:1.25rem; + 본문 블록
B: ❌ **섹션 좌우 2단 금지** — 섹션 카드를 좌우 나란히 배치하는 모든 구성 금지. 비교/대칭 데이터는 반드시 <table> 2열로.
C: **원형 번호 타임라인** — circle 2rem, background-color:${accentColor}, color:${accentTextColor}, font-weight:900; display:inline-block;vertical-align:top;margin-right:0.875rem;
D: **pill 배지 + 본문** — <p style="display:inline-block;background-color:${accentColor};color:${accentTextColor};border-radius:1.25rem;padding:0.1875rem 0.875rem;font-size:0.75rem;font-weight:900;"> 배지 텍스트 </p>
E: **하이라이트 띠** — BG-2(액센트틴트) 배경, border-left:0.25rem solid ${accentColor}, border-radius:0.75rem, padding:1.25rem 1.5rem
F: **아이콘 리스트** — border-bottom:1px solid ${borderColor};padding:0.875rem 0; 반복 구조
G: **카드 스택** — border-radius:0.875rem; **border 금지** (배경색 차이로만 경계, 상단 accent 바 제거됨)
H: **교차 배경 행** — 홀/짝 행 background-color: ${surfaceColor} / ${bgColor} 교차
I: ❌ **플로팅 배지 카드 패턴 사용 금지** — border-top accent 가 들어가서 다른 카드와 일관성 깨짐. 강조가 필요하면 D(pill 배지) 또는 E(하이라이트 띠) 사용.
J: ❌ **3열 카드 금지** — 섹션 카드를 가로 3열로 배치하는 모든 구성 금지. 세로 적층만 허용.
K: **번호 강조 표** — 좌측 첫 열 background-color:BG-2(액센트틴트), font-weight:900, color:${accentColor}
L: **구분선 리스트** — <p style="border-bottom:1px solid ${borderColor};padding:0.75rem 0;color:${textColor};"> 반복

---

# [에디터 파서 우회 — 절대 준수]
- class 없는 <div> 절대 금지. 에디터가 삭제함.
- 컨테이너·그룹 필요 시: <div class="se-div"> 또는 <div class="se-para-div"> 만 허용.
- 가로 정렬: <div class="se-para-div"> 부모 + 내부 <div class="se-div" style="display:inline-block;vertical-align:middle;"> 조합.
- display:flex · display:grid 금지. <table>은 데이터·비교 레이아웃에 허용 (레이아웃 전용 남용 금지).

---

# [섹션 분리 — 계층 구조]
- 논리적으로 같은 주제 → 하나의 카드(se-div) 안에 묶기.
- 다른 성격(기간 vs 참여방법 vs 보상목록)일 때만 별도 카드로 분리.
- 소제목(■·▶·번호)이 하나의 주제 아래 있으면 카드 안에서 소제목으로 처리. 별도 카드 금지.
- 계층: se-contents > 대카드(se-div) > 소섹션(내부 se-div) — 과도한 분리 FAIL.
- 모든 섹션은 반드시 형제(Sibling)로 수직 적층. 중첩(Nesting) 금지.

## ⚠️ 섹션 카드 내부 카드인카드 절대 금지 (위반 시 즉시 FAIL)
섹션 카드(${surfaceColor} bg 가진 se-div) **안에서** 또 다른 background-color / border:1px solid / border-radius 가진 se-div 로 콘텐츠를 감싸는 행위 금지. 카드 안에 또 카드 들어가면 시각 위계 무너지고 섹션마다 일관성 깨짐.

❌ **잘못된 예 (FAIL):** 섹션 se-div 안에 background-color 또는 border-radius 가진 se-div 가 또 등장 — 두번째 wrapper 가 새 카드로 인식됨.

✅ **올바른 예:** 섹션 se-div 안의 내부 se-div 는 padding, margin-bottom, border-top 만 사용. background-color / border:1px solid / border-radius 일체 금지.

**룰:** 섹션 카드 안의 내부 se-div 는 **레이아웃 그루핑 전용** (margin, padding, border-top 만 허용). background-color, border:1px solid, border-radius 가 있는 내부 se-div 는 새 카드로 인식되어 FAIL.

---

# [메타 클리닝]
- tab01 tab02 [대버튼] [중버튼] [소버튼] 등 지시어는 최종 HTML에서 삭제.
- [팝업N] 마커는 삭제 금지 — 반드시 위 [팝업 시스템] 규칙에 따라 트리거 버튼으로 변환하고 se-popup-content 블록을 생성해야 함.

${injectedGuideline}`;

                const stylePreserve = getById('stylePreserveCheck')?.checked;
                let fixedGuide;

                if (stylePreserve) {
                    const fp = extractStyleFingerprint();
                    if (fp) {
                        fixedGuide = '[\uc2a4\ud0c0\uc77c \uc720\uc9c0 \ubaa8\ub4dc] \uc544\ub798 \uae30\uc874 \ub514\uc790\uc778 \uc2a4\ud0c0\uc77c\uc744 100% \ub3d9\uc77c\ud558\uac8c \uc720\uc9c0\ud558\uba74\uc11c \ub0b4\uc6a9\ub9cc \uc0c8\ub85c \uc791\uc131\ud558\ub77c. \ub808\uc774\uc544\uc6c3 \uad6c\uc870, \uc0c9\uc0c1, \ud3f0\ud2b8 \ud06c\uae30, \uc5ec\ubc31, \uce74\ub4dc \ud615\ud0dc\ub97c \uadf8\ub300\ub85c \ubcf5\uc81c\ud574\ub77c.\n'
                            + '\uae30\uc874 \uc0c9\uc0c1 \ud314\ub808\ud2b8: ' + fp.colors + '\n'
                            + '\uae30\uc874 border-radius \ud328\ud134: ' + fp.radii + '\n'
                            + '\uae30\uc874 padding \ud328\ud134: ' + fp.paddings + '\n'
                            + '\uae30\uc874 font-size \ud328\ud134: ' + fp.fontSizes + '\n'
                            + '\uae30\uc874 font-weight \ud328\ud134: ' + fp.fontWeights + '\n'
                            + '\uae30\uc874 \uc139\uc158 \uc218: ' + fp.sectionCount + '\n'
                            + '\uae30\uc874 \uc139\uc158 \uc2a4\ud0c0\uc77c \uc0d8\ud50c:\n' + fp.sectionStyles + '\n'
                            + (style ? '\ucd94\uac00 \uc2a4\ud0c0\uc77c \uc694\uccad: ' + style + '\n' : '')
                            + '\ucf58\ud150\uce20 \uc720\uc2e4 \uc808\ub300 \uae08\uc9c0.';
                        showToast('\uc2a4\ud0c0\uc77c \uc9c0\ubb38 \ucd94\ucd9c \uc644\ub8cc \u2014 \uc2a4\ud0c0\uc77c \uc720\uc9c0 \ubaa8\ub4dc\ub85c \uc0dd\uc131\ud569\ub2c8\ub2e4.');
                    } else {
                        fixedGuide = '[\ub514\uc790\uc778 \uc9c0\uc2dc] \ubc00\ub3c4\uc788\ub294 \uace0\ud004\ub9ac\ud2f0 CSS. \ub2e4\uc591\ud55c \ub808\uc774\uc544\uc6c3(A~K \ud328\ud134 \ub85c\ud14c\uc774\uc158). \ub3d9\uc77c \uc131\uaca9 \uc139\uc158 \uc77c\uad00\uc131 \uc720\uc9c0. \ucf58\ud150\uce20 \uc720\uc2e4 \uc808\ub300 \uae08\uc9c0.'
                            + (style ? ' \ucd94\uac00\uc2a4\ud0c0\uc77c: ' + style : '');
                        showToast('\uae30\uc874 HTML\uc774 \uc5c6\uc5b4 \uc77c\ubc18 \ubaa8\ub4dc\ub85c \uc0dd\uc131\ud569\ub2c8\ub2e4.');
                    }
                } else {
                    fixedGuide = '【디자인 지시】 밀도있는 고퀄리티 CSS. 다양한 레이아웃(A~K 패턴 로테이션). 동일 성격 섹션 일관성 유지. 콘텐츠 유실 절대 금지.'
                        + (style ? ' 추가스타일: ' + style : '')
                        + (hasRef ? '\n\n★ Style Guide 이미지가 첨부되었습니다. 이 이미지의 색상 팔레트, 폰트 스타일, 디자인 분위기, 레이아웃 패턴을 최우선으로 반영하세요. 이미지에서 추출한 accent 색상을 ${accentColor} 대신 사용하세요.' : '');
                }

                const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONTENT_MODEL}:generateContent`;

                // Style Guide 이미지가 있으면 컨텐츠 생성에도 함께 전달
                // [2026-05-27] placeholder 토큰 보존 명령 — 원고 안 `[[PROMO_PRESERVE_N]]` 토큰은
                //   영상/표 블록의 자리표시자. Gemini 가 그대로 옮겨야 post-process 가 raw HTML 로 복원.
                const _hasPreserveTokens = _promoPreservedBlocks.length > 0;
                const _preserveInstruction = _hasPreserveTokens
                    ? `6. ⛔ **원고에 \`[[PROMO_PRESERVE_N]]\` 형태의 토큰이 ${_promoPreservedBlocks.length}개 있음.** 각 토큰은 영상 그리드/표 블록(영상 4~6개 + 라벨)의 자리표시자다. 절대 준수:
   (a) 토큰 텍스트를 그대로 한 글자도 빠뜨리지 말고 출력. 토큰 자체에 손대지 말 것.
   (b) **토큰 자리에 라벨/표/콘텐츠를 임의로 추가/추정하지 말 것.** 토큰이 무엇을 나타내는지 추측해서 라벨 행을 만들거나, 미리보기 표를 다시 그리거나, 영상 placeholder 박스를 만들면 즉시 FAIL — 시스템이 토큰을 영상 + 라벨 풀세트로 자동 복원하므로 AI 는 토큰 텍스트 외에는 아무것도 추가할 필요 없음.
   (c) 토큰을 wrapper div 안에 넣지 말 것. 토큰만 단독 라인으로 두면 시스템이 mutedColor bg 콜아웃 박스로 wrap.
   (d) 토큰은 의미상 가장 가까운 섹션 직후 (해당 섹션 카드 닫는 \`</div>\` 바로 다음 줄) 에 배치 — 그러면 시스템이 그 섹션 안으로 흡수.
   (e) 토큰 누락 또는 토큰 주변 임의 콘텐츠 추가 시 영상 미노출 + 중복 노출 → 즉시 FAIL.\n`
                    : '';
                // [2026-05-30] 문서 구조 결정론 지시 — ■ 소제목 vs N. 번호 섹션 계층 오해 방지.
                //   원고는 안 건드리고, 구조만 분석해 "배지 섹션/소제목" 을 명시 enumerate 하여 주입.
                const _structureDirective = (typeof buildStructureDirective === 'function') ? buildStructureDirective(data) : '';
                const contentParts = [{ text:
                    '[HTML 변환 요청]\n\n' +
                    (style ? '【사용자 디자인 스타일 요청 — 최우선 반영】\n' + style + '\n\n' : '') +
                    '★ 필수 준수 ★\n' +
                    '1. 배경색 ' + bgColor + ' 는 이미 지정된 값. 절대 바꾸지 말 것.\n' +
                    '2. 인라인 style 속성만, display:flex/grid 절대 금지\n' +
                    '3. 원고 텍스트 100% 보존 — 원고에 없는 내용 절대 생성 금지\n' +
                    '4. <img> 태그에 외부 URL(http://, https://) 절대 금지. 이미지 마커 (item1) 등이 없으면 img 태그 생성 금지.\n' +
                    '5. 테이블 생성 시 **빈 헤더 행 절대 금지**. <thead><tr><th></th><th></th></tr></thead> 같은 형태 금지. 헤더가 없으면 <thead> 자체를 생성하지 말 것. 마크다운 `| | |` 같은 더미 헤더 행도 HTML 로 변환 시 제거.\n' +
                    _preserveInstruction +
                    (_structureDirective ? '\n' + _structureDirective + '\n' : '') +
                    '\n=== 원고 시작 ===\n' + data + '\n=== 원고 끝 ===\n\n' + fixedGuide
                }];
                if (referenceImageBase64) {
                    const refMime = getMimeType(referenceImageBase64);
                    contentParts.push({ inlineData: { mimeType: refMime, data: referenceImageBase64.split(',')[1] } });
                }

                const res = await apiFetch(url, {
                    method: 'POST',
                    body: JSON.stringify({
                        contents: [{ parts: contentParts }],
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        generationConfig: { temperature: 1.0, maxOutputTokens: 65536 }
                    })
                });

                const fr = res.candidates?.[0]?.finishReason || '';
                let raw = res.candidates?.[0]?.content?.parts?.[0]?.text || '';
                console.log('[CG] finishReason:', fr, 'len:', raw.length);
                if (!raw) throw new Error('\uc751\ub2f5 \uc5c6\uc74c');

                if (fr === 'MAX_TOKENS') {
                    showToast('\uc774\uc5b4\uc11c \uc0dd\uc131 \uc911...');
                    const r2 = await apiFetch(url, {
                        method: 'POST',
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: '\uc774 HTML\uc744 \uc798\ub9b0 \ubd80\ubd84\ubd80\ud130 \uc774\uc5b4\uc11c \uc644\uc131\ud574\uc918. HTML \ucf54\ub4dc\ub9cc:\n\n' + raw.slice(-1200) }] }],
                            systemInstruction: { parts: [{ text: 'HTML \ucf54\ub4dc\ub9cc \ucd9c\ub825. \uc774\uc5b4\uc11c \uc644\uc131.' }] },
                            generationConfig: { temperature: 0.3 }
                        })
                    });
                    const raw2 = r2.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    console.log('[CG] 2nd len:', raw2.length);
                    if (raw2) raw += raw2;
                }

                let out = raw.replace(/```html|```/g, '');
                // 마크다운 이미지 참조 완전 제거 (![text](url), attachment: 형식 모두)
                out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
                out = out.replace(/\(attachment:[^)]*\)/g, '');
                // 유효하지 않은 img 태그 전부 제거 — data: (base64) 외 모든 src 제거
                // attachment: 스킴, https:// 외부 URL, 상대경로(char47.jpg 등) 모두 포함
                out = out.replace(/<img[^>]+src\s*=\s*["'](?!data:)[^"']*["'][^>]*>/gi, '');
                out = out.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, css) => {
                    const s = document.createElement('style'); s.textContent = css;
                    document.head.appendChild(s); return '';
                });
                out = out.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
                out = out.replace(/Tab\d+\.\s*/gi, '');
                // STEP 01, STEP02 등 제거
                out = out.replace(/STEP\s*\d+/gi, '');
                out = out.replace(/<ul[^>]*>/gi,'<div>').replace(/<\/ul>/gi,'</div>');
                out = out.replace(/<ol[^>]*>/gi,'<div>').replace(/<\/ol>/gi,'</div>');
                out = out.replace(/<li[^>]*>/gi,'<div style="padding:0.3rem 0;">').replace(/<\/li>/gi,'</div>');
                // 빈 <td></td> 폭주 청소 (Gemini hallucination 방어, 문자열 단계).
                // 동일 행 안에 빈 셀이 2개 이상 연속이면 phantom 으로 간주하고 통째로 제거.
                // 2단계 방어 (DOM 단계 cascade 차단 + maxCols cap) 가 fixTableThs() 안에 있음.
                {
                    const beforeLen = out.length;
                    const beforeTds = (out.match(/<td\b/gi) || []).length;
                    // 빈 셀 패턴 — 속성/공백 모두 허용. 캡처 그룹 제거 (JS 엔진 backtracking 회피).
                    out = out.replace(/(?:<td\b[^>]*>\s*<\/td>\s*){2,}/gi, '');
                    out = out.replace(/(?:<th\b[^>]*>\s*<\/th>\s*){2,}/gi, '');
                    const afterTds = (out.match(/<td\b/gi) || []).length;
                    console.log('[CG] phantom cleanup: <td>', beforeTds, '→', afterTds, '/', (beforeLen - out.length), 'chars removed');
                }
                // 영상 마커 복구 (텍스트로 남은 [영상|opts]+URL → event-video div). → js/video.js
                out = recoverVideoMarkers(out);
                // div/span으로 감싼 img 제거 (custom-resizer 제외, 반복 적용)
                for (let i = 0; i < 3; i++) {
                    out = out.replace(/<(?:div|span)(?![^>]*custom-resizer)[^>]*>\s*(<img[^>]*>)\s*<\/(?:div|span)>/gi, '$1');
                }
                // div/span으로 감싼 table 제거 (반복 적용)
                for (let i = 0; i < 3; i++) {
                    out = out.replace(/<(?:div|span)[^>]*>\s*(<table[\s\S]*?<\/table>)\s*<\/(?:div|span)>/gi, '$1');
                }
                // padding-top% 빈 div 제거
                out = out.replace(/<div[^>]*padding-top\s*:\s*\d+%[^>]*>\s*<\/div>/gi, '');
                // 이미지 래퍼 div의 고정 height 제거 (이미지 겹침 원인)
                out = out.replace(/(<div[^>]*style\s*=\s*["'][^"']*)\bheight\s*:\s*[\d.]+(?:rem|px|em|vh|%)[^;]*;?/gi, '$1');
                out = out.replace(/<img([^>]*?)>/gi, (m, a) => {
                    // position/float/z-index 항상 제거
                    a = a.replace(/(?:position|float|z-index)\s*:[^;'"]+;?/gi, '');
                    // width/height HTML 속성 제거
                    a = a.replace(/\s*(?:width|height)\s*=\s*["'][^"']*["']/gi, '');
                    // [2026-05-20] 인라인 style 안의 고정 width/height 제거 — 원본 사이즈로 표시 + 반응형 보장
                    //   ❌ width:35px; height:29px; → 작은 화면에서 축소 안 되고 큰 화면에서도 강제 고정
                    //   ✅ 다 빼고 max-width:100%; height:auto; 만 남김 → 원본 사이즈 + 반응형 축소
                    //   단 max-width 는 유지 (인라인 100% 안전망).
                    a = a.replace(/style\s*=\s*(["'])([^"']*)\1/i, (sm, q, css) => {
                        let cleaned = css
                            .replace(/(?<![-a-z])width\s*:[^;'"]+;?/gi, '')   // width:Npx 류 제거 (max-width 는 보존 — lookbehind 로 분리)
                            .replace(/(?<![-a-z])height\s*:[^;'"]+;?/gi, '')  // height:Npx 류 제거 (max-height 는 보존)
                            .replace(/;;+/g, ';').replace(/^;+/, '').trim();
                        return `style=${q}${cleaned}${q}`;
                    });
                    if (/max-width\s*:\s*100%/.test(a) && /display\s*:\s*block/.test(a)) return '<img' + a + '>';
                    return /style\s*=\s*["']/.test(a)
                        ? '<img' + a.replace(/(style\s*=\s*["'])/, '$1max-width:100%;height:auto;display:block;margin:0 auto;') + '>'
                        : '<img' + a + ' style="max-width:100%;height:auto;display:block;margin:0 auto;">';
                });
                // 테이블 margin 강제 0
                out = out.replace(/(<table[^>]*style\s*=\s*["'][^"']*)margin\s*:[^;'"]+;?/gi, '$1');
                out = out.replace(/<table([^>]*)>/gi, (m, a) => {
                    const br = 'margin:0;';
                    let tag;
                    if (a.includes('width:100%')) {
                        tag = a.includes('border-radius') ? m : '<table' + a.replace(/(style=['"])/, '$1' + br) + '>';
                    } else {
                        tag = a.includes('style=')
                            ? '<table' + a.replace(/(style=['"])/, '$1width:100%;border-collapse:collapse;table-layout:fixed;' + br) + '>'
                            : '<table' + a + ' style="width:100%;border-collapse:collapse;table-layout:fixed;' + br + '">';
                    }
                    // 이미 tbl-scroll-wrap 안에 있는 테이블은 래핑 스킵
                    if (a.includes('tbl-fixed') || a.includes('tbl-responsive')) return tag;
                    // 반응형 스크롤 래퍼로 감싸기
                    return '<div style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;display:block;">' + tag;
                });
                // 닫는 </table> 뒤에 래퍼 닫기 (table 1개당 1개 대응)
                // 버튼(a태그) 안 중복 div 제거
                out = out.replace(/(<a[^>]*>)\s*<div[^>]*>\s*([\s\S]*?)\s*<\/div>\s*(<\/a>)/gi, '$1$2$3');
                // 테이블 태그 오류 수정 (<th ead> → <thead> 등)
                out = out.replace(/<th\s+ead([^>]*)>/gi, '<thead$1>');
                out = out.replace(/<\/th\s+ead>/gi, '</thead>');
                out = out.replace(/<t\s+body([^>]*)>/gi, '<tbody$1>');
                out = out.replace(/<\/t\s+body>/gi, '</tbody>');
                // 빈 tr/td DOM 기반 제거 — 철저하게
                (function removeEmptyTableRows() {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = out;
                    // thead 외 모든 th → td 강제 변환 (한 번만 실행)
                    fixTableThs(tmp);
                    // 표 구조 강제 정규화 (데이터 추출 → 고정 템플릿 재조립). → js/table.js
                    normalizeTableStructure(tmp, ctx);
                    // 빈 tr/thead/tbody DOM 기반 제거. → js/table.js
                    stripEmptyTableRows(tmp);
                    // popup-trigger 출력 복원기 (인라인 콘텐츠 → se-popup-content). → js/popup-builder.js
                    sanitizeBrokenPopupTriggers(tmp);
                    out = tmp.innerHTML;
                })();
                out = out.replace(/<\/table>/gi, '</table></div>');
                out = out.replace(/<(td|th)([^>]*)>/gi, (m, tag, a) => {
                    let style = '';
                    const styleMatch = a.match(/style\s*=\s*["']([^"']*)["']/i);
                    if (styleMatch) style = styleMatch[1];
                    // word-break 보장
                    if (!style.includes('word-break')) style = 'word-break:break-all;overflow-wrap:anywhere;' + style;
                    // color 없으면 추가: td 는 subColor(본문), th 는 textColor(헤더 crisp)
                    if (!/(?<![a-z-])color\s*:/.test(style)) style += `;color:${tag.toLowerCase()==='th' ? textColor : subColor};`;
                    // font-size 없으면 clamp 적용 (14px 고정값 제거)
                    if (!style.includes('font-size')) style += ';font-size:clamp(0.875rem,1.702vw,1rem);';
                    // line-height 보장
                    if (!style.includes('line-height')) style += ';line-height:1.8;';
                    const restA = a.replace(/style\s*=\s*["'][^"']*["']/i, '').trim();
                    return '<' + tag + (restA ? ' ' + restA : '') + ' style="' + style.replace(/^;+|;+$/g,'').replace(/;;+/g,';') + '">';
                });
                const fd = out.indexOf('<div'); if (fd > 0) out = out.slice(fd);
                const oc = (out.match(/<div[^>]*>/gi)||[]).length;
                const cc = (out.match(/<\/div>/gi)||[]).length;
                for (let d=0; d<oc-cc; d++) out += '</div>';
                // [팝업N] 마커 → 트리거 버튼 + 자식 패널 (se-popup-content 제거 전에 실행)
                out = processPopupMarkers(out);

                // AI가 생성한 HTML의 bare 이미지 파일명(img.png, char47.jpg 등)을 괄호로 감싸기
                // 이미 괄호/대괄호로 감싸진 경우는 건드리지 않음
                out = out.replace(
                    /(>|\s|^|[,:;、。·])([A-Za-z0-9가-힣_\-]{1,40}\.(?:png|jpg|jpeg|gif|webp|svg))(?=<|\s|$|[,.:;、。·])/gm,
                    (m, pre, fn) => {
                        const idxInM = pre.length;
                        const before = m[idxInM - 1] || '';
                        const after = m[idxInM + fn.length] || '';
                        if (before === '(' || before === '[' || after === ')' || after === ']') return m;
                        return `${pre}(${fn})`;
                    }
                );

                // .se-contents 관련 레이아웃 보정은 ensureLayoutCompliance 가 전담 (직계 자식 se-div 별 max-width 주입 방식).
                // 이전 enforceSeContentsMaxWidth (.se-contents 에 max-width 강제 주입) 은 사이냅이 제거하므로 무의미 → 제거됨.
                // se-popup-content 블록 DOM 기반 안전 제거 (processPopupMarkers 이후)
                if (out.includes('se-popup-content')) {
                    const tmpClean = document.createElement('div');
                    tmpClean.innerHTML = out;
                    tmpClean.querySelectorAll('.se-popup-content').forEach(el => el.remove());
                    out = tmpClean.innerHTML;
                }
                // <script> 태그 제거
                out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
                out = out.replace(/\s*!important/gi, '');
                // 레이아웃 규칙 보정 — se-contents position:relative + 2번 블록 좌우 패딩
                out = ensureLayoutCompliance(out);
                // 인라인 style에 font-size:14px 고정값 → clamp로 교체 (모바일 최소 14px 보장)
                out = out.replace(/font-size\s*:\s*14px/gi, 'font-size:clamp(0.875rem,1.702vw,1rem)');
                out = out.replace(/font-size\s*:\s*13px/gi, 'font-size:clamp(0.8125rem,1.4vw,0.9375rem)');
                // 임의 영문 텍스트 제거 (text-transform:uppercase 이면서 영문만 있는 것)
                out = out.replace(/<p([^>]*)>\s*([A-Z][A-Z0-9\s\-\·\.&;]{3,})\s*<\/p>/g, (m, attrs, text) => {
                    if (/text-transform\s*:\s*uppercase/i.test(attrs)) return '';
                    return m;
                });
                // 모든 popup-trigger 버튼 스타일 강제 통일 (크기/색상)
                out = out.replace(/<button([^>]*class="popup-trigger"[^>]*)>/gi, (m, attrs) => {
                    return `<button${attrs.replace(/style="[^"]*"/i, '')} style="${getPopupBtnStyle()}">`;
                });
                // 모든 <a href> 링크에 cursor:pointer 보장
                out = out.replace(/<a(\s[^>]*href=[^>]*)>/gi, (m, a) => {
                    if (a.includes('cursor:pointer')) return m;
                    if (/style\s*=\s*["']/.test(a)) {
                        return '<a' + a.replace(/(style\s*=\s*["'])/, '$1cursor:pointer;') + '>';
                    }
                    return '<a' + a + ' style="cursor:pointer;">';
                });
                // 탭 앵커(<a href="#id">) → <button onclick="scrollIntoView"> 로 변환
                // 에디터·CDN 양쪽 동일 동작 (이전에 잘 되던 button 방식 복원)
                out = convertTabAnchorsForCdn(out);
                if (!out || out.length < 50) throw new Error('HTML \uc0dd\uc131 \uc2e4\ud328');

                out = expandHexColors(out);
                out = processTooltips(out, getById('bgPicker')?.value || '#0e0b48');
                // AI 가 가이드 예시의 (구버전) 변환 script 본문을 텍스트로 emit 한 케이스 강제 제거 (script 태그 밖 visible JS 차단)
                // 패턴: addEventListener("DOMContentLoaded" ... querySelectorAll(".event-video") ... appendChild(video)
                out = out.replace(/<(div|p|pre|code|span)[^>]*>\s*document\.addEventListener\([^<]*?querySelectorAll\(['"]\.event-video['"]\)[^<]*?appendChild\(video\)[^<]*?<\/\1>/gi, '');
                // 더 단순: 본문 텍스트로 노출된 구버전 EVENT_VIDEO_SCRIPT 패턴 — 어떤 태그든 안쪽 텍스트로 매칭
                out = out.replace(/document\.addEventListener\(\s*['"]DOMContentLoaded['"][\s\S]{200,}?appendChild\(video\)[\s\S]{0,200}?\}\s*\)\s*;\s*\}\s*\)\s*;/g, '');
                // [2026-05-27] placeholder 토큰 → 저장된 raw HTML 블록 복원.
                //   preprocessPasteContent 가 raw <table> + event-video div 를 placeholder 로 치환했음 →
                //   여기서 다시 raw HTML 로 복원. Gemini 가 토큰 텍스트만 보존하면 결정론적으로 복원.
                //   회귀 차단: Gemini 가 raw HTML 을 자주 누락 (실측 4/4 드롭). placeholder 텍스트는 거의 100% 보존됨.
                out = restorePromoPreservedBlocks(out);

                // [2026-05-28] Gemini hallucination 치환 — Gemini 가 placeholder 토큰을 드롭하고
                //   대신 라벨-only 가짜 표(영상 없음)를 만든 케이스. 그 가짜 표의 "위치 = 영상이 들어가야 할 자리"
                //   라는 사용자 의도. 그래서 통째 삭제가 아니라 _promoPreservedBlocks 의 실제 콘텐츠로 위치 치환.
                if (_promoPreservedBlocks.length > 0) {
                    const _tmpH = document.createElement('div');
                    _tmpH.innerHTML = out;

                    // placeholder 블록의 라벨 텍스트 수집 (셀 텍스트 중 짧은 것들)
                    const expectedLabels = new Set();
                    _promoPreservedBlocks.forEach(block => {
                        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                        let _m;
                        while ((_m = tdRe.exec(block)) !== null) {
                            const inner = _m[1];
                            // event-video div 포함된 셀은 라벨 아님
                            if (/event-video|<video/i.test(inner)) continue;
                            const text = inner.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, '').trim();
                            if (text && text.length > 1 && text.length < 40) {
                                expectedLabels.add(text);
                            }
                        }
                    });

                    // 가짜 라벨 표 찾기: event-video 없음 + expectedLabels 와 2+ 매칭
                    const fakeTables = [];
                    _tmpH.querySelectorAll('table').forEach(t => {
                        if (t.querySelector('video, .event-video')) return;
                        const cellTexts = Array.from(t.querySelectorAll('td, th'))
                            .map(td => td.textContent.trim());
                        let matchCount = 0;
                        for (const text of cellTexts) {
                            if (expectedLabels.has(text)) matchCount++;
                        }
                        if (matchCount >= 2) fakeTables.push(t);
                    });

                    if (fakeTables.length > 0) {
                        // 가짜 표 자리에 placeholder 콘텐츠 위치 치환 (순서대로)
                        fakeTables.forEach((fakeTable, idx) => {
                            if (idx >= _promoPreservedBlocks.length) return;
                            // 단일 자식 wrapper 까지 거슬러 올라가서 그 통째를 치환
                            let target = fakeTable;
                            while (target.parentElement && target.parentElement !== _tmpH &&
                                   target.parentElement.children.length === 1 &&
                                   !target.parentElement.classList.contains('se-contents')) {
                                target = target.parentElement;
                            }
                            target.outerHTML = _promoPreservedBlocks[idx];
                        });
                        console.warn('[hallucination-replace] replaced', fakeTables.length,
                            'fake label table(s) with restored placeholder content (in order)');
                        out = _tmpH.innerHTML;
                    }
                }

                // 영상 그리드/표 → 콜아웃 박스 wrap (DOM 기반). → js/video.js
                out = wrapVideoGridsInCallout(out, ctx);

                // event-video URL 누락 복구 (occurrence 기반 safety net). → js/video.js
                out = recoverMissingVideoUrls(out, data, ctx);

                // event-video div → 정적 <video> 태그 치환 (2026-05-20: 스크립트 방식 폐기). → js/video.js
                out = ensureEventVideoScript(out);

                const notice = getById('initialNotice'); if (notice) notice.remove();
                // 에디터용: popup-trigger 의 onclick 은 항상 제거 (export 시점에 새로 생성됨)
                // 이전 실행에서 leak 된 popup overlay HTML 코드가 본문에 텍스트로 보이는 회귀 차단
                out = out.replace(/(<(?:button|a)[^>]*\bdata-popup="[^"]*"[^>]*?)\sonclick="[^"]*"/gi, '$1');
                // 부유한 popup 오버레이 div (이전 클릭 잔존물) 제거
                out = out.replace(/<div[^>]*id="__popup_[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
                // [2026-05-29] 자가 검증 리포트 leak 차단 — rules/20-self-verify.md 의 `✅ FAIL-N` 라인은
                //   채팅으로만 출력해야 하는데 Gemini 가 HTML 본문 끝(.se-contents 외부)에 plain text 로
                //   흘려보내는 케이스. 페이지 하단에 raw text 로 렌더되는 회귀 차단.
                out = out.replace(/^[ \t]*✅[ \t]*FAIL-\d+[ \t]+[^\n]*\n?/gm, '');
                const _area = getById('contentArea');
                // checkbox ON = 스타일 유지 + 컨텐츠만 변경 (smart update)
                // checkbox OFF = 전체 새로 생성
                const _isSmartUpdate = stylePreserve && hasExistingContent(_area);
                if (_isSmartUpdate) {
                    const _result = applySmartUpdate(out, _area);
                    tagSectionsWithId(_area);
                    recordState();
                    showToast(`스타일 유지 업데이트 — ${_result.kept}개 유지 / ${_result.replaced}개 교체`);
                } else {
                    currentHashFolder = '';
                    const accentSlashEl = getById('accentSlash');
                    if (accentSlashEl) accentSlashEl.style.display = 'block';
                    const accentPickerEl = getById('accentPicker');
                    if (accentPickerEl) { accentPickerEl.value = '#888888'; accentPickerEl.style.opacity = '0.4'; }
                    _area.innerHTML = out;
                    tagSectionsWithId(_area);
                    recordState();
                }
                // [regression-fix 2026-05-12] WYSIWYG 자체에도 fixTableThs 적용 — 그래야 편집 화면에서 빈 헤더 행이 안 보임.
                //   기존엔 export clone(_d)에만 돌고 contentArea 본체엔 안 돌아서 WYSIWYG 에 빈 셀이 잔존했음.
                if (typeof fixTableThs === 'function') fixTableThs(_area);
                // [defense 2026-05-21] 탭 바 box-sizing 강제 (overflow 방지)
                if (typeof fixTabBarOverflow === 'function') fixTabBarOverflow(_area);

                // ⚠️ AI 가 가이드 예시의 script 본문 또는 깨진 onclick 코드가 텍스트로 노출된 경우 강제 제거
                //   (HTML attribute 파싱 깨짐으로 leak 된 text node 까지 잡기 위해 TreeWalker 사용)
                stripExposedScriptText(_area);
                // 탭 버튼 컨테이너 직후의 라벨 텍스트 중복 제거 (rules/13-tab.md §탭 시스템). → js/tab.js
                removeDuplicateTabLabels(_area);
                // AI 생성 HTML에서 히어로 이미지 추출 → 사이드바로 이동 + contentArea에서 숨김
                extractHeroFromContent(_area);
                // 본문 전체에서 (hero...) 히어로 마커만 제거
                // 일반 이미지 파일명 마커는 보존 — 자산 있으면 runImageMatching이 <img>로 치환,
                // 자산 없으면 사용자가 볼 수 있도록 그대로 노출
                removeHeroTextMarkers(_area);
                // [회귀 방지 2026-05-27] 탭 섹션 hide/show 토글 패턴 강제 무력화 (생성 마지막 방어선).
                //   Gemini 가 종종 탭 섹션에 display:none + tab-content 클래스 + scrollIntoView onclick 조합으로
                //   show/hide 토글 탭 패턴을 출력 → 사용자에겐 1번 탭만 보이고 2~N번 컨텐츠가 통째로 누락된 것처럼 인지됨
                //   (영상/이미지/표 다 들어있어도 숨겨짐). 룰에 명시했지만 모델 변동성 대비 후처리 안전망.
                //   처리: id=tabN se-div 의 display:none/visibility:hidden/opacity:0 인라인 스타일 제거 + tab-content/tab-panel 클래스 strip.
                unhideTabSections(_area);

                // popup-trigger 버튼 텍스트 통일: ? → +
                _area.querySelectorAll('.popup-trigger[data-popup]').forEach(btn => {
                    const t = btn.textContent.trim();
                    if (t === '?' || t === '❓' || t === '＋') btn.textContent = '+';
                });
                // popup-trigger 스타일을 hex로 강제 재설정 (브라우저 rgb() 변환 방지)
                fixPopupTriggerStyles(); protectAccentBars(); protectSectionCards();

                // 이미지 매칭: innerHTML 세팅 직후 즉시 실행 (타이밍 문제 방지)
                if (Object.keys(contentAssetLibrary).length > 0) {
                    setTimeout(() => runImageMatching(true), 100);
                }

                // ──[Route 1 체크포인트 2 — 컨텐츠 HTML 생성 완료]──────────────
                // orchestration_contract.md §체크포인트. 자동화 모드에서만 orchestrator.js 가 수신.
                // HTML 내용이 DOM 에 주입되고 이미지 매칭까지 예약된 시점에 발행.
                try {
                    setTimeout(() => {
                        const html = (_area && _area.innerHTML) ? _area.innerHTML : '';
                        window.dispatchEvent(new CustomEvent('promo-content-html-ready', {
                            detail: { htmlString: html, at: Date.now() }
                        }));
                    }, 200);
                } catch (_) {}

                // accentPicker 자동 동기화: DOM 렌더링 후 실행
                setTimeout(function syncAccentPicker() {
                    const area = getById('contentArea');
                    const freq = {};
                    area.querySelectorAll('[style]').forEach(el => {
                        const m = el.getAttribute('style').match(/#[0-9a-fA-F]{6}/g);
                        if (m) m.forEach(c => { freq[c.toLowerCase()] = (freq[c.toLowerCase()] || 0) + 1; });
                    });
                    const bg = (getById('bgPicker').value || bgColor).toLowerCase();
                    // accent 후보 필터 헬퍼는 color-palette.js (colorDistance / isNeutralColor) 공용.
                    const detected = Object.entries(freq)
                        .filter(([c]) => c !== bg && colorDistance(c, bg) > 60 && !isNeutralColor(c))
                        .sort((a, b) => b[1] - a[1])[0];
                    if (detected) {
                        const p = getById('accentPicker');
                        if (p) { p.value = detected[0]; p.style.opacity = '1'; }
                        const slash = getById('accentSlash');
                        if (slash) slash.style.display = 'none';
                        getById('bgPicker').dataset.accent = detected[0];
                        getById('bgPicker').dataset.prevAccent = detected[0];
                        // accent 감지 후 popup-trigger 버튼 색상 동기화
                        fixPopupTriggerStyles(); protectAccentBars(); protectSectionCards();
                    }

                    // ── 테이블 스타일 자동 통일 ──
                    // AI가 생성한 테이블들의 스타일이 제각각일 때, 가장 많이 쓰인 스타일을 기준으로 전체 통일
                    standardizeTableStyles(area);

                    // 이미지 매칭은 위에서 이미 실행됨 (accent 감지 여부 무관)
                    showToast(detected ? '디자인 완료! 키컬러 ' + detected[0] + ' 감지됨' : '디자인 완료!');
                }, 200);
            } catch(e) {
                console.error('[CG]', e);
                showToast('\uc2e4\ud328: ' + (e.message || '\uc624\ub958'));
            } finally {
                getById('contentSpinner').style.display = 'none';
            }
        }




        document.addEventListener('mousedown', function(e) {
            if (e.target.classList.contains('resizer-handle')) {
                isImgResizing = true;
                currentImgResizer = e.target.closest('.custom-resizer');
                startImgX = e.clientX;
                startImgY = e.clientY;
                startImgWidth = parseInt(document.defaultView.getComputedStyle(currentImgResizer).width, 10);
                startImgHeight = parseInt(document.defaultView.getComputedStyle(currentImgResizer).height, 10) || currentImgResizer.offsetHeight;
                imgResizePos = e.target.dataset.pos;
                // 비율 고정: 자연 이미지/영상 비율 우선, 없으면 현재 wrapper 비율 사용
                const _imgEl = currentImgResizer.querySelector('img, video');
                const _elNatW = _imgEl ? (_imgEl.naturalWidth || _imgEl.videoWidth || 0) : 0;
                const _elNatH = _imgEl ? (_imgEl.naturalHeight || _imgEl.videoHeight || 0) : 0;
                if (_elNatW > 0 && _elNatH > 0) {
                    startAspectRatio = _elNatH / _elNatW;
                } else {
                    startAspectRatio = startImgWidth > 0 ? startImgHeight / startImgWidth : 1;
                }
                e.preventDefault();
                e.stopPropagation();
            }
        });

        document.addEventListener('mousemove', function(e) {
            if (!isImgResizing || !currentImgResizer) return;
            let dx = e.clientX - startImgX;
            // X축 기준 너비 계산 (핸들 방향에 따라 증감 방향 결정)
            let newWidth = startImgWidth;
            if (imgResizePos === 'se' || imgResizePos === 'ne') newWidth = startImgWidth + dx;
            else if (imgResizePos === 'sw' || imgResizePos === 'nw') newWidth = startImgWidth - dx;
            newWidth = Math.max(20, newWidth);
            // 비율 고정: 너비 기준으로 높이 자동 산출
            const newHeight = Math.round(newWidth * startAspectRatio);

            currentImgResizer.style.width  = newWidth  + 'px';
            currentImgResizer.style.height = newHeight + 'px';
            // 내부 img/video도 동기화
            const _imgEl = currentImgResizer.querySelector('img, video');
            if (_imgEl) { _imgEl.style.width = '100%'; _imgEl.style.height = '100%'; }

            const label = getById('imgSizeLabel');
            if (label) label.textContent = `${Math.round(newWidth)} × ${Math.round(newHeight)}`;
            const inp = getById('imgWidthInput');
            if (inp && document.activeElement !== inp) inp.value = Math.round(newWidth);
        });

        document.addEventListener('mouseup', function(e) {
            // 테이블 셀 드래그 선택 종료 — 반드시 isSelecting 초기화
            if (isSelecting) {
                isSelecting = false;
                selectionStartCell = null;
            }
            if (isImgResizing) {
                isImgResizing = false;
                if (currentImgResizer) {
                    showImgFloatToolbar(currentImgResizer);
                }
                currentImgResizer = null;
                if (typeof recordState === 'function') recordState();
            }
        });

        document.addEventListener('mousedown', function(e) {
            const tb = getById('imgFloatToolbar');
            if (!tb || tb.contains(e.target)) return; // 툴바 자신 클릭 시 무시
            const tblTb = getById('tableFloatToolbar');
            if (tblTb && tblTb.contains(e.target)) return;
            const area = getById('contentArea');
            if (area && !area.contains(e.target)) {
                hideImgFloatToolbar();
            }
        }, true);

        // [dom-ready-fix 2026-05-13] app.js 는 동적 <script> 로 삽입되어 (defer 효과 없음)
        //   DOMContentLoaded 가 이미 발생한 뒤에 실행될 수 있음 → 이 경우 아래 콜백이 영영 실행 안 됨
        //   (heroDiv 드롭 핸들러, contentArea 드롭, 빈테이블가드, window 드래그 차단 모두 미등록).
        //   readyState 로 분기해 즉시 실행 또는 이벤트 대기로 통일.
        const _runOnReady = (cb) => {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb);
            else cb();
        };
        _runOnReady(() => {
            // ─────────────────────────────────────────────────────────
            // [회귀 방지 2026-04-23] 빈 테이블 헤더·선두 빈 행 감시자
            //  어떤 경로로 <table> 이 삽입되든 즉시 정리 (render 시점 최종 방어선)
            //  - DOMContentLoaded 시 기존 테이블 정리
            //  - MutationObserver 로 이후 삽입되는 테이블도 감시
            // ─────────────────────────────────────────────────────────
            installEmptyRowGuard();

            // window dragover: 브라우저 기본 "파일 열기" 동작 차단
            window.addEventListener('dragover', e => e.preventDefault(), false);
            // window drop: HTML 파일 드롭 시 새 탭으로 열리는 것 방지 + 로드
            window.addEventListener('drop', function(e) {
                e.preventDefault(); // 브라우저 기본 동작 차단
                // capture로 등록된 각 영역 핸들러(heroDiv, contentArea)가
                // stopPropagation 하므로 여기까지 오는 건 해당 영역 밖 드롭
                const dtFiles = Array.from(e.dataTransfer.files || []);
                const htmlFile = dtFiles.find(f => f.name && f.name.endsWith('.html'));
                if (htmlFile) {
                    showToast('HTML 불러오는 중...');
                    loadHtmlFile(htmlFile, {});
                }
            }, false); // bubble phase - 각 영역 핸들러가 stopPropagation하면 여기 안 옴

            // heroDiv: 히어로 이미지 드롭
            // [hero-drop-robust 2026-05-13] 자식 요소(mainHeroImg/heroPlaceholder) 위를 지날 때
            //   dragenter/leave 가 반복 발화되어 outline 이 깜빡이는 이슈 → 카운터 기반으로 안정화.
            //   파일 드롭(Finder/Explorer) + 내부 <img> 드래그(contentArea·썸네일) 양쪽 모두 지원.
            const heroDiv = getById('heroDiv');
            let _heroDragDepth = 0;
            const _heroDragStart = () => {
                heroDiv.style.outline = '4px dashed #4f46e5';
                heroDiv.style.outlineOffset = '-4px';
            };
            const _heroDragEnd = () => {
                _heroDragDepth = 0;
                heroDiv.style.outline = 'none';
                heroDiv.style.outlineOffset = '';
            };
            heroDiv.addEventListener('dragenter', e => {
                e.preventDefault(); e.stopPropagation();
                _heroDragDepth++;
                _heroDragStart();
            });
            heroDiv.addEventListener('dragover', e => {
                e.preventDefault(); e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
                _heroDragStart();
            });
            heroDiv.addEventListener('dragleave', e => {
                e.preventDefault(); e.stopPropagation();
                _heroDragDepth = Math.max(0, _heroDragDepth - 1);
                if (_heroDragDepth === 0) _heroDragEnd();
            });
            heroDiv.addEventListener('drop', e => {
                e.preventDefault(); e.stopPropagation();
                _heroDragEnd();

                // 1) 파일 드롭(Finder/Explorer) 우선 처리
                let files = Array.from(e.dataTransfer.files || []);
                if (!files.length && e.dataTransfer.items) {
                    files = Array.from(e.dataTransfer.items).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
                }
                const imgFile = files.find(f => f && isImageFile(f));
                if (imgFile) {
                    const reader = new FileReader();
                    reader.onload = ev => { applyHeroImage(ev.target.result, false); recordState(); showToast("메인 히어로 이미지가 등록되었습니다."); };
                    reader.readAsDataURL(imgFile);
                    return;
                }

                // 2) 내부 <img> 드래그 — contentArea/썸네일/팝업/외부 페이지의 <img> 끌어다 놓기
                //    text/html 파싱이 가장 신뢰도 높음 (브라우저가 <img src="..."> 전체를 넣음)
                let src = '';
                try {
                    const html = e.dataTransfer.getData('text/html') || '';
                    if (html) {
                        const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
                        if (m) src = m[1];
                    }
                } catch(_) {}
                if (!src) {
                    try {
                        const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
                        if (uri && /^(data:image|https?:|blob:|\.\/|\/)/i.test(uri.trim())) src = uri.trim();
                    } catch(_) {}
                }
                if (!src) return;

                // data: URL 은 즉시 적용, http(s)/상대경로는 fetch → base64 (CORS 실패 시 원본 URL 그대로)
                if (src.startsWith('data:image')) {
                    applyHeroImage(src, false); recordState(); showToast("메인 히어로 이미지가 등록되었습니다.");
                } else {
                    const tmp = new Image();
                    tmp.crossOrigin = 'anonymous';
                    tmp.onload = () => {
                        try {
                            const c = document.createElement('canvas');
                            c.width = tmp.naturalWidth || 1;
                            c.height = tmp.naturalHeight || 1;
                            c.getContext('2d').drawImage(tmp, 0, 0);
                            applyHeroImage(c.toDataURL('image/png'), false);
                        } catch(_) {
                            applyHeroImage(src, false);
                        }
                        recordState(); showToast("메인 히어로 이미지가 등록되었습니다.");
                    };
                    tmp.onerror = () => { applyHeroImage(src, false); recordState(); showToast("메인 히어로 이미지가 등록되었습니다."); };
                    tmp.src = src;
                }
            });

            // contentArea: 이미지 드롭 (매칭 or 삽입)
            const area = getById('contentArea');
            area.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); });
            area.addEventListener('dragover', e => {
                e.preventDefault(); e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
            });
            area.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); });
            area.addEventListener('drop', e => {
                e.preventDefault(); e.stopPropagation();
                const dtFiles = Array.from(e.dataTransfer.files || []);

                // HTML 파일 드롭 → 로드 (함께 드롭된 이미지 파일도 imgMap으로 전달)
                const htmlFile = dtFiles.find(f => f.name && f.name.endsWith('.html'));
                if (htmlFile) {
                    showToast('HTML 불러오는 중...');
                    const coImgFiles = dtFiles.filter(f => isImageFile(f));
                    if (coImgFiles.length > 0) {
                        const coImgMap = {};
                        Promise.all(coImgFiles.map(f => new Promise(resolve => {
                            const r = new FileReader();
                            r.onload = ev => { coImgMap[f.name] = ev.target.result; resolve(); };
                            r.onerror = () => resolve();
                            r.readAsDataURL(f);
                        }))).then(() => loadHtmlFile(htmlFile, coImgMap));
                    } else {
                        loadHtmlFile(htmlFile, {});
                    }
                    return;
                }

                const imgFiles = dtFiles.filter(f => isImageFile(f));
                if (!imgFiles.length) return;

                // 테이블 셀에 드롭 → 셀 안에 이미지 삽입
                const targetTd = e.target.closest('td, th');
                if (targetTd) {
                    imgFiles.forEach(file => {
                        const reader = new FileReader();
                        reader.onload = ev => {
                            recordState();
                            const img = document.createElement('img');
                            img.src = ev.target.result;
                            img.style.cssText = 'max-width:100%;height:auto;display:block;margin:0 auto;';
                            targetTd.appendChild(img);
                            recordState();
                        };
                        reader.readAsDataURL(file);
                    });
                    showToast('셀에 이미지가 삽입되었습니다.');
                    return;
                }

                // 깨진 이미지/히어로/텍스트마커 매칭 모드 (contentArea + 팝업 childArea 모두 스캔)
                const _scanAreas = [area];
                childPanels.forEach(panel => { const ca = getById('childArea_' + panel.id); if (ca) _scanAreas.push(ca); });
                const brokenImgs = _scanAreas.flatMap(a => Array.from(a.querySelectorAll('img[src]')).filter(img => {
                    const s = img.getAttribute('src') || '';
                    return !s.startsWith('data:') && !s.startsWith('http') && !s.startsWith('blob:');
                }));
                const heroImg = getById('mainHeroImg');
                const heroSrc = heroImg ? (heroImg.getAttribute('src') || '') : '';
                const heroBroken = heroSrc && !heroSrc.startsWith('data:') && !heroSrc.startsWith('http') && !heroSrc.startsWith('blob:');
                // contentArea + 모든 팝업 childArea 텍스트 합산 (팝업 내 마커도 감지)
                const _allTexts = _scanAreas.map(a => a.innerText || '').join('\n');
                const hasTextMarker = imgFiles.some(file => {
                    const base = file.name.replace(/\.[^.]+$/, '');
                    return _allTexts.includes(`(${base})`) || _allTexts.includes(`[${base}]`) ||
                           _allTexts.includes(`(${file.name})`) || _allTexts.includes(`[${file.name}]`);
                });

                if (brokenImgs.length > 0 || heroBroken || hasTextMarker) {
                    let matched = 0;
                    Promise.all(imgFiles.map(file => new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onload = ev => {
                            const fname = file.name;
                            brokenImgs.forEach(img => {
                                const srcFname = (img.getAttribute('src') || '').split('/').pop().split('\\').pop();
                                if (srcFname === fname) { img.src = ev.target.result; matched++; }
                            });
                            if (heroBroken && heroImg) {
                                const heroFname = heroSrc.split('/').pop().split('\\').pop();
                                if (heroFname === fname) { applyHeroImage(ev.target.result, false, null, true); matched++; } // skipColorExtract=true: 재매칭 시 배경색 자동 추출 비활성화
                            }
                            resolve({ fname, b64: ev.target.result });
                        };
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(file);
                    }))).then(results => {
                        const fileMap = {};
                        results.forEach(r => { if (r) fileMap[r.fname] = r.b64; });
                        const textMatched = runMatchWithFiles(fileMap);
                        matched += textMatched;
                        recordState();
                        showToast(matched > 0 ? '이미지 ' + matched + '개 매칭 완료!' : '매칭되는 파일명이 없습니다.');
                    });
                    return;
                }

                // 일반 삽입 모드: 커서 위치에 이미지 삽입
                let range;
                if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(e.clientX, e.clientY);
                else if (document.caretPositionFromPoint) {
                    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                    if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
                }
                if (range) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); savedRange = range; }
                else { area.focus(); }

                imgFiles.forEach(file => {
                    const reader = new FileReader();
                    reader.onload = ev => {
                        recordState();
                        area.focus();
                        if (savedRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); }
                        document.execCommand('insertHTML', false, `<img src="${ev.target.result}" style="max-width:100%;width:auto;height:auto;display:inline-block;vertical-align:middle;margin:4px;border:none;">`);
                        if (window.getSelection().rangeCount > 0) savedRange = window.getSelection().getRangeAt(0);
                        recordState();
                    };
                    reader.readAsDataURL(file);
                });
                showToast("\ub4dc\ub798\uadf8\ud55c \uc774\ubbf8\uc9c0\uac00 \uc0bd\uc785\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
            });

            const pageWidthEl = getById('pageWidthInput');
            // applyPageWidth 는 editor-helpers.js 로 분리 (2026-05-29). 여기선 wiring 만.
            if (pageWidthEl) {
                pageWidthEl.oninput = e => applyPageWidth(parseInt(e.target.value) || 840);
                // 초기 적용
                applyPageWidth(parseInt(pageWidthEl.value) || 840);
            }
            initNotionDetection();
            
            // HTML 파일 직접 열기 버튼 핸들러
            const htmlLoadInput = getById('htmlLoadInput');
            if (htmlLoadInput) {
                htmlLoadInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    showToast('HTML 불러오는 중...');
                    loadHtmlFile(file, {});
                    e.target.value = '';
                });
            }

            // 영상 파일 input 핸들러
            const videoFileInput = getById('videoFileInput');
            if (videoFileInput) {
                videoFileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) insertVideoToEditor(file);
                    e.target.value = '';
                });
            }

            // [2026-05-28] master_guidelines.md 제거됨 — dispatcher.js 의 loadAllRules() 가
            // 스크립트 로드 시 자동으로 rules/*.md 21개 병렬 fetch (이 init 호출 불요).

            // tbody 내 th → td 강제 변환 자동수정 — table.js 의 initTableHeaderFix 로 분리 (2026-05-29).
            initTableHeaderFix(getById('contentArea'));

            getById('editorImgInput').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file || !isImageFile(file)) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    recordState();
                    const area = getById('contentArea');
                    area.focus();
                    if (savedRange) {
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(savedRange);
                    }
                    const imgHTML = `<img src="${ev.target.result}" style="max-width: 100%; width: auto; height: auto; display: inline-block; vertical-align: middle; margin: 4px; border: none;">`;
                    document.execCommand('insertHTML', false, imgHTML);
                    recordState();
                    showToast("\uc774\ubbf8\uc9c0\uac00 \uc0bd\uc785\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
                };
                reader.readAsDataURL(file);
                e.target.value = '';
            });

            // (initDragDrop 제거 2026-05-29 — 호출처 0 의 죽은 코드였음. heroDiv/contentArea 는 자체 드롭 핸들러 사용.)

            // 파일 input change 핸들러 (클릭으로 파일 선택 시)
            getById('heroAssetInput').addEventListener('change', e => {
                Array.from(e.target.files||[]).forEach(f => {
                    if (!isImageFile(f)) return;
                    const r = new FileReader();
                    r.onload = ev => { uploadedAssets.push({b64:ev.target.result,name:f.name||'asset.png'}); renderHeroAssets(); };
                    r.readAsDataURL(f);
                });
                e.target.value = '';
            });
            getById('heroRefInput').addEventListener('change', e => {
                const f = e.target.files[0];
                if (!f || !isImageFile(f)) return;
                const r = new FileReader();
                r.onload = ev => {
                    referenceImageBase64 = ev.target.result;
                    getById('refPreview').innerHTML = `<div class="relative inline-block w-12 h-12 group pointer-events-auto shadow-sm rounded-lg border border-indigo-100 overflow-hidden shrink-0"><img src="${ev.target.result}" class="w-full h-full object-cover bg-slate-50"><button onclick="referenceImageBase64=null;getById('refPreview').innerHTML='';" class="absolute top-0 right-0 bg-red-500/80 text-white w-4 h-4 flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 cursor-pointer rounded-bl-sm">✕</button></div>`;
                    showToast('레퍼런스 이미지가 등록되었습니다.');
                };
                r.readAsDataURL(f);
                e.target.value = '';
            });
            getById('heroLogoInput').addEventListener('change', e => {
                if (e.target.files[0]) loadLogoFile(e.target.files[0]);
                e.target.value = '';
            });
            getById('contentAssetInput').addEventListener('change', e => {
                Array.from(e.target.files||[]).forEach(f => {
                    if (!isImageFile(f)) return;
                    const r = new FileReader();
                    r.onload = ev => { contentAssetLibrary[f.name||`img_${Date.now()}`] = ev.target.result; renderContentAssets(); setTimeout(() => runImageMatching(true), 100); };
                    r.readAsDataURL(f);
                });
                e.target.value = '';
            });

            // se-div 삭제 방지: 내용이 비면 br 보장, se-div 자체 삭제 차단
            area.addEventListener('beforeinput', e => {
                if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') return;
                const sel = window.getSelection();
                if (!sel || !sel.rangeCount) return;
                const range = sel.getRangeAt(0);
                const node = range.startContainer;

                // se-div 찾기
                const el = node.nodeType === 3 ? node.parentElement : node;
                const seDiv = el ? el.closest('.se-div') : null;
                if (!seDiv) return;

                // collapsed 상태 (커서만 있을 때)
                if (range.collapsed) {
                    const text = seDiv.textContent.replace(/[\s\u00a0]/g, '');
                    // 내용이 비어있으면 삭제 차단 (div 사라짐 방지)
                    if (text === '' || seDiv.innerHTML.replace(/<br\s*\/?>/gi,'').trim() === '') {
                        e.preventDefault();
                        return;
                    }
                    // [Backspace] 커서가 se-div 첫 위치이면 윗 블록과 병합 차단
                    if (e.inputType === 'deleteContentBackward') {
                        try {
                            const preRange = document.createRange();
                            preRange.setStart(seDiv, 0);
                            preRange.setEnd(range.startContainer, range.startOffset);
                            const preText = preRange.toString();
                            const preClone = preRange.cloneContents();
                            const hasPreContent = preText.length > 0 || preClone.querySelector('img, table');
                            if (!hasPreContent) { e.preventDefault(); return; }
                        } catch(_) {
                            const divStart = range.startOffset === 0 && (node === seDiv || node.parentElement === seDiv);
                            if (divStart) { e.preventDefault(); return; }
                        }
                    }
                    // [Delete] 커서가 se-div 끝 위치이면 아랫 블록과 병합 차단
                    if (e.inputType === 'deleteContentForward') {
                        try {
                            const postRange = document.createRange();
                            postRange.setStart(range.endContainer, range.endOffset);
                            // seDiv의 끝 위치로 range 끝 설정
                            const lastChild = seDiv.lastChild;
                            if (lastChild) {
                                if (lastChild.nodeType === 3) {
                                    postRange.setEnd(lastChild, lastChild.length);
                                } else {
                                    postRange.setEnd(seDiv, seDiv.childNodes.length);
                                }
                            } else {
                                postRange.setEnd(seDiv, 0);
                            }
                            const postText = postRange.toString();
                            const postClone = postRange.cloneContents();
                            const hasPostContent = postText.length > 0 || postClone.querySelector('img, table');
                            if (!hasPostContent) { e.preventDefault(); return; }
                        } catch(_) {
                            // fallback
                        }
                    }
                }

                // 선택 범위가 se-div 경계를 넘으면 차단
                if (!range.collapsed) {
                    const startDiv = range.startContainer.nodeType === 3
                        ? range.startContainer.parentElement?.closest('.se-div')
                        : range.startContainer.closest?.('.se-div');
                    const endDiv = range.endContainer.nodeType === 3
                        ? range.endContainer.parentElement?.closest('.se-div')
                        : range.endContainer.closest?.('.se-div');
                    if (startDiv && endDiv && startDiv !== endDiv) {
                        e.preventDefault();
                    }
                }
            });

            area.addEventListener('keyup', (e) => {
                if ([16,17,18,37,38,39,40].includes(e.keyCode)) return;
                const td = e.target.closest('td, th');
                if (td && (e.key.startsWith('Arrow') || ['Shift','Control','Alt','Meta'].includes(e.key))) return;
                // 빈 se-div가 되면 br 하나 보장 (영역 사라짐 방지)
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    area.querySelectorAll('.se-div').forEach(div => {
                        if (!div.querySelector('table') && div.innerHTML.trim() === '') {
                            div.innerHTML = '<br>';
                        }
                    });
                }
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => { recordState(); }, 800);
            });

            area.addEventListener('dblclick', e => {
                const target = e.target;
                const block = target === area ? null : (target.closest('.se-div') || target.closest('table') || target.closest('div'));
                if (block) {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNode(block);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    showToast("\ube14\ub85d\uc774 \uc120\ud0dd\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \ubcf5\uc0ac(Ctrl+C) \ub610\ub294 \uc0ad\uc81c \uac00\ub2a5\ud569\ub2c8\ub2e4.");
                }
            });

            area.addEventListener('mousedown', e => {
                if (e.target.classList.contains('resizer-handle')) return; 

                const target = e.target; 
                const td = target.closest('td, th'); 
                const table = target.closest('table');
                const resizer = target.closest('.custom-resizer');
                // se-div 또는 se-para-div 우선 탐색, contentArea 내부로만 한정
                const div = (() => {
                    const closest = target.closest('.se-div, .se-para-div');
                    if (closest && area.contains(closest) && closest !== area) return closest;
                    const anyDiv = target !== area ? target.closest('div') : null;
                    if (anyDiv && area.contains(anyDiv) && anyDiv !== area) return anyDiv;
                    return null;
                })();
                // td 안의 img인지 판별 (td 분기보다 먼저 처리)
                const imgInTd = target.tagName === 'IMG' && td;
                
                if (activeLayer) activeLayer.classList.remove('active-layer');
                area.querySelectorAll('.img-selected').forEach(el => el.classList.remove('img-selected'));
                hideAllTools();
                hideImgFloatToolbar();

                // 테이블 셀이 아닌 곳 클릭 시 셀 선택 해제
                if (!td) {
                    clearSelection();
                    hideTableFloatToolbar();
                }

                if (resizer) {
                    activeLayer = resizer;
                    activeLayer.classList.add('active-layer');
                    getById('imgTools').style.display = 'flex';
                    hideTableFloatToolbar();

                } else if (imgInTd) {
                    // td 안 이미지 클릭 → 이미지 선택 우선, 셀/드래그 상태 완전 초기화
                    isSelecting = false; selectionStartCell = null;
                    clearSelection();
                    hideTableFloatToolbar();
                    activeLayer = target;
                    activeLayer.classList.add('active-layer');
                    getById('imgTools').style.display = 'flex';
                    showImgFloatToolbar(activeLayer);

                } else if (target.tagName === 'IMG') {
                    activeLayer = target;
                    activeLayer.classList.add('active-layer');
                    getById('imgTools').style.display = 'flex';
                    hideTableFloatToolbar();

                } else if (td) {
                    isSelecting = true; selectionStartCell = td; lastActiveCell = td; clearSelection();
                    td.classList.add('selected-cell'); selectedCells = [td];
                    activeLayer = table; activeLayer.classList.add('active-layer');
                    hideImgFloatToolbar();
                    setTimeout(() => showTableFloatToolbar(table, td), 0);

                } else if (table) {
                    activeLayer = table; activeLayer.classList.add('active-layer');
                    hideImgFloatToolbar();
                    setTimeout(() => showTableFloatToolbar(table, null), 0);
                } else if (div && div !== area && div.id !== 'contentArea' && area.contains(div)) {
                    activeLayer = div;
                    activeLayer.classList.add('active-layer');
                    getById('divTools').style.display = 'flex';
                    hideTableFloatToolbar();
                    // 아래 줄 추가 버튼 - 선택된 div 바로 아래에 위치
                    positionAddLineBtn();
                    
                    const computed = window.getComputedStyle(div);
                    getById('divRadiusInput').value = parseInt(computed.borderRadius) || 0;
                    const _pdEl = getById('divPaddingInput'); if (_pdEl) { _pdEl.value = Math.round(parseFloat(computed.paddingTop)) || Math.round(parseFloat(computed.paddingLeft)) || 0; }
                    getById('divShadowInput').checked = computed.boxShadow && computed.boxShadow !== 'none';
                    const divBgPk = getById('divBgColorInput');
                    if (divBgPk) {
                        const rgb = computed.backgroundColor;
                        if (rgb && rgb !== 'rgba(0, 0, 0, 0)' && rgb !== 'transparent') {
                            const m = rgb.match(/\d+/g);
                            if (m && m.length >= 3) {
                                divBgPk.value = '#' + [m[0],m[1],m[2]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
                            }
                        }
                    }
                } else {
                    activeLayer = null; lastActiveCell = null;
                    hideTableFloatToolbar();
                }
            });

            // copy 이벤트 - 인라인 스타일 완전 보존 (background-color 포함)
            area.addEventListener('copy', e => {
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed) return;
                const range = sel.getRangeAt(0);
                const frag = range.cloneContents();
                const tmp = document.createElement('div');
                tmp.appendChild(frag);
                const html = tmp.innerHTML;
                if (html.trim()) {
                    e.preventDefault();
                    e.clipboardData.setData('text/html', html);
                    e.clipboardData.setData('text/plain', sel.toString());
                }
            });

            area.addEventListener('paste', e => {
                // HTML 표 붙여넣기 우선 처리 (엑셀 복사 시 이미지보다 먼저)
                const htmlDataFirst = e.clipboardData.getData('text/html');
                if (htmlDataFirst && /<table/i.test(htmlDataFirst) && !e.target.closest('td, th')) {
                    e.preventDefault();
                    recordState();
                    const doc2 = new DOMParser().parseFromString(htmlDataFirst, 'text/html');
                    const tbl = doc2.querySelector('table');
                    if (tbl) {
                        // 테이블 자체 스타일만 교체 (셀 스타일 건드리지 않음)
                        tbl.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed;';
                        tbl.querySelectorAll('th, td').forEach(cell => {
                            // bgcolor 속성은 제거하되 style의 background-color는 유지
                            const bgAttr = cell.getAttribute('bgcolor');
                            if (bgAttr) {
                                // bgcolor → style background-color로 이전
                                const existing = cell.getAttribute('style') || '';
                                if (!existing.includes('background-color')) {
                                    cell.style.backgroundColor = bgAttr;
                                }
                                cell.removeAttribute('bgcolor');
                            }
                            cell.removeAttribute('width');
                        });
                        const area2 = getById('contentArea');
                        area2.focus();
                        const sel3 = window.getSelection();
                        if (savedRange && area2.contains(savedRange.startContainer)) {
                            sel3.removeAllRanges();
                            sel3.addRange(savedRange);
                        } else {
                            const r3 = document.createRange();
                            r3.selectNodeContents(area2);
                            r3.collapse(false);
                            sel3.removeAllRanges();
                            sel3.addRange(r3);
                        }
                        document.execCommand('insertHTML', false, tbl.outerHTML);
                        setTimeout(() => fixTableThs(), 0); // 붙여넣기 후 th→td 정규화
                        recordState();
                        showToast('표가 삽입되었습니다.');
                    }
                    return;
                }
                // 이미지 붙여넣기 (클립보드 이미지)
                const items = e.clipboardData?.items;
                if (items) {
                    for (const item of items) {
                        if (item.type.startsWith('image/')) {
                            e.preventDefault();
                            const file = item.getAsFile();
                            if (!file) break;
                            const reader = new FileReader();
                            reader.onload = ev => {
                                recordState();
                                const img = document.createElement('img');
                                img.src = ev.target.result;
                                img.style.cssText = 'max-width:100%;height:auto;display:block;margin:0 auto;';

                                const activeTd = e.target.closest('td, th');
                                if (activeTd) {
                                    // td 안에 붙여넣기: 기존 내용 대체
                                    activeTd.innerHTML = '';
                                    activeTd.appendChild(img);
                                } else {
                                    const area2 = getById('contentArea');
                                    const sel2 = window.getSelection();
                                    if (sel2 && sel2.rangeCount && area2.contains(sel2.getRangeAt(0).startContainer)) {
                                        const range = sel2.getRangeAt(0);
                                        range.deleteContents();
                                        range.insertNode(img);
                                    } else {
                                        area2.appendChild(img);
                                    }
                                }
                                recordState();
                                showToast('이미지가 붙여넣기 되었습니다.');
                            };
                            reader.readAsDataURL(file);
                            return;
                        }
                    }
                }

                // 셀 내부 붙여넣기
                const td = e.target.closest('td, th');
                if (!td) return;
                e.preventDefault();
                // HTML에 여러 행이 있으면 자동 행 추가
                const tdHtml = e.clipboardData.getData('text/html');
                if (tdHtml) {
                    const tmpDoc = new DOMParser().parseFromString(tdHtml, 'text/html');
                    const srcRows = tmpDoc.querySelectorAll('tr');
                    if (srcRows.length > 1) {
                        // 여러 행 → 자동 행 추가
                        const table = td.closest('table');
                        const tbody = table.querySelector('tbody') || table;
                        const allRows = Array.from(tbody.querySelectorAll('tr'));
                        const startRowIdx = allRows.indexOf(td.closest('tr'));
                        const startColIdx = Array.from(td.closest('tr').cells).indexOf(td);
                        recordState();
                        srcRows.forEach((srcRow, ri) => {
                            let targetRow = allRows[startRowIdx + ri];
                            if (!targetRow) {
                                targetRow = allRows[allRows.length - 1].cloneNode(true);
                                targetRow.querySelectorAll('td, th').forEach(c => { c.textContent = ''; });
                                tbody.appendChild(targetRow);
                                allRows.push(targetRow);
                            }
                            Array.from(srcRow.cells).forEach((srcCell, ci) => {
                                const cell = Array.from(targetRow.cells)[startColIdx + ci];
                                if (cell) cell.innerHTML = srcCell.innerHTML;
                            });
                        });
                        recordState();
                        return;
                    } else if (srcRows.length === 1) {
                        // 단일 행 → 셀 스타일 포함 붙여넣기
                        const srcTd = tmpDoc.querySelector('td, th');
                        if (srcTd) {
                            if (srcTd.getAttribute('style')) td.setAttribute('style', srcTd.getAttribute('style'));
                            td.innerHTML = srcTd.innerHTML;
                            recordState();
                            return;
                        }
                    }
                }
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
                if (rows.length > 1 || rows[0]?.includes('\t')) {
                    // 여러 행/열: 현재 셀부터 채우고 행 부족하면 추가
                    const table = td.closest('table');
                    const tbody = table.querySelector('tbody') || table;
                    const allRows = Array.from(tbody.querySelectorAll('tr'));
                    let startRowIdx = allRows.indexOf(td.closest('tr'));
                    let startColIdx = Array.from(td.closest('tr').cells).indexOf(td);
                    recordState();
                    rows.forEach((row, ri) => {
                        const cols = row.split('\t');
                        let targetRow = allRows[startRowIdx + ri];
                        if (!targetRow) {
                            targetRow = allRows[allRows.length - 1].cloneNode(true);
                            targetRow.querySelectorAll('td, th').forEach(c => { c.textContent = ''; });
                            tbody.appendChild(targetRow);
                            allRows.push(targetRow);
                        }
                        const cells = Array.from(targetRow.cells);
                        cols.forEach((col, ci) => {
                            const cell = cells[startColIdx + ci];
                            if (cell) cell.textContent = col;
                        });
                    });
                    recordState();
                } else {
                    const sel = window.getSelection();
                    if (!sel.rangeCount) return;
                    sel.deleteFromDocument();
                    sel.getRangeAt(0).insertNode(document.createTextNode(text));
                    sel.collapseToEnd();
                    recordState();
                }
            });

            area.addEventListener('mouseover', e => {
                if (isSelecting && selectionStartCell) {
                    const td = e.target.closest('td, th');
                    if (td && td.closest('table') === selectionStartCell.closest('table')) {
                        const table = selectionStartCell.closest('table'); const rows = Array.from(table.rows);
                        const startR = selectionStartCell.parentElement.rowIndex, startC = selectionStartCell.cellIndex;
                        const endR = td.parentElement.rowIndex, endC = td.cellIndex;
                        const minR = Math.min(startR, endR), maxR = Math.max(startR, endR);
                        const minC = Math.min(startC, endC), maxC = Math.max(startC, endC);
                        clearSelection();
                        for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) { const cell = rows[r].cells[c]; if (cell) { cell.classList.add('selected-cell'); selectedCells.push(cell); } }
                        updateTableSelInfo();
                        showTableFloatToolbar(table, null);
                    }
                }
            });

            // 전역 undo/redo (contentArea 밖에서도 동작, 단 area 내부는 area keydown에서 처리해 중복 방지)
            document.addEventListener('keydown', e => {
                const _area = getById('contentArea');
                if (_area && _area.contains(e.target)) return; // area 내부는 아래 area.addEventListener에서 처리
                if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoAction(); }
                if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) { e.preventDefault(); redoAction(); }
            });

            area.addEventListener('keydown', e => {
                if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undoAction(); }
                if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) { e.preventDefault(); redoAction(); }
                // div/table 블록 선택 상태 단축키
                const isBlockLayer = activeLayer && (
                    activeLayer.classList.contains('se-div') ||
                    activeLayer.tagName === 'TABLE' ||
                    activeLayer.tagName === 'DIV'
                ) && !activeLayer.classList.contains('custom-resizer');

                if (isBlockLayer) {
                    // Ctrl+C: 블록 복사 (blockClipboard에도 저장 → Ctrl+V로 붙여넣기 가능)
                    if (e.ctrlKey && e.key === 'c') {
                        e.preventDefault();
                        setBlockClipboard(activeLayer.outerHTML);
                        const sel = window.getSelection();
                        const range = document.createRange();
                        range.selectNode(activeLayer);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        document.execCommand('copy');
                        showToast('블록 복사됨 (Ctrl+V로 붙여넣기)');
                        return;
                    }
                    // Ctrl+X: 블록 잘라내기
                    if (e.ctrlKey && e.key === 'x') {
                        e.preventDefault();
                        recordState();
                        setBlockClipboard(activeLayer.outerHTML);
                        const sel = window.getSelection();
                        const range = document.createRange();
                        range.selectNode(activeLayer);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        document.execCommand('copy');
                        activeLayer.remove();
                        activeLayer = null;
                        hideAllTools();
                        recordState();
                        showToast('블록 잘라내기됨 (Ctrl+V로 붙여넣기)');
                        return;
                    }
                    // Delete/Backspace: 텍스트 커서가 블록 안에 있으면 일반 텍스트 삭제 허용
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        const _sel = window.getSelection();
                        if (_sel && _sel.rangeCount > 0) {
                            const _r = _sel.getRangeAt(0);
                            if (activeLayer.contains(_r.commonAncestorContainer)) {
                                return; // 텍스트 커서 모드 — 브라우저 기본 삭제 허용
                            }
                        }
                        e.preventDefault();
                        recordState();
                        activeLayer.remove();
                        activeLayer = null;
                        hideAllTools();
                        recordState();
                        showToast('블록이 삭제되었습니다.');
                        return;
                    }
                }

                if (e.ctrlKey && e.key === 'x' && activeLayer && (activeLayer.classList.contains('custom-resizer') || activeLayer.tagName === 'IMG')) {
                    e.preventDefault();
                    imgCutAction();
                    return;
                }

                if (e.ctrlKey && e.key === 'c' && activeLayer && (activeLayer.classList.contains('custom-resizer') || activeLayer.tagName === 'IMG')) {
                    const sel = window.getSelection();
                    if (!sel || sel.toString().trim() === '') {
                        e.preventDefault();
                        imgCopyAction();
                        return;
                    }
                }

                if (e.ctrlKey && e.key === 'v' && imgClipboard) {
                    e.preventDefault();
                    imgPasteAction();
                    return;
                }
                if (e.ctrlKey && e.key === 'v' && blockClipboard && !e.target.closest('td, th')) {
                    // blockClipboard가 있고 이미지 클립보드가 없는 경우에만 블록 붙여넣기
                    if (!imgClipboard) {
                        e.preventDefault();
                        blockPasteAction();
                        return;
                    }
                }
                
                // Delete/Backspace - 테이블 셀 선택 상태
                if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCells.length > 0) {
                    const selection = window.getSelection();
                    // 텍스트가 선택된 경우 브라우저 기본 동작 허용 (텍스트 삭제)
                    // 단, 선택이 셀 경계를 넘는 경우만 방지
                    if (selection.toString().length === 0) { e.preventDefault(); smartDeleteAction('row'); }

                // td 안 이미지 선택 상태에서 Delete/Backspace → 이미지 삭제
                } else if ((e.key === 'Delete' || e.key === 'Backspace') && activeLayer && activeLayer.tagName === 'IMG' && activeLayer.closest('td, th')) {
                    e.preventDefault();
                    recordState();
                    const parentTd = activeLayer.closest('td, th');
                    activeLayer.remove();
                    activeLayer = null;
                    hideAllTools();
                    hideImgFloatToolbar();
                    lastActiveCell = parentTd;
                    recordState();
                    showToast('이미지가 삭제되었습니다.');

                // 일반 콘텐츠 영역 이미지/영상 (custom-resizer 래퍼 또는 bare 요소) 삭제
                } else if ((e.key === 'Delete' || e.key === 'Backspace') && activeLayer && (
                    activeLayer.classList?.contains('custom-resizer') ||
                    (activeLayer.tagName === 'IMG' && !activeLayer.closest('td, th')) ||
                    activeLayer.tagName === 'VIDEO'
                )) {
                    e.preventDefault();
                    recordState();
                    activeLayer.remove();
                    activeLayer = null;
                    hideAllTools();
                    hideImgFloatToolbar();
                    recordState();
                    showToast('미디어가 삭제되었습니다.');
                }

                // Enter 키 처리 - p 태그 안이면 새 p, 아니면 br
                if (e.key === 'Enter' && !e.shiftKey && !e.target.closest('td, th')) {
                    const sel = window.getSelection();
                    if (!sel || !sel.rangeCount) return;
                    const node = sel.anchorNode;
                    const el = node ? (node.nodeType === 3 ? node.parentElement : node) : null;
                    const inSeDiv = el && el.closest('.se-div');
                    const inP = el && el.closest('p');
                    if (inSeDiv) {
                        e.preventDefault();
                        const range = sel.getRangeAt(0);
                        range.deleteContents();
                        if (inP && inP.closest('.se-div')) {
                            // p 태그 안 → p 뒤에 새 p 삽입
                            const newP = document.createElement('p');
                            const styleStr = inP.getAttribute('style') || 'margin:0;line-height:1.8;';
                            newP.setAttribute('style', styleStr);
                            newP.innerHTML = '<br>';
                            inP.insertAdjacentElement('afterend', newP);
                            const newRange = document.createRange();
                            newRange.setStart(newP, 0);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                        } else {
                            // p 밖 → br 삽입
                            const br = document.createElement('br');
                            range.insertNode(br);
                            const newRange = document.createRange();
                            newRange.setStartAfter(br);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                        }
                        recordState(); // Enter 후 즉시 스냅샷 — Ctrl+Z 즉시 복원 보장
                    }
                }
            });

            recordState();

            // contentArea가 비어도 최소 높이 유지 (삭제 시 영역 사라짐 방지)
            const areaObserver = new MutationObserver(() => {
                const hasContent = area.innerHTML.trim().replace(/<br\s*\/?>/gi,'').replace(/&nbsp;/gi,'').trim().length > 0;
                area.style.minHeight = hasContent ? '200px' : '600px';
            });
            areaObserver.observe(area, { childList: true, subtree: true });
            area.addEventListener('click', e => {
                // 링크 새탭 열기
                // - 버튼 링크(<a> 또는 버튼 안 <a>): 일반 클릭으로 새 탭 (팝업 트리거·탭 버튼 제외)
                // - 일반 텍스트 링크: Ctrl/Cmd+클릭으로 새 탭
                const clickedLink = e.target.closest('a[href]');
                if (clickedLink && area.contains(clickedLink)) {
                    const isPopupTrigger = clickedLink.classList.contains('popup-trigger') || clickedLink.closest('.popup-trigger');
                    const isTabBtn = clickedLink.classList.contains('se-tab-btn') || clickedLink.closest('.se-tab-nav, .se-tabs');
                    const linkHref = clickedLink.getAttribute('href') || '';
                    const isAnchorLink = linkHref.startsWith('#') || linkHref === 'javascript:void(0)' || linkHref === 'javascript:;';
                    const isButtonLink = clickedLink.closest('button') ||
                        clickedLink.style.display?.includes('inline-flex') ||
                        clickedLink.style.display?.includes('flex') ||
                        clickedLink.style.borderRadius ||
                        clickedLink.style.padding ||
                        clickedLink.classList.contains('btn') ||
                        clickedLink.getAttribute('role') === 'button';
                    if (!isPopupTrigger && !isTabBtn && !isAnchorLink && (isButtonLink || e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(clickedLink.href, '_blank', 'noopener');
                        return;
                    }
                }
                // contenteditable 안에서 onclick 속성 실행 허용
                const onclickEl = e.target.closest('[onclick]');
                if (onclickEl && area.contains(onclickEl)) {
                    // popup-trigger: 에디터에서는 onclick 실행 안 함 (childPanel이 처리)
                    if (onclickEl.classList.contains('popup-trigger') || onclickEl.hasAttribute('data-popup')) return;
                    const fn = onclickEl.getAttribute('onclick');
                    if (fn) {
                        try { new Function(fn).call(onclickEl); } catch(err) { console.warn('onclick:', err); }
                    }
                }

                const clickedImg   = e.target.tagName === 'IMG' ? e.target : null;
                const clickedVideo = e.target.tagName === 'VIDEO' ? e.target : e.target.closest('video');
                const clickedResizer = e.target.closest('.custom-resizer');

                if (clickedResizer) {
                    e.preventDefault();
                    if (activeLayer) activeLayer.classList.remove('active-layer');
                    activeLayer = clickedResizer;
                    activeLayer.classList.add('active-layer');
                    getById('tableTools').style.display = 'none';
                    getById('imgTools').style.display = 'flex';
                    getById('divTools').style.display = 'none';
                    showImgFloatToolbar(activeLayer);
                    return;
                }

                // Ctrl+클릭 또는 se-div 직접 클릭 시 div 선택
                const clickedDiv = e.target.classList?.contains('se-div') ? e.target : e.target.closest('.se-div');
                if (clickedDiv && area.contains(clickedDiv) && (e.ctrlKey || e.metaKey || e.target === clickedDiv)) {
                    if (activeLayer) activeLayer.classList.remove('active-layer');
                    activeLayer = clickedDiv;
                    activeLayer.classList.add('active-layer');
                    getById('tableTools').style.display = 'none';
                    getById('imgTools').style.display = 'none';
                    getById('divTools').style.display = 'flex';
                    // 아래 줄 추가 버튼 - 선택된 div 바로 아래에 위치
                    positionAddLineBtn();
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); return; }
                }

                if (clickedImg && area.contains(clickedImg)) {
                    e.preventDefault();
                    if (activeLayer) activeLayer.classList.remove('active-layer');
                    area.querySelectorAll('.img-selected').forEach(el => el.classList.remove('img-selected'));
                    getById('tableTools').style.display = 'none';
                    getById('imgTools').style.display = 'flex';
                    getById('divTools').style.display = 'none';
                    hideImgFloatToolbar();

                    // td/th 안 이미지: 래퍼 없이 글자처럼 inline 취급 — 직접 선택
                    if (clickedImg.closest('td, th')) {
                        clickedImg.classList.add('img-selected');
                        activeLayer = clickedImg;
                        showImgFloatToolbar(activeLayer);
                        return;
                    }

                    recordState();
                    const wrap = wrapImgInResizer(clickedImg);
                    wrap.classList.add('active-layer');
                    activeLayer = wrap;
                    recordState();
                    showImgFloatToolbar(activeLayer);
                    return;
                }

                // 영상 클릭 → 이미지와 동일하게 리사이저 래핑 + 선택
                if (clickedVideo && area.contains(clickedVideo) && !clickedVideo.closest('.custom-resizer')) {
                    e.preventDefault();
                    if (activeLayer) activeLayer.classList.remove('active-layer');
                    getById('tableTools').style.display = 'none';
                    getById('imgTools').style.display = 'flex';
                    getById('divTools').style.display = 'none';
                    hideImgFloatToolbar();
                    recordState();
                    const wrap = wrapImgInResizer(clickedVideo);
                    wrap.classList.add('active-layer');
                    activeLayer = wrap;
                    recordState();
                    showImgFloatToolbar(activeLayer);
                    return;
                }

                if (e.target === area) {
                    const newDiv = document.createElement('div');
                    newDiv.innerHTML = '<br>';
                    area.appendChild(newDiv);
                    newDiv.focus();
                }
            });


            document.addEventListener('mousedown', function(e) {
                const area = getById('contentArea');
                // 플로팅 툴바 클릭 시 선택 상태 유지 (툴바가 contentArea 밖 fixed 엘리먼트)
                const imgTb  = getById('imgFloatToolbar');
                const tblTb  = getById('tableFloatToolbar');
                const vidTb  = getById('videoOptToolbar');
                const addBtn = getById('addLineBtn');
                if ((imgTb && imgTb.contains(e.target)) || (tblTb && tblTb.contains(e.target)) || (vidTb && vidTb.contains(e.target))) return;
                // addLineBtn 클릭 시 activeLayer 유지 (클릭 핸들러에서 사용)
                if (addBtn && addBtn.contains(e.target)) return;

                const inContentArea = area && area.contains(e.target);
                const inChildArea   = !!e.target.closest('[id^="childArea_"]');
                if (!inContentArea && !inChildArea) {
                    clearActiveLayer(); // img-selected 포함 전체 해제
                    clearSelection();
                    hideTableFloatToolbar();
                }
            });
        });

        function addLineBelow() {
            if (!activeLayer) return;
            // 스크롤 위치 저장 (focus 시 위로 튀는 현상 방지)
            const scrollContainer = getById('canvasScroll');
            const savedScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
            recordState();
            const newP = document.createElement('p');
            const textColor = getById('textColorPicker')?.value || '#1e293b';
            newP.style.cssText = `margin:0;line-height:1.8;color:${textColor};font-size:inherit;`;
            newP.innerHTML = '<br>';
            activeLayer.after(newP);
            activeLayer.classList.remove('active-layer');
            activeLayer = null;
            getById('addLineBtn').style.display = 'none';
            getById('divTools').style.display = 'none';
            recordState();
            setTimeout(() => {
                const area2 = getById('contentArea');
                if (area2) {
                    // 스크롤 복원 후 focus (preventScroll로 위치 유지)
                    area2.focus({ preventScroll: true });
                    const sel2 = window.getSelection();
                    const range2 = document.createRange();
                    range2.setStart(newP, 0);
                    range2.collapse(true);
                    sel2.removeAllRanges();
                    sel2.addRange(range2);
                    if (scrollContainer) scrollContainer.scrollTop = savedScrollTop;
                    newP.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }, 10);
        }

    