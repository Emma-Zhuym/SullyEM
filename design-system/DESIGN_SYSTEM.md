# Emma Soft Clay UI — Design System Rules (v0.1)

> **For any agent (Claude Code, etc.) building UI in this system.**
> These rules are **binding**. Use `tokens.json` / `tokens.css` as the *only* source of
> color, radius, shadow, spacing, type, and motion values. **Never invent new hex values,
> radii, or shadows.** If a value you need isn't in the tokens, ask — don't improvise.

---

## 0. The feel (read first)

```
底子像 Claude：暖、松、安静
组件像 Clay：有厚度、能按、能陷进去
颜色像糖纸：亮，但只露一点点
```

warm-soft-clay =空气感 + 实体感 + 少量高饱和记忆点 + **凹凸并存**.
The foundation is a **cooler neutral (V2)** — off-white, low-saturation, never yellow.

---

## 1. Color usage ratio (HARD RULE)

```
Warm-neutral foundation   ~75%   (app bg, surfaces, borders, text)
Module / product Tint     ~18%   (large soft fills, card backgrounds)
Bright Main color          ~7%   (icons, rails, progress, selected, button core)
```

- **Large areas are never high-saturation.** High saturation only on: icons, thin rails,
  progress fills, selected states, primary-button cores.
- **Per screen, at most:** `1 primary hue` + `1 secondary hue` + `1 status color`.
  Never put red+blue+green+purple+amber on one screen — that turns clay into kids' stickers.

## 2. Foundation tokens

| Token | Value | Use |
|---|---|---|
| appBackground | `#F7F6F2` | page base |
| surface | `#FFFEFC` | default card / sheet |
| surfaceWarm | `#FAF6EF` | subtle warm fill |
| surfaceSunken | `#ECE8E1` | inputs, segmented base, sunken wells |
| surfaceRaised | `#FFFFFF` | selected/raised element on sunken base |
| textPrimary | `#2E2A28` | headings, numbers (**never pure black**) |
| textSecondary | `#6E665F` | body |
| textTertiary | `#9E9891` | captions, placeholders |
| borderSoft | `#E8E1D8` | default 1px border |
| borderStrong | `#D8CFC4` | emphasized border |
| divider | `#EEE8E0` | hairlines |
| globalAccent | `#C7834B` | brand accent, focus ring |

## 3. Hue system — pick, don't hardcode business names

Every hue = **Tint / Soft / Main / Ink**. Choose roles by purpose:

```
Tint   大面积浅底、卡片背景
Soft   轻强调、选中底、标签底
Main   图标、按钮、进度、边条
Ink    深色文字、强调数字
```

Give each product a `Product Color` (one Main from the palette) + its Tint/Soft/Ink.
Borrow **sparingly** from other hues for sub-categories. The system does **not** know
business meaning — `red…gray` first, business mapping second.

Rule of thumb: bleed on foundation → use **Tint**. Memorable → **Main**.
Carry text → **Ink**. Just emotion → **Soft**.

## 4. Status colors (fixed, kept separate from product hues)

`success #35A853` · `warning #D99612` · `danger #D94B72` · `info #4A88FF`
Each has tint/main/ink. Do **not** mix status colors into the product palette.

## 5. Radius

```
button 14 · input 14 · smallCard 16 · bigCard 20–24 · bottomSheet 28 · iconButton 999
```
**Do not** default to 32 / 40 — it reads as a toy.

## 6. Elevation — 凹凸并存 (the signature move)

Four levels only: `raisedSoft`, `raisedMedium`, `floating`, `sunken`.

- **Raised (凸起):** primary buttons, cards, FAB, module entries, bottom sheet, icon buttons.
- **Sunken (凹陷):** segmented base, search box, inputs, calendar selected slot,
  progress track, stat containers, draggable areas.
- Pair them: a sunken well holding a raised selected chip is the core texture.
- One `Hero` card (raisedMedium) per screen, max.

## 7. Component recipes

**Info card** — surface, radius 20, padding 18, 1px borderSoft, raisedSoft.
**Module record card** — Module *Tint* bg, radius 20, padding 16, 5px left rail (Module Main),
44×44 icon box (radius 12, Module Main), raisedSoft. *Don't flood the whole card with saturation.*
**Hero card** — surface, radius 24, padding 24, raisedMedium; one per screen.
**Primary button** — h48, radius 14, bg textPrimary *or* accent, text surface, raisedSoft;
pressed = `translateY(1px)` + shadow halved.
**Secondary button** — h44, radius 14, surface, 1px borderSoft.
**Segmented / sunken toggle** — sunken container radius 18; selected = surfaceRaised + raisedSoft.
**Input** — h52, radius 14, bg surfaceSunken, sunken shadow, transparent border;
focus = 1px accent + slight raise. **No glow on focus.**
**Progress track** — sunken well; fill = Main color.
**Ring progress** — sunken groove track (same as linear). Fill = Hue Main, round cap,
starts at 12 o'clock. Overfill (>100%): continue on the **same ring path** from the top —
**no offset, no thickening, no inner/outer rings**. Overfill arc start = exactly Main
(zero seam), then deepen **linearly along the arc from 100% onward**, ending at Hue **Ink**
with a round cap — the dark cap marks how far past 100%. SVG note: gradient coordinates
rotate with the element's `transform`; pre-rotate the gradient vector to compensate.

## 8. Typography

Font `Noto Sans SC` (中文界面别太细). Scale (size/line/weight):
`display 30/38/600 · title 24/32/600 · section 18/26/600 · body 15/23/400 ·
bodyStrong 15/23/600 · caption 13/18/400 · tiny 12/16/400`.
Text color is warm/near-black, **never `#000`**.

## 9. Spacing

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64`. Use flex/grid + `gap`, not ad-hoc margins.
Page margin mobile 20 / desktop 24–32 · card gap 12–16 · section gap 24–32.

## 10. Icons

Stroke 2px, round cap+join. Sizes 18 / 22 / 26; icon button 40–44.
Module icons may use Module Main; **label text stays warm-near-black**, not gray.

## 11. Motion

Durations: `tap 100 · hover 140 · cardMove 180 · sheet 240 · page 280`.
Curve `cubic-bezier(.2,.8,.2,1)`. Press: raised → press down 1px + shorter shadow;
sunken → inner shadow deepens; cards → `scale(.99)` max (no big scaling).

---

## Enforcement checklist (agent must self-verify before shipping)

- [ ] Every color/radius/shadow/spacing value comes from tokens — zero raw hex/px invented.
- [ ] Screen uses ≤ 1 primary + 1 secondary hue + 1 status color.
- [ ] Large fills use Tint, not Main; high saturation only on small accents (~7%).
- [ ] Both raised **and** sunken surfaces present (not all-raised).
- [ ] No pure black text; no focus glow; no 32/40 default radius.
- [ ] Inputs/segments/progress are sunken; buttons/cards/sheets are raised.
