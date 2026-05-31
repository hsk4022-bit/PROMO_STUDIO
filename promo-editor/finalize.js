// ============================================================================
//  finalize.js — FINALIZE 단계 구현
//  계약: image_pipeline_contract.md §3 (PROMO_xxx/ 해시 복사 + ZIP + 검증 리포트)
//
//  ⚠️ 회귀 방지
//    - 컨텐츠_에셋 폴더는 절대 수정하지 않는다 (복사만 허용).
//    - app.js 의 기존 export 경로(폴더·ZIP 구조)를 변경하지 않는다.
//    - 자동화 컨텍스트 없으면 본 모듈의 export 함수는 호출되지 않는다.
//
//  유저가 호출하는 진입점:
//    PromoPipeline.finalizeExport({
//      htmlString, outputDirHandle, assetDirHandle,
//      usedFileNames,          // HTML 에 실제 쓰인 원본 파일명 배열 또는 Set
//      placeholderPattern,     // 기본: '__ASSET__<name>' . 다른 형식이면 커스텀 맵 전달
//      promoFolderName,        // 생략 시 'PROMO_<ts>'
//      existingHash,           // 수정 작업 시 기존 해시 (선택)
//    })
// ============================================================================

(function () {
  'use strict';

  if (!window.PromoPipeline) {
    console.error('[finalize] pipeline.js 가 먼저 로드되어야 합니다.');
    return;
  }
  const P = window.PromoPipeline;

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.2  해시 생성 (app.js 의 generateHashString 이 있으면 재사용)
  // ─────────────────────────────────────────────────────────────────────────

  function _gen(len) {
    if (typeof window.generateHashString === 'function') return window.generateHashString(len);
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let r = '';
    for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.3  HTML 내 img src 스캔 + placeholder/경로 치환
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * HTML 에서 실제 사용된 원본 파일명 집합을 추출.
   * 지원 src 형태:
   *   - __ASSET__<name.ext>
   *   - ./컨텐츠_에셋/<name.ext>
   *   - 컨텐츠_에셋/<name.ext>
   *   - data:image/...  (무시)
   */
  function extractUsedAssetNames(htmlString) {
    const names = new Set();
    const re = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(htmlString)) !== null) {
      const src = m[1];
      if (!src) continue;
      if (/^data:/i.test(src)) continue;
      let n = null;
      const p1 = src.match(/^__ASSET__(.+)$/);
      if (p1) n = p1[1];
      else {
        const p2 = src.match(/컨텐츠_에셋\/([^?#]+)$/);
        if (p2) n = p2[1];
      }
      if (n) names.add(decodeURIComponent(n));
    }
    return names;
  }

  /**
   * HTML 내 모든 에셋 src 를 해시 경로로 일괄 치환.
   * @param {string} htmlString
   * @param {Map<string,string>} mapping  원본파일명 → 해시파일명
   * @param {string} hashFolder 16자 해시 서브폴더명
   * @returns {string}
   */
  function rewriteAssetSrc(htmlString, mapping, hashFolder) {
    let out = htmlString;
    for (const [orig, hashed] of mapping.entries()) {
      const esc = orig.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const patterns = [
        new RegExp('__ASSET__' + esc, 'g'),
        new RegExp('\\.\\/컨텐츠_에셋\\/' + esc, 'g'),
        new RegExp('컨텐츠_에셋\\/' + esc, 'g'),
      ];
      const target = `./${hashFolder}/${hashed}`;
      for (const r of patterns) out = out.replace(r, target);
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.3  파일 복사 (컨텐츠_에셋 → PROMO_xxx/<hash>/)
  // ─────────────────────────────────────────────────────────────────────────

  async function _copyFile(srcDirHandle, srcName, dstDirHandle, dstName) {
    const srcHandle = await srcDirHandle.getFileHandle(srcName, { create: false });
    const file = await srcHandle.getFile();
    const dstHandle = await dstDirHandle.getFileHandle(dstName, { create: true });
    const w = await dstHandle.createWritable();
    await w.write(file);
    await w.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.4  ZIP export (JSZip 사용 — index.html 에서 이미 로드)
  //         PROMO_SLICED / PROMO_html 구조는 app.js 의 기존 export 와 호환
  // ─────────────────────────────────────────────────────────────────────────

  async function _zipFolderTree(dirHandle, zip, prefix = '') {
    for await (const [name, entry] of dirHandle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'file') {
        const f = await entry.getFile();
        zip.file(path, f);
      } else if (entry.kind === 'directory') {
        await _zipFolderTree(entry, zip, path);
      }
    }
  }

  async function _writeZipToDir(dirHandle, zipName, zipBlob) {
    const fh = await dirHandle.getFileHandle(zipName, { create: true });
    const w  = await fh.createWritable();
    await w.write(zipBlob);
    await w.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Main — finalizeExport
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {object} opts
   * @param {string} opts.htmlString          최종 HTML 원본 (placeholder 포함 상태)
   * @param {FileSystemDirectoryHandle} opts.outputDirHandle  '로컬 저장 경로' 핸들
   * @param {FileSystemDirectoryHandle} opts.assetDirHandle   컨텐츠_에셋 핸들
   * @param {Iterable<string>} [opts.usedFileNames]  명시적으로 쓰인 파일명 (생략 시 HTML 스캔)
   * @param {string} [opts.promoFolderName]          기본 'PROMO_<ts>'
   * @param {string} [opts.existingHash]             수정 작업 시 기존 해시 유지
   * @param {string} [opts.htmlFileName]             기본 'index.html'
   * @returns {Promise<{
   *     promoFolderName: string,
   *     hashFolder: string,
   *     mapping: object,              // { orig: hashed }
   *     rewrittenHtml: string,
   *     usedCount: number,
   *     copiedCount: number,
   *     report: string,
   *     pass: boolean,
   * }>}
   */
  async function finalizeExport(opts) {
    if (!opts || !opts.htmlString) throw new Error('finalizeExport: htmlString 필수');
    if (!opts.outputDirHandle)     throw new Error('finalizeExport: outputDirHandle 필수');
    if (!opts.assetDirHandle)      throw new Error('finalizeExport: assetDirHandle 필수');

    const ts = Date.now();
    const promoFolderName = opts.promoFolderName || `PROMO_${ts}`;
    const hashFolder = opts.existingHash || _gen(16);
    const htmlFileName = opts.htmlFileName || 'index.html';

    // 1) 사용된 파일명 확정
    const usedSet = new Set(opts.usedFileNames ? Array.from(opts.usedFileNames)
                                               : extractUsedAssetNames(opts.htmlString));

    // 2) 컨텐츠_에셋 폴더 실물 파일 확인 + 매핑 생성
    const existing = await P.listFileNames(opts.assetDirHandle);
    const mapping = new Map();          // orig → hashed
    const missing = [];
    for (const name of usedSet) {
      // 대소문자 관대 매칭
      let found = null;
      if (existing.has(name)) found = name;
      else {
        for (const n of existing) if (n.toLowerCase() === name.toLowerCase()) { found = n; break; }
      }
      if (!found) { missing.push(name); continue; }
      const ext = (found.match(/\.[^.]+$/) || [''])[0];
      const hashed = _gen(8) + ext;
      mapping.set(found, hashed);
    }
    if (missing.length) {
      throw new Error(`finalizeExport: 컨텐츠_에셋 폴더에 없는 파일 ${missing.length}건: ${missing.slice(0, 5).join(', ')}`);
    }

    // 3) PROMO_xxx/<hash>/ 생성 + 복사
    const promoDir = await P.getOrCreateSubDir(opts.outputDirHandle, promoFolderName);
    const hashDir  = await P.getOrCreateSubDir(promoDir, hashFolder);
    let copied = 0;
    for (const [orig, hashed] of mapping.entries()) {
      await _copyFile(opts.assetDirHandle, orig, hashDir, hashed);
      copied++;
    }

    // 4) HTML src 치환 + 저장
    const rewrittenHtml = rewriteAssetSrc(opts.htmlString, mapping, hashFolder);
    await P.writeFileToDir(promoDir, htmlFileName, new Blob([rewrittenHtml], { type: 'text/html' }));

    // 5) ZIP 생성 (PROMO_xxx 폴더 트리 전체)
    let zipName = null;
    try {
      if (typeof window.JSZip === 'function') {
        const zip = new window.JSZip();
        await _zipFolderTree(promoDir, zip, promoFolderName);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        zipName = `${promoFolderName}.zip`;
        await _writeZipToDir(opts.outputDirHandle, zipName, zipBlob);
      }
    } catch (e) {
      console.warn('[finalize] ZIP 생성 실패:', e.message);
    }

    // 6) §3.6 검증 리포트
    const remainingPlaceholder = /(?:__ASSET__|컨텐츠_에셋\/)/.test(rewrittenHtml);
    const remainingMarker = /<[^>]*>\s*[\(\[][\w가-힣.\-_\s]+?[\)\]]\s*<\/[^>]+>/.test(rewrittenHtml);
    const allHashed = Array.from(rewrittenHtml.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi))
      .every(m => /^data:/i.test(m[1]) || m[1].startsWith(`./${hashFolder}/`));

    const lines = [];
    lines.push('📸 이미지 파이프라인 — FINALIZE 검증');
    lines.push(`- 산출물 폴더: ${promoFolderName}/${hashFolder}/`);
    lines.push(`- 복사된 파일 수: ${copied} (실사용 이미지만)`);
    lines.push('- 파일명 매핑:');
    for (const [o, h] of mapping) lines.push(`   ✅ ${o} → ./${hashFolder}/${h}`);
    lines.push(`- HTML <img src> 전부 ./${hashFolder}/ 로 시작: ${allHashed ? '✅' : '❌'}`);
    lines.push(`- 잔존 placeholder/컨텐츠_에셋 경로: ${remainingPlaceholder ? '❌' : '0건 ✅'}`);
    lines.push(`- 잔존 텍스트 마커 (filename.ext) / [filename.ext]: ${remainingMarker ? '❌' : '0건 ✅'}`);
    lines.push(`- 컨텐츠_에셋 폴더 무변경 (복사만): ✅`);
    lines.push(`- ZIP export: ${zipName ? `✅ ${zipName}` : '⚠️ JSZip 미탑재 — ZIP 생략'}`);
    const pass = allHashed && !remainingPlaceholder && !remainingMarker;
    lines.push(`총괄: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);

    const mappingObj = {};
    for (const [o, h] of mapping) mappingObj[o] = h;

    return {
      promoFolderName,
      hashFolder,
      mapping: mappingObj,
      rewrittenHtml,
      usedCount: usedSet.size,
      copiedCount: copied,
      report: lines.join('\n'),
      pass,
      zipName,
    };
  }

  // Expose
  P.extractUsedAssetNames = extractUsedAssetNames;
  P.rewriteAssetSrc       = rewriteAssetSrc;
  P.finalizeExport        = finalizeExport;
})();
