# `infra/`: the team demo on Cloud Run (Terraform)

A **short-lived, public** deployment of the Heat-Safe API (`../server.py`): the REST and streaming
endpoints, the agent chat, and the ADK dev UI at `/dev-ui`, so teammates can call it from their frontend. Anyone with the URL can use it and spend the project's
Gemini budget, so **destroy it when the demo is over**.

```bash
# From 01_population-health_climate-worker/. --env-file ../.env (it lives at the repo root): Terraform
# and gcloud must use the project's credentials (README "Credentials")
uv run --env-file ../.env terraform -chdir=infra init        # once: downloads the google provider
uv run --env-file ../.env terraform -chdir=infra plan        # what would change (read it every time)
uv run --env-file ../.env terraform -chdir=infra apply       # build the image if code changed, deploy
uv run --env-file ../.env terraform -chdir=infra output url  # the link to share
uv run --env-file ../.env terraform -chdir=infra destroy     # remove it all; `apply` brings it back

# Live date instead of the replay day:
uv run --env-file ../.env terraform -chdir=infra apply -var demo_today=""
# Service logs:
gcloud run services logs read supervisor-demo --region me-central1 --limit 50
```

Deployed 7 Nov 2026 (`adk web`), redeployed 17 Nov with the API and Model Armor:
`https://heat-safe.example.invalid`. Start at `/docs`; the ADK chat page is at `/dev-ui`.
It runs with `HEAT_SAFE_TODAY=2025-07-31`, so "tomorrow" is the hot 1 Aug 2025 replay day.

Verified on 17 Nov:
- `/docs` and `/dev-ui` return 200.
- `/sites/mussafah/conditions` returns 24 hours.
- `/monitor/replay` streams `plan`, 24 `reading`, 2 `alert`, `replan`, `done`.
- `/agent/chat`:
  - a normal plan in 18.5 s (armor passed, grounding passed)
  - a phone and passport number replaced before Gemini (`input: redacted`)
  - an injection blocked in 2.1 s
- No raw personal data in that session's `telemetry.agent_events` rows.

| File | Role |
|---|---|
| `../Dockerfile` | The image: Python 3.12, `uv sync --frozen`, the code, the runtime data, `uvicorn server:app` |
| `../.gcloudignore` | What `gcloud builds submit` uploads (and what it must not: `.env`, `.venv`, most of `data/`) |
| `versions.tf` | Terraform and provider versions; local state; the quota project Sensitive Data Protection needs |
| `variables.tf` | Project, region, demo date |
| `main.tf` | APIs, image registry, build account and bucket, the build step, the agent's account and roles, the Cloud Run service, public access |
| `model_armor.tf` | Model Armor and Sensitive Data Protection templates that screen the agent's input, guidance text and answers |
| `outputs.tf` | `url`, `image` |
| `.terraform.lock.hcl` | Exact provider version and checksums (commit it, like `uv.lock`) |
| `terraform.tfstate` | What Terraform created (gitignored, local, **don't delete it**: without it Terraform forgets it owns these resources) |

## What changes for production

| Demo (now) | Production (with the real frontend) |
|---|---|
| `allUsers` invoker, public | IAP (Google sign-in) or IAM-only invoker, behind the frontend |
| ~~`adk web` dev UI~~ | Done 15 Nov: `server.py` (FastAPI) serves the API; the dev UI stays at `/dev-ui` for the demo |
| In-memory sessions, 1 instance | `--session_service_uri` (Cloud SQL / Vertex AI sessions); scale out freely |
| Image built by `local-exec` in `apply` | CI (Cloud Build trigger or GitHub Actions) builds on merge; Terraform gets the tag |
| Local `terraform.tfstate` | GCS backend (`heat-safe-example-tfstate`, versioned) so the team shares state with locking |
| One environment | `dev` and `prod` workspaces or folders, same modules, different variables |
| Model Armor in `asia-south1` | A UAE region once Model Armor offers one; `PERSON_NAME` with a custom dictionary of site and role words to exclude |
| Demo and eval traffic mixed in `telemetry.agent_events` | A source label per environment |
| Pinned `HEAT_SAFE_TODAY` | Real date and live forecast |
| The hand-made data bucket | Imported into Terraform with an `import` block |

## Design decisions

- **Every service has its own least-privilege account.** The agent's account has only the roles its tools need
  (`main.tf`), not the default compute account.
- **Data stays in the UAE where the service exists** (`me-central1`), and every default location is checked, not
  just the configured ones. The exception is Model Armor in `asia-south1`, because there is no UAE region yet
  (`model_armor.tf`).
- **The image tag is a hash of its inputs,** so `apply` rebuilds only when the code or data changes.
- **One instance,** because sessions live in memory (see "What changes for production").
- **Public on purpose and short-lived,** so the risk and the cost are written down.
- **We verify the deployment, not just the deploy:** the checks listed above.
- **Model Armor is infrastructure.** Its templates are in Terraform, and so is the decision against using
  `PERSON_NAME`, which would rewrite site names and crew roles.
