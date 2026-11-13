# Heat-Safe design system: “Issued Sheet”

The visual and interaction language for every Heat-Safe surface: supervisor web, site app, worker app and Shelter A kiosk. It builds on the screen spec (`heat-safe-screen-spec.md` §1) and the navigable wireframes in `../ui_wireframes/`.

The living style guide shows every token and component in every state: open `index.html` over HTTP.

```bash
python -m http.server 8766 --directory 01_population-health_climate-worker/ui_design_system
```

| File | Contents |
|---|---|
| `tokens.css` | All design tokens: colour (day, glare, night shift), rules, spacing, glove targets, type, motion, focus |
| `components.css` | Components, each with default, hover, focus, active, disabled, loading and error states |
| `field.css` | Field and system patterns: sync indicator and queue, agent task state, inline suggestion, guardrail record, media capture, zone plan, component empty states |
| `icons.js` | The icon set (one drawing rule) and the `icon()` helper |
| `system.js` | Behaviour for select, menu, segmented control, switch, AI disclosure, hold-to-confirm, typed confirm, loading, toast |
| `field.js` | Behaviour for the offline sync engine, agent runs, suggestions, Withdraw, photo/voice/yes-no capture, zone plan |
| `index.html`, `guide.css` | The style guide page and three compositions (web, site app, worker app) |

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
| Palette | Warm ink and paper, plus four signal colours. Nothing else. Grey is warm graphite and pencil, never slate or zinc. |
| Colour use | Signals carry safety meaning only. They are never component identity, chart series, brand or hover. |
| Geometry | Every corner is 0px, for buttons, inputs, avatars, dialogs and focus rings alike. |
| Lines | 1px hair, 2px structure, 4px signal edge, 2px dashed draft. No other weights. |
| Surfaces | Paper (content), sheet (chrome) and tracing (drafts). No nested cards: sections are a label on a 2px rule. |
| Type | DM Sans only, at 400, 500 and 700. Hierarchy by size and weight, never by colour or italics. |

### Tactility and motion

The system is hardware-adjacent, so motion is mechanical and fast.

| Event | Response | Token |
|---|---|---|
| Colour and state change | Instant | `--dur-instant` 0ms |
| Hover | A yellow rail appears under the label | `--dur-snap` 90ms |
| Press | The control sinks 1px; secondary buttons invert to ink | `--easing-mechanical` |
| A record is made | Stamp: stepped scale 1.18 → 1 | `--dur-stamp` 140ms, `steps(4)` |
| Something arrives (alert, banner, menu) | Wipe from the reading edge, like a plotter pass | `--dur-wipe` 180ms, `steps(4)` |
| Loading | A hatch travels across the placeholder | `--dur-scan` 1.2s linear |

Nothing fades, bounces or springs. With `prefers-reduced-motion` every duration is 0.

### Information hierarchy

- **One focal readout per screen**, at `--fs-focal` (36–56px) with the 4px signal edge, on its own row. Everything else stays at 32px or below. The jump in scale is deliberate tension: the eye lands on what to do.
- **The emissive accent is spent once.** Signal red as an edge marks only “needs action now”. Stop-work fills and red bands use the same hue because they mean the same thing.
- **Supporting information gets quieter as it gets more technical.** Computed captions, rules versions and sources are 12px graphite.

---

## 2. Tokens

All tokens live in `tokens.css`. The headline set:

| Token | Day | Night shift | Notes |
|---|---|---|---|
| `--color-base` | `#FFFFFF` | `#12110F` | Paper |
| `--color-sheet` | `#F2EFE8` | `#1C1A17` | Chrome, rails, hover |
| `--color-tracing` | `#ECEFF3` | `#1A1D22` | Drafts, AI, proposals |
| `--color-ink` | `#14120F` (18.7:1) | `#F2EEE6` (16.3:1) | Text, rules, stamps |
| `--color-graphite` | `#4A453E` (9.5:1) | `#B8B0A4` (8.8:1) | Secondary text |
| `--color-pencil` | `#6B655D` (5.8:1) | `#8E877C` (5.3:1) | Tertiary, disabled |
| `--color-signal-red` | `#A31F24` (7.6:1) | `#FF7A6B` (7.4:1) | Prohibition, stop-work, needs action; `--color-emissive` |
| `--color-signal-yellow` | `#F2A900` | `#FFC21A` | Caution, focus halo. **Fill only**: ink text 9.3:1 |
| `--color-signal-green` | `#1E6E47` (6.2:1) | `#5CCB93` (9.4:1) | Safe condition, Low band |
| `--color-signal-blue` | `#1D4A86` (8.8:1) | `#8DB4F0` (8.9:1) | Mandatory instruction: work slots |
| `--border-brutalist` | 2px solid ink | | Structural rule |
| `--spacing-unit` | 0.5rem (8px) | | Steps 4, 8, 16, 24, 32, 48, 64 |
| `--easing-mechanical` | `cubic-bezier(.2,0,0,1)` | | |
| `--target` | 32px pointer, 56px touch | | Switches on `pointer: coarse` |
| `--target-touch` / `--target-glove` / `--target-cta` | 48 / 56 / 64dp | | Floor, field default, primary action |
| `--gap-touch` | 12px | | Between adjacent touch targets |
| `--edge-safe` | 20px | | Critical targets stay off rugged-case bezels |
| `--focus-ring` | 2px paper, 2px ink, 3px yellow | | Visible in direct sun |

Ratios are WCAG 2.2 against paper (day) or base (night). The style guide recomputes them live.

**Glare theme** (`data-theme="glare"`, the outdoor default for the site and worker apps) is pure black on white:

- Every text pair is 11:1 or better: ink 21, graphite 16.0, pencil 11.8, red 11.1, green 11.2, blue 14.2, black on yellow 13.2. WCAG AAA asks for 7:1.
- Sheet and tracing tints become white, so meaning never depends on a subtle tint.
- Rules thicken to 2/3/6px and the draft rule to 3px dashed.
- Body text goes up to 18px at weight 500.

Night shift is not given a glare variant; glare is a daylight problem.

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
| Button: primary, secondary, danger, quiet | default, hover, focus, active, disabled, loading, error | `disabled`, `aria-busy`, `aria-describedby` for errors |
| Icon button | default, hover, active, disabled | `aria-label` required |
| Field (input) | default, hover, focus, error, disabled, loading | Visible `<label>`, inline error with `aria-live` |
| Select | closed, open, active option, selected, disabled option | Button + `listbox`, arrows, Home/End, type-ahead, Enter, Esc |
| Segmented control | checked, hover, focus | `radiogroup`, roving tabindex, arrows follow reading direction |
| Switch | on, off, disabled | `role="switch"`, `aria-checked` |
| Overflow menu | closed, open, focused item, danger item | `menu`/`menuitem`, arrows, Home/End, Esc, Tab closes |
| Stamp | stop, caution, safe, mandatory, emergency, recorded, done, waiting, overdue, draft, unknown | Glyph + word; never colour alone |
| Band | low, caution, high, unknown | Swatch + word |
| Readout band | default, focal, stale, loading skeleton | One ruled band; no cards |
| Action row | default, hover, focus, selected, urgent, done, disabled, loading skeleton | Whole row is one target |
| Draft block | high confidence, low with grounding warning, proposal, discarded | “Why this?” is a disclosure (`aria-expanded`), not hover-only |
| Banner | error, offline, caution | `role="alert"` or `status` |
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
| Red band at 145 W/m² (wireframe W1) | Red cell | Green **band** + red **hold** stamp | Matches `ui/DESIGN_NOTES.md`: colour is not task permission |
| Rules | 1px ink everywhere | 1 / 2 / 4px hierarchy + dashed | Lets structure carry hierarchy without boxes |
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

1. **Wireframes.** Swap `ui_wireframes/styles.css` colour and rule values for `tokens.css`. Their structure already matches.
2. **The `ui/` app.** Import `tokens.css` and `components.css` ahead of Tailwind. Map Tailwind theme colours to the tokens so utility classes can’t reintroduce zinc, then retire `ui/src/tokens.css`. Replace `lucide-react` icons with this set, or restyle them to the 2px square-cap rule.
3. **Copy.** Status words, glyphs and the confirmation verbs in this guide are the canonical strings for `i18n.js`.

## 10. Open questions

- Test the dashed-edge AI treatment with supervisors: is it read as “draft, not issued”?
- Check Glare mode, signal yellow and the focus halo on real rugged phones in midday sun, at 100% brightness and in battery-saver mode, with and without gloves.
- Sync conflicts: agree the rule for each record type (for example, does the kiosk time or the manual entry win for headcount?) with the safety lead.
- Photo capture: confirm with occupational health and legal that equipment photos never include faces, and how long they are kept.
- Night shift: is it worth having on the worker app, or only for supervisors in the cabin?
- Arabic UI for supervisors: the system is RTL-ready, but nobody has reviewed the copy.
