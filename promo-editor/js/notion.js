// promo-editor/js/notion.js — Notion API 연동 + sync (← rules/19-notion-parsing.md)
//
// app.js 에서 분리 (Stage 6 — 2026-05-28). 원본 단일 블록 L7054-7311.
// 포함: extractNotionPageId, notionBlocksToText, fetchNotionBlocks,
//       fetchChildrenRecursive, fetchNotionContent, registerNotionUrl,
//       notionUpdateAndGenerate, clearNotionUrl, initNotionDetection,
//       syncNotionPageUrlToMain, checkNotionSync.
//
// 의존:
// - state.js: registeredNotionPageId, registeredNotionTitle
// - utils.js: getById
// - app.js (runtime): showToast, apiFetch, generateContent

        // ── Notion 연동 ────────────────────────────────────────────────────────

        function extractNotionPageId(url) {
            const match = url.match(/([a-f0-9]{32})(?:\?|$|#)/i)
                || url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\?|$|#)/i);
            if (!match) return null;
            const id = match[1].replace(/-/g, '');
            return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`;
        }

        function notionBlocksToText(blocks) {
            const lines = [];
            for (const block of blocks) {
                const type = block.type;
                const b = block[type];
                if (!b) continue;
                const richText = (b.rich_text || []).map(t => t.plain_text).join('');
                switch (type) {
                    case 'heading_1': lines.push(`# ${richText}`); break;
                    case 'heading_2': lines.push(`## ${richText}`); break;
                    case 'heading_3': lines.push(`### ${richText}`); break;
                    case 'paragraph': lines.push(richText || ''); break;
                    case 'bulleted_list_item': lines.push(`- ${richText}`); break;
                    case 'numbered_list_item': lines.push(`• ${richText}`); break;
                    case 'to_do': lines.push(`${b.checked ? '☑' : '☐'} ${richText}`); break;
                    case 'quote': lines.push(`> ${richText}`); break;
                    case 'callout': lines.push(`${b.icon?.emoji || ''} ${richText}`); break;
                    case 'divider': lines.push('---'); break;
                    case 'table_row': {
                        const cells = (b.cells || []).map(cell => cell.map(t => t.plain_text).join('')).join(' | ');
                        lines.push(`| ${cells} |`);
                        break;
                    }
                    case 'image':
                    case 'video':
                    case 'file': {
                        // 이미지/영상/파일 블록 → 캡션을 우선 사용, 없으면 URL에서 파일명 추출
                        const caption = (b.caption || []).map(t => t.plain_text).join('').trim();
                        const url = b[b.type]?.url || '';
                        let fname = '';
                        if (caption) {
                            // 캡션이 이미 (filename) 형식이면 그대로, 아니면 감싸기
                            fname = /^\(.+\)$/.test(caption) ? caption : `(${caption})`;
                        } else if (url) {
                            // URL에서 파일명 추출 (쿼리스트링 제거)
                            const base = url.split('?')[0].split('/').pop();
                            if (base && /\.[a-z0-9]{2,5}$/i.test(base)) fname = `(${base})`;
                        }
                        if (fname) lines.push(fname);
                        break;
                    }
                    default: if (richText) lines.push(richText); break;
                }
                if (block._children && block._children.length > 0) {
                    lines.push(notionBlocksToText(block._children));
                }
            }
            return lines.join('\n');
        }

        async function fetchNotionBlocks(pageId, token, cursor = null) {
            const PROXY = 'https://corsproxy.io/?url=';
            const target = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
            const url = PROXY + encodeURIComponent(target);
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Notion API 오류: ${res.status} — ${errText.slice(0, 120)}`);
            }
            return await res.json();
        }

        async function fetchChildrenRecursive(blocks, token) {
            for (const block of blocks) {
                if (block.has_children) {
                    try {
                        const cd = await fetchNotionBlocks(block.id, token);
                        block._children = cd.results || [];
                        await fetchChildrenRecursive(block._children, token);
                    } catch(e) { block._children = []; }
                }
            }
        }

        async function fetchNotionContent(pageId) {
            const token = getById('notionTokenInput')?.value.trim();
            if (!token) throw new Error('Notion Integration Token이 없습니다.');

            const PROXY = 'https://corsproxy.io/?url=';

            // 페이지 제목
            let pageTitle = '';
            try {
                const pageRes = await fetch(PROXY + encodeURIComponent(`https://api.notion.com/v1/pages/${pageId}`), {
                    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
                });
                if (pageRes.ok) {
                    const pageData = await pageRes.json();
                    const titleProp = Object.values(pageData.properties || {}).find(p => p.type === 'title');
                    if (titleProp) pageTitle = (titleProp.title || []).map(t => t.plain_text).join('');
                }
            } catch(e) {}

            // 블록 전체 가져오기
            let allBlocks = [], cursor = null, hasMore = true;
            while (hasMore) {
                const data = await fetchNotionBlocks(pageId, token, cursor);
                const blocks = data.results || [];
                for (const block of blocks) {
                    if (block.has_children) {
                        try {
                            const cd = await fetchNotionBlocks(block.id, token);
                            block._children = cd.results || [];
                            await fetchChildrenRecursive(block._children, token);
                        } catch(e) { block._children = []; }
                    }
                }
                allBlocks = allBlocks.concat(blocks);
                hasMore = data.has_more;
                cursor = data.next_cursor;
                if (allBlocks.length > 500) break;
            }

            const text = notionBlocksToText(allBlocks);
            return { title: pageTitle, text: pageTitle ? `# ${pageTitle}\n\n${text}` : text };
        }

        // 노션 URL 등록
        async function registerNotionUrl() {
            // file:// 프로토콜에서는 CORS 프록시가 null origin을 차단함 → 경고
            if (window.location.protocol === 'file:') {
                showToast('❌ Notion 연동은 파일을 직접 열면 동작하지 않습니다.\n→ VS Code Live Server 또는 http://localhost 로 접속해주세요.');
                alert('⚠️ Notion 연동 불가\n\n현재 파일을 직접(file://) 열고 있습니다.\n\n해결 방법:\n1. VS Code → index.html 우클릭 → "Open with Live Server"\n2. 또는 터미널: python3 -m http.server 8080\n   → 브라우저에서 http://localhost:8080 접속');
                return;
            }
            const urlInput = getById('notionPageUrl')?.value.trim();
            if (!urlInput) return showToast('⚠️ Notion URL을 입력하세요.');
            const token = getById('notionTokenInput')?.value.trim();
            if (!token) return showToast('⚠️ ENGINE SETTINGS에서 Notion Token을 먼저 입력하세요.');

            const pageId = extractNotionPageId(urlInput);
            if (!pageId) return showToast('⚠️ 유효한 Notion URL이 아닙니다.');

            showToast('📋 연결 확인 중...');
            try {
                const { title } = await fetchNotionContent(pageId);
                registeredNotionPageId = pageId;
                registeredNotionTitle = title || '노션 기획서';
                getById('notionRegisteredTitle').textContent = registeredNotionTitle;
                getById('notionRegistered').style.display = 'flex';
                showToast(`✅ "${registeredNotionTitle}" 연동 완료!`);
            } catch(e) {
                showToast('❌ 연결 실패: ' + e.message);
            }
        }

        // 기획서 업데이트 + 바로 생성
        async function notionUpdateAndGenerate() {
            if (!registeredNotionPageId) return showToast('⚠️ 노션 URL을 먼저 등록하세요.');
            const spinner = getById('notionUpdateSpinner');
            const btn = getById('notionUpdateBtn');
            if (spinner) spinner.classList.remove('hidden');
            if (btn) btn.disabled = true;
            showToast('🔄 노션에서 최신 내용 가져오는 중...');
            try {
                const { text } = await fetchNotionContent(registeredNotionPageId);
                getById('contentData').value = text;
                showToast('✅ 불러오기 완료! 생성 시작...');
                // 바로 generateContent 실행
                await generateContent();
            } catch(e) {
                showToast('❌ 실패: ' + e.message);
            } finally {
                if (spinner) spinner.classList.add('hidden');
                if (btn) btn.disabled = false;
            }
        }

        function clearNotionUrl() {
            registeredNotionPageId = null;
            registeredNotionTitle = '';
            const reg = getById('notionRegistered');
            if (reg) reg.style.display = 'none';
            const url = getById('notionPageUrl');
            if (url) url.value = '';
            const urlTop = getById('notionPageUrlTop');
            if (urlTop) urlTop.value = '';
            showToast('노션 연동이 해제되었습니다.');
        }

        function initNotionDetection() {} // placeholder (UI로 대체)
        // ── Notion 연동 끝 ────────────────────────────────────────────────────

        function showToast(msg) { const t = getById('toast'); if (t) { t.innerText = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); } }



        // 상단 ENGINE SETTINGS의 페이지 URL을 CONTENT ENGINE notionPageUrl 인풋과 동기화
        function syncNotionPageUrlToMain() {
            const topVal = (getById('notionPageUrlTop')?.value || '').trim();
            if (!topVal) { showToast('노션 페이지 URL을 입력하세요.'); return; }
            const mainInput = getById('notionPageUrl');
            if (mainInput) {
                mainInput.value = topVal;
                registerNotionUrl(); // CONTENT ENGINE의 등록 로직 실행
            } else {
                showToast('연동 완료 (CONTENT ENGINE 섹션에서 확인하세요)');
            }
        }

        // 노션 동기화 변경 확인 (기획서 연동 패널)
        async function checkNotionSync() {
            const token = getById('notionTokenInput')?.value.trim();
            const pageUrl = getById('notionPageUrl')?.value.trim();
            const statusEl = getById('notionSyncStatus');
            if (!token || !pageUrl) {
                showToast('노션 토큰과 페이지 URL을 먼저 입력하세요.');
                return;
            }
            // 페이지 ID 추출 (URL 또는 ID 직접 입력)
            const idMatch = pageUrl.replace(/-/g,'').match(/[0-9a-f]{32}/i);
            if (!idMatch) { showToast('올바른 노션 페이지 URL 또는 ID를 입력하세요.'); return; }
            const pageId = idMatch[0];
            if (statusEl) { statusEl.textContent = '확인 중...'; statusEl.classList.remove('hidden'); }
            try {
                const res = await fetch(`https://corsproxy.io/?https://api.notion.com/v1/pages/${pageId}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28' }
                });
                if (!res.ok) throw new Error('API 오류 ' + res.status);
                const data = await res.json();
                const lastEdited = data.last_edited_time;
                const stored = localStorage.getItem('notion_last_edited_' + pageId);
                const mode = getById('notionSyncMode')?.value || 'notify';
                if (statusEl) {
                    statusEl.textContent = `마지막 수정: ${new Date(lastEdited).toLocaleString('ko-KR')}`;
                    statusEl.classList.remove('hidden');
                }
                if (stored && stored !== lastEdited) {
                    if (mode === 'notify') {
                        showToast('📢 노션 기획서가 수정됐습니다! 재생성 버튼을 눌러주세요.');
                        if (statusEl) statusEl.textContent += ' ⚠️ 변경 감지됨';
                    } else if (mode === 'auto') {
                        showToast('🔄 변경 감지 — 자동 재생성 시작...');
                        await generateContent();
                    }
                } else if (!stored) {
                    showToast('노션 연결 확인 완료. 현재 상태가 저장됐습니다.');
                } else {
                    showToast('변경사항 없음 — 최신 상태입니다.');
                }
                localStorage.setItem('notion_last_edited_' + pageId, lastEdited);
            } catch(e) {
                showToast('노션 확인 실패: ' + e.message);
                if (statusEl) { statusEl.textContent = '연결 실패: ' + e.message; }
            }
        }
