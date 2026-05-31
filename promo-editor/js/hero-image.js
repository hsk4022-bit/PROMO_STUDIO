// promo-editor/js/hero-image.js — Hero 이미지 생성 (Gemini 호출)
//
// app.js 에서 분리 (Stage 9 — 2026-05-28). 단일 블록 L790-985.
// 포함: generateHeroImage.
//
// 의존:
// - state.js: referenceImageBase64
// - utils.js: getById, apiKey, IMAGE_MODEL
// - image-editor.js: applyHeroImage
// - app.js (runtime): apiFetch, recordState, showToast, window._heroAspectRatio

        async function generateHeroImage() {
            const rawData = getById('heroInputForm').value;
            const style = (getById('heroStyle').value || '').replace(/\*\*/g, '').trim();
            // ⚠️ API 키 선검증 — 원고 입력 여부보다 먼저 체크 (키 없으면 이미지 생성 자체 금지)
            const apiKeyEl = getById('apiKeyInput');
            let keyVal = (apiKeyEl.value || '').trim();
            // fallback: hidden input 이 비어 있으면 부모와 공유된 localStorage 에서 직접 읽음
            if (!keyVal) {
                try { keyVal = (localStorage.getItem('promo_studio_gemini_api_key') || '').trim(); } catch(e){}
                if (keyVal) apiKeyEl.value = keyVal;
            }
            const effectiveKey = keyVal || apiKey || '';
            // Gemini 키는 "AIza" 로 시작 + 35자 이상. 형식 미달이면 차단 (무효 키로 API 호출해서 이상한 이미지 생성 방지)
            if (!effectiveKey || effectiveKey.length < 20) {
                alert('⚠️ Gemini API 키를 먼저 등록하세요.\n\n우측 상단 "API Key" 입력란에 키를 입력해야 히어로 이미지를 생성할 수 있습니다.\n키는 AIza 로 시작하는 39자 내외 문자열입니다.');
                apiKeyEl.focus();
                apiKeyEl.style.outline = '2px solid #ef4444';
                setTimeout(() => apiKeyEl.style.outline = '', 3000);
                return;
            }
            if (!rawData) return showToast("정보를 입력하세요.");

            const loaderEl  = getById('heroLoader');
            const spinnerEl = getById('heroSpinner');
            const loaderMsg = loaderEl.querySelector('p');
            loaderEl.style.display = 'flex';
            spinnerEl.style.display = 'block';

            try {
                const titleMatch = rawData.match(/\ud0c0\uc774\ud2c0:\s*(.*)/);
                const subMatch   = rawData.match(/\uc11c\ube0c\ud0c0\uc774\ud2c0:\s*(.*)/);
                const btnMatch   = rawData.match(/\ubc84\ud2bc:\s*(.*)/);
                const finalTitle = titleMatch ? titleMatch[1].trim() : rawData;
                const finalSub   = subMatch   ? subMatch[1].trim()   : "";
                const finalBtn   = (btnMatch && btnMatch[1].trim().length > 0) ? btnMatch[1].trim() : "";

                const injectedGuideline = masterGuidelineText ? `\n[MASTER GUIDELINES]\n${masterGuidelineText}` : '';
                const hasAssets = uploadedAssets.length > 0;
                const hasRef    = !!referenceImageBase64;

                if (hasRef) showToast('🖼 Style Guide REF 이미지 적용됨');

                const buttonCmd = finalBtn
                    ? `Include a stylized CTA button with exact text "${finalBtn}" (gradient fill, rounded, bottom-center).`
                    : `Do NOT draw any buttons, UI chrome, or labeled rectangles.`;

                let finalImagePrompt = '';
                let genTemperature  = 1.0;

                if (hasAssets) {
                    if (loaderMsg) loaderMsg.textContent = 'Compositing Assets \u2014 Strict Fidelity Mode...';
                    genTemperature = 0.4;

                    // [2026-05-20] Reference 와 Asset 역할 명시 분리.
                    //   Reference 는 parts 배열의 첫 번째로 전송됨. 모델이 두 종류 이미지를 혼동해서
                    //   Reference 의 캐릭터까지 복제하는 사고를 방지.
                    finalImagePrompt = [
                        style ? `[USER STYLE REQUEST \u2014 HIGHEST PRIORITY]: ${style}.` : '',
                        // 사용자가 별도 Reference 를 등록한 경우 — 이미지는 안 보내지만 색감/스타일은 텍스트로 명시
                        hasRef ? `[STYLE NOTE FROM USER REFERENCE \u2014 TEXTUAL ONLY]:
A separate style-reference image was provided by the user as visual guidance for the AI palette/mood.
That reference image is NOT included in this request \u2014 it has already been analyzed and its palette/atmosphere is captured in the user style directive above.
Therefore: there is NO character/style-guide image in the inputs below \u2014 ONLY the character/object asset images are attached.
Do NOT imagine a separate "first image" or "style image". The attached image(s) are ALL character/object assets to copy faithfully.` : '',
                        `[ASSET FIDELITY \u2014 ABSOLUTE]:`,
                        `The uploaded image(s) below are the SOLE visual source for characters/objects.`,
                        `Copy every detail of the character/object assets with zero artistic reinterpretation:`,
                        `  - Face structure, eye color, pupil shape, skin tone \u2014 exact copy.`,
                        `  - Hair color, style, strands \u2014 exact copy.`,
                        `  - Clothing design, colors, accessories, weapons \u2014 exact copy.`,
                        `  - Body proportions \u2014 do NOT alter.`,
                        `  - Art style of the original (chibi / realistic / etc.) \u2014 preserve exactly.`,
                        `DO NOT "improve", "enhance", or "reinterpret" ANY feature of the character/object assets.`,
                        `[BACKGROUND]:`,
                        `If the character/object asset already contains a background, use THAT background faithfully.`,
                        `Do NOT add, replace, or invent any new background elements from the style reference.`,
                        hasRef
                            ? `For the backdrop atmosphere/lighting, you MAY take inspiration from the style reference's color palette and mood \u2014 but never copy its specific objects, characters, or scene elements.`
                            : `If the asset has a transparent/plain background, create a backdrop that is FULLY CONSISTENT with the asset's art style, color palette, and visual tone \u2014 the background and character must feel like they belong to the same world.`,
                        `Do NOT mix art styles (e.g. no photorealistic background behind a chibi/game-style character).`,
                        `[TEXT OVERLAY \u2014 VERBATIM]:`,
                        `Render the exact title text: "${finalTitle}"${finalSub ? ` and subtitle: "${finalSub}"` : ''}.`,
                        `Typography must match the style/mood of the character/object asset. Do not invent other text.`,
                        buttonCmd,
                        `[PROHIBITIONS]: No brand logos. No watermarks. No invented characters. No AI-style "improvements" to the original asset.${hasRef ? ' Do not replicate the style reference character.' : ''}`,
                        injectedGuideline,
                    ].filter(Boolean).join('\n');

                } else {
                    if (loaderMsg) loaderMsg.textContent = 'PASS 1 / 2 \u2014 AI Prompt Engineering...';
                    genTemperature = 1.0;

                    let enrichedPrompt = '';
                    const enhanceSys = `You are a game promotional banner art director.
Transform user inputs into ONE precise Gemini image generation prompt (English only, no preamble).
Rules:
- STRICTLY follow the user's style directive. It is the #1 priority \u2014 do not override it.
- Add lighting/atmosphere descriptors that COMPLEMENT (not replace) the style directive.
- ${hasRef ? 'A Style Guide reference image is provided. Extract ONLY its color palette, mood, lighting style, and visual atmosphere. Do NOT replicate characters or specific assets from this image — treat it as a style reference only.' : 'No characters, humans, or avatars (no assets provided).'}
- Banner must prominently display title text: "${finalTitle}"${finalSub ? ` and subtitle: "${finalSub}"` : ''}.
- ${buttonCmd}
- No logos, no watermarks.`;

                    const enhanceUser = `Title: ${finalTitle}
Subtitle: ${finalSub || '(none)'}
Style directive: ${style || 'premium game promotional banner, cinematic, high-contrast'}
Reference image provided: ${hasRef ? 'YES \u2014 replicate character, visual style, and color palette from this reference image exactly' : 'NO'}`;

                    try {
                        const enhRes = await apiFetch(
                            `https://generativelanguage.googleapis.com/v1beta/models/${CONTENT_MODEL}:generateContent`,
                            { method: 'POST', body: JSON.stringify({
                                contents: [{ parts: [{ text: enhanceUser }] }],
                                systemInstruction: { parts: [{ text: enhanceSys }] },
                                generationConfig: { temperature: 0.8, maxOutputTokens: 600 }
                            })}
                        );
                        enrichedPrompt = enhRes.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                    } catch(e) { console.warn('PASS 1 failed:', e.message); }

                    if (loaderMsg) loaderMsg.textContent = 'PASS 2 / 2 \u2014 Rendering Image...';

                    const noCharConstraint = hasRef ? '' : 'No characters. ';
                    finalImagePrompt = enrichedPrompt.length > 40
                        ? `${enrichedPrompt}\n[HARD CONSTRAINTS] No logos. No watermarks. ${noCharConstraint}Title verbatim: "${finalTitle}". ${finalSub ? `Subtitle verbatim: "${finalSub}".` : ''} ${buttonCmd}${hasRef ? '\n[STYLE GUIDE ATTACHED: match its color palette and mood only — do NOT copy characters]' : ''}${injectedGuideline}`
                        : [
                            style ? `Style: ${style}.` : 'Style: premium cinematic game promotional banner.',
                            hasRef ? `Match the color palette and visual atmosphere from the style guide image.` : `Background only — no characters.`,
                            `Title text verbatim: "${finalTitle}".`,
                            finalSub ? `Subtitle text verbatim: "${finalSub}".` : '',
                            buttonCmd,
                            `High-contrast, vivid color palette. No logos. No watermarks.`,
                            injectedGuideline,
                          ].filter(Boolean).join(' ');
                }

                if (!hasAssets && loaderMsg) loaderMsg.textContent = 'Rendering High-Fidelity Image...';

                // 현재 선택된 비율 버튼 확인
                const activeRatioBtn = document.querySelector('#ratioBtn11.bg-indigo-500, #ratioBtn34.bg-indigo-500, #ratioBtn43.bg-indigo-500');
                const ratioText = activeRatioBtn ? (activeRatioBtn.id === 'ratioBtn11' ? '1:1' : activeRatioBtn.id === 'ratioBtn34' ? '3:4' : '4:3') : (window._heroAspectRatio || '1:1');
                const ratioInstruction = `\n[IMAGE ASPECT RATIO: ${ratioText} — compose the image strictly for this ratio]`;

                const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;

                // [2026-05-20] hasAssets 모드에서는 Reference 이미지 자체를 보내지 않음.
                //   이유: Gemini 가 두 종류 이미지를 모두 "캐릭터 소스" 로 오인하는 사고 빈발.
                //   Reference 의 스타일/색감/분위기는 텍스트 프롬프트로만 전달 (heroStyle 에 사용자 지시 + 자동 추출).
                //   레퍼런스 없는 hasRef-only 모드(else 분기) 에서는 여전히 이미지를 전송 (스타일 가이드 역할).
                const parts = [];
                const _sendRefAsImage = referenceImageBase64 && !hasAssets;  // hasAssets 면 reference 이미지 미전송
                if (_sendRefAsImage) {
                    const refMime = getMimeType(referenceImageBase64);
                    parts.push({ inlineData: { mimeType: refMime, data: referenceImageBase64.split(',')[1] } });
                }
                parts.push({ text: finalImagePrompt + ratioInstruction });
                uploadedAssets.forEach(asset => {
                    const mimeType = getMimeType(asset.b64);
                    parts.push({ inlineData: { mimeType, data: asset.b64.split(',')[1] } });
                });

                const res = await apiFetch(imgUrl, {
                    method: 'POST',
                    body: JSON.stringify({
                        contents: [{ parts }],
                        generationConfig: {
                            responseModalities: ["IMAGE", "TEXT"],
                            temperature: genTemperature,
                        }
                    })
                });

                const b64 = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
                if (b64) {
                    applyHeroImage("data:image/png;base64," + b64, true);
                    // ──[Route 1 체크포인트 1 — 히어로 이미지 생성 완료]──────────────
                    // orchestration_contract.md §체크포인트. 자동화 모드에서만 orchestrator.js 가 수신.
                    try {
                        window.dispatchEvent(new CustomEvent('promo-hero-ready', {
                            detail: { dataUrl: "data:image/png;base64," + b64, at: Date.now() }
                        }));
                    } catch (_) {}
                } else {
                    throw new Error("\uc774\ubbf8\uc9c0 \ub370\uc774\ud130\ub97c \ubc1b\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. API \uc751\ub2f5\uc744 \ud655\uc778\ud558\uc138\uc694.");
                }

            } catch (e) {
                console.error(e);
                showToast("\ud788\uc5b4\ub85c \uc0dd\uc131 \uc2e4\ud328: " + e.message);
            } finally {
                loaderEl.style.display = 'none';
                spinnerEl.style.display = 'none';
                const loaderMsgEl = loaderEl.querySelector('p');
                if (loaderMsgEl) loaderMsgEl.textContent = 'Rendering Fidelity Banner...';
            }
        }

// ────────────────────────────────────────────────────────────────
// Gemini 출력 후처리 — 히어로 추출/마커 정리 (app.js generateContent 에서 이전 2026-05-29)
// ────────────────────────────────────────────────────────────────

        // AI가 생성한 HTML에서 히어로 이미지 추출 → 사이드바로 이동 + contentArea에서 숨김
        function extractHeroFromContent(area) {
            const sc = area.querySelector('.se-contents');
            if (!sc) return;
            const firstSeDiv = sc.querySelector(':scope > .se-div:first-child');
            if (!firstSeDiv) return;
            const heroImg = firstSeDiv.querySelector('img');
            if (heroImg) {
                const heroSrc = heroImg.getAttribute('src') || '';
                if (heroSrc) {
                    firstSeDiv.style.display = 'none';
                    firstSeDiv.innerHTML = '';
                    applyHeroImage(heroSrc, false, null, true);
                    return;
                }
            }
            // img 없이 텍스트 마커만 남은 경우 (hero.png) 등 제거
            const txt = firstSeDiv.textContent.trim();
            if (/^\(.*hero.*\)$/i.test(txt) || /^\(.*\.png\)$/i.test(txt) || /^\(.*\.jpg\)$/i.test(txt)) {
                firstSeDiv.style.display = 'none';
                firstSeDiv.innerHTML = '';
            }
        }

        // 본문 전체에서 (hero...) 히어로 마커만 제거
        // 일반 이미지 파일명 마커는 보존 — 자산 있으면 runImageMatching이 <img>로 치환,
        // 자산 없으면 사용자가 볼 수 있도록 그대로 노출
        function removeHeroTextMarkers(area) {
            area.querySelectorAll('p, span, div').forEach(el => {
                const t = el.textContent.trim();
                // (hero...) 히어로 전용 마커만 제거 (히어로 이미지는 별도 사이드바로 분리 처리됨)
                if (/^\(hero[^)]*\)$/i.test(t)) { el.remove(); return; }
            });
            // 깨진 히어로 img (alt="hero" 또는 src에 hero 포함 + 로드 실패) 제거
            area.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src') || '';
                const alt = img.getAttribute('alt') || '';
                if (/hero/i.test(src) || /hero/i.test(alt)) {
                    // 첫 번째 se-div 안이면 숨김, 아니면 제거
                    const parent = img.closest('.se-div');
                    if (parent) { parent.style.display = 'none'; parent.innerHTML = ''; }
                    else img.remove();
                }
            });
        }
