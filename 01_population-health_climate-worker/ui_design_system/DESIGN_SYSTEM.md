# Heat-Safe design system: “Issued Sheet”

The visual and interaction language for every Heat-Safe surface: supervisor web, site app, worker app and Shelter A kiosk. It builds on the screen spec (`heat-safe-screen-spec.md` §1) and the navigable wireframes in `../ui_wireframes/`.

The living style guide shows every token and component in every state: open `index.html` over HTTP.

```bash
python -m http.server 8766 --directory 01_population-health_climate-worker
```

Then open http://localhost:8766/ui_design_system/ (the wireframes are at `/ui_wireframes/`).

| File | Contents |
|---|---|
| `tokens.css` | All design tokens: colour (day, glare, night shift), rules, spacing, glove targets, type, motion, focus. Themes apply to any element with `data-theme`, not just the page |
| `brand.css` | Company brand slots: brand bar, logo mark, phone status bar (section 11) |
| `brand.js` | `HSBrand`: checks a company palette against the signal colours, fits contrast per theme, emits brand tokens and the web app manifest (section 11) |
| `people.js`, `people/` | `HSPeople`: crew photos (256px WebP per person ID), initials fallback, avatar/person/stack markup, on-device resize for uploads (section 12) |
| `components.css` | Components, each with default, hover, focus, active, disabled, loading and error states |
| `field.css` | Field and system patterns: sync indicator and queue, agent task state, inline suggestion, guardrail record, media capture, zone plan, component empty states |
| `icons.js` | The icon set (one drawing rule) and the `icon()` helper |
| `system.js` | Behaviour for select, menu, segmented control, switch, AI disclosure, hold-to-confirm, typed confirm, loading, toast |
| `field.js` | Behaviour for the offline sync engine, agent runs, suggestions, Withdraw, photo/voice/yes-no capture, zone plan |
| `index.html`, `guide.css` | The style guide page and three compositions (web, site app, worker app). Its 26 sections are grouped into five parts (Foundations, Components, Screens and conditions, AI and field patterns, Identity). Body text always sits on white. Colour lives only in the headers: each section heading sits on sheet paper (`#F2EFE8`), in its part's earth-tone ink (sand, stone, sage, clay or bark) at least 7.8:1. On phones each nav tab carries the same 8px colour line on top. The colours are wayfinding for the guide only, never product colour. Glare turns them to ink |

---

## 1. Design thinking

### Core metaphor: the issued sheet

Heat-Safe users already read two visual systems fluently: **engineering drawings** (in the site cabin) and **safety signs** (in the field). The interface borrows both instead of inventing a third:

- Every screen is a **sheet on the site permit board**. It has a title block (site, time, rules revision), ruled sections and a single thing to act on.
- **Drawing conventions decide structure.** Line weight is hierarchy. Line style is certainty: solid means issued, dashed means draft, hatched means no work.
- **Safety-sign conventions decide colour.** Hues are ISO 3864 safety colours, used only for their sign meaning.
- **Ink fill is a stamp.** A solid ink block means a person recorded something, or there is an emergency.
- **There is no lighting.** No shadows, glows, blurs or gradients. Depth exists only as stacking order: a dialog sits on a dimmed sheet.

This metaphor is also a safety argument. Heat-Safe’s hardest design problem is keeping four kinds of statement apart: an environmental **condition**, a task **hold**, a human **decision** and an AI **draft**. The sheet gives each its own drawing form (section 3).

### Visual restraints

| Constraint | Rule |
|---|---|
| Palette | Warm ink and paper, plus four signal colours. Grey is warm graphite and pencil, never slate or zinc. The one addition is a company’s brand colour, and only in the identity slots of section 11. |
| Colour use | Signals carry safety meaning only. They are never component identity, chart series, brand or hover. Brand colour never appears on a control, stamp, band, chart or statement. |
| Section colour | Structural colour only (`--color-section-*`), never a state, signal or selection. Five natural tones (sand, sage, clay, stone, bark) so neighbouring section headers and tabs never share a colour. A section (ledger) has a 1px light warm-grey frame (`--color-section-frame`, ink in glare) round its header and all its rows, so it is clear what belongs to it; its header sits on sheet paper (`#F2EFE8`) with the label in its tone's ink (≥ 7.8:1). Pick the tone with `data-tone="1…5"`. Tabs (phone tab bar, rail as a strip) take a tone by position. Glare turns every band white and every rule ink. |
| Status icons | The only multi-colour icons, shared through `tokens.css` (`--icon-ok`, `--icon-warn`, `--icon-error`, class `.si`). Good: green tick. Warning: yellow triangle with an ink "!". Error: filled red circle with a white X, ringed in white so it shows on a red fill (night uses a dark X, since white on the lifted red is 2.6:1). Always beside a word; they replace the ●, ▲ and ■ glyphs on good, caution and stop or overdue stamps, banners, notes and field errors. |
| Section icons | Every section heading leads with a line icon for what it is about (people, pin, list, message, calendar, sensor, alert, record, lock and so on, from `icons.js`). The app and wireframes pick it from the heading text; a heading can name its own. |
| Geometry | Every corner is 0px, for buttons, inputs, dialogs and focus rings alike. The one exception is the crew photo, a circle (`--radius-photo`), so a face can never be mistaken for a control, stamp or signal. |
| Lines | 1px hair, 2px structure, signal (8px top line over a 1px frame), 2px dashed draft. No other weights. The signal marks the whole cell that needs action: a heavy 8px line on top and a 1px frame on all four sides, both in the signal colour, so the cell is closed and its top edge is found at a glance. |
| Surfaces | Paper (content), sheet (chrome) and tracing (drafts). No nested cards: sections are a label on a 2px rule. |
| Type | DM Sans only, at 400, 500 and 700. Hierarchy by size and weight, never by colour or italics. |

### Tactility and motion

The system is hardware-adjacent, so motion is mechanical and fast.

| Event | Response | Token |
|---|---|---|
| Colour and state change | Instant | `--dur-instant` 0ms |
| Hover | A 4px yellow rail appears under the label | `--dur-snap` 90ms |
| Press | The control sinks 1px; secondary buttons invert to ink | `--easing-mechanical` |
| A record is made | Stamp: stepped scale 1.18 → 1 | `--dur-stamp` 140ms, `steps(4)` |
| Something arrives (alert, banner, menu) | Wipe from the reading edge, like a plotter pass | `--dur-wipe` 180ms, `steps(4)` |
| Loading | A hatch travels across the placeholder | `--dur-scan` 1.2s linear |

Nothing fades, bounces or springs. With `prefers-reduced-motion` every duration is 0.

### Information hierarchy

- **One focal readout per screen**, at `--fs-focal` (36–56px) under the signal (8px top line, 1px frame), on its own row. Everything else stays at 32px or below. The jump in scale is deliberate tension: the eye lands on what to do.
- **The emissive accent is spent once.** Signal red as an edge marks only “needs action now”. Stop-work fills and red bands use the same hue because they mean the same thing.
- **Supporting information gets quieter as it gets more technical.** Computed captions, rules versions and sources are 12px graphite.
- **A face before a name.** Anything that belongs to a named person (row, readout note, table cell, task owner, handoff, record stamp) leads with that person’s round crew photo. People find a face faster than they read a name.

---

## 2. Tokens

All tokens live in `tokens.css`. The headline set:

| Token | Day | Night shift | Notes |
|---|---|---|---|
| `--color-base` | `#FFFFFF` | `#12110F` | Paper |
| `--color-sheet` | `#F2EFE8` | `#1C1A17` | Chrome, rails, hover |
| `--color-tracing` | `#ECEFF3` | `#1A1D22` | Drafts, AI, proposals |
| `--tone-1…5-rule` | `#A28045` · `#698C56` · `#BC653B` · `#807164` · `#7B4F30` (≥ 3.7:1) | `#A3885A` · `#749065` · `#B87252` · `#84786D` · `#8D6850` (≥ 3.8:1) | 8px top rule on section headers and tabs |
| `--tone-1…5-ink` | `#5B4315` · `#375028` · `#723311` · `#50453B` · `#613F27` (≥ 7.8:1 on sheet) | `#DEC7A2` · `#BBD3AF` · `#F8BBA0` · `#D3C8BF` · `#E4C3AD` (≥ 9.1:1) | Section header label, on sheet paper (≥ 7.8:1; night ≥ 10.4:1) |
| `--color-ink` | `#14120F` (18.7:1) | `#F2EEE6` (16.3:1) | Text, rules, stamps |
| `--color-graphite` | `#4A453E` (9.5:1) | `#B8B0A4` (8.8:1) | Secondary text |
| `--color-pencil` | `#6B655D` (5.8:1) | `#8E877C` (5.3:1) | Tertiary, disabled |
| `--color-signal-red` | `#A31F24` (7.6:1) | `#FF7A6B` (7.4:1) | Prohibition, stop-work, needs action; `--color-emissive` |
| `--color-signal-yellow` | `#F2A900` | `#FFC21A` | Caution, focus halo. **Fill only**: ink text 9.3:1 |
| `--color-signal-green` | `#1E6E47` (6.2:1) | `#5CCB93` (9.4:1) | Safe condition, Low band |
| `--color-signal-blue` | `#1D4A86` (8.8:1) | `#8DB4F0` (8.9:1) | Mandatory instruction: work slots |
| `--border-brutalist` | 2px solid ink | | Structural rule |
| `--signal-width` / `--signal-hair` | 8px / 1px (glare 10px / 2px) | | Signal: 8px top line over a 1px frame. Use `--signal-frame` (inset shadow, no layout shift), or as a border: `border: var(--rule-signal); border-block-start-width: var(--signal-width)` where the colour varies |
| `--radius-photo` | 50% | | Crew photos only. Every other corner stays `--radius: 0` |
| `--spacing-unit` | 0.5rem (8px) | | Steps 4, 8, 16, 24, 32, 48, 64 |
| `--easing-mechanical` | `cubic-bezier(.2,0,0,1)` | | |
| `--target` | 32px pointer, 56px touch | | Switches on `pointer: coarse` |
| `--target-touch` / `--target-glove` / `--target-cta` | 48 / 56 / 64dp | | Floor, field default, primary action |
| `--gap-touch` | 12px | | Between adjacent touch targets |
| `--edge-safe` | 20px | | Critical targets stay off rugged-case bezels |
| `--focus-ring` | 2px paper, 2px ink, 4px yellow | Every yellow highlight uses `--highlight-width` (4px) | Visible in direct sun |

Ratios are WCAG 2.2 against paper (day) or base (night). The style guide recomputes them live.

**Glare theme** (`data-theme="glare"`, the outdoor default for the site and worker apps) is pure black on white:

- Every text pair is 11:1 or better: ink 21, graphite 16.0, pencil 11.8, red 11.1, green 11.2, blue 14.2, black on yellow 13.2. WCAG AAA asks for 7:1.
- Sheet and tracing tints become white, so meaning never depends on a subtle tint.
- Rules thicken to 2/3/10px (hair, structure, signal top line; the signal frame goes to 2px) and the draft rule to 3px dashed.
- Body text goes up to 18px at weight 500.

Night shift is not given a glare variant; glare is a daylight problem.

Themes are **element-scoped**: `data-theme` works on any element, and every derived token (rules, hatches, focus ring, emissive) is redeclared there. That is what lets one page show a night-shift preview inside a day page, as the style guide and W9 do.

Type sizes are fluid with `clamp()`: label 12, small 14, body 16, title 18–20, heading 20–24, readout 24–32, focal 36–56.

---

## 3. Signal grammar

| Statement | Form | Example | Rule |
|---|---|---|---|
| **Environmental band** (a condition) | Square swatch + word | ■ Low band · 145 W/m² | Stale or missing readings are **Unknown** (hatched swatch), never a reassuring colour |
| **Task hold** (a rule result) | Prohibition stamp | ■ HEAVY-WORK HOLD | Can be active under a green band; the two are always shown together |
| **Human decision** | Ink stamp with name and time | ✓ RECORDED · HUDA 08:11 | Only people stamp. Software never lifts a stop-work |
| **Draft** (AI or proposal) | Tracing paper, dashed edge, ◇ | ◇ AI · PLANNING AGENT | Never solid until a person records it; discard is non-destructive with Undo |

This applies the `ui/DESIGN_NOTES.md` rule: at 145 W/m², show a green environmental band **and** a heavy-work hold.

---

## 4. Components and states

Every interactive component has a real implementation (semantics, keyboard, ARIA) in `system.js`. The style guide shows each state side by side, using forced-state classes (`.is-hover`, `.is-focus`, `.is-active`, `.is-loading`, `.is-error`).

| Component | States covered | Semantics |
|---|---|---|
| Button: primary, secondary, danger, quiet | default, hover, focus, active, disabled, loading, error | `disabled`, `aria-busy`, `aria-describedby` for errors. A control, so never shaped like a stamp: sheet-paper fill (`--color-sheet`) with an ink outline, sentence case, 2px frame with a 4px bottom key edge (`--key-edge`) that collapses on press |
| Icon button | default, hover, active, disabled | `aria-label` required |
| Field (input) | default, hover, focus, error, disabled, loading | Visible `<label>`, inline error with `aria-live` |
| Select | closed, open, active option, selected, disabled option | Button + `listbox`, arrows, Home/End, type-ahead, Enter, Esc |
| Segmented control | checked, hover, focus | `radiogroup`, roving tabindex, arrows follow reading direction |
| Switch | on, off, disabled | `role="switch"`, `aria-checked` |
| Overflow menu | closed, open, focused item, danger item | `menu`/`menuitem`, arrows, Home/End, Esc, Tab closes |
| Stamp | stop, caution, safe, mandatory, emergency, recorded, done, waiting, overdue, draft, unknown | Glyph + word; never colour alone. A record, not a control: 12px uppercase label in a flat 1px frame (no key edge, default cursor), 42px-tall box with 16px side padding; wraps between words in narrow cells |
| Band | low, caution, high, unknown | Swatch + word |
| Readout band | default, focal (signal: 8px top, 1px frame), stale, loading skeleton | One ruled band; no cards |
| Action row | default, hover, focus, selected, urgent (signal: 8px top, 1px frame), done, disabled, loading skeleton; crew photo lead when the row is about a person | Whole row is one target |
| Crew photo | photo, no photo (initials), excluded (rest hatch), loading; sizes xs 20 · sm 24 · 32 · md 40 · lg 64 · xl 120 | `aria-hidden`: the name is always written beside it |
| Crew stack | first four faces, then +n | `aria-hidden`; names are in the text beside it |
| Photo upload (account page) | issued, uploaded, none, preparing, error, drag-over | Visible label on a real `<input type="file">`; status in `aria-live`; error in `role="alert"` |
| Draft block | high confidence, low with grounding warning, proposal, discarded | “Why this?” is a disclosure (`aria-expanded`), not hover-only |
| Banner | error, offline, caution (8px top line and 1px frame in the state’s colour) | `role="alert"` or `status` |
| Empty state | onboarding, all-clear | One sentence of why, at most one action |
| Dialog: typed confirm | empty, wrong word, ready | Native `<dialog>`, Cancel focused, Esc closes |
| Hold-to-confirm | idle, filling, confirmed | Pointer, Space or Enter held for 1.5s |
| Toast | message, message with Undo | `aria-live="polite"`; 8s with Undo, 3s without |
| Timeline | work, rest, excluded, horizon | Time runs with reading direction |
| Statement | stop-work, emergency | Full-bleed fixed template with pictograms |
| Title block, rail, tab bar, thumb zone | | `<header>`, `<nav aria-label>`, `aria-current` |
| Sync indicator | synced, pending, sending, needs you, offline | Button in every title block; `aria-label` states the full status |
| Sync queue | saved, sending, sent, failed (Retry / Discard with Undo), conflict (resolve) | `aria-live` summary |
| Agent task state | queued, calling tool, waiting on dependency (with unblock action), ready for review, failed, cancelled | Ordered list; `role="status"` line |
| Inline suggestion | offered, accepted (Undo), dismissed (Undo) | Buttons beside the field they fill |
| Guardrail record | recorded, withdrawn | Withdraw by tier: click or hold; audit kept |
| Media capture | empty, recording, captured (queued) | Real `<input type="file" capture>`; voice `aria-pressed`; yes/no `aria-pressed` group |
| Zone plan | default, hold, recovery, unknown, selected, focus | SVG zones are `role="button"` with Enter/Space |
| Empty (component) | ledger with no rows, select with no options | Text explains why; no fake rows |

---

## 5. Web ↔ mobile translation

| Concern | Desktop web | Phone |
|---|---|---|
| Context | Title block across the content column; rail on the inline-start edge | Title block at top: who, where, when. Status and secondary actions only |
| Decisions | Primary action at the foot of the detail panel, beside its evidence | Thumb zone above the tab bar, inset 16px; never full-bleed |
| Targets | 32px dense rows and icon buttons | 56dp default (48dp floor), 64dp primary, 12px apart, 20px from edges |
| Readouts | One ruled band; focal on its own row | Focal alone; others stack; horizontal strips start 16px in so they never fight the system back gesture |
| Density | Descriptions clamp at two lines; J/K, /, ? shortcuts | Fewer rows; worker app never truncates |
| Confirmation | Typed word in a dialog | Hold-to-confirm |
| Layout mechanics | Grid with container queries: the Squad Monitoring composition re-flows by its own width, not the viewport | Flex column with safe-area padding |

---

## 6. Anti-patterns this system rules out

- **Card-in-card.** Sections are a label on a structural rule. Readouts share one ruled band. The only filled surfaces are drafts (tracing) and stamps (ink).
- **The statistical-mean palette.** No Tailwind indigo, blue-700, amber-700, zinc or slate. Every hue is a safety-signal colour with a stated meaning.
- **Mixed icon styles.** Every icon is drawn on one 24px grid with a 2px stroke, square caps and miter joins. Only the AI diamond is dashed, on purpose.
- **Faux controls.** Every drawn control works with keyboard and screen reader. Disabled controls use `disabled`, look hatched and show a not-allowed cursor.
- **Fixed-dimension brittleness.** No content container has a fixed height. Sizes come from `clamp()`, `min-block-size` and rem-based grid tracks; the device frames in the guide size to their content.
- **Happy path only.** Skeletons, empty, stale, offline, error and failed-send states are all specified, with real copy from the 4 August scenario.

---

## 7. Changes to the screen spec (§1) and the current app

| Area | Screen spec / `ui/` today | Issued Sheet | Why |
|---|---|---|---|
| Component colours 1–4 | Heat amber, protect rose, plan blue, restart green | **Numbered ink squares**, no hue | Four extra hues collided with the band colours (restart green read as “safe”, protect rose as “stop”). Numbers already carry identity |
| AI colour | Violet `#5B21B6` + grey tint | **No hue**: dashed edge, ◇, cool tracing paper | Removes the “grey looks disabled” problem (spec §8) and keeps colour for safety |
| Hues | Tailwind 700-series values | RAL-derived signal colours | Domain-grounded; same or better contrast |
| Red band at 145 W/m² (Squad Monitoring) | Red cell | Green **band** + red **hold** stamp | Matches `ui/DESIGN_NOTES.md`: colour is not task permission |
| Rules | 1px ink everywhere | 1 / 2px hierarchy, signal (8px top line, 1px frame) + dashed | Lets structure carry hierarchy without boxes; the 4px edge was too thin to find at a glance. A heavy top line plus a light frame marks the whole cell without the mass of an 8px box |
| People | Name text only | Round crew photo before every name | Faster matching of content to a person on a crowded site |
| Metric cards | Separate bordered boxes | One ruled readout band | No card-in-card |
| Focus | 2px ink | Ink ring + yellow halo | Visible in direct sun |
| Field confirmations | Type CONFIRM / REMOVED | Hold-to-confirm on phones; typed on desktop | Gloves, glare and non-Latin keyboards |
| Night | Not specified | Night-shift theme | Early starts and cabin screens left on overnight |
| `ui/` app | Inter, zinc greys, 6px radius (Tracecat-derived) | DM Sans, warm ink, 0 radius | Aligns the build with the spec and this system |

---

## 8. Field and system guidelines: what was applied, adapted and left out

Each guideline was weighed against what Heat-Safe is: a heat-safety execution layer for a mixed-language crew, not a construction QA or BIM product.

| Guideline | Decision | How it shows up |
|---|---|---|
| Offline-first resilience | **Applied** | Records are written to the phone first. Safety alerts and bands come from the rules on the phone, so they never wait for the network. |
| Sync and state transparency | **Applied** | Sync indicator in every title block; a sync queue with per-record states, Retry, Discard with Undo, and conflict resolution (manual entry vs kiosk time). |
| Agentic AI state indicators | **Adapted** | Queued, calling a tool, waiting on a dependency, ready for review, failed, cancelled. There is no “executing” state: the Planning Agent never acts on the site or writes to a plan. A waiting state names the dependency and offers the unblocking action. |
| Active guardrails | **Applied** | Four tiers (reversible → records a fact → destructive → human-only decision), each with its own gate. AI sits outside the tiers because it cannot act. |
| Universal undo / rollback | **Adapted** | Tier 0 gets an 8-second Undo. Safety records are *withdrawn*, never silently undone: the audit log keeps them and withdrawal re-raises whatever they had cleared. A stop-work that reached phones can’t be unsent; withdrawing it sends a follow-up. |
| Ambient intelligence | **Applied, bounded** | Inline suggestions beside the field they fill (evidence reference, earliest restart time), with Use/Dismiss/Undo and reasoning behind “Why this?”. Never for health judgements: who is fit, who complains. |
| High-glare contrast | **Applied** | Glare theme at ≥ 11:1 for every text pair, thicker rules, larger and heavier type. The yellow-on-dark variant was not added; nobody needs glare protection on a night shift. |
| Glove-ready targets, edge clearance | **Applied** | 56dp default touch target, 64dp primary action, 12px between targets, 20px clearance from screen edges. |
| Thumb-zone ergonomics | **Already applied** | Context at top; decisions in the bottom third above the tab bar. |
| Media-driven input | **Applied, bounded** | Photo (meter, cooler, shade), voice-to-text with the audio discarded, and yes/no buttons before any keyboard. Photos are for equipment and conditions, never people. |
| Spatial anchoring | **Adapted** | A 2D zone plan anchors bands, holds, sensors and actions to zones, showing counts only. No live worker pins: Heat-Safe is not a location tracker. No BIM: zones are enough for heat decisions. |
| Role-bifurcated Field / Office views | **Already applied** | Site and worker apps are execution and capture; the web app is verification (list + evidence detail, restart review). Financial aggregation stays out of safety screens; the existing cost-review export for Amal is the only money path. |
| Blueprint rendering, QA checklists, issue logging | **Not applied** | Out of Heat-Safe’s scope. |
| Metaphor, fluid sizing, type/icon uniformity, semantic states | **Already applied** | Empty states are now covered at component level too: ledger and select. |

## 9. Adopting it

1. **Wireframes. Done.** `ui_wireframes/` loads `tokens.css`, `brand.css` and `brand.js`. Its `styles.css` keeps its short names as aliases of the tokens. Markers are numbered ink squares. Bands and holds are drawn separately, so W1’s hourly strip shows a Low band and a heavy-work hold at 145 W/m². Proposals sit on dashed tracing paper. Site and worker phones open in glare. Company branding is applied by W9.
2. **The `ui/` app.** Import `tokens.css` and `components.css` ahead of Tailwind. Map Tailwind theme colours to the tokens so utility classes can’t reintroduce zinc, then retire `ui/src/tokens.css`. Replace `lucide-react` icons with this set, or restyle them to the 2px square-cap rule.
3. **Copy.** Status words, glyphs and the confirmation verbs in this guide are the canonical strings for `i18n.js`.

## 10. Open questions

- Test the dashed-edge AI treatment with supervisors: is it read as “draft, not issued”?
- Check Glare mode, signal yellow and the focus halo on real rugged phones in midday sun, at 100% brightness and in battery-saver mode, with and without gloves.
- Sync conflicts: agree the rule for each record type (for example, does the kiosk time or the manual entry win for headcount?) with the safety lead.
- Photo capture: confirm with occupational health and legal that equipment photos never include faces, and how long they are kept.
- Night shift: is it worth having on the worker app, or only for supervisors in the cabin?
- Arabic UI for supervisors: the system is RTL-ready, but nobody has reviewed the copy.
- Crew photos: confirm with HR and legal how photos are collected and retained, whether contractors’ crews consent separately, and whether supervisors may add a photo for a worker who has no phone.
- Branding: confirm the signal-risk thresholds (section 11) with real client palettes. Should an orange brand that is also a company’s safety colour still be held to the logo mark? Which roles beyond the organisation admin may publish, and do sites within one organisation ever need different brands?

---

## 11. Company branding

Heat-Safe is sold to contractors who want their own colours on it. Branding is allowed where it identifies **who issued the sheet**. It is never allowed where it could be read as a **safety signal**. `brand.js` enforces the line, so an admin can’t configure their way past it. Try it in the style guide (section 25) or in wireframe W9.

### Slots

| Slot | Platform (supervisor web) | Mobile web (site app, worker app, kiosk) |
|---|---|---|
| Brand bar (`--brand-bar`, `--brand-on-bar`) | Rail head: logo mark, company name, “Heat-Safe Crew” underneath | 32px strip above the title block (header style “strip”) |
| Logo mark (`--brand-mark`) | Rail head, PDF export headers | Strip, install icon, launch screen |
| Browser colour (`--brand-theme`, `theme_color`) | Not used | Status bar and browser toolbar |
| Chrome tint (`--color-sheet`) | Optional faint wash on rail and sheet surfaces | Not offered: glare, the field default, forces white |
| **Never** | Stamps, bands, holds, statements, buttons, links, focus, charts, timelines, AI drafts | The same, plus stop-work and emergency screens, which drop the strip and paint the browser colour ink |

The product line “Heat-Safe Crew” always stays under the company name, so a worker knows which system issued the instruction.

### Guardrails (`HSBrand.resolve`)

1. **Signal risk.** A colour is kept to the logo mark if it reads as a signal: OKLCH chroma ≥ 0.06 with hue in the red family (≥ 345° or < 50°), the caution family (50–110°, lightness ≥ 0.45) or the green family (110–180°). It is also kept to the mark if it sits within OKLab ΔE 0.10 of any signal (0.06 for signal blue).
2. **Bar source.** On “auto”, the bar uses the primary colour, then the secondary, then paper. An admin can force primary, secondary or off, but never a restricted colour.
3. **Contrast.** Bar text is ink or paper, whichever passes: 4.5:1 for day and night, 7:1 for glare. If neither passes, only the bar’s lightness changes; the hue is kept.
4. **Night.** The bar dims to lightness ≤ 0.40 and chroma ≤ 0.14, so it doesn’t glare in a dark cabin.
5. **Tint.** Rail tint is OKLCH 0.955/0.014 (day) or 0.215/0.012 (night) at the brand hue. It is refused within 40° of the tracing-paper hue, so a tinted rail can’t pass for an AI draft.
6. **Safety screens.** Any screen with a stop-work or emergency statement shows no brand, whatever the setting.

Each guardrail produces a check (`pass`, `adjusted`, `restricted`, `off`, `enforced`) with a plain sentence. The branding screen lists them beside the publish button.

### Platform and mobile web are configured separately

```js
{
  org: 'Sandline Contracting', wordmark: 'Sandline', logo: 'data:image/svg+xml…',
  primary: '#C2541B', secondary: '#2B2D42',
  platform: { bar: 'auto', tint: true },                       // auto | primary | secondary | none
  mobile:   { bar: 'auto', header: 'strip', tint: false,         // header: strip | browser | off
              appName: 'Sandline Heat-Safe', shortName: 'Sandline' }
}
```

The desk has room for a full bar and a tint. On a phone the screen is short and glare is the default, so the choice is a 32px strip, the browser colour only, or nothing.

### Output

- `HSBrand.css(res)` writes `[data-brand-surface="platform|mobile"]` rules for each theme. Shells put `data-brand-surface` on the frame next to `data-theme`.
- `HSBrand.apply(res)` injects them into the page. Passing a suffix (`'-draft'`) scopes a draft for previewing without touching the live chrome.
- `HSBrand.manifest(res)` writes the web app manifest for mobile web: `name`, `short_name`, and `theme_color` from the day bar.

### Fictional presets used for testing

| Preset | Palette | Outcome |
|---|---|---|
| Sandline Contracting | Orange `#C2541B`, charcoal `#2B2D42` | Orange reads as Stop, so it goes in the mark only; the charcoal fills the bar |
| Dune Civil Works | Petrol `#0E4C5A`, sand `#D9B45A` | Petrol fills the bar and the mark; the sand reads as Caution and is not used |
| Al Noor Facilities | Lilac `#B9A7E0`, plum `#5B2A86` | Lilac fills the bar with ink text; the phone uses the browser colour only |
| Corniche Logistics | Navy `#1D4B8F` | Too close to signal blue (Mandatory). The bar stays paper; the mark carries the brand |

---

## 12. Crew photos

Every surface shows a small round photo in front of a person’s name: crew lists, task and action rows, readout notes, table cells, handoff lines, decision stamps, the title bar and the sign-in list. The kiosk shows faces on the badge tiles. Try it in the style guide (section 26).

### Rules

- **Always with the name.** The photo helps people recognise each other; it is never the only identifier. It is `aria-hidden`, because the name beside it is what a screen reader reads.
- **People only.** Zones, sensors, unowned tasks and AI drafts never get a face. Agents, scheduled jobs and the kiosk keep a square ⚙ tile, so software is never drawn as a person.
- **No signal colour on a face.** Status stays in the stamp beside the photo. The only overlay is the rest hatch for “excluded from work”.
- **No photo yet:** initials on sheet paper (family particles such as “Al” are skipped: Mariam Al Qamar → MQ). Never a stock silhouette.

### Sources, in order

1. The photo the person uploaded on their account page (`GET /api/people/{id}/photo`, versioned by `GET /api/people/photos`).
2. The photo issued with the account: `people/<ID>.webp`, 256px square WebP. The app bundles these with Vite; the style guide and wireframes load them through `people.js`.
3. Initials.

### Account page: add or replace your own photo

- Web: **My account**, opened from your photo and name in the title bar. Site app: the same, from the title bar. Worker app: **Me → My photo**.
- Only the signed-in person can change their own photo (`PUT` / `DELETE /api/people/me/photo`). There is no route to set someone else’s.
- The browser square-crops the picked image and shrinks it to 256px WebP (JPEG if the browser can’t encode WebP) before upload. The server accepts JPEG, PNG or WebP only, checks the type from the file’s bytes, and caps the size at 512 KB.
- **Remove** goes back to the issued photo, or to initials if there isn’t one.
- In the static style guide and wireframes, uploads stay in this browser (`localStorage`).

### Demo photos

20 photorealistic portraits of fictional people were supplied for the demo and matched to roster IDs by role (for example the first-aid vest goes to Salim, the first aider; white helmets to supervisors and HSE). They cover everyone named in the 4 August story except Lina (P07) and Mariam (C11), plus four more of the crew. Everyone else in the 37-person roster shows initials until they add a photo, which also demonstrates the initials state.
