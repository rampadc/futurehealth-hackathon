-- Agent observability views for Looker Studio (17 Nov 2026). See observability/README.md.
--
-- telemetry.agent_events is an event log: ~15 rows per turn, decisions buried in JSON. Dashboards want
-- one tidy row per thing they count, so each view below is shaped for a chart:
--
--   v_turns                 one row per turn: latency, tokens, tools, every guardrail decision
--   v_guardrail_decisions   one row per (turn, guardrail): for stacked bars "decision by guardrail"
--   v_tool_calls            one row per tool call: latency and status per tool
--   v_redteam               one row per red-team eval run: category, verdicts, which layer caught it
--
-- Views, not tables: no copies, no refresh jobs, always current. They cost a scan per query, which is
-- fine at hackathon volume; at scale they'd become scheduled tables or materialized views.
--
-- Run in the BigQuery console (location me-central1), or: uv run python observability/create_views.py

-- One row per turn. Starts from INVOCATION_STARTING so turns that crashed (no COMPLETED row) still count.
CREATE OR REPLACE VIEW `future-health-513202.telemetry.v_turns` AS
WITH started AS (
  SELECT invocation_id, session_id, user_id, MIN(timestamp) AS started_at
  FROM `future-health-513202.telemetry.agent_events`
  WHERE event_type = 'INVOCATION_STARTING'
  GROUP BY 1, 2, 3
),
completed AS (
  SELECT invocation_id,
         ANY_VALUE(SAFE_CAST(JSON_VALUE(latency_ms, '$.total_ms') AS INT64)) AS latency_ms,
         -- the session state at the end of the turn: where the guardrails record their decisions
         ANY_VALUE(attributes.session_metadata.state) AS state
  FROM `future-health-513202.telemetry.agent_events`
  WHERE event_type = 'INVOCATION_COMPLETED'
  GROUP BY 1
),
llm AS (
  SELECT invocation_id,
         COUNTIF(event_type = 'LLM_RESPONSE') AS llm_calls,
         SUM(SAFE_CAST(JSON_VALUE(attributes, '$.usage_metadata.prompt_token_count') AS INT64)) AS prompt_tokens,
         SUM(SAFE_CAST(JSON_VALUE(attributes, '$.usage_metadata.candidates_token_count') AS INT64)) AS output_tokens,
         SUM(SAFE_CAST(JSON_VALUE(attributes, '$.usage_metadata.thoughts_token_count') AS INT64)) AS thinking_tokens,
         COUNTIF(event_type = 'TOOL_COMPLETED') AS tool_calls,
         STRING_AGG(IF(event_type = 'TOOL_COMPLETED', JSON_VALUE(content, '$.tool'), NULL), ' > ' ORDER BY timestamp) AS tools,
         LOGICAL_OR(event_type LIKE '%ERROR') AS had_error,
         ANY_VALUE(IF(event_type = 'LLM_ERROR', error_message, NULL)) AS error_message
  FROM `future-health-513202.telemetry.agent_events`
  GROUP BY 1
)
SELECT
  s.started_at,
  DATE(s.started_at, 'Asia/Dubai') AS day,
  s.session_id, s.invocation_id, s.user_id,
  IF(s.user_id = 'eval-runner', 'eval', 'live') AS source,
  c.latency_ms / 1000 AS latency_s,
  l.llm_calls, l.tool_calls, l.tools,
  l.prompt_tokens, l.output_tokens, l.thinking_tokens,
  COALESCE(l.prompt_tokens, 0) + COALESCE(l.output_tokens, 0) + COALESCE(l.thinking_tokens, 0) AS total_tokens,
  -- Model Armor (agents/supervisor/armor.py): only if recorded for THIS turn, else 'not screened'
  IF(JSON_VALUE(c.state, '$.armor.invocation') = s.invocation_id,
     COALESCE(JSON_VALUE(c.state, '$.armor.input'), 'not screened'), 'not screened') AS armor_input,
  IF(JSON_VALUE(c.state, '$.armor.invocation') = s.invocation_id,
     COALESCE(JSON_VALUE(c.state, '$.armor.tool_output'), 'no guidance search'), 'no guidance search') AS armor_tool_output,
  IF(JSON_VALUE(c.state, '$.armor.invocation') = s.invocation_id,
     COALESCE(JSON_VALUE(c.state, '$.armor.output'), 'not screened'), 'not screened') AS armor_output,
  -- Our own answer checks (agent.py). They flag, they don't block.
  SAFE_CAST(JSON_VALUE(c.state, '$.grounding.passed') AS BOOL) AS grounding_passed,
  SAFE_CAST(JSON_VALUE(c.state, '$.grounding.checked') AS INT64) AS grounding_checked,
  SAFE_CAST(JSON_VALUE(c.state, '$.citations.passed') AS BOOL) AS citations_passed,
  SAFE_CAST(JSON_VALUE(c.state, '$.links.passed') AS BOOL) AS links_passed,
  c.invocation_id IS NOT NULL AS completed,
  COALESCE(l.had_error, FALSE) AS had_error,
  l.error_message
FROM started s
LEFT JOIN completed c USING (invocation_id)
LEFT JOIN llm l USING (invocation_id);

-- One row per (turn, guardrail). Long format: Looker Studio stacks bars by a dimension, not by columns.
CREATE OR REPLACE VIEW `future-health-513202.telemetry.v_guardrail_decisions` AS
SELECT started_at, day, source, invocation_id, guardrail, layer, decision
FROM `future-health-513202.telemetry.v_turns`,
UNNEST([
  STRUCT('1 Armor: input' AS guardrail, 'Model Armor' AS layer, armor_input AS decision),
  STRUCT('2 Armor: guidance text', 'Model Armor', armor_tool_output),
  STRUCT('3 Armor: answer', 'Model Armor', armor_output),
  STRUCT('4 Numbers grounded', 'Answer checks', CASE grounding_passed WHEN TRUE THEN 'passed' WHEN FALSE THEN 'flagged' ELSE 'not checked' END),
  STRUCT('5 Citations grounded', 'Answer checks', CASE citations_passed WHEN TRUE THEN 'passed' WHEN FALSE THEN 'flagged' ELSE 'not checked' END),
  STRUCT('6 Links grounded', 'Answer checks', CASE links_passed WHEN TRUE THEN 'passed' WHEN FALSE THEN 'flagged' ELSE 'not checked' END)
])
WHERE completed;

-- One row per tool call.
CREATE OR REPLACE VIEW `future-health-513202.telemetry.v_tool_calls` AS
SELECT timestamp, DATE(timestamp, 'Asia/Dubai') AS day, invocation_id,
       IF(user_id = 'eval-runner', 'eval', 'live') AS source,
       JSON_VALUE(content, '$.tool') AS tool,
       SAFE_CAST(JSON_VALUE(latency_ms, '$.total_ms') AS INT64) AS latency_ms,
       COALESCE(JSON_VALUE(content, '$.result.status'), 'ok') AS result_status
FROM `future-health-513202.telemetry.agent_events`
WHERE event_type = 'TOOL_COMPLETED';

-- One row per red-team eval run (evals/golden/redteam.yaml). "caught_by" is the defence-in-depth story:
-- did Model Armor stop it, or did the agent itself refuse / plan safely?
CREATE OR REPLACE VIEW `future-health-513202.telemetry.v_redteam` AS
SELECT started_at, run_id, scenario_id, category, repeat, passed, latency_s,
       prompt_tokens + output_tokens + thinking_tokens AS total_tokens,
       COALESCE(JSON_VALUE(armor_json, '$.input'), 'not screened') AS armor_input,
       COALESCE(JSON_VALUE(armor_json, '$.output'), 'not screened') AS armor_output,
       CASE
         WHEN category = 'control' AND JSON_VALUE(armor_json, '$.input') = 'blocked' THEN 'False positive (blocked)'
         WHEN category = 'control' THEN 'Control: let through'
         WHEN JSON_VALUE(armor_json, '$.input') = 'blocked' THEN 'Model Armor blocked'
         WHEN JSON_VALUE(armor_json, '$.input') = 'redacted' THEN 'Model Armor redacted'
         WHEN passed THEN 'Agent refused / planned safely'
         ELSE 'Got through (scenario failed)'
       END AS caught_by,
       prompt, answer
FROM `future-health-513202.telemetry.eval_results`
WHERE suite = 'redteam';
