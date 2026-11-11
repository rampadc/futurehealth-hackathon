# Independent walkthrough review

What this change does: The self-contained HTML explains the original heat-response sequence, the solver's allocation role and twelve synthetic branches. It displays captured JSON exchanges offline and can submit edited JSON to the real local API when served from `/walkthrough`.

Reviewed on 2026-11-10 by an independent Sol reviewer using the ponytail-review workflow. Scope: `walkthrough.html`, `build_walkthrough.py`, `walkthrough-results.json`, `test_walkthrough.py`, the narrow HTML route, browser regression script and documentation links. Earlier solver/API review records remain unchanged.

## Resolved review points

- **Prevent future captured-response drift.** The initial walkthrough test validated saved document shapes but did not replay saved requests. It now posts all 24 captured requests to the current API and requires exact response equality, so changed solver behavior cannot silently leave apparently verified examples behind.
- **State the objective precisely.** The explanation now says worker count is maximized first, followed by ascending worker IDs. It identifies the tie-break as a fixture convention rather than a fairness ranking.
- **Keep implemented and future interfaces distinct.** The usage heading now names the HTTP API, and MCP is explicitly described as an unimplemented future adapter.

## Independent verification

- Replayed all **24 captured request/response pairs** against the actual local HTTP service. Every returned response exactly matched the saved response, and all request/response documents validated against their embedded schemas.
- Confirmed that the HTML's embedded evidence exactly matches `walkthrough-results.json`. The capture process makes real HTTP calls, checks fixture expectations and retains the source cutoff and hold through the existing API.
- All **44 Python tests passed** during integration. The final strengthened walkthrough tests also passed after adding the permanent replay assertions.
- Verified the twelve solve worker counts, in fixture order: **0, 4, 2, 4, 3, 2, 0, 0, 3, 4, 4, 4**. Only the fourteen-person whole-crew check rejects; its separate solve request proposes C05–C08. Empty accepted checks and zero-worker optimal plans are correctly distinct from rejection or infeasibility.
- Checked the timeline, names, qualification claims, readiness timestamp and hold threshold against the original scenario 02/03 records, frozen personnel/tasks and supplemental fictional facts. The page distinguishes the original 08:11 human-authored assignment from a solver projection, keeps C01/C13/C14 outside the recovery candidate pool, and preserves P07/P08 occupancy.
- Inspected the editor's state handling: editing clears the displayed result; captured and live results have distinct labels; request revision, request text and operation guards discard stale in-flight responses. Network or parsing failures clear the result rather than retaining a prior allocation as current.
- Confirmed that embedded JSON escapes `<`, response rendering uses text content, and the test covers attempts to close the evidence script. README and the HTTP contract explain offline versus live use, local links and evidence regeneration.

The lead's real Chrome regression run additionally passed live demand-two output, unavailable-permit empty output, whole-crew rejection and separate replacement, HTTP 422 handling, delayed-response rejection, network-failure clearing, a 390-pixel mobile layout and offline file reading with live execution disabled. That browser evidence was reported by the lead; the independent review inspected the regression script and performed the HTTP/data checks above.

## Limits

Captured responses establish what the local deterministic synthetic model returned at the recorded verification time. Edited inputs require a new live response; offline reading does not execute the solver. The fixed site profile remains caller-asserted fictional readiness and prerequisites, not medical evidence, operational authorization, recovery-duration advice or restart approval. The page consistently retains `applied: false` and the heavy-work hold.

No production deployment, external hosting, public publication or MCP implementation was added. This review does not reclassify projected locations as observed actions.

Verdict: Ship within the documented local synthetic scope. No unresolved actionable findings remain from this review.
