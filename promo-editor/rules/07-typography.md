---
id: 07-typography
title: 타이포그래피 (폰트 크기·두께·승격 금지)
purpose: 폰트 토큰 + 대제목 자동 승격 방지
---

# [타이포그래피]
- 섹션 제목: font-size:clamp(1.25rem,2.5vw,1.375rem); font-weight:900; color:${accentColor}
- 소제목: font-size:0.8125rem; font-weight:700; text-transform:uppercase; color:${subColor}
- 본문: font-size:clamp(0.875rem,1.702vw,1rem); font-weight:400; line-height:1.8; color:${textColor}
- 모든 <p> 태그: margin:0; line-height:1.8;
- 수치/날짜 강조: font-size:clamp(1.5rem,3vw,2rem); font-weight:900; color:${accentColor}
- ❌ **카드 상단 accent 바 절대 금지** — border-top, 별도 div 등 모든 형태 금지. 일부 섹션만 적용되면 즉시 일관성 깨짐 → FAIL.
- ⚠️ **대제목 자동 승격 금지** — 원고 첫 문장이 "~안내드립니다", "~기념하여...", "~소식을 전해드립니다" 같은 서술형 안내문이면 본문 처리. 명시적 제목 마커(■ ▶ 번호 배지, 단독 라인 짧은 명사구)가 없으면 절대 1.5rem+ 크기로 키우지 말 것. 위반 시 FAIL.
