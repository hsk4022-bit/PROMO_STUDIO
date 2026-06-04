// promo-editor/js/color-palette.js — 색상 시스템 + 팔레트 (← rules/06-color-system.md)
//
// app.js 에서 분리 (Stage 2 — 2026-05-28). 원본 L194-543 (=Stage 1 후 L1-340).
// 포함: getPopupBtnStyle, fixPopupTriggerStyles, protectSectionCards/AccentBars,
//       getLuminance, isDarkColor, blendHex, hexToHsl, hslToHex, generatePalette,
//       generateAgentPalette (Gemini Vision 호출), enforcePaletteHierarchy,
//       generateBgVariants, renderBgVariants, getMimeType, POPUP_BTN_STYLE.
//
// 의존:
// - state.js: (없음 — 모든 호출이 runtime, state read는 없음)
// - utils.js: getById, CONTENT_MODEL
// - app.js (runtime 호출): apiFetch, changeBg, showToast
// - 자식: getPopupBtnStyle 가 isDarkColor 호출, renderBgVariants 가 generateBgVariants/isDarkColor 호출 (모두 같은 파일)

        // 팝업 트리거 버튼 공통 스타일 — 모든 팝업 버튼은 이 스타일 사용
        const POPUP_BTN_STYLE = 'display:inline-flex;align-items:center;justify-content:center;width:1.375rem;height:1.375rem;border-radius:50%;background-color:var(--popup-btn-color,#7c3aed);color:#ffffff;font-size:0.75rem;font-weight:900;border:none;cursor:pointer;vertical-align:middle;margin:0 0.25rem;line-height:1;';
        function getPopupBtnStyle() {
            const ac = getById('accentPicker')?.value;
            // accent가 없거나 기본값이면 DOM에서 포인트 색 추출 시도
            //   [SSOT 2026-06-04] 자체 빈도 추출(게이트 없음) → detectAccentFromDom 으로 통일.
            //   bg hue-family 게이트가 적용돼 off-family(주황 로고) 가 팝업 버튼색으로 새지 않음.
            let color = (ac && ac !== '#888888') ? ac : null;
            if (!color) {
                const area = getById('contentArea');
                const bg = getById('bgPicker')?.value || '';
                color = detectAccentFromDom(area, bg, {});
            }
            if (!color) color = getById('bgPicker')?.dataset?.accent || '#888888';
            const _btnTextColor = isDarkColor(color) ? '#ffffff' : '#000000';
            return `display:inline-flex;align-items:center;justify-content:center;width:1.375rem;height:1.375rem;border-radius:50%;background-color:${color};color:${_btnTextColor};font-size:0.75rem;font-weight:900;border:none;cursor:pointer;vertical-align:middle;margin:0 0.25rem;line-height:1;`;
        }
        // 에디터 DOM 안 popup-trigger 버튼의 style attribute를 hex로 강제 재설정
        // 브라우저 contenteditable이 hex → rgb() 변환하므로 setAttribute로 덮어씀
        function fixPopupTriggerStyles() {
            const style = getPopupBtnStyle();
            document.querySelectorAll('#contentArea .popup-trigger[data-popup], [id^="childArea_"] .popup-trigger[data-popup]').forEach(el => {
                const extra = el.tagName === 'A' ? 'text-decoration:none;' : '';
                el.setAttribute('style', style + extra);
            });
        }

        // 섹션 카드의 border-radius가 편집 중 손상되지 않도록 overflow:hidden 보장
        function protectSectionCards() {
            document.querySelectorAll('#contentArea .se-div').forEach(div => {
                const style = div.getAttribute('style') || '';
                // border-radius가 있는 카드형 se-div에 overflow:hidden 보장
                if (style.includes('border-radius')) {
                    if (!style.includes('overflow')) div.style.overflow = 'hidden';
                    // contenteditable 내부에서 position:absolute 요소(accent bar)에
                    // 브라우저(Chrome)가 z-index:251659264를 자동 부여해 팝업 위로 뜨는 문제 방지.
                    // 카드에 isolation:isolate로 stacking context를 생성해 accent bar z-index를 카드 내부에 격리.
                    div.style.isolation = 'isolate';
                }
            });
        }

        // 섹션 상단 accent bar가 contenteditable에서 확장되지 않도록 보호
        function protectAccentBars() {
            document.querySelectorAll('#contentArea .se-div').forEach(div => {
                const h = div.style.height;
                const bg = div.style.backgroundColor;
                // height가 매우 작고(0.1875rem/3px 이하) 배경색이 있는 accent bar 감지
                if (bg && h && (h === '0.1875rem' || h === '3px' || h === '0.125rem' || h === '2px')) {
                    div.style.maxHeight = h;
                    div.style.overflow = 'hidden';
                    div.style.fontSize = '0';
                    div.style.lineHeight = '0';
                    // 편집 시 내용 삽입으로 높이 변경 방지
                    div.innerHTML = '';
                }
            });
        }

        // ── 공통 유틸리티 ──────────────────────────────────────────────────
        function getLuminance(hex) {
            const r = parseInt(hex.slice(1,3),16)||0;
            const g = parseInt(hex.slice(3,5),16)||0;
            const b = parseInt(hex.slice(5,7),16)||0;
            return (r*299 + g*587 + b*114) / 1000;
        }
        function isDarkColor(hex) { return getLuminance(hex) < 128; }

        // ── accent 후보 분석 헬퍼 (loadHtmlFile / generateContent 양쪽 accent 자동 감지에서 공용) ──
        //   RGB 맨해튼 거리: bg 와 충분히 떨어진 색만 accent 후보로.
        function colorDistance(a, b) {
            const ar=parseInt(a.slice(1,3),16), ag=parseInt(a.slice(3,5),16), ab=parseInt(a.slice(5,7),16);
            const br=parseInt(b.slice(1,3),16), bg_=parseInt(b.slice(3,5),16), bb=parseInt(b.slice(5,7),16);
            return Math.abs(ar-br)+Math.abs(ag-bg_)+Math.abs(ab-bb);
        }
        //   중성색(저채도/거의 흰색/거의 검정) 판별: accent 후보에서 제외.
        //   ⚠️ [2026-06-04 핵심버그fix] 흰색 판정은 `min>230`(전 채널 높음) 이어야 함.
        //     기존 `max>230` 은 R=255 인 vivid 빨강/주황(#ff4d4d/#ff9a00)을 "거의 흰색"으로 오판 →
        //     모든 hue-family 게이트·강제 치환이 가장 선명한 255짜리 warm 색(로고/축제색)을 통째로 흘려보냄.
        //     이게 accent 가 계속 주황/빨강으로 새던 진짜 근본 원인. (near-white=min>230, vivid=low min)
        function isNeutralColor(c) {
            const r=parseInt(c.slice(1,3),16), g=parseInt(c.slice(3,5),16), b=parseInt(c.slice(5,7),16);
            return (Math.max(r,g,b)-Math.min(r,g,b)) < 30 || Math.min(r,g,b) > 230 || (r<25&&g<25&&b<25);
        }

        // ── accent 선택 SSOT (2026-06-04) ────────────────────────────────────
        //   회귀: 파란 히어로인데 본문/이미지 안 주황 로고가 accent 로 굳음(#ff9a00).
        //   원인: accent SET 지점 4곳 중 hue-family 게이트가 픽셀 추출 1곳에만 있었음.
        //     본문 DOM 최빈색 재감지(loadHtmlFile / syncAccentPicker)가 게이트 없이 덮어써
        //     bg(파랑) 와 이질적인 주황을 선택 → 자기강화 루프.
        //   해결: hue-family 게이트를 이 단일 함수로 통합. off-family(bgHue ±90° 밖) 하드 제외.
        //
        //   pickAccentFromCandidates: [{hex, weight}] 후보 → bg hue family 게이트 → 최고 1개.
        //     반환 null = "같은 계열 후보 없음"(호출자가 폴백 결정).
        //     image-editor.js 픽셀 추출(weight=픽셀빈도) 과 본문 DOM(weight=색빈도) 양쪽이 공용.
        function pickAccentFromCandidates(candidates, bgHex) {
            if (!candidates || !candidates.length || !/^#[0-9a-fA-F]{6}$/.test(bgHex || '')) return null;
            const [bgH, bgS] = hexToHsl(bgHex);
            const reliable = bgS >= 0.12;            // bg 채도 낮으면 hue 불안정 → 게이트 스킵
            let best = null, bestScore = 0;
            for (const { hex, weight } of candidates) {
                if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) continue;
                const [h, s] = hexToHsl(hex);
                let mult = 1.0;
                if (reliable) {
                    let d = Math.abs(h - bgH); if (d > 180) d = 360 - d;
                    mult = d > 90 ? 0 : d > 45 ? 0.3 : 1.0;   // off-family 하드 제외(0)
                }
                const score = s * weight * mult;
                if (score > bestScore) { bestScore = score; best = hex; }
            }
            return best;
        }

        //   detectAccentFromDom: 본문 area 의 inline color hex 빈도 → pickAccentFromCandidates → 폴백.
        //     반환 null = "덮어쓰지 말 것"(기존 accentPicker 유지 — off-family 굳힘 방지 핵심).
        //     opts.fallbackAccent: 기존 accentPicker 값(있으면 유지, 없을 때만 bg-hue 생성).
        function detectAccentFromDom(area, bgHex, opts = {}) {
            if (!area || !/^#[0-9a-fA-F]{6}$/.test(bgHex || '')) return null;
            const bg = bgHex.toLowerCase();
            const freq = {};
            area.querySelectorAll('[style]').forEach(el => {
                const m = el.getAttribute('style').match(/#[0-9a-fA-F]{6}/g);
                if (m) m.forEach(c => { const k = c.toLowerCase(); freq[k] = (freq[k] || 0) + 1; });
            });
            const cands = Object.entries(freq)
                .filter(([c]) => c !== bg && colorDistance(c, bg) > 60 && !isNeutralColor(c))
                .map(([hex, weight]) => ({ hex, weight }));
            const picked = pickAccentFromCandidates(cands, bg);
            if (picked) return picked;
            // 폴백: 기존 accent 유지(null), 없거나 기본값일 때만 bg-hue 생성
            const prev = opts.fallbackAccent;
            if (prev && /^#[0-9a-fA-F]{6}$/.test(prev) && prev !== '#888888') return null;
            return generatePalette(bgHex).accent;
        }

        // rgba() 없이 배경색 + 오버레이를 alpha 블렌딩해 6자리 hex 반환
        function blendHex(bgHex, overlayHex, alpha) {
            const clamp = v => Math.min(255, Math.max(0, Math.round(v)));
            const br=parseInt(bgHex.slice(1,3),16), bg_=parseInt(bgHex.slice(3,5),16), bb=parseInt(bgHex.slice(5,7),16);
            const or=parseInt(overlayHex.slice(1,3),16), og=parseInt(overlayHex.slice(3,5),16), ob=parseInt(overlayHex.slice(5,7),16);
            return '#' + [br*(1-alpha)+or*alpha, bg_*(1-alpha)+og*alpha, bb*(1-alpha)+ob*alpha]
                .map(v => clamp(v).toString(16).padStart(2,'0')).join('');
        }

        // ── 컬러 하모니: 배경색 기반 팔레트 자동 생성 ──
        function hexToHsl(hex) {
            let r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
            const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
            let h = 0, s = 0, l = (max+min)/2;
            if (d > 0) {
                s = l > 0.5 ? d/(2-max-min) : d/(max+min);
                if (max === r) h = ((g-b)/d + (g<b?6:0))/6;
                else if (max === g) h = ((b-r)/d+2)/6;
                else h = ((r-g)/d+4)/6;
            }
            return [h*360, s, l];
        }
        function hslToHex(h, s, l) {
            h = ((h%360)+360)%360;
            const a = s * Math.min(l, 1-l);
            const f = n => { const k = (n+h/30)%12; return Math.round(255*(l - a*Math.max(-1, Math.min(k-3, 9-k, 1)))); };
            return '#' + [f(0),f(8),f(4)].map(v => Math.min(255,Math.max(0,v)).toString(16).padStart(2,'0')).join('');
        }
        function generatePalette(bgHex) {
            const [bh, bs, bl] = hexToHsl(bgHex);
            const dark = bl < 0.5;
            // [2026-06-02] accent: 히어로/배경과 **같은 색 계열(동일 hue)** — 대비는 채도·명도로 (POP).
            //   기존 분할보색(+150°)은 파란 히어로 → 주황 accent 처럼 색 계열이 어긋나는 회귀 원인(사용자 지적).
            //   디자인 시스템 룰(06: "accent = bg/히어로와 같은 temperature family, 활기는 채도로")과도 일치.
            //   ※ app.js clampAccentSat 이 채도만 0.45~0.70 으로 제한(hue 보존) → 파란 hue 유지됨.
            const accentH = bh;  // 동일 hue (같은 계열)
            const accentS = Math.min(0.78, Math.max(0.55, bs > 0.25 ? bs * 1.15 : 0.6));  // 채도 부스트로 대비
            const accentL = dark ? Math.min(0.66, Math.max(0.52, 0.6)) : Math.min(0.5, Math.max(0.38, 0.44));
            const accent = hslToHex(accentH, accentS, accentL);
            const surface = blendHex(bgHex, dark ? '#ffffff' : '#000000', 0.08);
            const border = blendHex(bgHex, dark ? '#ffffff' : '#000000', 0.15);
            const text = dark ? '#e8e8e8' : '#2d2d2d';
            const sub = dark ? '#9ca3af' : '#6b7280';
            return { bg: bgHex, accent, surface, border, text, sub };
        }

        // [agent-palette 2026-05-14] Gemini Vision 으로 히어로 이미지 분석 → mood-aware 팔레트 추천
        // 픽셀 빈도 알고리즘 대신 디자이너 수준의 색상 선택 + 검증 통과한 팔레트 반환.
        // 실패 시 호출자가 fallback (pixel extraction + enforcePaletteHierarchy) 사용.
        async function generateAgentPalette(heroBase64OrSrc) {
            const _heroBase64 = (heroBase64OrSrc || '').startsWith('data:')
                ? heroBase64OrSrc.split(',')[1]
                : null;
            if (!_heroBase64) throw new Error('히어로 이미지 base64 필요');
            const mime = (heroBase64OrSrc.match(/data:(image\/[a-z+]+);/i) || [])[1] || 'image/png';

            const systemPrompt = `You are a senior visual designer specializing in Korean game promotional pages.

TASK: Look at the hero image and design a 6-color palette that captures its mood AND passes strict readability rules.

OUTPUT: Strict JSON only (no markdown, no commentary):
{
  "mood": "brief description (e.g. 'warm afternoon tea elegance')",
  "bg": "#xxxxxx",
  "surface": "#xxxxxx",
  "accent": "#xxxxxx",
  "text": "#xxxxxx",
  "sub": "#xxxxxx",
  "border": "#xxxxxx"
}

HARD RULES (any violation = bad output):
- bg: light theme L 0.92~0.96 OR dark theme L 0.05~0.18. NEVER mid-lightness 0.40~0.80 (muddy zone).
- bg saturation MUST be S 0.30~0.55 — CONFIDENT warm/cool pastel, NOT near-neutral grayish white. The bg should clearly express the hero's mood color (warm cream, cool mint, dusty rose pastel, etc.), not look like washed-out neutral.
- surface: lighter than bg (light theme L 0.97, dark theme 0.24~0.28). Saturation slightly lower than bg (S 0.20~0.40) but still has visible hue.
- accent: the page's vivid POP color. Saturation MUST be S ≥ 0.65. L 0.38~0.55 (light) or 0.50~0.68 (dark).
  ⚠️ HARMONY (critical): the accent MUST belong to the SAME temperature/mood family as bg & the hero scene.
    · Warm hero (browns, amber, lava, gold, burgundy, crimson) → warm accent (amber, coral, terracotta, warm red, gold). NEVER a cool/off pink, magenta, cyan, violet.
    · Cool hero (blue, teal, mint, violet) → cool accent in that family.
  · Pick the hue from a PROMINENT, already-saturated element of the hero — not a small off-temperature outlier.
  · Do NOT over-boost a deep/muted source color into a clashing neon. A dark burgundy must become a rich warm red/crimson, NOT hot pink. Raise saturation only within the hero's own hue/temperature.
- text: light theme L ≤ 0.10 (near black with subtle hue hint), dark theme L ≥ 0.96.
- sub: text L + (light: +0.22) or (dark: -0.24).
- border: light theme L 0.70~0.78, dark theme L 0.38~0.42. Saturation matches bg's hue family.

CRITICAL: A common failure mode is producing "muddy" output by going to near-neutral grayish whites (S near 0). The output should feel like a designed brand palette (think: stationary brand, fashion magazine), NOT like a default Bootstrap reset. Bg with confident chroma (warm cream #ffe8d0 / cool mint #d9f0e8 / dusty lavender #e8dff5) is the target, NOT desaturated near-white (#f5f0ee).

DESIGN INTENT:
- 3-tier lightness hierarchy: bg(~0.95) → accent(~0.45) → text(~0.05). Visual depth.
- Korean elegant/warm moods: bg should be warm-white (cream), NOT pure cold white.
- Korean dark/premium moods: bg should be deep navy/charcoal, NOT pure black.
- accent is the page's "heartbeat" — one bold color from the hero that POPS against bg yet clearly belongs to the same warm/cool family as the scene. Vibrancy comes from SATURATION, never from a clashing off-temperature hue.
- ALL 6 colors should feel like they belong to ONE designed palette, not picked independently.`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONTENT_MODEL}:generateContent`;
            const body = {
                contents: [{
                    parts: [
                        { inlineData: { mimeType: mime, data: _heroBase64 } },
                        { text: 'Analyze this hero image and produce the palette JSON.' }
                    ]
                }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 1500,  // [2026-05-20 r2] 800→1500
                    // [2026-05-20 r3] thinkingBudget: 0 — Gemini 3 Flash 가 기본적으로 thinking 모드라
                    //   1500 토큰 중 ~1400 을 think 토큰으로 소진하고 출력에 100 만 남겨 MAX_TOKENS 로 잘림.
                    //   팔레트는 단순 JSON 출력이라 추론 불필요. thinking 0 이면 1500 전부 output 사용 가능.
                    thinkingConfig: { thinkingBudget: 0 },
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            mood:    { type: 'string' },
                            bg:      { type: 'string' },
                            surface: { type: 'string' },
                            accent:  { type: 'string' },
                            text:    { type: 'string' },
                            sub:     { type: 'string' },
                            border:  { type: 'string' }
                        },
                        required: ['mood', 'bg', 'surface', 'accent', 'text', 'sub', 'border']
                    }
                }
            };
            const res = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
            // [diag 2026-05-20] finishReason 노출 — 응답 잘림 원인 추적 (STOP / MAX_TOKENS / SAFETY 등)
            const _finish = res?.candidates?.[0]?.finishReason || '(none)';
            const raw = res?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (_finish !== 'STOP' && _finish !== '(none)') {
                console.warn('[agent-palette] non-STOP finishReason:', _finish, '— raw len:', raw.length);
            }
            // [2026-05-20] JSON 파싱 강화 — markdown 코드블록 / 빈 응답 / 부분 응답 안전 처리
            if (!raw || raw.trim().length < 10) {
                console.warn('[agent-palette] empty response, raw:', JSON.stringify(raw).slice(0, 200));
                throw new Error('AI palette empty response');
            }
            // ```json ... ``` 같은 마크다운 wrap 제거
            const _cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
            let json;
            try {
                json = JSON.parse(_cleaned);
            } catch (parseErr) {
                // partial JSON 일 가능성 — { ... } 범위만 잘라 재시도
                const m = _cleaned.match(/\{[\s\S]*\}/);
                if (m) {
                    try { json = JSON.parse(m[0]); } catch (_) {
                        console.warn('[agent-palette] JSON parse failed even after regex extract. raw:', _cleaned.slice(0, 300));
                        throw parseErr;
                    }
                } else {
                    console.warn('[agent-palette] no JSON object in response. raw:', _cleaned.slice(0, 300));
                    throw parseErr;
                }
            }
            const hex = /^#[0-9a-fA-F]{6}$/;
            const need = ['bg','surface','accent','text','sub','border'];
            for (const k of need) {
                if (!hex.test(String(json[k] || ''))) throw new Error('Invalid hex for ' + k + ': ' + json[k]);
            }
            return {
                bg: json.bg, surface: json.surface, accent: json.accent,
                text: json.text, sub: json.sub, border: json.border,
                mood: json.mood || ''
            };
        }

        // [palette-hierarchy 2026-05-14] hue-locked L/S 강제 fit (fallback / safety net)
        // Gemini Vision 호출 실패 또는 응답 invalid 시 픽셀 추출 + 이 함수로 hierarchy 강제.
        // generateContent 에서도 호출 (사용자가 픽커 수동 조정한 경우 정합 보정).
        function enforcePaletteHierarchy(bgHex, accentHex) {
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            const [bgH, bgS, bgL] = hexToHsl(bgHex);
            const [acH, acS, acL] = hexToHsl(accentHex);
            const isDark = bgL < 0.5;
            // [saturation-restored 2026-05-14] bg/surface 채도를 깎지 않고 boost.
            //   이전 (S ≤ 0.22) → near-neutral 회백색 → 사용자 "muddy" 인지.
            //   현재 (S 0.30~0.55) → 자신 있는 warm/cool pastel → 깨끗하면서 활기 있음.
            //   고명도(L 0.93+) + 고채도 조합은 "muddy zone(L 0.40~0.80 + S<0.30)" 과 완전히 다른 영역.
            if (isDark) {
                // [2026-06-04] surface 채도 상향 — 카드 프레임이 탁한 회색빛으로 빠지지 않고 확실한 cool 톤.
                //   bg 채도 × 1.2 부스트(0.58~0.85). 회색 안 쓰는 디자인이라 bg 보다도 살짝 더 진하게.
                //   ※ 팝업 박스/카드도 같은 surface(dataset.surface)를 써서 동일하게 적용됨.
                const _surface  = hslToHex(bgH, clamp(bgS * 1.2, 0.58, 0.85), 0.25);
                const _thBgFull = hslToHex(acH, clamp(acS * 0.80, 0.40, 0.70), 0.32);
                // 헤더 bg: 풀 톤을 surface 위 alpha 0.5 로 얹은 효과 (50% opacity)
                const _thBg     = blendHex(_surface, _thBgFull, 0.5);
                return {
                    bg:      hslToHex(bgH, clamp(bgS, 0.30, 0.65), clamp(bgL, 0.05, 0.18)),
                    surface: _surface,
                    text:    hslToHex(bgH, 0.06, 0.96),
                    sub:     hslToHex(bgH, 0.10, 0.72),
                    accent:  hslToHex(acH, clamp(acS, 0.60, 0.85), clamp(acL, 0.50, 0.68)),
                    thBg:    _thBg,
                    // 라인은 풀 톤 기준으로 계산 (헤더 알파와 별개 — 라인까지 흐려지면 안 됨)
                    border:  blendHex(_surface, _thBgFull, 0.6),
                };
            } else {
                const _surface = hslToHex(bgH, clamp(bgS, 0.20, 0.40), 0.97);
                const _thBgFull = hslToHex(acH, clamp(acS * 0.65, 0.30, 0.55), 0.85);
                // 헤더 bg: 풀 톤을 surface 위 alpha 0.5 로 얹은 효과 (50% opacity)
                const _thBg    = blendHex(_surface, _thBgFull, 0.5);
                const _text    = hslToHex(bgH, 0.20, 0.10);
                // 라이트 테마: surface(L 0.97) 와 thBg 차이가 작아 alpha blend 만으로는 라인 흐림.
                //   → 풀 thBg 를 text 쪽으로 20% 끌어내려 "헤더보다 약간 짙은 색" 만든 뒤, surface 위 alpha 0.6 로 얹음.
                //   (헤더 알파와 별개 — 라인은 풀 톤 기준으로 계산해야 흐려지지 않음)
                const _thBgDeep = blendHex(_thBgFull, _text, 0.2);
                return {
                    bg:      hslToHex(bgH, clamp(bgS, 0.30, 0.55), clamp(bgL, 0.92, 0.96)),
                    surface: _surface,
                    text:    _text,
                    sub:     hslToHex(bgH, 0.18, 0.32),
                    accent:  hslToHex(acH, clamp(acS, 0.65, 0.85), clamp(acL, 0.38, 0.55)),
                    // 헤더 강조: accent 톤이 명확하게 드러나도록 채도 boost + 명도 살짝 down
                    thBg:    _thBg,
                    border:  blendHex(_surface, _thBgDeep, 0.6),
                };
            }
        }

        // ── 팔레트 최종 결정 (SSOT — 본문/팝업/슬라이서가 쓰는 7색 단일 진실 소스) ──
        //   입력: 확정된 bg/accent + (선택) agent 팔레트 {surface,text,sub,border} (Gemini Vision).
        //   규칙(디자인 시스템 rules/06): surface 는 bg 의 elevation 방향이어야 함.
        //     → agent surface 의 명도가 bg 와 어긋나면(밝은 bg + 짙은 surface) agent 무시,
        //       enforcePaletteHierarchy 로 bg 일관 팔레트 재도출 (히어로 bg 색 = 본문 카드 색).
        //   muted: bg < muted < surface 위계. text 와 블렌드 금지(탁한 회색 방지).
        function resolvePalette(bgHex, accentHex, agent) {
            const _muted = (hex) => {
                const [h, s, l] = hexToHsl(hex);
                const newL = (l < 0.5) ? Math.min(0.22, l + 0.08) : Math.min(0.96, l + 0.03);
                return hslToHex(h, s, newL);
            };
            const hexRe = /^#[0-9a-fA-F]{6}$/;
            const a = agent || {};
            const agValid = a.surface && hexRe.test(a.surface) && a.text && hexRe.test(a.text) &&
                a.sub && hexRe.test(a.sub) && a.border && hexRe.test(a.border);
            const agConsistent = agValid && (isDarkColor(a.surface) === isDarkColor(bgHex));
            if (agValid && !agConsistent) {
                console.warn('[palette] agentSurface', a.surface, 'lightness mismatches bg', bgHex, '→ deriving surface from bg (enforcePaletteHierarchy)');
            }
            if (agConsistent) {
                return {
                    bg: bgHex, accent: accentHex,
                    surface: a.surface, text: a.text, sub: a.sub, border: a.border,
                    thBg: blendHex(bgHex, accentHex, 0.25),   // 헤더 = accent+bg blend
                    muted: _muted(bgHex),
                    source: 'agent',
                };
            }
            const p = enforcePaletteHierarchy(bgHex, accentHex);
            return {
                bg: p.bg, accent: p.accent,
                surface: p.surface, text: p.text, sub: p.sub, border: p.border,
                thBg: p.thBg,
                muted: _muted(p.bg),
                source: 'hierarchy',
            };
        }

        // ── 유사 배경색 추천 (현재 배경 기반 톤 변형 5개) ──
        function generateBgVariants(bgHex) {
            const [h, s, l] = hexToHsl(bgHex);
            const variants = [];
            // 색상(hue) ±3°~8°, 채도 ±0.02, 명도 ±0.02~0.04 — 흡사한 범위
            const offsets = [
                { dh: -7, ds: 0.02, dl: -0.03 },
                { dh: -3, ds: -0.01, dl: 0.02 },
                { dh: 4,  ds: 0.01, dl: -0.02 },
                { dh: 8,  ds: -0.02, dl: 0.03 },
                { dh: -5, ds: 0.02, dl: -0.04 },
                { dh: 3,  ds: -0.01, dl: 0.04 },
                { dh: -8, ds: 0.01, dl: -0.01 },
                { dh: 6,  ds: 0.02, dl: 0.02 },
            ];
            offsets.forEach(o => {
                const nh = (h + o.dh + 360) % 360;
                const ns = Math.min(1, Math.max(0, s + o.ds));
                const nl = Math.min(0.95, Math.max(0.05, l + o.dl));
                variants.push(hslToHex(nh, ns, nl));
            });
            return variants;
        }

        function renderBgVariants() {
            const panel = getById('palettePanel');
            const list = getById('paletteList');
            if (!panel || !list) return;
            const currentBg = getById('bgPicker')?.value || '#0e0b48';
            const variants = generateBgVariants(currentBg);
            list.innerHTML = '';
            variants.forEach(color => {
                const btn = document.createElement('button');
                btn.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.5rem;border:none;background:none;cursor:pointer;border-radius:0.375rem;width:100%;text-align:left;font-family:inherit;';
                btn.onmouseover = () => btn.style.background = '#f1f5f9';
                btn.onmouseout = () => btn.style.background = 'none';
                const textPreview = isDarkColor(color) ? '#e8e8e8' : '#2d2d2d';
                btn.innerHTML = `<span style="width:24px;height:24px;border-radius:4px;background:${color};border:1px solid #e2e8f0;flex-shrink:0;"></span><span style="font-size:11px;font-weight:600;color:#374151;">${color}</span><span style="font-size:9px;color:${textPreview};background:${color};padding:1px 4px;border-radius:3px;">Aa</span>`;
                btn.onclick = () => {
                    changeBg(color, true); // 유사색이므로 텍스트색 반전 안 함
                    getById('bgPicker').value = color;
                    showToast('배경색 변경: ' + color);
                    renderBgVariants(); // 새 배경 기반으로 추천 갱신
                };
                list.appendChild(btn);
            });
        }

        // base64 데이터URI에서 mimeType 추출
        function getMimeType(base64) {
            return base64.split(';')[0].split(':')[1] || 'image/png';
        }
