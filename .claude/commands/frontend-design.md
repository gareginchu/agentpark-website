You are now in frontend design mode. Before writing any code, follow this checklist:

## 1. Check Brand Assets
- Look in `brand_assets/` for logos, color palettes, style guides, or images.
- If assets exist, use them — no placeholders where real assets are available.

## 2. Set Up Local Server
- Start `node serve.mjs` in the background (port 3000) if not already running.
- Never use `file:///` URLs.

## 3. Design System Setup
Apply these rules to every page you build:

**Typography:**
- Pair a display/serif font for headings with a clean sans-serif for body.
- Tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.

**Colors:**
- Never use default Tailwind palette (indigo-500, blue-600, etc.).
- Derive all colors from a custom brand color or `brand_assets/` palette.

**Shadows:**
- Use layered, color-tinted shadows with low opacity — never flat `shadow-md`.

**Gradients & Texture:**
- Layer multiple radial gradients. Add grain/texture via SVG noise filter.

**Animations:**
- Only animate `transform` and `opacity`. Never use `transition-all`.
- Use spring-style easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`).

**Interactive States:**
- Every clickable element must have `hover`, `focus-visible`, and `active` states.

**Images:**
- Add gradient overlay (`bg-gradient-to-t from-black/60`) and color treatment (`mix-blend-multiply`).

**Spacing & Depth:**
- Use consistent spacing tokens — not random Tailwind steps.
- Surfaces use a layering system: base, elevated, floating.

## 4. Output Format
- Single `index.html` with inline styles unless told otherwise.
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`
- Mobile-first responsive.

## 5. Screenshot & Compare
- Screenshot via: `node screenshot.mjs http://localhost:3000`
- Read the screenshot from `temporary screenshots/` and compare against reference.
- Do at least 2 comparison rounds. Be specific about mismatches (px values, hex colors, spacing).
- Stop only when no visible differences remain.

## 6. Hard Rules
- Do not add sections, features, or content not in the reference.
- Do not "improve" a reference design — match it exactly.
- Do not stop after one screenshot pass.
- Do not use default Tailwind blue/indigo as primary color.

Acknowledge that frontend design mode is active, then proceed with the user's request.
