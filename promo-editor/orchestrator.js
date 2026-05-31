// ============================================================================
//  orchestrator.js — Route 1 자동화 진입점 + 체크포인트 게이트
//  계약: orchestration_contract.md (4-checkpoint flow)
//
//  진입 조건 (회귀 방지)
//    - URL 파라미터 ?auto=1 또는 window.top.__PROMO_SESSION__ 이 있을 때만 동작.
//    - 둘 다 없으면 본 모듈은 완전 no-op → 수동 플로우 100% 유지.
//
//  책임
//    1) 폴더 핸들 확보 (컨텐츠 에셋 폴더 · 로컬 저장 경로)
//    2) Notion INGESTION 실행 + 검증 게이트
//    3) app.js UI (노션 토큰/URL 입력폼) 자동 채움 + 히어로/컨텐츠 생성 트리거
//    4) 각 체크포인트 전환 시 세션 브리지 step 갱신
//    5) 최종 FINALIZE 호출 + 검증 리포트 출력
// ============================================================================

(function () {
  'use strict';

  if (!window.PromoPipeline) {
    console.error('[orchestrator] pipeline.js 가 먼저 로드되어야 합니다.');
    return;
  }
  const P = window.PromoPipeline;

  const LOG = (...args) => console.info('[orchestrator]', ...args);
  const WARN = (...args) => console.warn('[orchestrator]', ...args);
  const ERR = (...args) => console.error('[orchestrator]', ...args);

  // ─────────────────────────────────────────────────────────────────────────
  //  UI 알림 — app.js 의 showToast 가 있으면 우선 사용
  // ─────────────────────────────────────────────────────────────────────────

  function notify(msg, level = 'info') {
    if (typeof window.showToast === 'function') {
      try { window.showToast(msg); return; } catch (_) {}
    }
    (level === 'error' ? ERR : LOG)(msg);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  폴더 핸들 확보 — 2가지 케이스
  //    Case A: 노션 기본정보에 '컨텐츠 에셋 경로' 존재 → 해당 폴더 + 로컬 저장 경로 = 2개 핸들
  //    Case B: '컨텐츠 에셋 경로' 없음 → 로컬 저장 경로 1개 핸들 + 하위 '컨텐츠_에셋/' 자동 생성
  // ─────────────────────────────────────────────────────────────────────────

  async function resolveHandles(pageId, basicInfo, ctx) {
    if (!P.isFsApiSupported()) {
      throw new Error('Chrome/Edge 가 필요합니다 (File System Access API 미지원 브라우저).');
    }

    const outputRaw = basicInfo['로컬 저장 경로'] || (ctx && ctx.outputDir) || '';
    const assetRaw  = basicInfo['컨텐츠 에셋 경로'] || (ctx && ctx.assetDir) || '';
    const outputPath = P.normalizeNasPath(outputRaw);
    const assetPath  = P.normalizeNasPath(assetRaw);

    // 로컬 저장 경로 핸들 (필수)
    const outputHandle = await P.getProjectRootHandle(`${pageId}::output`, {
      expectedPath: outputPath,
      promptMessage: `로컬 저장 경로 폴더를 선택하세요:\n  ${outputPath}`,
    });

    // 컨텐츠 에셋 경로 핸들
    let assetHandle;
    if (assetRaw) {
      // Case A
      try {
        assetHandle = await P.getProjectRootHandle(`${pageId}::asset`, {
          expectedPath: assetPath,
          promptMessage: `컨텐츠 에셋 폴더를 선택하세요:\n  ${assetPath}`,
        });
      } catch (e) {
        WARN('컨텐츠 에셋 경로 선택 실패 → 로컬 저장 경로/컨텐츠_에셋 으로 폴백', e);
      }
    }
    if (!assetHandle) {
      // Case B — 로컬 저장 경로 하위에 자동 생성
      assetHandle = await P.getOrCreateSubDir(outputHandle, '컨텐츠_에셋');
    }

    return { outputHandle, assetHandle, outputPath, assetPath };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  app.js UI 자동 채움
  //    - Notion 토큰은 ctx.session.notionToken 또는 기존 로컬스토리지 활용
  //    - Notion URL 입력 후 registerNotionUrl() 트리거
  // ─────────────────────────────────────────────────────────────────────────

  function _byId(id) { return document.getElementById(id); }

  async function fillNotionFormAndRegister(pageId, token) {
    const urlInput   = _byId('notionPageUrl');
    const tokenInput = _byId('notionTokenInput');
    if (tokenInput && token) tokenInput.value = token;
    if (urlInput)  urlInput.value = `https://www.notion.so/${pageId.replace(/-/g, '')}`;

    if (typeof window.registerNotionUrl === 'function') {
      await window.registerNotionUrl();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Session bridge 유틸
  // ─────────────────────────────────────────────────────────────────────────

  function getSession() {
    return (window.top && window.top.__PROMO_SESSION__) || null;
  }
  function setSessionStep(step, extra) {
    try {
      if (!window.top) return;
      const s = window.top.__PROMO_SESSION__ = window.top.__PROMO_SESSION__ || {};
      s.step = step;
      if (extra) Object.assign(s, extra);
      const ev = new CustomEvent('promo-session-step', { detail: { step, extra } });
      window.dispatchEvent(ev);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  export 버튼 잠금/해제 — INGESTION 검증 실패 시 export 차단
  // ─────────────────────────────────────────────────────────────────────────

  const EXPORT_BTN_SELECTORS = [
    '#exportBtn', '#downloadBtn', '#saveZipBtn', '#zipExportBtn',
    '[data-role="export-zip"]',
  ];
  function _exportButtons() {
    const out = [];
    for (const sel of EXPORT_BTN_SELECTORS) {
      document.querySelectorAll(sel).forEach(el => out.push(el));
    }
    return out;
  }
  function setExportBlocked(blocked, reason) {
    _exportButtons().forEach(btn => {
      btn.disabled = !!blocked;
      if (blocked) {
        btn.dataset.blockedReason = reason || 'ingestion-fail';
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
        btn.title = reason || 'INGESTION 검증 실패 — 이미지 수집 완료 후 재시도';
      } else {
        delete btn.dataset.blockedReason;
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
        btn.title = '';
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Main entry
  // ─────────────────────────────────────────────────────────────────────────

  async function run() {
    const ctx = P.getAutomationContext();
    if (!ctx) return; // 자동화 모드가 아님 → 완전 no-op

    LOG('자동화 모드 진입', ctx);
    setSessionStep('ingestion:start');

    const pageId = ctx.notionPageId;
    if (!pageId) {
      notify('자동화 진입: notionPageId 누락', 'error');
      return;
    }

    // 1) 토큰 확보 (세션 > 기존 입력값)
    const token =
      (ctx.session && ctx.session.notionToken) ||
      (_byId('notionTokenInput') && _byId('notionTokenInput').value.trim()) ||
      '';
    if (!token) {
      notify('Notion 토큰이 없습니다. ENGINE SETTINGS 에서 입력 후 재시도.', 'error');
      return;
    }

    // 2) 기본정보 먼저 가져오기 (핸들 요청 메시지에 실제 경로 안내하려고 선수집)
    //    비용이 크지 않은 1회 호출 — 이후 ingestNotionAssets 에서 다시 사용
    let basicInfo = {};
    try {
      const blocks = await P.fetchNotionBlocksRaw(pageId, token);
      basicInfo = P.extractBasicInfo(blocks) || {};
    } catch (e) {
      notify('Notion 기본정보 조회 실패: ' + e.message, 'error');
      return;
    }
    LOG('기본정보', basicInfo);

    // 3) 폴더 핸들 확보
    let handles;
    try {
      handles = await resolveHandles(pageId, basicInfo, ctx);
    } catch (e) {
      notify('폴더 선택 실패: ' + e.message, 'error');
      return;
    }
    setSessionStep('ingestion:handles-ready', {
      outputPath: handles.outputPath, assetPath: handles.assetPath,
    });

    // 4) INGESTION
    let ingestResult;
    try {
      ingestResult = await P.ingestNotionAssets({
        pageId, token,
        assetDirHandle: handles.assetHandle,
      });
    } catch (e) {
      setExportBlocked(true, 'INGESTION 실패: ' + e.message);
      notify('INGESTION 실패: ' + e.message, 'error');
      return;
    }

    // 5) 검증 게이트
    const verdict = P.verifyIngestionCoverage(ingestResult);
    LOG(verdict.report);
    if (!verdict.ok) {
      setExportBlocked(true, `INGESTION 누락 ${verdict.missing.length}건`);
      notify(`⚠️ 이미지 수집 누락 ${verdict.missing.length}건 — 콘솔 리포트 확인 후 재실행`, 'error');
      try {
        alert('이미지 수집 누락:\n' + verdict.missing.map(m => '• ' + m.name).join('\n'));
      } catch (_) {}
      return;
    }
    setExportBlocked(false);
    setSessionStep('ingestion:done', {
      assetFiles: ingestResult.assetDirFiles,
    });

    // 6) Notion 폼 자동 채움 → 기존 등록/생성 플로우 트리거
    //    (app.js 의 registerNotionUrl → notionUpdateAndGenerate 체인)
    try {
      await fillNotionFormAndRegister(pageId, token);
    } catch (e) {
      WARN('Notion 폼 자동 등록 실패 (수동 진행 가능):', e.message);
    }

    // 7) 체크포인트 이벤트 수신 — app.js 가 발행 (§체크포인트 1: hero, 2: content)
    //    각 단계 완료 시 유저에게 확인 요청 → OK 응답 받으면 다음 단계 진행.
    let lastHeroDataUrl = null;
    let lastContentHtml = null;

    window.addEventListener('promo-hero-ready', (ev) => {
      lastHeroDataUrl = ev.detail?.dataUrl || null;
      setSessionStep('checkpoint-1:hero-ready', { at: ev.detail?.at });
      notify('⏸ 체크포인트 1 — 히어로 이미지 생성 완료. 확인 후 승인해주세요.');
      console.info('[orchestrator] 체크포인트 1 대기 — 승인하려면:\n  window.dispatchEvent(new CustomEvent("promo-checkpoint-approved", { detail: { id: 1 } }))');
    });

    window.addEventListener('promo-content-html-ready', (ev) => {
      lastContentHtml = ev.detail?.htmlString || null;
      setSessionStep('checkpoint-2:content-ready', { at: ev.detail?.at });
      notify('⏸ 체크포인트 2 — 컨텐츠 HTML 생성 완료. 확인 후 승인해주세요.');
      console.info('[orchestrator] 체크포인트 2 대기 — 승인하려면:\n  window.dispatchEvent(new CustomEvent("promo-checkpoint-approved", { detail: { id: 2 } }))');
    });

    window.addEventListener('promo-checkpoint-approved', async (ev) => {
      const d = ev.detail || {};
      setSessionStep(`checkpoint-${d.id}:approved`, d);

      // 체크포인트 2 (컨텐츠 HTML) 승인 시 FINALIZE 자동 실행
      if (d.id === 2 && handles && handles.outputHandle) {
        const htmlString = d.htmlString || lastContentHtml;
        if (!htmlString) {
          notify('FINALIZE 실패: HTML 문자열을 찾지 못했습니다.', 'error');
          return;
        }
        try {
          const r = await P.finalizeExport({
            htmlString,
            outputDirHandle: handles.outputHandle,
            assetDirHandle:  handles.assetHandle,
            promoFolderName: d.promoFolderName,
            existingHash:    d.existingHash,
          });
          console.info(r.report);
          notify(r.pass ? '✅ FINALIZE 완료 — banner 단계로' : '❌ FINALIZE FAIL — 리포트 확인', r.pass ? 'info' : 'error');
          setSessionStep('finalize:done', { promoFolderName: r.promoFolderName, pass: r.pass });
        } catch (e) {
          ERR('finalize 실패', e);
          notify('FINALIZE 실패: ' + e.message, 'error');
        }
      }
    });
  }

  // Expose
  P.orchestrator = { run, resolveHandles, setExportBlocked };

  // DOM 준비 후 실행 (app.js 초기화와 경합 없이)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setTimeout(run, 200); });
  } else {
    setTimeout(run, 200);
  }
})();
