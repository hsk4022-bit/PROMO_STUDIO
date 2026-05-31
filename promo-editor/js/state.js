// promo-editor/js/state.js — 모든 mutable shared state
//
// app.js 에서 분리 (Stage 1 — 2026-05-28).
// `let` 키워드를 `var` 로 변환. 본문 read/write 사이트는 0 변경.
//
// 원칙:
// - top-level `var` 는 자동으로 window 속성이 되어 다른 <script src> 파일에서 동일 식별자로 접근 가능.
// - `let` 도 cross-script 전역 접근 가능하지만, 인라인 onclick HTML 호환 + hoisting 안전성 위해 var 채택.
// - 초기값/순서는 원본 app.js 와 동일.

// ── 에디터 활성 셀 (원본 L185-186)
var activeLayer = null;
var lastActiveCell = null;

// ── 출력 / 슬라이서 공통 해시폴더 (원본 L187)
var currentHashFolder = '';

// ── 영상 blob URL ↔ data URL 매핑 (원본 L188, const Map → var Map. 바인딩 cross-file)
var videoObjectUrlMap = new Map();

// ── 로고 (원본 L189-191)
var logoBase64 = null;
var logoPos = 'right';      // left/right
var logoSize = 14;          // % of hero width

// ── 에셋 / 가이드라인 (원본 L261-264)
var uploadedAssets = [];
var contentAssetLibrary = {};
var referenceImageBase64 = null;
var masterGuidelineText = "";

// ── 셀 선택 (원본 L266-268)
var isSelecting = false;
var selectionStartCell = null;
var selectedCells = [];

// ── 히스토리 (원본 L270-271)
var historyStack = [];
var historyIdx = -1;

// ── 타이핑 / selection 백업 (원본 L273-274)
var savedRange = null;
var typingTimer = null;

// ── preserve token 배열 (원본 L1159)
// cross-file: paste-preprocess (write) ↔ generateContent in app.js (read)
var _promoPreservedBlocks = [];

// ── 슬라이서 (원본 L1546-1549)
var slicerImg = null;
var slicerLinks = [];
var slicerPopups = [];      // 팝업 트리거 버튼 위치 목록
var autoSliceCount = 1;

// ── 이미지 / 영상 / 클립보드 (원본 L3372, 3438, 3736, 4693)
var currentImgMode = 'resize';
var _lastVideoRef = null;   // 영상 옵션 바용 — activeLayer 해제 시에도 참조 유지
var imgClipboard = null;
var blockClipboard = null;

// ── 팝업 패널 시스템 (원본 L4827-4828, 5301)
var childPanels = [];       // [{id, title}]
var nextPopupId = 1;
var activeEditorPopup = null;

// ── 이미지 리사이저 (원본 L8248-8255)
var isImgResizing = false;
var currentImgResizer = null;
var startImgX = 0;
var startImgY = 0;
var startImgWidth = 0;
var startImgHeight = 0;
var startAspectRatio = 1;   // 드래그 시작 시 비율 고정용
var imgResizePos = '';

// ── 노션 sync (원본 L9578-9579)
var registeredNotionPageId = null;
var registeredNotionTitle = '';
