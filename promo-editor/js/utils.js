// promo-editor/js/utils.js — DOM/file/hash/canvas 유틸 + 상수
//
// app.js 에서 분리 (Stage 1 — 2026-05-28). 원본 L1-184.
// cross-file 참조되는 const → var 로 격상 (getById, apiKey, CONTENT_MODEL, IMAGE_MODEL).
// 내부 전용 const (_PROMO_IDB_*) 는 const 유지.
// 의존: showToast (app.js 잔류 — 호출 시점에 정의되어 있음)

var getById = (id) => document.getElementById(id);
var apiKey = "";
var CONTENT_MODEL = "gemini-3-flash-preview";
var IMAGE_MODEL = "gemini-3.1-flash-image-preview";

function generateHashString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function isImageFile(f) {
    return f.type.match(/^image\//i) || f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
}

// ─────────────────────────────────────────────────────────────────
//  산출물 저장 경로 — File System Access API + IndexedDB 영구 캐시
//
//  노션 "산출물 저장 경로" (또는 프롬프트로 전달된 경로) 에 자동 저장.
//  - 최초 1회: showDirectoryPicker 로 폴더 선택 → IndexedDB 에 handle 저장
//  - 이후: 탭 닫았다 열어도 기억. 권한만 한 번 확인 (팝업 자동 승인 시 그대로)
//  - 미지원 브라우저(Safari 등): 기존 <a download> 로 폴백
// ─────────────────────────────────────────────────────────────────
const _PROMO_IDB_NAME = 'promo-editor-fs';
const _PROMO_IDB_STORE = 'handles';
const _PROMO_IDB_KEY = 'outputDir';

function _promoIdbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(_PROMO_IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(_PROMO_IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror  = () => reject(req.error);
    });
}
async function _promoIdbGet() {
    try {
        const db = await _promoIdbOpen();
        return await new Promise((resolve) => {
            const tx = db.transaction(_PROMO_IDB_STORE, 'readonly');
            const r  = tx.objectStore(_PROMO_IDB_STORE).get(_PROMO_IDB_KEY);
            r.onsuccess = () => resolve(r.result || null);
            r.onerror   = () => resolve(null);
        });
    } catch (e) { return null; }
}
async function _promoIdbSet(handle) {
    try {
        const db = await _promoIdbOpen();
        await new Promise((resolve) => {
            const tx = db.transaction(_PROMO_IDB_STORE, 'readwrite');
            tx.objectStore(_PROMO_IDB_STORE).put(handle, _PROMO_IDB_KEY);
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch (e) { /* ignore */ }
}
async function _promoIdbClear() {
    try {
        const db = await _promoIdbOpen();
        await new Promise((resolve) => {
            const tx = db.transaction(_PROMO_IDB_STORE, 'readwrite');
            tx.objectStore(_PROMO_IDB_STORE).delete(_PROMO_IDB_KEY);
            tx.oncomplete = resolve; tx.onerror = resolve;
        });
    } catch (e) { /* ignore */ }
}

async function _ensureHandlePermission(handle, mode = 'readwrite') {
    if (!handle) return false;
    try {
        if ((await handle.queryPermission({ mode })) === 'granted') return true;
        return (await handle.requestPermission({ mode })) === 'granted';
    } catch (e) { return false; }
}

async function savePromoFile(filename, blob) {
    // [UX 변경 2026-05-19] showDirectoryPicker (폴더 선택) → showSaveFilePicker (저장 dialog).
    //   기존: 폴더 picker 가 떠서 사용자가 폴더만 선택, 파일명 / 위치 미세 조정 불가 → 어색함.
    //   현재: 일반 OS "다른 이름으로 저장" dialog 가 뜸. 파일명·위치 모두 사용자가 결정.
    //   미지원 브라우저 또는 취소 시 → <a download> 폴백 (기본 Downloads 폴더).
    const saveFilePickerSupported = typeof window.showSaveFilePicker === 'function';

    // 확장자에서 MIME / 설명 추론
    const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [, ''])[1].toLowerCase();
    const mimeMap = {
        zip:  { mime: 'application/zip', desc: 'ZIP archive' },
        html: { mime: 'text/html', desc: 'HTML document' },
        json: { mime: 'application/json', desc: 'JSON file' },
        txt:  { mime: 'text/plain', desc: 'Text file' },
        png:  { mime: 'image/png', desc: 'PNG image' },
        jpg:  { mime: 'image/jpeg', desc: 'JPEG image' },
        jpeg: { mime: 'image/jpeg', desc: 'JPEG image' },
    };
    const typeInfo = mimeMap[ext] || { mime: blob.type || 'application/octet-stream', desc: 'File' };

    if (saveFilePickerSupported) {
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{ description: typeInfo.desc, accept: { [typeInfo.mime]: ['.' + ext] } }],
                startIn: 'downloads'
            });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            console.log('[save] 저장 완료:', fileHandle.name);
            showToast(`저장 완료: ${fileHandle.name}`);
            return { ok: true, mode: 'save-as', filename: fileHandle.name };
        } catch (e) {
            if (e && e.name === 'AbortError') {
                // 사용자가 취소 — 폴백으로 다운로드 안 함 (취소는 명시적 의도이므로 존중)
                console.log('[save] 사용자가 저장 취소');
                showToast('저장 취소됨');
                return { ok: false, mode: 'cancelled' };
            }
            console.warn('[save] showSaveFilePicker 실패 → <a download> 폴백:', e);
        }
    }

    // 폴백 — 일반 다운로드 (Downloads 폴더)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    console.log('[save] 일반 다운로드:', filename);
    showToast(`다운로드: ${filename}`);
    return { ok: true, mode: 'download', filename };
}

// 글로벌 — 콘솔에서 폴더 초기화할 때
window.resetPromoSaveFolder = async () => {
    window.__promoOutputDirHandle = null;
    await _promoIdbClear();
    showToast('저장 폴더 초기화됨. 다음 저장 시 다시 선택하세요.');
};

// 페이지 로드 시 저장 폴더 복원 시도 (다운로드 안 누르고도 상태 확인 가능)
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.showDirectoryPicker !== 'function') return;
    const h = await _promoIdbGet();
    if (!h) return;
    // 권한은 저장 시점에 재확인 (여기서 request 하면 사용자 클릭 없이 팝업이 떠서 거절되기 쉬움)
    window.__promoOutputDirHandle = h;
    console.log('[save] 저장 폴더 기억됨:', h.name);
    // 상태 표시 배지 (있으면)
    const badge = document.getElementById('saveFolderBadge');
    if (badge) badge.textContent = `📁 ${h.name}`;
});

function downscaleCanvas(sourceCanvas, targetWidth) {
    if (sourceCanvas.width <= targetWidth + 1) {
        return sourceCanvas;
    }

    let current = sourceCanvas;
    let targetHeight = Math.round(sourceCanvas.height * (targetWidth / sourceCanvas.width));

    while (current.width / 2 >= targetWidth) {
        let temp = document.createElement('canvas');
        temp.width = current.width / 2;
        temp.height = current.height / 2;
        let ctx = temp.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(current, 0, 0, temp.width, temp.height);
        current = temp;
    }

    let finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    let ctx = finalCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, finalCanvas.width, finalCanvas.height);

    return finalCanvas;
}
