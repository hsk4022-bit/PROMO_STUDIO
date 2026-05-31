#!/usr/bin/env python3
"""Hero image generation script - mirrors app.js generateHeroImage logic"""

import json, base64, urllib.request, urllib.error, os, sys, re

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    sys.exit("ERROR: GEMINI_API_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.")

IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "gemini-3.1-flash-image-preview")
CONTENT_MODEL = os.environ.get("CONTENT_MODEL", "gemini-3-flash-preview")
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# 작업 파일 경로: 환경변수 우선, 없으면 스크립트 위치 기준 상대경로
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
NOTION_DATA = os.environ.get("NOTION_DATA", os.path.join(_SCRIPT_DIR, "notion_data.json"))
OUT_DIR = os.environ.get("OUT_DIR", _SCRIPT_DIR)

def api_fetch(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{url}?key={API_KEY}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

def get_mime(b64str):
    if "image/png" in b64str: return "image/png"
    if "image/jpeg" in b64str or "image/jpg" in b64str: return "image/jpeg"
    if "image/webp" in b64str: return "image/webp"
    return "image/png"

def main():
    with open(NOTION_DATA, "r", encoding="utf-8") as f:
        d = json.load(f)

    hero_text      = d.get("heroText", "")
    hero_style     = d.get("heroStyle", "")
    hero_ratio     = d.get("heroRatio", "1:1")
    assets         = d.get("heroAssets", [])
    ref_assets     = d.get("heroReferenceAssets", [])  # 스타일 참고용 — 복사 금지

    # 타이틀/서브타이틀 파싱
    title_match = re.search(r"타이틀\s*[:：]\s*(.+)", hero_text)
    sub_match   = re.search(r"서브타이틀\s*[:：]\s*(.+)", hero_text)
    final_title = title_match.group(1).strip() if title_match else hero_text.strip()
    final_sub   = sub_match.group(1).strip() if sub_match else ""

    has_assets     = len(assets) > 0
    has_ref_assets = len(ref_assets) > 0
    print(f"[HERO] 타이틀: {final_title}")
    print(f"[HERO] 서브타이틀: {final_sub}")
    print(f"[HERO] 비율: {hero_ratio} / 캐릭터 에셋: {len(assets)}개 / 레퍼런스: {len(ref_assets)}개")

    # ── PASS 1: 프롬프트 엔지니어링 ──
    if has_assets:
        # 캐릭터 에셋: 100% 재현
        print("[PASS 1] 캐릭터 에셋 있음 → 직접 프롬프트 구성")
        ref_note = (
            "\n[STYLE REFERENCE PROVIDED]: The additional image(s) are for STYLE AND MOOD INSPIRATION ONLY."
            " Extract ONLY: color palette, lighting mood, overall aesthetic tone."
            " Do NOT copy the composition, characters, or specific elements from the reference."
        ) if has_ref_assets else ""
        final_prompt = "\n".join(filter(None, [
            "[TASK]: Create a single high-quality game promotional banner image.",
            "[CHARACTER ASSET PROVIDED]: Reproduce the uploaded character(s) with 100% fidelity.",
            "Copy every detail with zero artistic reinterpretation:",
            "  - Face structure, eye color, pupil shape, skin tone — exact copy.",
            "  - Hair color, style, strands — exact copy.",
            "  - Clothing design, colors, accessories — exact copy.",
            "  - Body proportions — do NOT alter.",
            "  - Art style of the original — preserve exactly.",
            "DO NOT 'improve', 'enhance', or 'reinterpret' ANY feature of uploaded character assets.",
            ref_note,
            "[BACKGROUND]:",
            "If the uploaded asset has a transparent/plain background, create a backdrop FULLY CONSISTENT with the asset's art style, color palette — the background and character must feel like they belong to the same world.",
            f"Style directive: {hero_style}" if hero_style else "",
            "[TEXT OVERLAY — VERBATIM]:",
            f'Render the exact title text: "{final_title}"' + (f' and subtitle: "{final_sub}"' if final_sub else "") + ".",
            "Typography must match the style/mood of the uploaded asset. Do not invent other text.",
            "[PROHIBITIONS]: No brand logos. No watermarks. No invented characters.",
            f"[IMAGE ASPECT RATIO: {hero_ratio} — compose the image strictly for this ratio]",
        ]))
        gen_temperature = 1.0
    elif has_ref_assets and not has_assets:
        # 레퍼런스만 있는 경우: 스타일만 참고, 복사 금지
        print("[PASS 1] 레퍼런스 이미지만 있음 → 스타일 참고 프롬프트 구성")
        final_prompt = "\n".join(filter(None, [
            "[TASK]: Create a single high-quality game promotional banner image.",
            "[STYLE REFERENCE PROVIDED]: The uploaded image is for STYLE AND MOOD INSPIRATION ONLY.",
            "Extract ONLY the following from the reference — do NOT copy or reproduce it:",
            "  - Overall color palette and tone",
            "  - Lighting atmosphere and mood",
            "  - Visual style and aesthetic direction",
            "  - Compositional energy (dynamic, calm, epic, etc.)",
            "DO NOT reproduce: composition layout, specific characters, text, logos, or any identifiable elements from the reference.",
            "Create an ORIGINAL image inspired by the extracted style.",
            f"Style directive: {hero_style}" if hero_style else "",
            "[TEXT OVERLAY — VERBATIM]:",
            f'Render the exact title text: "{final_title}"' + (f' and subtitle: "{final_sub}"' if final_sub else "") + ".",
            "[PROHIBITIONS]: No brand logos. No watermarks.",
            f"[IMAGE ASPECT RATIO: {hero_ratio} — compose the image strictly for this ratio]",
        ]))
        gen_temperature = 1.0
    else:
        print("[PASS 1] 에셋 없음 → CONTENT_MODEL로 프롬프트 강화")
        enhance_sys = f"""You are a game promotional banner art director.
Transform user inputs into ONE precise Gemini image generation prompt (English only, no preamble).
Rules:
- STRICTLY follow the user's style directive. It is the #1 priority.
- Add lighting/atmosphere descriptors that COMPLEMENT (not replace) the style directive.
- No characters, humans, or avatars (no assets provided).
- Banner must prominently display title text: "{final_title}"{f' and subtitle: "{final_sub}"' if final_sub else ""}.
- No logos, no watermarks."""

        enhance_user = f"""Title: {final_title}
Subtitle: {final_sub or '(none)'}
Style directive: {hero_style or 'premium game promotional banner, cinematic, high-contrast'}
Reference image provided: NO"""

        try:
            res = api_fetch(
                f"{BASE_URL}/{CONTENT_MODEL}:generateContent",
                {
                    "contents": [{"parts": [{"text": enhance_user}]}],
                    "systemInstruction": {"parts": [{"text": enhance_sys}]},
                    "generationConfig": {"temperature": 0.8, "maxOutputTokens": 600}
                }
            )
            enriched = res["candidates"][0]["content"]["parts"][0]["text"].strip()
            print(f"[PASS 1] 강화 프롬프트: {enriched[:100]}...")
        except Exception as e:
            print(f"[PASS 1] 실패 ({e}), 폴백 프롬프트 사용")
            enriched = ""

        sub_constraint = f'Subtitle verbatim: "{final_sub}".' if final_sub else ''
        sub_text = f'Subtitle text verbatim: "{final_sub}".' if final_sub else ''
        if len(enriched) > 40:
            final_prompt = f'{enriched}\n[HARD CONSTRAINTS] No logos. No watermarks. No characters. Title verbatim: "{final_title}". {sub_constraint}\n[IMAGE ASPECT RATIO: {hero_ratio}]'
        else:
            final_prompt = f'Style: {hero_style or "premium cinematic game promotional banner"}. Background only — no characters. Title text verbatim: "{final_title}". {sub_text} High-contrast, vivid color palette. No logos. No watermarks. [IMAGE ASPECT RATIO: {hero_ratio}]'
        gen_temperature = 1.0

    # ── PASS 2: 이미지 생성 ──
    print("[PASS 2] 이미지 생성 중...")
    parts = []
    parts.append({"text": final_prompt})
    # 캐릭터 에셋 (복사 대상)
    for asset in assets:
        mime = get_mime(asset["data"])
        b64data = asset["data"].split(",")[1]
        parts.append({"inlineData": {"mimeType": mime, "data": b64data}})
    # 레퍼런스 이미지 (스타일 참고용 — 프롬프트에서 이미 "복사 금지" 명시됨)
    for ref in ref_assets:
        mime = get_mime(ref["data"])
        b64data = ref["data"].split(",")[1]
        parts.append({"inlineData": {"mimeType": mime, "data": b64data}})

    res = api_fetch(
        f"{BASE_URL}/{IMAGE_MODEL}:generateContent",
        {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseModalities": ["IMAGE", "TEXT"],
                "temperature": gen_temperature,
            }
        }
    )

    b64 = None
    for cand in res.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            if "inlineData" in part:
                b64 = part["inlineData"]["data"]
                break
        if b64:
            break

    if not b64:
        print("[ERROR] 이미지 데이터를 받지 못했습니다.")
        print(json.dumps(res, ensure_ascii=False, indent=2)[:500])
        sys.exit(1)

    out_path = os.path.join(OUT_DIR, "hero_generated.png")
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(b64))
    print(f"[OK] 히어로 이미지 저장: {out_path}")
    return out_path

if __name__ == "__main__":
    main()
