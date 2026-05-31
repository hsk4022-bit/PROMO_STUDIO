// JS 측 leaf 변환 패리티 러너.
//
// video.js / paste-preprocess.js 의 순수 leaf 함수·정규식을 cases.json 골든 스펙에 대해 검증한다.
// 런타임 파일을 수정하지 않고, 소스 텍스트에서 leaf 선언부만 잘라 Node vm 샌드박스에서 실행한다
// (registerPromoPreservedBlock 은 identity 로 stub → raw HTML 비교). python run_python.py 와 동일 cases.json 사용.
//
// 사용: node run_js.mjs   (실패 시 비-0 종료)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import vm from "vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", ".."); // promo-editor/
const CASES = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));

// ── video.js 의 leaf 선언부 슬라이스 (_VIDEO_OPT_TO_DATA_ATTR ~ 그리드 빌더 끝) ──
const videoSrc = readFileSync(join(ROOT, "js", "video.js"), "utf8");
const sliceStart = videoSrc.indexOf("const _VIDEO_OPT_TO_DATA_ATTR");
const sliceEnd = videoSrc.indexOf("// event-video → <video> SSOT 빌더");
if (sliceStart < 0 || sliceEnd < 0) {
  console.error("[js] FATAL: video.js 의 leaf 선언부 앵커를 못 찾음 — 파일 구조 변경?");
  process.exit(2);
}
const ctx = { registerPromoPreservedBlock: (h) => h, console };
vm.createContext(ctx);
vm.runInContext(
  videoSrc.slice(sliceStart, sliceEnd) +
    "\nthis._gridDimensions=_gridDimensions;" +
    "\nthis._optsToDataAttrs=_optsToDataAttrs;" +
    "\nthis._buildVideoGridHtml=_buildVideoGridHtml;",
  ctx
);

// ── paste-preprocess.js 의 영상 마커 정규식 추출 ──
const pasteSrc = readFileSync(join(ROOT, "js", "paste-preprocess.js"), "utf8");
const reMatch = pasteSrc.match(/const VIDEO_RE\s*=\s*(\/.*\/[gimsuy]*)\s*;/);
if (!reMatch) {
  console.error("[js] FATAL: paste-preprocess.js 의 VIDEO_RE 정규식을 못 찾음");
  process.exit(2);
}
// eslint-disable-next-line no-new-func
const VIDEO_RE = new Function("return " + reMatch[1])();

const fails = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(section, label, actual, expect) {
  if (!eq(actual, expect)) fails.push({ section, label, expect, actual });
}

// 1) 그리드 치수
for (const c of CASES.grid_dimensions) {
  check("grid_dimensions", `n=${c.n}`, ctx._gridDimensions(c.n), c.expect);
}
// 2) 옵션 → data-attr
for (const c of CASES.opts_to_attrs) {
  check("opts_to_attrs", JSON.stringify(c.opts), ctx._optsToDataAttrs(c.opts), c.expect);
}
// 3) 영상 그리드 HTML
for (const c of CASES.video_grid_html) {
  check("video_grid_html", `${c.videos.length} videos`, ctx._buildVideoGridHtml(c.videos), c.expect);
}
// 4) 영상 마커 정규식 — (opts, url) 매치 목록. 비참여 옵션 그룹은 "" 정규화.
for (const c of CASES.marker_regex) {
  const re = new RegExp(VIDEO_RE.source, VIDEO_RE.flags);
  const matches = [...c.text.matchAll(re)].map((m) => [m[1] || "", m[2]]);
  check("marker_regex", JSON.stringify(c.text.slice(0, 40)), matches, c.expect);
}

// ── 리포트 ──
const total = Object.values(CASES).filter(Array.isArray).reduce((s, a) => s + a.length, 0);
if (fails.length) {
  console.log(`[js] PARITY FAIL — ${fails.length}/${total} case(s) mismatched:`);
  for (const f of fails) {
    console.log(`  ✗ ${f.section} [${f.label}]`);
    console.log(`      expect: ${JSON.stringify(f.expect)}`);
    console.log(`      actual: ${JSON.stringify(f.actual)}`);
  }
  process.exit(1);
}
console.log(`[js] PARITY PASS — ${total}/${total} cases match cases.json`);
