# Cove visual design system handoff

This is the design handoff for any first-party Cove screen, including Leave and My Details. It documents the visual language already established by Cove home and the People page. It does not define either product's features or business logic.

The copy-ready stylesheet is [cove-design-system.css](cove-design-system.css). The [visual specimen page](cove-design-system-preview.html) shows the system assembled in a browser.

## 1. The visual idea

Cove is a bright, coastal employee workspace. It should feel personal and optimistic without becoming childish, and operational without looking like generic HR software.

The visual signature is:

- deep navy information hierarchy;
- teal navigation and action emphasis;
- white working surfaces over a nearly-white aqua atmosphere;
- pale aqua gradients in page headers and icon tiles;
- extremely quiet borders and shadows;
- compact Avenir typography;
- small uppercase metadata labels with generous tracking;
- circular/orbital decorative linework used at low opacity; and
- restrained movement: a slight rise on interactive cards, never constant animation.

The most important rule is restraint. Navy carries content. Teal identifies actions. Pale aqua creates atmosphere. Brass appears only as a tiny warm accent. Red is for real danger or failure.

## 2. What the developer receives

Use these existing files as the source of truth:

- `src/components/app-shell.tsx` — shell structure and navigation
- `src/app/people/page.tsx` — canonical workspace-page composition
- `src/components/people/people-directory.tsx` — canonical card density and metadata hierarchy
- `src/app/globals.css` — live source styling
- `public/images/cove-logo.png` — Cove logo asset
- `docs/cove-design-system.css` — portable, cleaned and tokenised stylesheet
- `docs/cove-design-system-preview.html` — standalone visual component specimen

If the new screens live in this repository, reuse `AppShell`, `workspace-page-header`, `portal-data-panel`, `portal-data-heading`, `section-kicker` and the existing responsive rules. Do not import the portable stylesheet on top of `globals.css`, because it intentionally reproduces those primitives.

If the screens live in another repository, copy the logo asset and import `cove-design-system.css` once at the application root.

## 3. Canonical tokens

### Colour

| Token | Value | Role |
|---|---:|---|
| `--cove-navy-900` | `#071b49` | Page and panel headings |
| `--cove-navy-800` | `#0a204d` | Card headings and controls |
| `--cove-navy-700` | `#17305a` | Strong secondary values |
| `--cove-slate-700` | `#53617b` | Supporting body copy |
| `--cove-slate-500` | `#7b8799` | Hints and metadata |
| `--cove-slate-400` | `#8b95a4` | Fine labels |
| `--cove-teal-600` | `#008a84` | Primary action and active navigation |
| `--cove-teal-700` | `#087b75` | High-contrast teal text |
| `--cove-teal-100` | `#e9f6f4` | Icon tiles and selected states |
| `--cove-aqua-050` | `#f4fbfa` | Header gradient start |
| `--cove-aqua-100` | `#e6f7f5` | Header gradient end |
| `--cove-brass-600` | `#96733b` | Rare source/warm metadata |
| `--cove-white` | `#ffffff` | Cards and working surfaces |
| `--cove-page` | `#fbfdff` | Page background |
| `--cove-line` | `#e2e8ea` | Major border |
| `--cove-line-soft` | `#edf1f2` | Internal divider |
| `--cove-danger` | `#e93f49` | Destructive and critical only |
| `--cove-warning` | `#9a6628` | Warning or pending |
| `--cove-success` | `#087a72` | Success or approved |

Do not introduce another primary colour. Product categories may have a small secondary accent, but the page shell, controls and actions remain navy/teal.

### Type

```css
font-family: "Avenir Next", Avenir, "Century Gothic", sans-serif;
```

Do not introduce Inter, Roboto, Arial, Space Grotesk or a new display face. The current employee-facing Cove pages use the sans family for titles as well as body text.

| Element | Size | Weight | Tracking |
|---|---:|---:|---:|
| Page title | `clamp(30px, 3vw, 40px)` | 600 | `-0.04em` |
| Panel title | `19px` | 600 | `-0.02em` |
| Card title | `13–16px` | 600 | normal |
| Body | `12–14px` | 400–500 | normal |
| Input value | `13px`; `16px` mobile | 400–500 | normal |
| Kicker | `8px` | 600 | `0.15em` |
| Fine metadata | `7–9px` | 600–700 | `0.08–0.1em` |

Tiny metadata is allowed only for supplementary information. Field labels, errors and instructions must remain at least 11px.

### Geometry

| Element | Radius |
|---|---:|
| Small control | `8px` |
| Input/button | `9px` |
| Card | `11px` |
| Utility card | `13px` |
| Panel | `15px` |
| Workspace header | `16px` |
| Avatar | circle |

Avoid blanket pill shapes. Pills are only for statuses, compact filters and tags.

### Spacing

The base rhythm is 4px. Use the provided tokens: 4, 8, 12, 16, 20, 24, 28 and 36px.

Important canonical measurements:

- desktop page frame: `min(1480px, calc(100% - 48px))`;
- mobile page frame: `min(1480px, calc(100% - 24px))`;
- desktop top navigation: `92px` high;
- mobile top navigation: `74px` high;
- vertical gap between major page sections: `14px`;
- workspace header padding: `30px 36px`;
- standard panel padding: `22px 28px 28px`;
- mobile panel padding: `18px`;
- card grid gap: `12px`.

### Shadow

Shadows are cool, wide and barely visible:

```css
--cove-shadow-card: 0 5px 12px rgba(12, 44, 67, 0.035);
--cove-shadow-panel: 0 8px 24px rgba(18, 55, 75, 0.05);
--cove-shadow-hover: 0 10px 20px rgba(12, 79, 83, 0.09);
```

If the shadow is the first thing visible about a card, it is too strong.

## 4. Required page composition

Every normal Cove service screen should follow this hierarchy:

```text
Cove global top navigation
└── Main frame (1480px maximum)
    └── Page stack (14px gap)
        ├── Pale-aqua workspace header
        │   ├── WORKSPACE kicker
        │   ├── Page title
        │   ├── One-line explanation
        │   └── Optional single summary stat
        └── One or more white portal panels
            ├── Panel heading
            ├── Optional right-aligned explanation/action
            └── Product content
```

Do not add an employee-facing dark sidebar. Do not start the page with a grid of generic KPI tiles. Do not wrap every element in a card.

## 5. Global shell

The shell is not open to reinterpretation. Match the existing structure:

- Cove logo at left in a `164 × 64px` crop window;
- logo image rendered `215px` wide and centred within that crop;
- Home, People, Brands and Apps in the centre;
- employee avatar/name and optional Admin link on the right;
- active navigation item in teal with a rounded `3px` underline;
- no coloured top bar and no drop shadow under navigation;
- at 760px, labels hide and icons remain;
- at 480px, primary navigation hides.

If an external app cannot reuse the full shell, it should at minimum preserve the logo, page frame, employee identity treatment and a clear route back to Cove. Do not invent a replacement brand header.

## 6. Workspace header

This is the clearest inheritance from the People page.

Anatomy:

```html
<header class="cove-workspace-header">
  <div class="cove-workspace-copy">
    <span class="cove-kicker">Workspace</span>
    <h1>Page title</h1>
    <p>One short explanation of the page.</p>
  </div>
  <div class="cove-workspace-stat">
    <strong>Value</strong>
    <span>Short label</span>
  </div>
</header>
```

Visual details:

- pale aqua gradient from `#f4fbfa` to `#e6f7f5`;
- subtle radial teal highlight near the upper right;
- one 210px orbital circle partially outside the surface;
- 1px pale teal border;
- 16px radius;
- 154px minimum desktop height;
- 170px minimum tablet height;
- summary stat separated by a fine teal vertical divider;
- below 520px the header stacks and the divider disappears.

Only one summary stat belongs in the header. If there is no genuinely useful value, omit it rather than filling the space.

## 7. Panels, cards and content density

### Portal panel

Use `.cove-panel` for major working areas. It is a white 15px surface with a quiet border/shadow.

```html
<section class="cove-panel">
  <header class="cove-panel-heading">
    <div>
      <span class="cove-source-label">Optional context</span>
      <h2>Panel title</h2>
    </div>
    <p>Optional explanation.</p>
  </header>
  <!-- content -->
</section>
```

Use two or three major panels, not many nested panels.

### Card

Use `.cove-card` for repeated content objects. The People card is the density reference:

- 11px radius;
- 1px cool-grey border;
- white surface;
- 15–16px padding;
- 12px grid gap;
- 13–14px title;
- 7–9px metadata;
- fine internal dividers.

Only add `.cove-card--interactive` when the whole card is actually clickable. Static cards must not rise on hover.

### Definition grid

For read-only personal or employment information, use `.cove-definition-grid`. Labels are small uppercase metadata; values are navy and readable. It becomes one column on mobile.

## 8. Forms

Forms should feel like the People panel extended into editable content—not like a different design system.

Use:

- visible label above every control;
- 44–46px field height;
- white field background;
- `#dce5e7` border;
- 9px radius;
- teal border plus soft outer ring on focus;
- 13px input values on desktop and 16px on mobile;
- muted helper text immediately below;
- red error text and border only after validation fails;
- 18px vertical field gap;
- two columns only for naturally paired short fields, collapsing below 720px.

Use `.cove-field`, `.cove-input`, `.cove-select`, `.cove-textarea`, `.cove-help`, `.cove-field-error`, `.cove-form-grid` and `.cove-form-actions` from the stylesheet.

Never:

- use placeholder text as the only label;
- put labels inside the border;
- use underlined Material-style inputs for forms;
- use tiny 8px field labels;
- place more than one filled primary action in the same action group; or
- hide a validation message in a tooltip.

## 9. Buttons and actions

### Primary

`.cove-button.cove-button--primary`

- teal background;
- white text;
- 9px radius;
- 44px minimum height;
- 13px/600 label;
- slight lift and darker teal on hover;
- visible teal focus ring.

### Secondary

`.cove-button.cove-button--secondary`

- white background;
- navy text;
- pale border;
- same dimensions as primary.

### Quiet

`.cove-button.cove-button--quiet`

- transparent background;
- teal label;
- no border until hover/focus.

### Destructive

`.cove-button.cove-button--danger`

Use only for a final destructive action. Normal cancellation or back navigation is secondary, not red.

## 10. Status and feedback

Use `.cove-status` plus a semantic modifier:

- `--success`: pale aqua/green, teal text;
- `--warning`: pale warm sand, amber text;
- `--danger`: pale red, red text;
- `--neutral`: cool grey, slate text.

Statuses are compact pills; they always include readable text and may include a 6px dot. Colour is never the only state indicator.

Use `.cove-alert` for page-level feedback. Normal information uses pale aqua. Warnings use sand. Errors use pale red. Do not reuse the large red Cove-home “critical action” banner for ordinary validation.

Use `.cove-empty` for empty states and `.cove-skeleton` for loading. Do not use full-page spinners.

## 11. Tabs, filters and tables

- `.cove-tabs` is a thin bottom-border row; active item is teal with a 2px underline.
- `.cove-filter` is a compact pill used only in filter groups.
- Tables sit directly inside a panel, use no heavy outer border and separate rows with `--cove-line-soft`.
- Table headings are 8px uppercase tracked metadata.
- At 720px, use `.cove-record-list` cards instead of forcing a wide table to scroll.

## 12. Icons

Use custom outline SVGs matching `src/components/icons.tsx`:

- `viewBox="0 0 24 24"`;
- no fill;
- `currentColor` stroke;
- `1.5–1.8px` stroke width;
- round caps and joins;
- 20–24px for controls;
- 38–43px only for large utility tiles.

Do not use emoji as interface icons. Do not mix several icon libraries with different stroke weights.

## 13. Motion

- entry: 450–550ms, opacity plus 8px upward movement;
- hover: 180–220ms;
- clickable card lift: 2px maximum;
- button lift: 1px maximum;
- no bouncing, pulsing or looping animation in working screens;
- all motion collapses under `prefers-reduced-motion: reduce`.

## 14. Responsive contract

### Above 1050px

- full navigation labels and employee name;
- up to three repeated cards per row;
- two-column form groups allowed.

### 761–1050px

- employee name may hide;
- repeated content normally uses two columns;
- keep at least 24px page gutters.

### 521–760px

- navigation labels hide;
- main frame uses 12px side gutters;
- panel padding becomes 18px;
- panel headings stack when needed;
- forms become one column;
- action groups may become full width.

### 320–520px

- primary navigation hides;
- workspace header stacks;
- summary-stat divider disappears;
- all repeated cards use one column;
- definition grids use one column;
- inputs use 16px text to prevent mobile browser zoom;
- no horizontal scroll.

## 15. Copy-ready skeleton

```tsx
export function CoveServicePage() {
  return (
    <div className="cove-app">
      <header className="cove-topnav">
        {/* Reuse the canonical logo, nav and employee area. */}
      </header>

      <main className="cove-main">
        <div className="cove-page-stack">
          <header className="cove-workspace-header">
            <div className="cove-workspace-copy">
              <span className="cove-kicker">Workspace</span>
              <h1>Page title</h1>
              <p>One short explanation.</p>
            </div>
            <div className="cove-workspace-stat">
              <strong>Value</strong>
              <span>Short label</span>
            </div>
          </header>

          <section className="cove-panel">
            <header className="cove-panel-heading">
              <div>
                <span className="cove-source-label">Section</span>
                <h2>Panel title</h2>
              </div>
              <button className="cove-button cove-button--primary">Primary action</button>
            </header>

            <div className="cove-grid cove-grid--3">
              <article className="cove-card">…</article>
              <article className="cove-card">…</article>
              <article className="cove-card">…</article>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
```

## 16. Visual acceptance checklist

- [ ] The page uses the canonical Cove shell or an exact shared implementation.
- [ ] The main frame is 1480px maximum with 24px desktop gutters.
- [ ] The first content element is the pale-aqua workspace header.
- [ ] Major content sits inside white 15px portal panels.
- [ ] Navy is used for hierarchy and teal for action.
- [ ] There is no new primary colour.
- [ ] Avenir Next/Cove sans is used everywhere.
- [ ] Page titles, panel titles, body and metadata match the prescribed scale.
- [ ] Borders and shadows remain low contrast.
- [ ] Cards use 11–13px radii, not oversized 24px SaaS cards.
- [ ] Static content does not animate on hover.
- [ ] Forms use persistent labels and 44px controls.
- [ ] Only one filled primary action appears per section/action group.
- [ ] Status is expressed with text, not colour alone.
- [ ] Icons use the same outline weight.
- [ ] The page reflows at 760px, 520px and 320px without horizontal scrolling.
- [ ] Focus states are visible and reduced motion is honoured.

If those checks pass and the new page can be placed beside People without looking like a separate template, it has adopted the Cove design language.
