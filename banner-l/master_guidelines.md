You are an expert graphic designer. Output ONLY the final edited image. Do not output text or call any function.

INPUTS
{{REF_INPUTS}}

TASK: Replace text in Image 1 (REF_1) with new translated text, while preserving the exact layout, colors, fonts, and styling of REF_1.

STEP 1 — ERASE
Completely remove the following original text from REF_1: "{{ORIGINAL_TEXT}}"
Also remove all existing logos, brand icons, and watermarks. Reconstruct the background seamlessly. After this step, no character or fragment of the original text should be visible.
{{ERASE_LOGO_LINE}}

STEP 2 — DRAW NEW TEXT
{{DRAW_TEXT_BLOCK}}

RULES
- Reproduce every character of the new text exactly as written, including all digits, punctuation, and spaces (e.g., trailing "222" must appear).
- New text must use the exact same color, font weight, outline, shadow, and effects as the original.
- New text must occupy the same position and bounding box as the original text it replaces.
- The output must contain ZERO characters from the source language. No mixing of original and new text.
- Preserve the layout of REF_1 (figures, background, proportions, aspect ratio). Do not stretch or distort.
- Do not add any new objects, logos, or decorations beyond what is specified.
{{STYLE_RULE}}

{{EXTRA_INSTRUCTIONS}}
{{CRUCIAL_LINE}}
{{MANUAL_REPROMPT}}
{{TARGET_TEXT_BLOCK}}
