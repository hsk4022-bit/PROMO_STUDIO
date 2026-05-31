# banner-studio Notion 연동 파싱 규칙

Claude Code가 Notion 기획서를 파싱해서 banner-studio가 자동으로 읽을 수 있는 JSON 파일로 변환할 때 따라야 할 규칙.

## 출력 파일

```
<프로젝트루트>/banner-studio/notion_data.json
```

이 경로에 JSON 쓰면 banner-studio가 페이지 로드 시 자동으로 fetch해서 state에 주입함.

파일 **없어도** banner-studio는 기존 수동 워크플로 그대로 동작 (무해).

---

## JSON 스키마

```json
{
  "style":        "디자인 스타일 프롬프트 (SCENE GUIDE에 주입됨)",
  "heroImage":    "data:image/png;base64,...   (MASTER REFERENCE에 주입됨)",
  "logoPosition": "TR",
  "savePath":     "/Users/.../결과물/bn  (참고용, 현재는 banner-studio가 직접 사용 안 함)",
  "banners": [
    {
      "filename":    "rolling_<버전>",
      "file_suffix": "_{16자리해시코드}",
      "w":           735,
      "h":           675,
      "title":       "<배너 메인 카피>",
      "sub_text":    "<배너 서브 카피>",
      "sub_sub_text": "",
      "btn_text":    "<버튼 텍스트>",
      "logo":        "data:image/png;base64,...",
      "format":      "jpg",
      "targetBytes": 102400
    }
  ]
}
```

**모든 필드 optional.** 없으면 banner-studio는 해당 항목을 무시하거나 기본값을 사용.

---

## Notion 페이지 섹션 매핑

### `# [기본 정보]` 테이블 → 루트 필드

| Notion 항목 | JSON 필드 | 추가 처리 |
|---|---|---|
| `디자인 스타일` | `style` | 텍스트 그대로 |
| `로고 위치` | `logoPosition` | 대문자 유지 가능 (`TL`/`TR`/`BL`/`BR`) |
| `로컬 저장 경로` | (내부용) | 이 경로에서 `hero.png` 찾기 위해 사용 |
| `배너 저장 경로` | `savePath` | 참고용 기록 |

#### hero.png 자동 임베드

`로컬 저장 경로` 값이 있으면 그 디렉토리 안의 **최신 해시 폴더**(또는 표시된 hash 폴더)에서 `hero.png`를 찾아 base64로 인코딩해 `heroImage` 필드에 넣는다. 파일 없으면 필드 생략.

예: `로컬 저장 경로` = `/Users/.../결과물` → `/Users/.../결과물/<16자리해시>/hero.png` 탐색.

### `# [HERO_SECTION]` → **무시**

banner-studio는 이 섹션의 타이틀/서브/배지/이미지 사이즈를 사용하지 않음.
(promo-editor용 섹션이라 이 도구에선 불필요. 있어도 안 읽음.)

### `# [CONTENT_SECTION]` → **무시**

promo-editor용.

### `# [BANNER_SECTION]` 테이블 → `banners` 배열 (필수)

헤더 컬럼 → JSON 필드 매핑:

| Notion 컬럼 | JSON 필드 | 변환 |
|---|---|---|
| `유형` | — | 현재는 무시 |
| `file_name` | `filename` | 그대로 |
| `file_suffix` | `file_suffix` | 그대로 (**`{16자리해시코드}` 등 플레이스홀더는 그대로 두기** — banner-studio가 다운로드 시 랜덤 해시로 치환) |
| `title` | `title` | 그대로 |
| `sub_text` | `sub_text` | 그대로 |
| `sub_sub_text` | `sub_sub_text` | 그대로 |
| `btn_text` | `btn_text` | 그대로 |
| `logo_url` | `logo` | **URL이면 fetch → base64 변환. 빈 값이면 필드 생략** |
| `size` | `w`, `h` | `735x675` → `w: 735, h: 675` (`x` 또는 `×` 구분자) |
| `파일 용량` | `targetBytes` | `100kb` → `102400` (parseFileSize 규칙) |
| `파일 형식` | `format` | `jpg` / `png` / `webp` / `jpeg` (`jpeg`는 `jpg`로 정규화) |
| `extra` | — | 현재는 무시 |

---

## 변환 규칙 세부사항

### 사이즈 파싱
- `735x675`, `735X675`, `735×675`, `735 x 675` 등 다양한 표기 허용
- 정규식: `/^(\d+)\s*[xX×]\s*(\d+)$/`
- 매칭 실패 시 해당 행은 banners에서 제외

### 파일 용량 파싱
- `100kb`, `100KB`, `100`, `0.5mb`, `1MB`, `500b` 지원
- 결과는 바이트 단위 정수
- 빈 값 또는 파싱 실패 → `0` (용량 제한 없음)

### 파일 형식 정규화
- 대소문자 무관, 앞의 `.` 허용
- `jpeg` → `jpg`로 매핑
- `jpg`/`png`/`webp` 외 값 → `jpg`로 폴백

### logo_url 처리
- `http(s)://` 로 시작 → HTTP GET, 응답을 base64로 인코딩해 `data:<mime>;base64,...` 형태로 저장
- 빈 값 또는 실패 → `logo` 필드 생략 (banner-studio는 로고 합성 스킵)

### file_suffix 플레이스홀더
- `{16자리해시코드}`, `{hash}`, `{code}` 등 중괄호로 둘러싸인 해시/코드 키워드 포함 시 → **그대로 JSON에 저장**
- banner-studio가 다운로드 직전에 런타임 랜덤 해시로 치환 (매 다운로드마다 다른 해시)
- 구체적 문자열(`_maple` 등)은 그대로 유지

---

## banner-studio 측 동작 요약 (코드가 뭘 하는지)

페이지 로드 시 `useEffect`가 `fetch('./notion_data.json?<timestamp>')` 실행.

성공 시:
1. `style` → `backgroundPrompt` state (사용자가 비워뒀을 때만)
2. `heroImage` → `referenceImage` state (업로드한 마스터 없을 때만)
3. `logoPosition` → `logoPosition` state (기본값 `tl`일 때만)
4. `banners` 각 행 → `customPresets`에 `notion_<filename>_<w>_<h>_<i>` ID로 등록
5. 각 행의 텍스트/로고/포맷/용량 → `notionMeta[pid]` 맵에 저장
6. 세션 내 한 번만 `selectedPresetIds`에 추가 (사용자가 숨겨도 새로고침 시 다시 켜지지 않음)

생성(Generate) 시:
- Notion 카드면 `notionMeta[pid]`의 title/sub_text/btn_text를 typography 전역 대신 사용
- 로고도 `notionMeta[pid].logo` 우선
- 최종 인코딩 시 `format`, `targetBytes` 사용 (JPG/WEBP는 이진탐색으로 용량 맞춤, PNG는 targetBytes 무시)

다운로드/ZIP 시:
- Notion 카드면 파일명 = `<filename><resolveFileSuffix(file_suffix)>.<format>`
- 일반 카드면 파일명 = `banner_<w>x<h>.jpg`

리셋:
- `RESET` 버튼 누르면 `notionMeta` 초기화 + `sessionStorage.bannerstudio_notion_injected` 제거
- 다시 로드하면 `notion_data.json` 재적용됨

---

## 케이스별 작동 예시

### 케이스 A: 풀페이지 (HERO + CONTENT + BANNER 전부 있음)
1. Claude Code가 `[기본 정보]`, `[BANNER_SECTION]` 파싱, `hero.png` 임베드
2. JSON에 `style`, `heroImage`, `logoPosition`, `banners` 모두 포함
3. banner-studio 로드 시 3개 모두 반영 + Notion 카드 N개 생성

### 케이스 B: 게시물 + 배너 (HERO + BANNER만)
1. 동일 로직
2. CONTENT 섹션 없어도 무관 (banner-studio는 안 봄)

### 케이스 C: 배너만 (BANNER_SECTION만)
1. `[기본 정보]`에 `디자인 스타일`, `로고 위치`, `로컬 저장 경로` 있으면 추출 (선택)
2. `hero.png` 파일 없으면 `heroImage` 생략
3. JSON에 `banners`만 확실히 채워짐
4. banner-studio 로드 시 Notion 카드만 생성, hero/style은 사용자가 수동 입력

---

## 주의 사항

- **JSON 파일은 git에 커밋 금지** (base64 이미지로 크기 커지고, 임시 데이터임)
- `notion_data.json` 갱신 후 브라우저 **새로고침 필요** (mount 시 한 번만 읽음)
- `sessionStorage.bannerstudio_notion_injected`는 세션당 1회 injection 방지용 → 새로고침 후 다시 주입 원하면 `sessionStorage.clear()` 또는 RESET 버튼
- base64 이미지는 JSON 크기를 키움. 큰 hero.png(>5MB)는 브라우저 fetch 시 느릴 수 있음.
