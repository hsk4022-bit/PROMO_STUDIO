#!/usr/bin/env python3
# ============================================================================
#  build_notion_data.py  —  결정론적 Notion → notion_data.json 빌더
#
#  사용법:
#    python3 build_notion_data.py \
#        --raw notion_raw.md \
#        --asset-dir <컨텐츠_에셋_경로> \
#        --out notion_data.json
#
#  책임:
#    1) notion_raw.md (Notion MCP 응답 원문) 을 읽고 섹션별로 파싱
#    2) HERO_SECTION 화이트리스트 기반 엄격 추출 (버튼 필드 존재 X → 포함 금지)
#    3) BANNER_SECTION / 다규격 배너 분리 추출 (HERO 와 섞이지 않음)
#    4) CONTENT_SECTION 본문 텍스트 + 마커 추출
#    5) S3 이미지 다운로드 → §1.3.B block-id suffix 로 컨텐츠 폴더에 저장
#    6) 컨텐츠 폴더 전수 스캔 → base64 인코딩 → contentAssets
#    7) 자가 검증 (위반 시 즉시 FAIL)
#    8) notion_data.json + notion_data_report.txt 출력
#
#  자가 검증 규칙 (위반 = FAIL):
#    - heroText 에 "버튼:" 서브스트링이 있으면 FAIL
#    - heroText 는 "타이틀:" 로 시작해야 함
#    - banners 는 list
#    - contentAssets 비어있으면 FAIL
#    - 본문 마커 (XXX) 중 contentAssets 에 매칭 안 되는 게 있으면 WARNING
# ============================================================================

import argparse, base64, hashlib, json, mimetypes, os, re, sys, time, unicodedata, urllib.request

# ────────────────────────────────────────────────────────────────────────
#  HERO_SECTION 허용 필드 화이트리스트
#  (여기에 없는 필드는 heroText 에 절대 들어가지 못함)
# ────────────────────────────────────────────────────────────────────────
HERO_TEXT_FIELDS  = ['타이틀', '서브타이틀', '추가 텍스트']
HERO_STYLE_FIELDS = ['디자인 스타일']
HERO_RATIO_FIELDS = ['이미지 비율']
HERO_LOGO_POS     = ['로고 위치']
HERO_REF_FIELDS   = ['레퍼런스 이미지', '레퍼런스', 'reference']  # 스타일 참고용 — 복사 금지
# 주의: '버튼' 은 HERO 에 없음 — BANNER_SECTION 전용
HERO_BANNED_FIELDS = ['버튼', 'btn_text', 'button']


# ────────────────────────────────────────────────────────────────────────
#  HTML-like 테이블 파서
# ────────────────────────────────────────────────────────────────────────
# [2026-05-30 fix] `<tr>` 뿐 아니라 `<tr color="gray_bg">` 처럼 속성 있는 행도 매칭.
#   노션은 헤더/라벨 행을 보통 `<tr color="...">` 로 색칠해서 보냄 → 속성 없는 `<tr>` 만 잡으면
#   색칠 헤더/라벨 행이 통째로 드롭됨 (영상 표 "미리보기 N" 라벨, 주간랭킹 헤더 등 누락 회귀).
#   TD_RE 가 `<td[^>]*>` 로 속성 허용하던 것과 동일하게 TR 도 속성 허용.
TR_RE   = re.compile(r'<tr\b[^>]*>(.*?)</tr>', re.DOTALL)
TD_RE   = re.compile(r'<td[^>]*>(.*?)</td>', re.DOTALL)

def _strip_md(s: str) -> str:
    """노션 MCP 출력에서 흔한 마크다운 이스케이프/태그 제거."""
    s = s.replace('\\[', '[').replace('\\]', ']')
    s = s.replace('\\|', '|').replace('\\~', '~').replace('\\*', '*')
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<empty-block\s*/?>', '', s)
    s = re.sub(r'\*\*(.+?)\*\*', r'\1', s, flags=re.DOTALL)   # bold 제거
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\2', s)            # markdown link → url
    s = re.sub(r'`([^`]+)`', r'\1', s)                           # code tick 제거
    return s.strip()

def parse_kv_table(table_html: str) -> dict:
    """2-열 (항목/값) 테이블 → dict."""
    out = {}
    rows = TR_RE.findall(table_html)
    for row in rows:
        cells = [_strip_md(c) for c in TD_RE.findall(row)]
        if len(cells) < 2: continue
        key, val = cells[0], cells[1]
        if key in ('항목', '**항목**') or not key: continue
        out[key] = val
    return out

def parse_rows_table(table_html: str) -> list:
    """다중 열 테이블 → list[dict] (첫 행 = 헤더)."""
    rows = TR_RE.findall(table_html)
    if not rows: return []
    headers = [_strip_md(c) for c in TD_RE.findall(rows[0])]
    out = []
    for row in rows[1:]:
        cells = [_strip_md(c) for c in TD_RE.findall(row)]
        if not cells: continue
        out.append({headers[i] if i < len(headers) else f'col{i}': cells[i]
                    for i in range(len(cells))})
    return out


# ────────────────────────────────────────────────────────────────────────
#  섹션 분리 — heading_3 ("### # [섹션명]") 기준
# ────────────────────────────────────────────────────────────────────────
SECTION_HEADER_RE = re.compile(
    r'^#{2,3}\s*#\s*\*{0,2}\\?\[\*{0,2}([^\]\*]+?)\*{0,2}\\?\]\*{0,2}', re.MULTILINE
)

def split_sections(raw: str) -> dict:
    """
    섹션명 → 본문 텍스트 매핑. 섹션명 예: '기본 정보', 'HERO_SECTION',
    'CONTENT_SECTION', 'BANNER_SECTION', '다규격 배너 데이터'.
    """
    matches = list(SECTION_HEADER_RE.finditer(raw))
    sections = {}
    for i, m in enumerate(matches):
        name = m.group(1).strip()
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(raw)
        sections[name] = raw[start:end]
    return sections


# ────────────────────────────────────────────────────────────────────────
#  HERO 섹션 — 화이트리스트 기반 엄격 추출
# ────────────────────────────────────────────────────────────────────────
FIRST_TABLE_RE = re.compile(r'<table[^>]*>(.*?)</table>', re.DOTALL)

def parse_hero_section(section_text: str, extra_callout_text: str = '') -> dict:
    """HERO_SECTION 테이블만 읽음. 화이트리스트 외 필드는 무시.
    extra_callout_text: [Asset]/[Logo]/[Reference] 콜아웃이 [기본 정보] 섹션에 있을 때 같이 검색하도록."""
    m = FIRST_TABLE_RE.search(section_text)
    if not m:
        raise ValueError('HERO_SECTION 에 테이블을 찾지 못했습니다.')
    kv = parse_kv_table(m.group(1))

    # 금지 필드 검사
    for banned in HERO_BANNED_FIELDS:
        for key in kv:
            if banned.lower() in key.lower():
                raise AssertionError(
                    f'HERO_SECTION 에 금지 필드 "{key}" 감지. '
                    f'버튼/btn_text 는 BANNER_SECTION 에만 있어야 함.'
                )

    hero_text_lines = []
    for f in HERO_TEXT_FIELDS:
        v = kv.get(f, '').strip()
        if v:
            hero_text_lines.append(f'{f}: {v}')
    hero_text = '\n'.join(hero_text_lines)

    hero_style = ''
    for f in HERO_STYLE_FIELDS:
        if kv.get(f):
            hero_style = kv[f].strip(); break

    ratio_raw = ''
    for f in HERO_RATIO_FIELDS:
        if kv.get(f):
            ratio_raw = kv[f].strip(); break
    ratio = ratio_raw.replace(' ', '')
    if ratio not in ('1:1', '3:4', '4:3'):
        ratio = '1:1'   # 안전 기본값

    logo_pos_raw = ''
    for f in HERO_LOGO_POS:
        if kv.get(f):
            logo_pos_raw = kv[f].strip(); break
    # TR/TL/BR/BL → right/left 단순화
    logo_pos = 'right' if 'R' in logo_pos_raw.upper() else 'left'

    # [Asset] / [Logo] / [Reference] 섹션 파싱 — 보통 [기본 정보] 섹션에 있으므로 extra_callout_text 합쳐서 검색.
    combined = section_text + '\n' + (extra_callout_text or '')
    asset_s3 = _find_callout_s3(combined, 'Asset')
    logo_url = _find_callout_url(combined, 'Logo')
    ref_s3   = _find_callout_s3(combined, 'Reference')

    return {
        'heroText':   hero_text,
        'heroStyle':  hero_style,
        'heroRatio':  ratio,
        'logoPosition': logo_pos,
        '_heroAssetS3': asset_s3,
        '_heroLogoUrl': logo_url,
        '_heroRefS3':   ref_s3,
        '_heroKv':      kv,  # 디버그용
    }

# [2026-05-27 fix] 노션 MCP 가 콜아웃을 `<callout>` 또는 `<aside>` 로 export → 양쪽 모두 매칭.
CALLOUT_RE = re.compile(r'<(?:callout|aside)[^>]*>(.*?)</(?:callout|aside)>', re.DOTALL)
S3_URL_RE  = re.compile(r'https://prod-files-secure\.s3[^\s)]+')
IMG_URL_RE = re.compile(r'!\[\]\((https://[^\s)]+)\)')
LABEL_RE   = lambda label: re.compile(
    r'\\?\[' + re.escape(label) + r'\\?\](.*?)<(?:callout|aside)[^>]*>(.*?)</(?:callout|aside)>',
    re.DOTALL
)

def _find_callout_s3(section_text: str, label: str):
    """**[label]** 바로 뒤 <callout>...</callout> 안의 S3 URL 추출."""
    m = LABEL_RE(label).search(section_text)
    if not m: return None
    callout_body = m.group(2)
    url = S3_URL_RE.search(callout_body)
    return url.group(0) if url else None

def _find_callout_url(section_text: str, label: str):
    """[label] 콜아웃 안의 일반 URL (로고 등 https URL)."""
    m = LABEL_RE(label).search(section_text)
    if not m: return None
    body = m.group(2)
    urls = re.findall(r'https?://[^\s)\]]+', body)
    # 마크다운 링크 [text](url) 에서 text 가 url 인 경우 중복 제거
    uniq = []
    for u in urls:
        if u not in uniq: uniq.append(u)
    return uniq[0] if uniq else None


# ────────────────────────────────────────────────────────────────────────
#  CONTENT_SECTION — 본문 텍스트 재조립 + S3 이미지 URL + 마커
# ────────────────────────────────────────────────────────────────────────

def parse_content_section(section_text: str) -> dict:
    """
    CONTENT_SECTION 에서:
      - 상단 CONTENT_STYLE 테이블 → contentStyle
      - 나머지 본문 → contentData (원문 보존, 마크업 이스케이프만 제거)
      - 본문에 포함된 S3 이미지 URL (blockId 포함) 리스트
    """
    content_style = ''
    body_text = section_text

    # 첫 테이블이 CONTENT_STYLE 이면 분리
    first_table_m = FIRST_TABLE_RE.search(body_text)
    if first_table_m:
        kv = parse_kv_table(first_table_m.group(1))
        for k, v in kv.items():
            if 'CONTENT_STYLE' in k.upper() or 'STYLE' == k.upper().strip('`'):
                content_style = v.strip()
        # 첫 테이블 제거
        body_text = body_text[first_table_m.end():]

    # S3 이미지 URL 추출 (본문 + 콜아웃 안 포함)
    s3_imgs = []
    for m in IMG_URL_RE.finditer(body_text):
        url = m.group(1)
        if 'prod-files-secure' not in url: continue
        # blockId 추출: /workspace-id/BLOCK-ID/filename
        parts = url.split('/')
        # .../<workspace>/<blockId>/<filename>?...
        try:
            blk_idx = None
            for i, p in enumerate(parts):
                if re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', p):
                    blk_idx = i
            if blk_idx is None: continue
            block_id = parts[blk_idx]
            filename_raw = parts[blk_idx + 1].split('?')[0]
        except Exception:
            continue
        s3_imgs.append({'url': url, 'blockId': block_id, 'filename': filename_raw})

    # 본문 텍스트 정리: 테이블은 파이프 구분자로, 콜아웃은 들여쓰기
    body_clean = _clean_body(body_text)

    return {
        'contentStyle': content_style,
        'contentData':  body_clean,
        '_s3Images':    s3_imgs,
    }

def _clean_body(text: str) -> str:
    """MCP 원문에서 HTML 태그를 최대한 평문화."""
    # ─────────────────────────────────────────────────────────────────────
    # 테이블 → 마크다운 파이프 테이블
    #
    # ⚠️ 회귀 방지 (2026-04-23):
    #   - 이전 버그: 구분선(|---|---|) 누락 → HTML 렌더 시 빈 thead 행 삽입
    #   - 재발 방지 원칙: 헤더 판정 규칙을 "첫 행의 모든 셀이 볼드(**...**)" 로 고정
    #   - 주간랭킹 (3셀 전부 볼드) = 헤더 있음 → 구분선 삽입
    #   - 누적랭킹 보상 (일부만 볼드) = 라벨 테이블 → 헤더 없음, 더미 헤더+구분선으로 감싸서
    #     마크다운 파서가 반드시 테이블로 인식하게 함 (첫 데이터 행이 실수로 헤더로 흡수되지 않도록)
    #
    # 이 함수 수정 시 반드시 전후 케이스 둘 다 테스트:
    #   A) <td>**주차**</td><td>**랭킹...**</td><td>**보상...**</td>  → 주차가 헤더
    #   B) <td>**1위**</td><td>(item1)...</td>                      → 1위가 본문 (헤더는 공란)
    # ─────────────────────────────────────────────────────────────────────
    BOLD_CELL_RE = re.compile(r'^\s*\*\*.+\*\*\s*$', re.S)
    def _is_header_row(raw_cells):
        return len(raw_cells) > 1 and all(BOLD_CELL_RE.match(c or '') for c in raw_cells)

    def table_to_pipe(m):
        table_html = m.group(0)
        rows = TR_RE.findall(table_html)
        parsed = []  # [(raw_cells, clean_cells)]
        for row in rows:
            raws = TD_RE.findall(row)
            if not raws: continue
            # 셀 안의 literal `|` 는 markdown pipe 구분자와 충돌 → 반드시 `\|` 로 이스케이프.
            # 예: `[영상|정지|플레이바]` 가 셀 안에 있으면 escape 안 할 시 데이터 row 가 7컬럼으로 깨짐.
            cleans = [_strip_md(c).replace('\n', ' ').strip().replace('|', '\\|') for c in raws]
            parsed.append((raws, cleans))
        if not parsed:
            return ''

        col_count = max(len(c) for _, c in parsed)
        out = []
        first_raw, first_clean = parsed[0]
        # [2026-05-30] 영상 그리드(셀에 `[영상…]` 마커 포함)는 header/data 표가 아니라 "라벨+영상" 균일 그리드.
        #   라벨 행이 볼드(`**미리보기 1**`)라 _is_header_row 가 첫 행을 헤더로 승격 → 첫 라벨행만 헤더 스타일,
        #   나머지 라벨행은 데이터 셀로 렌더되어 불일치. → 영상 마커 포함 표는 헤더 판정 자체를 끔(headerless).
        is_video_grid = '[영상' in table_html
        has_header = (not is_video_grid) and _is_header_row(first_raw)

        if has_header:
            out.append('| ' + ' | '.join(first_clean) + ' |')
            out.append('|' + '|'.join(['---'] * len(first_clean)) + '|')
            data_rows = parsed[1:]
        else:
            # 더미 헤더 + 구분선 → 마크다운 파서가 '테이블' 로 확정 인식, 첫 데이터 행이 헤더로 흡수되지 않음
            out.append('|' + ' |' * col_count)
            out.append('|' + '|'.join(['---'] * col_count) + '|')
            data_rows = parsed

        for _, cells in data_rows:
            # 컬럼 수 정규화
            padded = cells + [''] * (col_count - len(cells))
            out.append('| ' + ' | '.join(padded) + ' |')

        return '\n' + '\n'.join(out) + '\n'
    text = re.sub(r'<table[^>]*>.*?</table>', table_to_pipe, text, flags=re.DOTALL)

    # 이미지 마커화: ![](s3-url) → (filename.ext)  — 파일명 추출
    def img_marker(m):
        url = m.group(1)
        fname = url.split('/')[-1].split('?')[0]
        return f'\n({fname})\n'
    text = re.sub(r'!\[\]\((https://[^\s)]+)\)', img_marker, text)

    # 콜아웃 → 본문 인라인 (\[툴팁N\] 라인 유지)
    # [2026-05-27 fix] 노션 MCP 가 콜아웃을 `<callout>` 또는 `<aside>` 로 export.
    #   `<aside>` 케이스도 동일하게 unwrap — 태그가 영상 마커-URL 사이에 끼면
    #   _convert_consecutive_video_markers_to_grid 의 연속 run 판정이 실패해 4개 영상이 세로 적층되는 회귀 차단.
    def callout_inline(m):
        body = m.group(1)
        return '\n' + body + '\n'
    text = re.sub(r'<callout[^>]*>(.*?)</callout>', callout_inline, text, flags=re.DOTALL)
    text = re.sub(r'<aside[^>]*>(.*?)</aside>',   callout_inline, text, flags=re.DOTALL)

    # colgroup/col 제거
    text = re.sub(r'<colgroup>.*?</colgroup>', '', text, flags=re.DOTALL)
    text = re.sub(r'<col\s*[^>]*/?>', '', text)
    text = re.sub(r'<empty-block\s*/?>', '', text)
    text = re.sub(r'<br\s*/?>', '\n', text)

    # 남은 태그 제거
    text = re.sub(r'</?(?:tr|td|th|table|tbody|thead)[^>]*>', '', text)

    # 마크다운 이스케이프 풀기
    text = text.replace('\\[', '[').replace('\\]', ']')
    text = text.replace('\\|', '|').replace('\\~', '~').replace('\\*', '*')
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text, flags=re.DOTALL)

    # [2026-05-20] 영상/이미지 URL 의 markdown 링크 wrap 정리
    #   노션 MCP 가 URL 을 [URL](URL) 형식으로 감싸서 반환 → 마커 파서/AI 가 혼동
    #   같은 URL 이 텍스트와 링크 양쪽에 있으면 → URL 만 남김
    #   다른 텍스트와 URL 조합이면 → URL 만 남김 (앵커 텍스트는 보통 URL 자체라 손실 없음)
    text = re.sub(r'\[([^\]\n]+?)\]\((https?://[^\s\)]+)\)',
                  lambda m: m.group(2) if m.group(1).strip() == m.group(2).strip() else m.group(2),
                  text)

    # 3줄 이상 연속 공백 → 2줄
    text = re.sub(r'\n{3,}', '\n\n', text)

    # [2026-05-27 fix] markdown pipe table row 가 여러 줄에 걸친 경우 (`| ... \n url | ... |`) 정규화.
    #   노션 표 셀 안에 줄바꿈이 있으면 markdown export 가 cell 을 멀티라인으로 펼침 →
    #   _convert_inline_video_markers_in_pipe_rows 가 row 인식 못해 영상 변환 누락 회귀 차단.
    text = _normalize_pipe_table_rows(text)

    # [2026-05-27] 연속 영상 마커 → 결정론적 raw HTML 그리드 변환.
    #   Gemini 가 4개 영상을 2x2 그리드로 묶는 룰을 못 따르는 케이스 다발 (nested 깨진 markup, aspect-ratio 박힘 등).
    #   여기서 미리 raw HTML <table> 로 변환해 두면 Gemini 가 원고 보존 룰에 따라 그대로 통과시킴.
    #   - 2개→1x2, 3개→1x3, 4개→2x2, 5개→2x3 (마지막 빈 셀), 6개→2x3
    #   - 같은 옵션 (정지/플레이바/소리/1회) 조합을 가진 영상들만 같은 그리드로 묶음 (다르면 별도 그리드)
    #   - 영상 사이에 다른 의미 있는 컨텐츠가 있으면 그리드 안 묶음 (인접 + 공백만 허용)
    text = _convert_consecutive_video_markers_to_grid(text)

    # [2026-05-27 fix] markdown pipe table 셀 안의 영상 마커 → event-video div 변환.
    #   table_to_pipe 가 셀 안 \n 을 공백으로 치환 + 그리드 변환은 pipe row 스킵 →
    #   셀 안 `[영상|opts] url` 이 변환 누락되어 Gemini 가 텍스트로 출력 → 영상 안 보임.
    #   여기서 셀 단위 정규식 치환으로 결정론적 변환.
    text = _convert_inline_video_markers_in_pipe_rows(text)

    return text.strip()


# ────────────────────────────────────────────────────────────────────────
#  영상 마커 그리드 변환 (build_notion_data 결정론)
# ────────────────────────────────────────────────────────────────────────

_VIDEO_MARKER_LINE_RE = re.compile(
    # [2026-05-27 fix] 마커와 URL 사이는 공백/줄바꿈 둘 다 허용 (최대 200자, lazy).
    #   같은 줄 (`[영상] https://....mp4`) / 다른 줄 둘 다 잡힘. paste 경로(app.js)와 동일.
    #   거리 제한으로 우연한 무관 마커-URL 매칭 차단.
    r'\[영상(?:\|([^\]\n]*))?\]\s{1,200}?(https?://[^\s\n\)]+\.(?:mp4|webm|mov)(?:\?[^\s\n\)]*)?)',
    re.IGNORECASE
)

# 옵션 키워드 → data-* 속성 매핑
_OPTION_TO_DATA_ATTR = {
    '정지': 'data-stop',
    '플레이바': 'data-controls',
    '소리': 'data-sound',
    '1회': 'data-once',
}

def _opts_to_data_attrs(opts_str: str) -> str:
    """`정지|플레이바` → `data-stop data-controls`"""
    if not opts_str:
        return ''
    attrs = []
    for kw in opts_str.split('|'):
        kw = kw.strip()
        if kw in _OPTION_TO_DATA_ATTR:
            attrs.append(_OPTION_TO_DATA_ATTR[kw])
    return ' '.join(attrs)

def _grid_dimensions(n: int) -> tuple:
    """영상 개수 → (rows, cols). 4→(2,2), 6→(2,3) 등."""
    if n <= 1:
        return (1, 1)
    if n == 2:
        return (1, 2)
    if n == 3:
        return (1, 3)
    if n == 4:
        return (2, 2)
    if n in (5, 6):
        return (2, 3)
    # 7 이상: 3열 유지, 행 추가 (ceil(n/3)). JS video.js _gridDimensions 와 동일.
    #   (구버그: `if n in (7,8): return (3,3) if n==9 else (4,2)` — n==9 도달 불가 → 항상 (4,2) 로
    #    7·8개일 때 2열 그리드가 나와 JS(3열)와 드리프트. transform-parity 가 검출 후 제거.)
    cols = 3
    rows = (n + cols - 1) // cols
    return (rows, cols)

def _build_video_grid_html(videos: list) -> str:
    """videos: [(opts_str, url), ...] → raw HTML <table> 2~3열 그리드.
    Gemini 가 원고 보존 룰에 따라 그대로 통과하도록 단순 markup."""
    n = len(videos)
    rows, cols = _grid_dimensions(n)
    # 셀 폭은 2자리 고정 소수("50.00")로 — JS video.js _buildVideoGridHtml 의 (100/cols).toFixed(2) 와
    # 문자열까지 동일하게 맞춤. round() 는 "50.0" 을 내 JS("50.00") 와 텍스트 드리프트 발생 (transform-parity 가 검출).
    cell_width_pct = f"{100 / cols:.2f}"
    cells_html = []
    for i in range(rows * cols):
        if i < n:
            opts, url = videos[i]
            data_attrs = _opts_to_data_attrs(opts)
            cell_inner = f'<div class="se-div event-video" data-src="{url}"{(" " + data_attrs) if data_attrs else ""}></div>'
        else:
            cell_inner = ''
        cells_html.append(
            f'<td style="padding:0.375rem;vertical-align:top;width:{cell_width_pct}%;box-sizing:border-box;">{cell_inner}</td>'
        )
    # rows 단위로 묶기
    tr_html = []
    for r in range(rows):
        row_cells = cells_html[r * cols:(r + 1) * cols]
        tr_html.append('<tr>' + ''.join(row_cells) + '</tr>')
    table = (
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;">'
        '<tbody>' + ''.join(tr_html) + '</tbody>'
        '</table>'
    )
    return '\n' + table + '\n'

def _convert_consecutive_video_markers_to_grid(text: str) -> str:
    """본문 텍스트에서 연속한 영상 마커(2개 이상, 같은 옵션) 를 raw HTML 그리드로 변환.
    셀 안에 영상 마커가 들어간 markdown table 행은 건드리지 않음 (`| ... |` 행은 스킵)."""
    # 1) 모든 영상 마커 위치 + 옵션 + URL 수집
    matches = list(_VIDEO_MARKER_LINE_RE.finditer(text))
    if len(matches) < 2:
        return text

    # 2) 인접성 판정: m1.end()..m2.start() 사이가 공백/줄바꿈만이면 연속
    GAP_RE = re.compile(r'^\s*$')
    # markdown table row 안의 영상 마커는 별도 처리 경로 (셀 안 그대로 두고 system 이 셀별 변환)
    def _in_pipe_row(pos: int) -> bool:
        # 해당 위치가 포함된 줄이 `|` 로 시작/끝나면 markdown table row
        line_start = text.rfind('\n', 0, pos) + 1
        line_end = text.find('\n', pos)
        if line_end < 0:
            line_end = len(text)
        line = text[line_start:line_end].strip()
        return line.startswith('|') and line.endswith('|')

    runs = []  # [(start_idx_in_matches, end_idx_exclusive, opts_str)]
    i = 0
    while i < len(matches):
        if _in_pipe_row(matches[i].start()):
            i += 1
            continue
        run_start = i
        opts_first = (matches[i].group(1) or '').strip()
        j = i + 1
        while j < len(matches):
            if _in_pipe_row(matches[j].start()):
                break
            # 같은 옵션 + gap 이 공백만이어야 연속
            opts_j = (matches[j].group(1) or '').strip()
            if opts_j != opts_first:
                break
            gap = text[matches[j-1].end():matches[j].start()]
            if not GAP_RE.match(gap):
                break
            j += 1
        if j - run_start >= 2:
            runs.append((run_start, j, opts_first))
            i = j
        else:
            i += 1

    if not runs:
        return text

    # 3) 뒤에서부터 치환 (앞부터 치환 시 offset 이 깨짐)
    new_text = text
    for run_start, run_end, opts in reversed(runs):
        first_m = matches[run_start]
        last_m = matches[run_end - 1]
        videos = [(opts, matches[k].group(2)) for k in range(run_start, run_end)]
        replacement = _build_video_grid_html(videos)
        new_text = new_text[:first_m.start()] + replacement + new_text[last_m.end():]

    return new_text


# ────────────────────────────────────────────────────────────────────────
#  markdown pipe table row 정규화 — 셀 내 줄바꿈 평탄화 (추가 2026-05-27)
# ────────────────────────────────────────────────────────────────────────

def _normalize_pipe_table_rows(text: str) -> str:
    """노션 표 셀 안 줄바꿈으로 markdown row 가 여러 줄에 걸친 경우 한 줄로 머지.

    예시 입력:
        | [영상|정지|플레이바]
        https://...02.mp4 | [영상|정지|플레이바]
        https://...01.mp4 |

    출력:
        | [영상|정지|플레이바] https://...02.mp4 | [영상|정지|플레이바] https://...01.mp4 |

    알고리즘:
      1) `|` 로 시작하지만 `|` 로 끝나지 않는 줄 발견 → continuation row
      2) `|` 로 끝나는 줄이 나올 때까지 다음 줄 수집 (빈 줄 / 새 `|` 시작 줄 / heading 만나면 중단)
      3) 수집된 줄들을 trim + 공백 join → 한 줄로 평탄화
    """
    lines = text.split('\n')
    out = []
    i = 0
    merged_total = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith('|') and not stripped.endswith('|') and len(stripped) > 1:
            collected = [line]
            j = i + 1
            closed = False
            while j < len(lines):
                nxt = lines[j]
                nxt_strip = nxt.strip()
                if nxt_strip == '' or nxt_strip.startswith('|') or nxt_strip.startswith('#'):
                    break
                collected.append(nxt)
                if nxt_strip.endswith('|'):
                    closed = True
                    break
                j += 1
            if closed:
                out.append(' '.join(s.strip() for s in collected))
                merged_total += len(collected) - 1
                i = j + 1
                continue
        out.append(line)
        i += 1
    if merged_total:
        try:
            import sys
            print(f'[build_notion_data] pipe table normalized: {merged_total} continuation line(s) merged',
                  file=sys.stderr)
        except Exception:
            pass
    return '\n'.join(out)


# ────────────────────────────────────────────────────────────────────────
#  pipe-row 셀 안 영상 마커 → event-video div 인라인 변환 (추가 2026-05-27)
# ────────────────────────────────────────────────────────────────────────

# table_to_pipe 가 셀 안 \n → 공백으로 치환하므로 셀 안 마커는 같은 줄 형태.
# 그리드 변환은 _in_pipe_row 로 의도적 스킵 → 여기서 셀 단위로 변환.
# `]` `|` `\` 는 markdown pipe 셀 종결자라 URL 캡처에서 제외.
_VIDEO_INLINE_RE = re.compile(
    r'\[영상(?:\|([^\]\n]*))?\]\s{1,40}?(https?://[^\s\n\)\|\\]+\.(?:mp4|webm|mov)(?:\?[^\s\n\)\|\\]*)?)',
    re.IGNORECASE
)

_PIPE_ROW_SEP_RE = re.compile(r'^\|[\s\|:\-]+\|$')

def _convert_inline_video_markers_in_pipe_rows(text: str) -> str:
    """markdown pipe table row 안의 `[영상|opts] url` → event-video div HTML.
    `| ... [영상\|정지\|플레이바] https://....mp4 ... |` 같은 한 줄짜리 셀 안 마커 처리.
    `\|` 이스케이프는 이미 _clean_body 가 풀어둔 뒤이므로 옵션 추출은 그대로 가능.
    헤더 구분선(`| --- | --- |`)은 건너뜀."""

    def _replace_in_cell(m):
        opts = (m.group(1) or '').strip()
        url = m.group(2)
        data_attrs = _opts_to_data_attrs(opts)
        return f'<div class="se-div event-video" data-src="{url}"' \
               f'{(" " + data_attrs) if data_attrs else ""}></div>'

    lines = text.split('\n')
    converted = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not (stripped.startswith('|') and stripped.endswith('|')):
            continue
        if _PIPE_ROW_SEP_RE.match(stripped):
            continue
        if '[영상' not in line:
            continue
        new_line, n = _VIDEO_INLINE_RE.subn(_replace_in_cell, line)
        if n:
            converted += n
            lines[i] = new_line
    if converted:
        # 결정론적 변환 로깅 — 디버그 시 grep 용이
        try:
            import sys
            print(f'[build_notion_data] pipe-row inline video → event-video div: {converted} cell(s)', file=sys.stderr)
        except Exception:
            pass
    return '\n'.join(lines)


# ────────────────────────────────────────────────────────────────────────
#  BANNER_SECTION + 다규격 배너
# ────────────────────────────────────────────────────────────────────────

def parse_banner_section(section_text: str) -> list:
    m = FIRST_TABLE_RE.search(section_text)
    if not m: return []
    return parse_rows_table(m.group(1))


# ────────────────────────────────────────────────────────────────────────
#  S3 다운로드 — §1.3.B block-id suffix 규칙
# ────────────────────────────────────────────────────────────────────────

def _stable_hash8(block_id: str) -> str:
    return hashlib.sha256(block_id.encode()).hexdigest()[:8]

def suffix_filename_for_block(filename: str, block_id: str, existing_paths: set):
    """동일 파일명이 다른 blockId 에서 왔으면 __n<hash8> suffix 부여."""
    if filename not in existing_paths:
        return filename
    base, ext = os.path.splitext(filename)
    return f'{base}__n{_stable_hash8(block_id)}{ext}'

def find_local_file(asset_dir: str, filename: str) -> str:
    """asset_dir 및 하위 폴더 (출력 폴더 제외) 에서 filename 재귀 검색.
    찾으면 절대 경로 반환, 못 찾으면 None. S3 다운로드 실패 시 폴백용."""
    if not filename:
        return None
    target_lower = filename.lower()
    target_base = os.path.splitext(target_lower)[0]
    for root, dirs, files in os.walk(asset_dir):
        dirs[:] = [d for d in dirs if d not in SCAN_EXCLUDE_DIRS and not d.startswith('.')]
        for f in files:
            if f.lower() == target_lower:
                return os.path.join(root, f)
        # 정확 매칭 실패 → 확장자 다른 동일 베이스 시도 (예: img.png → img.jpg)
        for f in files:
            base, ext = os.path.splitext(f)
            if base.lower() == target_base and ext.lower() in IMG_EXT:
                return os.path.join(root, f)
    return None

def file_to_data_url(path: str) -> str:
    """로컬 파일 → data:mime;base64,... 변환."""
    mime = mimetypes.guess_type(path)[0] or 'image/png'
    with open(path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    return f'data:{mime};base64,{b64}'

def download_s3_images(s3_imgs: list, asset_dir: str, report_lines: list) -> list:
    """S3 이미지 리스트를 asset_dir 에 다운로드. §1.3.B suffix 적용."""
    os.makedirs(asset_dir, exist_ok=True)
    existing = set(os.listdir(asset_dir))
    saved = []
    # 이 실행 안에서 이미 다운로드한 (blockId → 실제 저장 파일명) 추적
    block_to_saved = {}

    for item in s3_imgs:
        url, block_id, raw_fn = item['url'], item['blockId'], item['filename']
        if block_id in block_to_saved:
            saved.append({'blockId': block_id, 'filename': block_to_saved[block_id], 'url': url})
            continue
        target = suffix_filename_for_block(raw_fn, block_id, existing)
        target_path = os.path.join(asset_dir, target)
        if os.path.exists(target_path):
            report_lines.append(f'  [skip] 이미 존재: {target}')
            block_to_saved[block_id] = target
            saved.append({'blockId': block_id, 'filename': target, 'url': url})
            continue
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            with open(target_path, 'wb') as f:
                f.write(data)
            existing.add(target)
            block_to_saved[block_id] = target
            saved.append({'blockId': block_id, 'filename': target, 'url': url})
            report_lines.append(f'  [dl]   {target} ({len(data):,} bytes) ← block {block_id[:8]}')
        except Exception as e:
            report_lines.append(f'  [FAIL] {raw_fn} ({block_id}): {e}')
    return saved


# ────────────────────────────────────────────────────────────────────────
#  contentAssets — 폴더 전수 스캔 base64 인코딩
# ────────────────────────────────────────────────────────────────────────

IMG_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}

# 출력/캐시 폴더는 스캔에서 제외 (이전 산출물이 contentAssets 에 들어가는 것 방지)
SCAN_EXCLUDE_DIRS = {'결과물', 'output', 'outputs', 'PROMO_html', 'PROMO_SLICED', '.cache', '__pycache__'}

def build_content_assets(asset_dir: str) -> list:
    """asset_dir 및 하위 폴더 (asset/, content/, logo/ 등) 를 재귀 스캔.
    출력 폴더 (결과물/ 등) 는 제외. 동일 파일명 중복 시 최상위에 가까운 파일 우선."""
    out = []
    seen = {}  # name (lowercase) → 첫번째 발견 path
    for root, dirs, files in os.walk(asset_dir):
        # 출력 폴더는 하위로 진입 안 함
        dirs[:] = [d for d in dirs if d not in SCAN_EXCLUDE_DIRS and not d.startswith('.')]
        for name in sorted(files):
            if name.startswith('.'): continue
            ext = os.path.splitext(name)[1].lower()
            if ext not in IMG_EXT: continue
            key = name.lower()
            if key in seen: continue  # 첫 발견 우선 (상위 폴더 → 하위 폴더 순서)
            seen[key] = os.path.join(root, name)
    for name_lower, p in seen.items():
        name = os.path.basename(p)
        mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        with open(p, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('ascii')
        out.append({'name': name, 'data': f'data:{mime};base64,{b64}'})
    return sorted(out, key=lambda x: x['name'].lower())


# ────────────────────────────────────────────────────────────────────────
#  자가 검증
# ────────────────────────────────────────────────────────────────────────

def validate(data: dict, report_lines: list) -> bool:
    ok = True
    def fail(msg):
        nonlocal ok
        ok = False
        report_lines.append('  ❌ ' + msg)

    # 1. heroText 금지어
    ht = data.get('heroText', '')
    if '버튼:' in ht:
        fail('heroText 에 "버튼:" 포함 — HERO 에는 버튼 필드가 존재하지 않음')
    if ht and not ht.strip().startswith('타이틀:'):
        fail(f'heroText 가 "타이틀:" 로 시작하지 않음: {ht[:40]!r}')

    # 2. banners list
    if 'banners' not in data or not isinstance(data['banners'], list):
        fail('banners 필드 누락 또는 list 아님')

    # 3. contentAssets
    if not data.get('contentAssets'):
        fail('contentAssets 비어있음')

    # 4. 본문 마커 → contentAssets 매칭
    def _norm(s): return unicodedata.normalize('NFC', s)
    names = {_norm(a['name']) for a in data.get('contentAssets', [])}
    name_stems = {_norm(os.path.splitext(n)[0]).lower() for n in names}
    markers_unmatched = []
    for m in re.finditer(r'[\(\[]([^\(\)\[\]]+\.(?:png|jpg|jpeg|gif|webp))[\)\]]', data.get('contentData', '')):
        fn = _norm(m.group(1))
        if fn not in names:
            if _norm(os.path.splitext(fn)[0]).lower() not in name_stems:
                markers_unmatched.append(fn)
    if markers_unmatched:
        report_lines.append(f'  ⚠️ 마커는 있지만 에셋 매칭 실패 (마커명: {markers_unmatched[:5]})')

    # 5. hero asset 이미지 확보 여부
    if data.get('_heroAssetS3_present', False) and not data.get('heroAssets'):
        fail('HERO Asset S3 존재하는데 heroAssets 비어있음')

    # 6. [회귀 방지] 마크다운 테이블 무결성
    #    각 테이블 블록(파이프 행 연속)의 2번째 줄은 반드시 구분선(|---|...|).
    #    이 검증이 FAIL 하면 table_to_pipe 가 깨진 것. 절대 PASS 처리하지 말 것.
    body = data.get('contentData', '')
    lines = body.split('\n')
    SEP_RE = re.compile(r'^\|\s*(?::?-+:?\s*\|)+\s*$')
    table_violations = []
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        if ln.startswith('|') and ln.endswith('|'):
            # 테이블 블록 시작 — 연속된 파이프 행 수집
            start = i
            while i < len(lines) and lines[i].strip().startswith('|'):
                i += 1
            block = [lines[k].strip() for k in range(start, i)]
            if len(block) >= 2:
                # 2번째 행이 구분선인지
                if not SEP_RE.match(block[1]):
                    table_violations.append((start+1, block[0][:60]))
            continue
        i += 1
    if table_violations:
        fail(f'마크다운 테이블 구분선 누락 {len(table_violations)}건 → HTML 렌더 시 빈 헤더 행 삽입됨')
        for ln, preview in table_violations[:5]:
            report_lines.append(f'     line {ln}: {preview}')

    return ok


# ────────────────────────────────────────────────────────────────────────
#  Main
# ────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', required=True, help='notion_raw.md 경로')
    ap.add_argument('--asset-dir', required=True, help='컨텐츠 에셋 폴더')
    ap.add_argument('--out', default='notion_data.json', help='출력 JSON')
    ap.add_argument('--report', default='notion_data_report.txt', help='검증 리포트')
    ap.add_argument('--skip-download', action='store_true')
    args = ap.parse_args()

    report = []
    report.append(f'📋 build_notion_data.py — {time.strftime("%Y-%m-%d %H:%M:%S")}')
    report.append(f'  raw:       {args.raw}')
    report.append(f'  asset-dir: {args.asset_dir}')
    report.append(f'  out:       {args.out}')
    report.append('')

    # 1) raw 로드
    with open(args.raw) as f:
        raw = f.read()

    # 2) 섹션 분리
    sections = split_sections(raw)
    report.append(f'📂 섹션 {len(sections)}개 파싱: {list(sections.keys())}')

    # 3) 기본 정보 (메타)
    meta = {}
    if '기본 정보' in sections:
        m = FIRST_TABLE_RE.search(sections['기본 정보'])
        if m: meta = parse_kv_table(m.group(1))
    report.append(f'  - 기본 정보 {len(meta)}개 필드')

    # 4) HERO
    if 'HERO_SECTION' not in sections:
        raise SystemExit('FAIL: HERO_SECTION 섹션 누락')
    hero = parse_hero_section(sections['HERO_SECTION'], extra_callout_text=sections.get('기본 정보', ''))
    report.append(f'  - HERO: 타이틀={hero["_heroKv"].get("타이틀","")!r} | 비율={hero["heroRatio"]} | Asset S3={"Y" if hero["_heroAssetS3"] else "N"}')

    # 5) CONTENT
    if 'CONTENT_SECTION' not in sections:
        raise SystemExit('FAIL: CONTENT_SECTION 섹션 누락')
    content = parse_content_section(sections['CONTENT_SECTION'])
    report.append(f'  - CONTENT: {len(content["contentData"])}자, S3 이미지 {len(content["_s3Images"])}건')

    # 6) BANNERS
    banners = []
    if 'BANNER_SECTION' in sections:
        banners = parse_banner_section(sections['BANNER_SECTION'])
    multi_banners = []
    if '다규격 배너 데이터' in sections:
        multi_banners = parse_banner_section(sections['다규격 배너 데이터'])
    report.append(f'  - BANNERS: 기본 {len(banners)}건, 다규격 {len(multi_banners)}건')

    # 7) S3 다운로드 (HERO Asset + CONTENT 이미지)
    dl_list = []
    if hero['_heroAssetS3']:
        dl_list.append({
            'url': hero['_heroAssetS3'],
            'blockId': _block_id_of_url(hero['_heroAssetS3']),
            'filename': _filename_of_url(hero['_heroAssetS3']),
        })
    dl_list.extend(content['_s3Images'])

    saved_by_block = {}
    if not args.skip_download:
        report.append(f'📥 S3 다운로드 {len(dl_list)}건 → {args.asset_dir}')
        saved = download_s3_images(dl_list, args.asset_dir, report)
        for s in saved:
            saved_by_block[s['blockId']] = s['filename']

    # 8) contentAssets (폴더 전수 스캔)
    report.append('')
    assets = build_content_assets(args.asset_dir)
    report.append(f'📦 contentAssets {len(assets)}개 ({sum(len(a["data"]) for a in assets)/1024/1024:.2f}MB)')
    for a in assets:
        report.append(f'  - {a["name"]}')

    # 9) heroAssets — HERO Asset S3 파일만 (컨텐츠 폴더에 저장된 실체 찾아서)
    #   ⚠️ 다운로드 결과 (saved_by_block) 가 있으면 그 파일명 우선 사용 — stale img.png 오매칭 방지.
    #   S3 다운로드 실패 시 로컬 폴더 재귀 검색으로 폴백.
    hero_assets = []
    if hero['_heroAssetS3']:
        raw_fn = _filename_of_url(hero['_heroAssetS3'])
        blk = _block_id_of_url(hero['_heroAssetS3'])
        target_path = None
        actual = None
        # (a) 이번 실행에 실제 저장된 HERO 블록 파일 우선
        if blk in saved_by_block:
            c = saved_by_block[blk]
            p = os.path.join(args.asset_dir, c)
            if os.path.isfile(p):
                target_path = p; actual = c
        # (b) suffix 포함 후보 → raw_fn 순으로 탐색
        if not target_path:
            for c in [_suffix(raw_fn, blk), raw_fn]:
                p = os.path.join(args.asset_dir, c)
                if os.path.isfile(p):
                    target_path = p; actual = c; break
        # (c) 로컬 재귀 검색 폴백 (S3 다운로드 실패해도 폴더에 이미지 있으면 사용)
        if not target_path:
            p = find_local_file(args.asset_dir, raw_fn)
            if p:
                target_path = p
                actual = os.path.basename(p)
                report.append(f'  [local] HERO Asset 폴더에서 발견: {os.path.relpath(p, args.asset_dir)}')
        if target_path:
            hero_assets.append({'name': actual, 'data': file_to_data_url(target_path)})
            report.append(f'🖼  HERO Asset: {actual}')

    # 9-b) heroReference — Reference S3 (로컬 폴백)
    hero_reference = None
    if hero.get('_heroRefS3'):
        raw_fn = _filename_of_url(hero['_heroRefS3'])
        p = find_local_file(args.asset_dir, raw_fn)
        if p:
            hero_reference = file_to_data_url(p)
            report.append(f'🖼  HERO Reference: {os.path.basename(p)} ({os.path.relpath(p, args.asset_dir)})')

    # 9-c) heroLogo — Logo URL → 로컬 폴더에서 동일 파일명 찾기 (있으면 base64, 없으면 URL 그대로)
    hero_logo_data_url = None
    if hero.get('_heroLogoUrl'):
        raw_fn = _filename_of_url(hero['_heroLogoUrl'])
        p = find_local_file(args.asset_dir, raw_fn)
        if p:
            hero_logo_data_url = file_to_data_url(p)
            report.append(f'🖼  HERO Logo: {os.path.basename(p)} ({os.path.relpath(p, args.asset_dir)})')

    # 10) notion_data.json 조립
    data = {
        'heroText':     hero['heroText'],
        'heroStyle':    hero['heroStyle'],
        'heroRatio':    hero['heroRatio'],
        'heroAssets':   hero_assets,
        'heroReference': hero_reference,
        'heroLogo':     hero_logo_data_url or hero['_heroLogoUrl'],
        'logoPosition': hero['logoPosition'],
        'logoSize':     14,
        'contentData':  content['contentData'],
        'contentStyle': content['contentStyle'],
        'contentAssets': assets,
        'banners':      banners,          # ★ HERO 와 완전 분리된 배너 데이터
        'multiBanners': multi_banners,    # ★ 다규격/다국어
        'basicInfo':    meta,              # ★ 기본 정보 전수 보관
        'syncedAt':     int(time.time() * 1000),
        '_heroAssetS3_present': bool(hero['_heroAssetS3']),
    }

    # 11) 자가 검증
    report.append('')
    report.append('🔍 자가 검증')
    ok = validate(data, report)
    report.append(f'총괄: {"✅ PASS" if ok else "❌ FAIL"}')

    # 12) 내부 디버그 필드 제거 후 저장
    for k in list(data.keys()):
        if k.startswith('_'): del data[k]

    with open(args.out, 'w') as f:
        json.dump(data, f, ensure_ascii=False)
    with open(args.report, 'w') as f:
        f.write('\n'.join(report))

    print('\n'.join(report))
    print()
    print(f'✅ {args.out} 저장 완료 ({os.path.getsize(args.out)/1024/1024:.2f}MB)')
    print(f'✅ {args.report} 리포트 저장 완료')

    if not ok:
        sys.exit(1)


def _block_id_of_url(url: str):
    parts = url.split('/')
    last = None
    for p in parts:
        if re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', p):
            last = p
    return last

def _filename_of_url(url: str):
    parts = url.split('/')
    blk = _block_id_of_url(url)
    if blk and blk in parts:
        idx = parts.index(blk)
        if idx + 1 < len(parts):
            return parts[idx + 1].split('?')[0]
    return url.rsplit('/', 1)[-1].split('?')[0]

def _suffix(filename: str, block_id: str) -> str:
    base, ext = os.path.splitext(filename)
    return f'{base}__n{_stable_hash8(block_id)}{ext}'


if __name__ == '__main__':
    main()
