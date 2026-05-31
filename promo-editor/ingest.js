// ============================================================================
//  ingest.js — INGESTION 단계 구현
//  계약: image_pipeline_contract.md §1 (전수 스캔 + 컨텐츠_에셋 폴더 구축)
//
//  ⚠️ 회귀 방지
//    - 자동화 컨텍스트(?auto=1 또는 __PROMO_SESSION__) 없으면 아무것도 하지 않는다.
//    - app.js 전역/함수 직접 수정 금지. contentAssetLibrary / renderContentAssets /
//      runImageMatching 은 존재 시에만 호출 (주입용).
// ============================================================================

(function () {
  'use strict';

  if (!window.PromoPipeline) {
    console.error('[ingest] pipeline.js 가 먼저 로드되어야 합니다.');
    return;
  }
  const P = window.PromoPipeline;

  const NOTION_VERSION = '2022-06-28';
  const PROXY = 'https://corsproxy.io/?url=';

  // ─────────────────────────────────────────────────────────────────────────
  //  §1.1  Notion Raw Block 수집 (기존 app.js 함수와 독립. 블록 원본 필요)
  // ─────────────────────────────────────────────────────────────────────────

  async function _notionFetchBlocks(pageId, token, cursor = null) {
    const target = `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`;
    const res = await fetch(PROXY + encodeURIComponent(target), {
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION }
    });
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }

  async function _fetchChildrenRecursive(blocks, token) {
    for (const b of blocks) {
      if (b.has_children) {
        try {
          const c = await _notionFetchBlocks(b.id, token);
          b._children = c.results || [];
          await _fetchChildrenRecursive(b._children, token);
        } catch (_) { b._children = []; }
      }
    }
  }

  async function fetchNotionBlocksRaw(pageId, token) {
    let all = [], cursor = null, hasMore = true;
    while (hasMore) {
      const data = await _notionFetchBlocks(pageId, token, cursor);
      const blocks = data.results || [];
      await _fetchChildrenRecursive(blocks, token);
      all = all.concat(blocks);
      hasMore = data.has_more;
      cursor  = data.next_cursor;
      if (all.length > 2000) break; // 안전 가드
    }
    return all;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §1.2  블록 전수 스캔: 기본정보 / S3 이미지 / 텍스트 마커 추출
  // ─────────────────────────────────────────────────────────────────────────

  function _richTextToPlain(rich) {
    return (rich || []).map(t => t.plain_text || '').join('');
  }

  /** 블록을 DFS 로 순회. 모든 블록(+자식) 을 평탄화 */
  function _flattenBlocks(blocks, out = []) {
    for (const b of blocks || []) {
      out.push(b);
      if (b._children && b._children.length) _flattenBlocks(b._children, out);
    }
    return out;
  }

  /**
   * 노션 본문에서 "기본정보" 테이블을 찾고 key→value 추출.
   * 기본정보는 보통 첫 table 블록이며, 각 table_row 의 cells[0] 이 라벨 / cells[1] 이 값.
   */
  function extractBasicInfo(blocks) {
    const flat = _flattenBlocks(blocks);
    const info = {};
    for (const b of flat) {
      if (b.type !== 'table') continue;
      const rows = (b._children || []).filter(c => c.type === 'table_row');
      let looksLikeBasic = false;
      for (const r of rows) {
        const cells = (r.table_row && r.table_row.cells) || [];
        if (cells.length < 2) continue;
        const k = cells[0].map(t => t.plain_text || '').join('').trim();
        const v = cells[1].map(t => t.plain_text || '').join('').trim();
        if (!k) continue;
        if (/(로컬\s*저장\s*경로|컨텐츠\s*에셋\s*경로|기본\s*정보|프로모\s*종류|작업자)/i.test(k)) {
          looksLikeBasic = true;
        }
        info[k] = v;
      }
      if (looksLikeBasic) break; // 첫 번째 매칭 테이블만 사용
    }
    return info;
  }

  /**
   * 이미지 블록 + 텍스트 마커 전수 수집.
   * 반환:
   *   s3Images: [{ blockId, url, suggestedName, ext, mime? }]
   *   markers : [{ name, hasExt, raw, kind: '(' | '[' }]  (unique)
   */
  function scanImageSources(blocks) {
    const flat = _flattenBlocks(blocks);
    const s3Images = [];
    const markersMap = new Map(); // name → markerObj

    const MARKER_RE = /[\(\[]([^()\[\]\n]+?)[\)\]]/g;

    const collectMarkersFromText = (text) => {
      if (!text) return;
      // (A) / [A] 형태만 매칭. 공백·영숫자·한글·.·_·- 허용.
      let m;
      while ((m = MARKER_RE.exec(text)) !== null) {
        const raw = m[0];
        const name = m[1].trim();
        const kind = raw[0];
        if (!name) continue;
        // 너무 긴 문자열·URL·공백 다수·숫자뿐은 제외
        if (name.length > 80) continue;
        if (/\s{2,}/.test(name)) continue;
        if (/^https?:\/\//i.test(name)) continue;
        if (/^\d+$/.test(name)) continue;
        // 한글·영문·숫자·./-_ 외 문자 제외
        if (!/^[\w가-힣.\-_\s]+$/.test(name)) continue;
        // shortname 은 최소 1글자 이상. 확장자 포함 여부 판별.
        const hasExt = /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
        const key = name.toLowerCase();
        if (!markersMap.has(key)) {
          markersMap.set(key, { name, hasExt, raw, kind });
        }
      }
    };

    for (const b of flat) {
      // 1) 이미지·파일 블록의 URL
      if (b.type === 'image' || b.type === 'file') {
        const src = b[b.type] || {};
        const url = (src.file && src.file.url) || (src.external && src.external.url) || '';
        if (url && /^https?:\/\//i.test(url)) {
          const captionPlain = _richTextToPlain(src.caption).trim();
          // caption 이 (name.ext) 형식이면 그 이름 사용
          let suggestedName = '';
          const capBr = captionPlain.match(/^[\(\[]([^()\[\]]+)[\)\]]$/);
          if (capBr) suggestedName = capBr[1].trim();
          else if (captionPlain && /^[\w가-힣.\-_\s]+$/.test(captionPlain)) suggestedName = captionPlain;
          if (!suggestedName) {
            const base = (url.split('?')[0].split('/').pop() || '').trim();
            suggestedName = base || ('image_' + b.id.slice(0, 8));
          }
          // 확장자 보정
          let ext = (suggestedName.match(/\.(png|jpe?g|webp|gif|svg)$/i) || [])[1];
          if (!ext) {
            const urlExt = (url.split('?')[0].match(/\.(png|jpe?g|webp|gif|svg)$/i) || [])[1];
            ext = urlExt || 'png';
            suggestedName = suggestedName.replace(/\.[^.]*$/, '') + '.' + ext;
          }
          s3Images.push({ blockId: b.id, url, suggestedName, ext: ext.toLowerCase() });

          // 이미지 블록의 caption 텍스트도 마커로 수집 (테이블 외부에서 단독 캡션 쓰는 케이스)
          if (captionPlain) collectMarkersFromText(captionPlain);
        }
      }

      // 2) rich_text 계열 블록의 텍스트 마커
      const b2 = b[b.type];
      if (b2 && Array.isArray(b2.rich_text)) {
        collectMarkersFromText(_richTextToPlain(b2.rich_text));
      }
      // table_row 의 cells
      if (b.type === 'table_row' && b.table_row && Array.isArray(b.table_row.cells)) {
        for (const cell of b.table_row.cells) {
          collectMarkersFromText(_richTextToPlain(cell));
        }
      }
    }

    return { s3Images, markers: Array.from(markersMap.values()) };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §1.3  S3 이미지 다운로드 + 컨텐츠_에셋 폴더 저장
  //         (§1.3.B S3 충돌 시 block id 기반 suffix)
  // ─────────────────────────────────────────────────────────────────────────

  /** block id 기반 8자 결정적 해시 (동일 블록의 재파싱은 같은 값) */
  function _stableHash8(seed) {
    // 간단한 djb2 기반 해시 → 36진수 8자리로 정규화
    let h = 5381;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    let u = (h >>> 0).toString(36);
    while (u.length < 8) u = '0' + u;
    return u.slice(0, 8);
  }

  /** "item.png" + blockId → "item__nA1B2C3D4.png" */
  function _suffixedName(baseName, blockId) {
    const m = baseName.match(/^(.*?)(\.[^.]+)?$/);
    const stem = m[1] || baseName;
    const ext  = m[2] || '';
    return `${stem}__n${_stableHash8(blockId)}${ext}`;
  }

  /**
   * S3 이미지를 blob 으로 다운로드.
   * 노션의 file.url 은 짧은 TTL 의 signed URL 이므로 즉시 받아야 함.
   */
  async function _downloadS3(url) {
    // 1) 직접 시도 (CORS 허용 시)
    try {
      const r = await fetch(url);
      if (r.ok) return await r.blob();
    } catch (_) {}
    // 2) 프록시 경유
    const r2 = await fetch(PROXY + encodeURIComponent(url));
    if (!r2.ok) throw new Error(`S3 다운로드 실패 (${r2.status}): ${url.slice(0, 80)}`);
    return await r2.blob();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §1.4  contentAssetLibrary 주입 (app.js 연동)
  // ─────────────────────────────────────────────────────────────────────────

  async function _blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /**
   * 컨텐츠_에셋 폴더의 모든 파일을 읽어 app.js 의 contentAssetLibrary 에 주입.
   * 기존 수동 업로드 항목은 **보존** (덮어쓰기는 동일 파일명에 한함 → 재파싱 반영).
   */
  async function injectContentAssetLibrary(assetDirHandle) {
    const manifest = {}; // filename → { size, type }
    if (typeof window.contentAssetLibrary !== 'object' || window.contentAssetLibrary === null) {
      // app.js 로드 전이거나 전역이 없으면 생성
      window.contentAssetLibrary = {};
    }
    for await (const [name, entry] of assetDirHandle.entries()) {
      if (entry.kind !== 'file') continue;
      const file = await entry.getFile();
      const dataURL = await _blobToDataURL(file);
      window.contentAssetLibrary[name] = dataURL;
      manifest[name] = { size: file.size, type: file.type };
    }
    // UI 갱신 (app.js 함수 존재 시)
    try { if (typeof window.renderContentAssets === 'function') window.renderContentAssets(); } catch (_) {}
    try { if (typeof window.runImageMatching === 'function') window.runImageMatching(true); } catch (_) {}
    return manifest;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §1.5  메인 — ingestNotionAssets
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {object} opts
   * @param {string} opts.pageId            노션 페이지 ID
   * @param {string} opts.token             노션 Integration Token
   * @param {FileSystemDirectoryHandle} opts.assetDirHandle  컨텐츠_에셋 폴더 핸들
   * @param {object} [opts.logger]          { info, warn } — 생략 시 console 사용
   * @returns {Promise<{
   *     basicInfo: object,
   *     s3Downloaded: Array<{blockId,url,fileName}>,
   *     markersMissing: Array<{name,hasExt}>,
   *     markersResolved: Array<{name,fileName}>,
   *     assetDirFiles: string[],
   * }>}
   */
  async function ingestNotionAssets(opts) {
    const log = opts.logger || console;
    if (!opts.pageId || !opts.token) throw new Error('ingestNotionAssets: pageId/token 필수');
    if (!opts.assetDirHandle) throw new Error('ingestNotionAssets: assetDirHandle 필수');

    log.info && log.info('[ingest] Notion blocks 수집 시작…');
    const blocks = await fetchNotionBlocksRaw(opts.pageId, opts.token);
    log.info && log.info(`[ingest] blocks=${blocks.length}`);

    const basicInfo = extractBasicInfo(blocks);
    const { s3Images, markers } = scanImageSources(blocks);
    log.info && log.info(`[ingest] S3 images=${s3Images.length} · markers=${markers.length}`);

    // 현재 컨텐츠_에셋 폴더 내 파일명 목록 (충돌 판정용)
    let existing = await P.listFileNames(opts.assetDirHandle);

    // (1) S3 다운로드 → 저장 (§1.3.B 충돌 시 suffix)
    const s3Downloaded = [];
    for (const img of s3Images) {
      let fileName = img.suggestedName;
      // 동일 파일명이 이미 있으면, 동일 블록 재다운로드인지 판별
      //   → suffix 규칙 "name__n<hash8>.ext" 의 hash8 가 같으면 같은 블록 → 덮어쓰기 OK
      //   → 다른 블록의 동명 파일이면 무조건 suffix 부착
      const collides = existing.has(fileName);
      const blockHash = _stableHash8(img.blockId);
      const suffixedExisting = _suffixedName(img.suggestedName, img.blockId);
      if (collides) {
        // 기존 파일이 "같은 블록의 suffix 없는 저장본" 일 가능성은 낮으므로 안전하게 suffix 버전으로 새 저장
        fileName = suffixedExisting;
      } else if (existing.has(suffixedExisting)) {
        // 이미 같은 블록 기반 suffix 버전이 존재 → 덮어쓰기 (재파싱 갱신)
        fileName = suffixedExisting;
      }
      try {
        const blob = await _downloadS3(img.url);
        await P.writeFileToDir(opts.assetDirHandle, fileName, blob);
        existing.add(fileName);
        s3Downloaded.push({ blockId: img.blockId, url: img.url, fileName });
      } catch (e) {
        log.warn && log.warn(`[ingest] S3 저장 실패 ${img.suggestedName}: ${e.message}`);
      }
    }

    // (2) 마커 해결 — 컨텐츠_에셋 폴더에 실제 존재하는지 검사
    existing = await P.listFileNames(opts.assetDirHandle); // refresh
    const lowerIndex = new Map();
    for (const n of existing) lowerIndex.set(n.toLowerCase(), n);

    const EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
    const markersResolved = [];
    const markersMissing  = [];

    for (const mk of markers) {
      let resolved = null;
      if (mk.hasExt) {
        resolved = lowerIndex.get(mk.name.toLowerCase()) || null;
      } else {
        for (const ext of EXTS) {
          const candidate = (mk.name + '.' + ext).toLowerCase();
          if (lowerIndex.has(candidate)) { resolved = lowerIndex.get(candidate); break; }
        }
      }
      if (resolved) markersResolved.push({ name: mk.name, fileName: resolved });
      else          markersMissing.push({ name: mk.name, hasExt: mk.hasExt });
    }

    // (3) contentAssetLibrary 주입 + UI 갱신
    await injectContentAssetLibrary(opts.assetDirHandle);

    const assetDirFiles = Array.from(await P.listFileNames(opts.assetDirHandle)).sort();

    return { basicInfo, s3Downloaded, markersMissing, markersResolved, assetDirFiles };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §1.5  verifyIngestionCoverage — FAIL 게이트
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * ingestNotionAssets 결과를 검증.
   * @returns {{ ok: boolean, missing: Array, report: string }}
   */
  function verifyIngestionCoverage(result) {
    const missing = result.markersMissing || [];
    const ok = missing.length === 0;
    const lines = [];
    lines.push('📸 이미지 파이프라인 — INGESTION 검증');
    lines.push(`- S3 이미지 다운로드: ${result.s3Downloaded.length}건`);
    lines.push(`- 마커 해결: ${result.markersResolved.length}건`);
    lines.push(`- 미확보 마커: ${missing.length}건 ${ok ? '✅' : '❌'}`);
    if (!ok) {
      lines.push('  누락 목록:');
      for (const m of missing) lines.push(`   · ${m.name}${m.hasExt ? '' : ' (shortname)'}`);
      lines.push('  → 수동 보강 후 재실행하세요. 2단계(HTML 생성) 진입 차단.');
    }
    lines.push(`- 컨텐츠_에셋 폴더 실물 파일 수: ${(result.assetDirFiles || []).length}`);
    return { ok, missing, report: lines.join('\n') };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Expose
  // ─────────────────────────────────────────────────────────────────────────

  P.fetchNotionBlocksRaw   = fetchNotionBlocksRaw;
  P.extractBasicInfo       = extractBasicInfo;
  P.scanImageSources       = scanImageSources;
  P.ingestNotionAssets     = ingestNotionAssets;
  P.verifyIngestionCoverage = verifyIngestionCoverage;
  P.injectContentAssetLibrary = injectContentAssetLibrary;
  P._internal = Object.assign(P._internal || {}, { _stableHash8, _suffixedName });
})();
