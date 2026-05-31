// ============================================================================
//  pipeline.js — 이미지 파이프라인 자동화 모듈 (Route 1 구현체)
//  계약: image_pipeline_contract.md §1 INGESTION / §3 FINALIZE
//        orchestration_contract.md Route 1
//
//  ⚠️ 회귀 방지 (orchestration_contract §회귀 방지)
//    - 본 모듈은 app.js 의 기존 함수·전역 상태를 **수정하지 않는다**.
//    - 자동화 진입 조건(URL 파라미터 ?auto=1 또는 __PROMO_SESSION__)이
//      없으면 본 모듈은 **어떤 동작도 하지 않는다** → 기존 수동 플로우 100% 유지.
//    - app.js 로부터 주입받는 훅은 window.PromoPipeline.* 로 노출.
// ============================================================================

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  //  §1.  OS 감지 + NAS 경로 정규화
  // ─────────────────────────────────────────────────────────────────────────

  /** 현재 OS 를 'mac' | 'win' | 'linux' 중 하나로 반환 */
  function detectOS() {
    const ua = (navigator.userAgent || '').toLowerCase();
    const p  = ((navigator.userAgentData && navigator.userAgentData.platform) ||
                navigator.platform || '').toLowerCase();
    if (p.includes('mac') || ua.includes('mac os')) return 'mac';
    if (p.includes('win') || ua.includes('windows')) return 'win';
    if (p.includes('linux') || ua.includes('linux')) return 'linux';
    return 'mac'; // 기본값: 현업 macOS 우세
  }

  /**
   * 노션에 적힌 NAS 경로를 현재 OS 의 실제 파일시스템 경로로 정규화.
   *
   * 입력 예시 (host/share 는 예시일 뿐, 실제 값은 노션에서 옴):
   *   smb://<HOST>/<SHARE>/path/to/foo
   *   //<HOST>/<SHARE>/path/to/foo
   *   \\<HOST>\<SHARE>\path\to\foo
   *   /Volumes/<SHARE>/path/to/foo  (mac 마운트 후)
   *
   * 매핑 규칙:
   *   mac   → /Volumes/<SHARE>/...
   *   win   → \\<HOST>\<SHARE>\...
   *   linux → /mnt/<share-lowercase>/...
   */
  function normalizeNasPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    const os = detectOS();
    let p = rawPath.trim();

    // 1) 프로토콜/슬래시 헤더 통일
    //    smb:// 또는 // 또는 \\ 로 시작하는 경우 host/share/.. 형태로 파싱
    let host = '', share = '', rest = '';
    let m;
    if ((m = p.match(/^smb:\/\/([^\/]+)\/([^\/]+)\/?(.*)$/i))) {
      host = m[1]; share = m[2]; rest = m[3];
    } else if ((m = p.match(/^\/\/([^\/]+)\/([^\/]+)\/?(.*)$/))) {
      host = m[1]; share = m[2]; rest = m[3];
    } else if ((m = p.match(/^\\\\([^\\]+)\\([^\\]+)\\?(.*)$/))) {
      host = m[1]; share = m[2]; rest = (m[3] || '').replace(/\\/g, '/');
    } else if ((m = p.match(/^\/Volumes\/([^\/]+)\/?(.*)$/))) {
      host = ''; share = m[1]; rest = m[2];
    } else if ((m = p.match(/^\/mnt\/([^\/]+)\/?(.*)$/))) {
      host = ''; share = m[1]; rest = m[2];
    } else {
      // 이미 로컬 경로이거나 상대 경로 → 그대로 반환
      return p;
    }

    // 2) OS 별 재조립
    const shareCap   = share;                 // 원본 대소문자 유지
    const shareLower = share.toLowerCase();
    const tail       = (rest || '').replace(/\\/g, '/').replace(/^\/+/, '');

    if (os === 'mac') {
      return '/Volumes/' + shareCap + (tail ? '/' + tail : '');
    }
    if (os === 'win') {
      // host 는 노션 경로(smb://<HOST>/<SHARE>/...)에서 파싱되므로 항상 존재해야 함
      if (!host) throw new Error('NAS host가 노션 경로에 포함돼있지 않습니다. 노션 [기본 정보]의 경로 필드를 확인하세요.');
      return '\\\\' + host + '\\' + shareCap + (tail ? '\\' + tail.replace(/\//g, '\\') : '');
    }
    // linux
    return '/mnt/' + shareLower + (tail ? '/' + tail : '');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §2.  폴더 핸들 관리 (File System Access API + IndexedDB 영속화)
  //
  //      브라우저 보안상 경로 문자열만으론 파일 I/O 불가 → 유저가 최초 1회
  //      네이티브 선택창에서 폴더를 지정해 **핸들**을 발급받아야 한다.
  //      발급된 핸들은 IndexedDB 에 저장되어 다음 방문 시 자동 복원.
  // ─────────────────────────────────────────────────────────────────────────

  const DB_NAME   = 'promo_pipeline_handles';
  const DB_STORE  = 'dirs';
  const DB_VER    = 1;

  function _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function _idbGet(key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  }

  async function _idbSet(key, value) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function _idbDelete(key) {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  /** File System Access API 지원 여부 */
  function isFsApiSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  /** 핸들에 readwrite 권한 확인/요청. 이미 허용 시 즉시 true. */
  async function ensureRwPermission(handle) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    const q = await handle.queryPermission(opts);
    if (q === 'granted') return true;
    const r = await handle.requestPermission(opts);
    return r === 'granted';
  }

  /**
   * 프로젝트별 루트 폴더 핸들 확보.
   *   1) IndexedDB 에 저장된 핸들 시도 (권한 재요청 가능)
   *   2) 실패 시 showDirectoryPicker() 로 유저에게 선택 요청
   *   3) 성공 시 IndexedDB 저장
   *
   * @param {string} projectKey  프로젝트 식별자 (예: notionPageId). 같은 키는 같은 핸들 공유.
   * @param {object} opts
   * @param {string} [opts.expectedPath]  노션에 적힌 경로 (검증·안내용 표시)
   * @param {string} [opts.promptMessage] 유저 안내 문구
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async function getProjectRootHandle(projectKey, opts = {}) {
    if (!isFsApiSupported()) {
      throw new Error('이 브라우저는 File System Access API 를 지원하지 않습니다. Chrome/Edge 를 사용해 주세요.');
    }
    const key = 'root:' + (projectKey || 'default');

    // 1) 저장된 핸들 복원 시도
    const stored = await _idbGet(key);
    if (stored) {
      const ok = await ensureRwPermission(stored);
      if (ok) return stored;
      // 권한 거절 → 새로 선택
      await _idbDelete(key);
    }

    // 2) 신규 선택
    if (opts.promptMessage) {
      // 브라우저 네이티브 선택창 전에 유저에게 목적을 알림 (선택적)
      console.info('[pipeline]', opts.promptMessage, opts.expectedPath ? `\n노션 경로: ${opts.expectedPath}` : '');
    }
    const pickerOpts = { mode: 'readwrite', id: 'promo-' + (projectKey || 'default') };
    // 일부 OS 에서 startIn 기본값을 'documents' 로 설정하면 체감 UX 개선
    try { pickerOpts.startIn = 'documents'; } catch (_) {}
    const handle = await window.showDirectoryPicker(pickerOpts);

    // 3) 저장
    await _idbSet(key, handle);
    return handle;
  }

  /** 저장된 핸들을 강제 재선택 (유저가 경로 변경 시 사용) */
  async function resetProjectRootHandle(projectKey) {
    await _idbDelete('root:' + (projectKey || 'default'));
  }

  /**
   * 루트 핸들 하위에서 서브폴더를 확보/생성하여 반환.
   * @param {FileSystemDirectoryHandle} rootHandle
   * @param {string} subpath  예: '컨텐츠_에셋' 또는 'PROMO_1776935444399/tyr3cauqhwj6rdyh'
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  async function getOrCreateSubDir(rootHandle, subpath) {
    if (!subpath) return rootHandle;
    const parts = subpath.split(/[\/\\]/).filter(Boolean);
    let cur = rootHandle;
    for (const seg of parts) {
      cur = await cur.getDirectoryHandle(seg, { create: true });
    }
    return cur;
  }

  /** 핸들 하위의 파일 이름을 Set 으로 반환 (재파싱 덮어쓰기 판단용) */
  async function listFileNames(dirHandle) {
    const names = new Set();
    if (!dirHandle) return names;
    for await (const [name, entry] of dirHandle.entries()) {
      if (entry.kind === 'file') names.add(name);
    }
    return names;
  }

  /**
   * 디렉터리 핸들에 파일 쓰기 (있으면 덮어씀).
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} fileName
   * @param {Blob|ArrayBuffer|Uint8Array|string} data
   */
  async function writeFileToDir(dirHandle, fileName, data) {
    const fh = await dirHandle.getFileHandle(fileName, { create: true });
    const w  = await fh.createWritable();
    await w.write(data);
    await w.close();
  }

  /** 핸들 기준 표시용 경로 ('루트이름/서브이름/...') — 디버그·리포트용 */
  async function describeHandlePath(rootHandle, subDirHandle) {
    if (!rootHandle) return '';
    if (!subDirHandle || subDirHandle === rootHandle) return rootHandle.name;
    try {
      const rel = await rootHandle.resolve(subDirHandle);
      return rel ? rootHandle.name + '/' + rel.join('/') : rootHandle.name + '/???';
    } catch (_) {
      return rootHandle.name + '/' + subDirHandle.name;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  §3.  자동화 진입 조건 판별
  // ─────────────────────────────────────────────────────────────────────────

  /** URL 파라미터 / __PROMO_SESSION__ 둘 중 하나라도 있으면 자동화 모드 */
  function getAutomationContext() {
    const qs  = new URLSearchParams(location.search);
    const ses = (window.top && window.top.__PROMO_SESSION__) || null;
    const auto = qs.get('auto') === '1' || !!ses;
    if (!auto) return null;
    return {
      notionPageId: qs.get('notion')    || (ses && ses.notionPageId) || null,
      assetDir:     qs.get('assetDir')  || (ses && ses.assetDir)     || null,
      outputDir:    qs.get('outputDir') || (ses && ses.outputDir)    || null,
      session:      ses,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Exports
  // ─────────────────────────────────────────────────────────────────────────

  // ⚠️ 의도적으로 freeze 하지 않음 — ingest.js / finalize.js 등 후속 모듈이
  //     PromoPipeline 에 기능을 덧붙일 수 있도록 확장 가능 상태로 둔다.
  window.PromoPipeline = ({
    // OS / 경로
    detectOS,
    normalizeNasPath,
    // FS 핸들
    isFsApiSupported,
    getProjectRootHandle,
    resetProjectRootHandle,
    ensureRwPermission,
    getOrCreateSubDir,
    listFileNames,
    writeFileToDir,
    describeHandlePath,
    // 진입 컨텍스트
    getAutomationContext,
    // 버전 (계약 일치 확인용)
    __version: '0.1.0',
    __contract: 'image_pipeline_contract.md §1/§3 + orchestration_contract.md Route 1',
  });

  // 자동화 컨텍스트가 아니면 아무 것도 하지 않는다 (회귀 방지)
  // 후속 단계(INGESTION/FINALIZE 자동 실행)는 별도 파일에서 위 훅을 호출한다.
  const ctx = getAutomationContext();
  if (ctx) {
    console.info('[PromoPipeline] automation context detected:', ctx);
  }
})();
