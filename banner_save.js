// ==========================================================================
//  banner_save.js — 배너 ZIP/이미지 다운로드를 "배너 로컬 저장 경로" 로 직접 저장
// --------------------------------------------------------------------------
//  사용처: banner-studio/index.html, banner-l/index.html
//  원리:
//   1) notion_data.json 의 basicInfo["배너 로컬 저장 경로"] 힌트 로드
//   2) IndexedDB 에 FileSystemDirectoryHandle 영구 캐시 (키: bannerOutputDir)
//   3) <a download> 클릭을 인터셉트 → FSA 로 저장 (최초 1회 피커, 이후 자동)
//   4) FSA 미지원/실패 시 기존 <a download> 동작으로 폴백
// ==========================================================================
(function () {
  if (window.__bannerSaveInstalled) return;
  window.__bannerSaveInstalled = true;

  const IDB_NAME  = 'banner-save-fs';
  const IDB_STORE = 'handles';
  const IDB_KEY   = 'bannerOutputDir';

  // ── IndexedDB helpers ────────────────────────────────────────────────────
  function idbOpen() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(IDB_STORE);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbGet() {
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const rq = tx.objectStore(IDB_STORE).get(IDB_KEY);
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => rej(rq.error);
      });
    } catch (e) { return null; }
  }
  async function idbSet(h) {
    try {
      const db = await idbOpen();
      await new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(h, IDB_KEY);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch (e) {}
  }
  async function idbClear() {
    try {
      const db = await idbOpen();
      await new Promise((res) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch (e) {}
  }

  async function ensurePerm(handle, mode) {
    try {
      if (!handle || !handle.queryPermission) return false;
      const q = await handle.queryPermission({ mode });
      if (q === 'granted') return true;
      const r = await handle.requestPermission({ mode });
      return r === 'granted';
    } catch (e) { return false; }
  }

  // ── 힌트 로드 (notion_data.json) ──────────────────────────────────────────
  (async function loadHint() {
    try {
      const resp = await fetch('./notion_data.json?' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      const bi = (data && data.basicInfo) || {};
      const hint = bi['배너 로컬 저장 경로'] || bi['배너 저장 경로'] || '';
      if (hint) {
        window.__bannerOutputPathHint = hint;
        console.log('[banner_save] 힌트:', hint);
      }
    } catch (e) {}
  })();

  // ── 저장 폴더 핸들 확보 ──────────────────────────────────────────────────
  let _cachedHandle = null;
  async function getHandle() {
    if (_cachedHandle) return _cachedHandle;
    if (typeof window.showDirectoryPicker !== 'function') return null;

    // IDB 복구
    const fromIdb = await idbGet();
    if (fromIdb) {
      if (await ensurePerm(fromIdb, 'readwrite')) {
        _cachedHandle = fromIdb;
        console.log('[banner_save] 복원된 저장 폴더:', fromIdb.name);
        return fromIdb;
      }
      await idbClear();
    }

    // 신규 피커
    try {
      const h = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      _cachedHandle = h;
      await idbSet(h);
      console.log('[banner_save] 저장 폴더 기억됨:', h.name);
      return h;
    } catch (e) {
      return null;
    }
  }

  async function writeFile(handle, filename, blob) {
    const fh = await handle.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob); await w.close();
  }

  async function fetchBlob(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch failed: ' + r.status);
    return await r.blob();
  }

  // ── <a download>.click() 인터셉트 ────────────────────────────────────────
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const a = this;
    const hasDownload = a.hasAttribute('download') || (a.download && a.download.length > 0);
    const href = a.href;

    if (!hasDownload || !href) {
      return origClick.apply(a, arguments);
    }

    // 비동기 처리 — 기본 동작은 즉시 취소하지 않고 FSA 성공 시에만 우회
    (async () => {
      try {
        const handle = await getHandle();
        if (!handle) {
          origClick.apply(a, []); // 폴백
          return;
        }
        const filename = a.download || ('banner_' + Date.now());
        const blob = await fetchBlob(href);
        await writeFile(handle, filename, blob);
        console.log('[banner_save] 저장:', handle.name + '/' + filename);
      } catch (e) {
        console.warn('[banner_save] 저장 실패, 다운로드로 폴백:', e);
        try { origClick.apply(a, []); } catch (_) {}
      }
    })();

    // 표준 click 은 호출하지 않음 (성공 시 중복 다운로드 방지)
    // 실패 케이스는 위 catch 에서 폴백 처리
  };

  // ── 외부 노출 ────────────────────────────────────────────────────────────
  window.resetBannerSaveFolder = async function () {
    _cachedHandle = null;
    await idbClear();
    console.log('[banner_save] 저장 폴더 초기화됨 — 다음 다운로드 시 피커 표시');
  };

  // 페이지 로드 시 IDB 핸들 사전 복원 시도 (로그만)
  document.addEventListener('DOMContentLoaded', async () => {
    const h = await idbGet();
    if (h) console.log('[banner_save] 캐시된 저장 폴더:', h.name, '(권한은 첫 다운로드 시 요청)');
  });

  console.log('[banner_save] installed');
})();
