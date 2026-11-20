# Agent observability: BigQuery views + Looker Studio (17 Nov 2026)

```bash
uv run --env-file ../.env python observability/create_views.py   # (re)create the views, print row counts
```

## How the data gets there

```
supervisor agent ──BigQueryAgentAnalyticsPlugin──▶ telemetry.agent_events   (~15 events per turn, JSON)
evals/run_evals.py ─────────────────────────────▶ telemetry.eval_results   (one row per scenario run)
                                   views.sql ──▶ v_turns, v_guardrail_decisions, v_tool_calls, v_redteam
                                                        │
                                              Looker Studio (charts)
```

Guardrail decisions are in the session state. `armor.py` writes `state["armor"]`, and `agent.py` writes
`state["grounding"]`, `["citations"]` and `["links"]`. The plugin copies the state into every event's `attributes`,
so the `INVOCATION_COMPLETED` row holds the final decisions for the turn. `v_turns` reads them from there.

## The views

| View | One row per | Use it for |
|---|---|---|
| `v_turns` | turn (invocation) | volume, latency, tokens, errors, tools used, every decision as a column |
| `v_guardrail_decisions` | turn × guardrail (6 per turn) | stacked bars: decision per guardrail |
| `v_tool_calls` | tool call | latency and errors per tool |
| `v_redteam` | red-team eval run | block rate per attack category; which layer caught it (`caught_by`) |

How to read the decisions:
- `not screened` means a turn from before Model Armor (16 Nov) or with `HEAT_SAFE_ARMOR=0`.
- `error` on 16 Nov is the closed-channel bug fixed in `armor.py` `close()`. Set the date range from 17 Nov to hide it.
- `source` = `eval` (runner) or `live` (`/agent/chat`, `adk web`).

## Build the dashboard (about 30 minutes)

1. Go to **lookerstudio.google.com** and choose **Create → Report**. Sign in with the account that has BigQuery access
   to `YOUR_PROJECT_ID`.
2. **Add data → BigQuery → My projects → YOUR_PROJECT_ID → telemetry → `v_turns` → Add.** Then add the other
   three views the same way (**Resource → Manage added data sources → Add**). Each view is a separate data source.
3. **Theme:** use **Theme and layout** for a simple one. Add a title text box: "Heat-Safe agent: observability".
4. **Controls** (top of the page; **Insert → Control**):
   - **Date range control.** Set the default to "Last 7 days" or a fixed range from 17 Nov. It filters every chart
     on the page whose source has a date field.
   - **Drop-down list** on `source` (eval or live).
5. Build the four charts below.
6. **Share → Manage access.** Viewers need BigQuery access too, or set each data source's **Data credentials** to
   *Owner's credentials* (Resource → Manage added data sources → Edit), so viewers see the data through you. Only do
   this for people who are allowed to see the telemetry.

### Section 1: Health (source `v_turns`)

| Chart | Setup |
|---|---|
| Scorecard: Turns | Metric `Record Count` |
| Scorecard: Median latency | Metric `latency_s`, aggregation **Median** |
| Scorecard: Avg tokens per turn | Metric `total_tokens`, **Average** |
| Scorecard: Error rate | Calculated field `SUM(CASE WHEN had_error THEN 1 ELSE 0 END) / COUNT(invocation_id)`, shown as a percent |
| Time series | Dimension `day`, metric `Record Count`, breakdown `source` |

### Section 2: Guardrails (source `v_guardrail_decisions`)

| Chart | Setup |
|---|---|
| **100% stacked bar** (the main chart) | Dimension `guardrail`, breakdown `decision`, metric `Record Count`. Then fix the colours under **Style**: passed is green, redacted is blue, flagged is amber, blocked is red, error is dark red, and "not screened" / "no guidance search" / "not checked" are grey |
| Table: blocked turns | Source `v_turns`, filter `armor_input = blocked OR armor_output IN (blocked, redacted)`, columns `started_at`, `source`, `armor_input`, `armor_output`, `tools` |

### Section 3: Red team (source `v_redteam`)

| Chart | Setup |
|---|---|
| **Stacked bar: who caught it** | Dimension `category`, breakdown `caught_by`, metric `Record Count`. This chart is defence in depth: Armor blocked, Armor redacted, or the agent refused |
| Scorecard: False positives | Filter `caught_by = False positive (blocked)`, metric `Record Count` (target 0) |
| Table | `scenario_id`, `category`, `armor_input`, `caught_by`, `passed`, with `prompt` for drill-down |

### Section 4: Tools (source `v_tool_calls`)

| Chart | Setup |
|---|---|
| Bar | Dimension `tool`, metrics `Record Count` and `latency_ms` (**Average**) |

## Design decisions

1. **Model the data before charting.** Looker Studio is good at grouping and counting tidy rows, and bad at parsing
   JSON. Every piece of shaping lives in SQL (`views.sql`), which is version-controlled and reviewable. The dashboard
   only configures charts.
2. **Long format for stacked charts.** `v_turns` has one column per guardrail. A chart can't stack columns, so
   `v_guardrail_decisions` unpivots them (`UNNEST` of an array of structs) into rows of (guardrail, decision).
3. **Count the denominator.** A blocked count alone means nothing. Show it as a share of all turns, and show the
   controls (false positives) next to it.
4. **Cost:** each chart runs a query on the views, and so on `agent_events`. That's tiny here. At scale:
   - partition the events table by `timestamp` (the plugin does)
   - turn on Looker Studio's data freshness cache (12 h by default)
   - or schedule the views into tables
5. **Privacy:** the views expose `prompt` and `answer` only in `v_redteam`, which holds synthetic test prompts.
   Live prompts are already redacted before logging (`armor.redact_for_log`), but keep live text out of shared
   dashboards anyway.
