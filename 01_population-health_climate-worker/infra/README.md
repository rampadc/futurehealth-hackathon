# `infra/`: the team demo on Cloud Run (Terraform)

A **short-lived, public** deployment of the Heat-Safe API (`../server.py`): the REST and streaming
endpoints, the agent chat, and the ADK dev UI at `/dev-ui`, so teammates can call it from their frontend. Anyone with the URL can use it and spend the project's
Gemini budget, so **destroy it when the demo is over**.

```bash
# From 01_population-health_climate-worker/. --env-file ../.env (it lives at the repo root): Terraform
# and gcloud must use the heat-safe credentials, never the work ADC (README "Credentials")
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
`https://supervisor-demo-6zb6rqbehq-ww.a.run.app`. Start at `/docs`; the ADK chat page is at `/dev-ui`.
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

**Tell teammates two things:**
- **Everyone shares one session list.** `adk web` keeps sessions in memory under one user, so you may
  see each other's chats. Don't type anything private.
- **Chats disappear** when the service scales to zero, after about 15 minutes idle.

| File | Role |
|---|---|
| `../Dockerfile` | The image: Python 3.12, `uv sync --frozen`, the code, the runtime data, `uvicorn server:app` |
| `../.gcloudignore` | What `gcloud builds submit` uploads (and what it must not: `.env`, `.venv`, most of `data/`) |
| `versions.tf` | Terraform and provider versions; local state; the quota project Sensitive Data Protection needs |
| `variables.tf` | Project, region, demo date |
| `main.tf` | APIs, image registry, build account and bucket, the build step, the agent's account and roles, the Cloud Run service, public access |
| `model_armor.tf` | Model Armor and Sensitive Data Protection templates that screen the agent's input, guidance text and answers (note 9) |
| `outputs.tf` | `url`, `image` |
| `.terraform.lock.hcl` | Exact provider version and checksums (commit it, like `uv.lock`) |
| `terraform.tfstate` | What Terraform created (gitignored, local, **don't delete it**: without it Terraform forgets it owns these resources) |

## Reading order

| # | File | Lines | Question to answer |
|---|---|---|---|
| 1 | `../Dockerfile` | all | Why are the dependencies installed before the code is copied? |
| 2 | `../.gcloudignore` | all | Which files does the agent read at run time, and why is `!data/heat_safe/raw/weather/` needed? |
| 3 | `versions.tf` | all | What does `~> 7.0` allow, and what pins the exact version? |
| 4 | `main.tf` | `locals` | What makes a new image tag, and what would happen if `__pycache__` were in the hash? |
| 5 | `main.tf` | APIs, registry | Why `disable_on_destroy = false`? |
| 6 | `main.tf` | build account, bucket, `terraform_data` | Which three things does a build need permission for? |
| 7 | `main.tf` | agent account | Map each role to the tool call that needs it |
| 8 | `main.tf` | Cloud Run service, `public` | Why exactly one instance? What makes the URL public? |
| 9 | `terraform.tfstate` | search `"type"` | What did Terraform record about each resource? (Read only; never edit it) |

## Exercises

1. **Read a plan.** Change `memory = "1Gi"` to `"2Gi"` and run `plan`, but don't apply. Is it an
   in-place update or a replace? Change it back, then `plan` again: "No changes".
2. **Watch the hash.** Add a comment to `src/heat_safe/rules.py` and run `plan`: `terraform_data.image`
   must be replaced and the service updated. Revert, and `plan` is clean again. Now touch
   `tests/test_twl.py`: why is there no rebuild?
3. **Least privilege, proven.** Remove the `vectors_read` grant, apply, and ask the agent about
   foreman training. Find the 403 in the logs, put the grant back, apply.
4. **Destroy and rebuild.** `destroy`, then `apply`. How long does it take? Is the URL the same?
   (Cloud Run URLs derive from the service name, project and region.)
5. **Drift.** Change the service's memory in the Cloud Console, then run `plan`. Terraform shows it
   will change it back. That is drift detection, and it's why changes should go through code.
6. **Import.** Write a `google_storage_bucket` block for `future-health-513202-data` (created by hand
   on 6 Nov) and adopt it with an `import` block. `plan` must show "1 to import, 0 to change".

## Learning notes

From the first deploy on 7 Nov. It took three `apply` runs, and each failure is below.

### 1. Infrastructure and releases are different things; this repo blurs them on purpose

Terraform describes things that should **exist** (a registry, accounts, a service). An image build
is an **event** that produces an artifact. Here `terraform_data` + `local-exec` runs the build inside
`apply`, so one command does everything. That's convenient for a demo, but it has costs:
- it needs gcloud on the machine running Terraform;
- a failed build leaves the resource "tainted" (it gets replaced on the next apply; we saw this twice);
- Terraform can't see what the build does.

In real projects CI builds the image on each merge, and Terraform only receives the tag (`-var image=...`).

The detail that makes the shortcut behave: **the image tag is a hash of the image's inputs**, so
1. code changes produce a new tag, which means a new Cloud Run revision;
2. no change means no rebuild, and `plan` stays clean.

The input list is explicit (`*.py`, the data files, lockfile, Dockerfile). Hashing whole folders would
pick up `__pycache__`, and every `apply` would rebuild for nothing.

### 2. Every service has an identity, and the defaults are wrong (failures 1 and 2)

**Failure 1:** `403 ... 350411621586-compute@developer ... storage.objects.get`. With no account
given, Cloud Build ran as the Compute Engine default service account, which has no roles in this
project. The fix was not to grant it roles: that account is shared by anything that doesn't name its
own, so its permissions leak. Instead the build got **its own account**, `image-build`, with exactly:
- read and write on its staging bucket;
- push to one repository;
- write logs.

**Failure 2:** `invalid bucket ... does not have access to the bucket`. `objectAdmin` covers
*objects*, but Cloud Build first checks the *bucket* (`storage.buckets.get`). Adding
`legacyBucketReader` gave it that one permission.

Least privilege is learned like this, one denied permission at a time. The error message names the
permission; you then find the smallest role that contains it.

The agent's account works the same way: each role maps to one tool.

| Role | Used by |
|---|---|
| `aiplatform.user` | Gemini (planning) and `gemini-embedding-001` (search queries) |
| `bigquery.jobUser` | running any query |
| `bigquery.dataViewer` on `vectors` | `search_guidance` (VECTOR_SEARCH) |
| `bigquery.dataEditor` on `telemetry` | the ADK analytics plugin writing `agent_events` |

Roles on the dataset, not the project: the agent can read the guidance index, but not `raw` or `analytics`.

### 3. Defaults move your data (found while fixing failure 1)

The first failed build had already uploaded the source to an auto-created bucket,
`future-health-513202_cloudbuild`, **in the US**. Nobody chose that; it's gcloud's default. The fix was
a Terraform-owned staging bucket in `me-central1`:
- a 7-day lifecycle rule;
- public access prevention.

Cloud Build is pointed at it with `--gcs-source-staging-dir` and `--gcs-log-dir`. When data residency
matters (here: UAE), **check every default location**, not just the ones you configured.

A related default: with no `.gcloudignore`, `gcloud builds submit` uses `.gitignore`, which excludes
`data/`. The build would succeed and the image would lack the replay weather. The agent would then
fetch it live from Open-Meteo, or fail, and either way the demo would differ from the evals.
`gcloud meta list-files-for-upload` shows the real upload set. Check it before the first build.

### 4. Build where you run: arm64 vs amd64

The Mac is Apple Silicon (arm64), and Cloud Run runs amd64. A `docker build` on the Mac produces an
image Cloud Run can't start ("exec format error"), unless you use `--platform linux/amd64` with
emulation, which is slow. Cloud Build runs on amd64, so the problem doesn't arise.

### 5. One instance, because sessions live in memory

`adk web` (and `/agent/chat`, which uses an `InMemoryRunner`) stores sessions in the process's memory. With two instances, a chat's second message could
reach the instance that never saw the first. `max_instance_count = 1` avoids that, and also caps
the cost: at most one container, scaling to zero when idle (`min_instance_count = 0`,
`cpu_idle = true`). The price is a cold start of a few seconds on the first visit.

### 6. Public is a decision with a cost, so it's written down

`allUsers` → `roles/run.invoker` makes the URL public. That is fine for a short demo with a budget
alert, and wrong for anything that stays up:
- anyone who finds the URL spends Gemini tokens;
- the dev UI shows every session and trace.

The risk is managed by making it **short-lived** (`destroy`) and **visible** (this README and the
comments in `main.tf`). It is not managed by hoping nobody finds the link.

### 7. Terraform state is the memory; adopting existing resources

`terraform.tfstate` records which real resources belong to this config. Two things seen on day one:
- **Already-enabled APIs** showed as "will be created". `google_project_service` just records them,
  and `disable_on_destroy = false` makes sure `destroy` never turns off APIs the rest of the project
  needs.
- **Renaming a resource address** (`build_staging` became `build_staging["roles/storage.objectAdmin"]`
  when it gained `for_each`) would destroy and recreate the grant. `terraform state mv` told Terraform
  it was the same thing. (Newer style: a `moved {}` block in code, which reviewers can see.)

The datasets `vectors` and `telemetry` were created by scripts, so Terraform grants roles *on* them
without owning them. Exercise 6 practises adopting a resource properly.

### 8. Verify the deployment, not just the deploy

"Apply complete!" only means the API calls succeeded. The checks that proved the demo works:
- `curl` without credentials → 200 (public access);
- `/list-apps` → `["supervisor"]`;
- a planning question through `/run` → `source: cache:era5_replay_2025-08-01.csv` and work blocked from
  12:30 (the image has the data, and `HEAT_SAFE_TODAY` is set);
- the foreman-training question → `ADOSH-SF CoP 11.0, p. 5` (vector search works under the new account);
- 32 rows in `telemetry.agent_events` for user `deploy-check` (the plugin's grant works);
- `credentials ok` in the logs, and `plan` → "No changes" (no drift, no rebuild loop).

### 9. Model Armor: a guardrail is infrastructure too (16 Nov)

The agent (`../agents/supervisor/armor.py`) screens three things through Model Armor, using templates defined here:

| Template | Applied to | Filters | On a match |
|---|---|---|---|
| `heat-safe-input` | The supervisor's message, before every model call | Prompt injection and jailbreak, personal data (SDP), harmful content | Personal data alone: **replaced** (`[PHONE_NUMBER]`) and the turn continues. Anything else: blocked. |
| `heat-safe-tool` | `search_guidance` results only | Injection | Blocked (the agent sees "withheld") |
| `heat-safe-output` | The final answer | Personal data, harmful content | Replaced or blocked |

Decisions that shaped it, all found by trying:
- **Location `asia-south1` (Mumbai).** Model Armor isn't offered in `me-central1`. The `global` location lists as supported and answers reads, but creating a template there fails with "not supported in 'global' location": it takes only project-wide floor settings. Mumbai is the nearest region with templates, so screened text is processed in India. The SDP templates must be in the same location as the Model Armor ones.
- **Mumbai lacks two filters**: malicious URLs and multi-language detection ("Region 'asia-south1' does not support the requested capabilities"). Both are left out. Links are still covered by our own `check_link_grounding` (an answer may only contain URLs a tool returned), and the agent has no tool that opens a link. The gap: injection detection is strongest on English, so an attack written in Arabic or Hindi is less likely to be caught.
- **A quota project** (`user_project_override`, `billing_project`). Sensitive Data Protection refuses user credentials without one. The provider then reads project services through the Cloud Resource Manager API, which must be enabled.
- **The service agent is created explicitly** (`google_project_service_identity`, so `google-beta`). Model Armor's own account calls DLP with our templates. It only exists after first use, and you can't grant roles to an account that doesn't exist.
- **No `PERSON_NAME` detector.** It would rewrite site names and crew roles ("Mussafah", "steel fixer") and break planning. Names are the known gap: phone, email, passport, date of birth, address and Emirates ID (a custom regex) are covered.
- **No personal-data filter on guidance text.** The plugin can only block tool output, not de-identify it, and the PDFs legitimately contain phone numbers.
- **`DANGEROUS` at `HIGH` only.** First aid for heat stroke is legitimately about danger to life.
- **Fail closed** (`block_on_screening_failure`). If Model Armor is down, the agent doesn't answer. For a live demo, `HEAT_SAFE_ARMOR=0` is the documented fallback.

Telemetry: ADK keeps the original user text in the session even after Model Armor replaces it in the model request. So `telemetry.agent_events` would still store it. `armor.redact_for_log` (the analytics plugin's `content_formatter`) redacts the same types locally before any row is written, whether or not Armor is on.

## What changes for production

| Demo (now) | Production (with the real frontend) |
|---|---|
| `allUsers` invoker, public | IAP (Google sign-in) or IAM-only invoker, behind the frontend |
| ~~`adk web` dev UI~~ | Done 15 Nov: `server.py` (FastAPI) serves the API; the dev UI stays at `/dev-ui` for the demo |
| In-memory sessions, 1 instance | `--session_service_uri` (Cloud SQL / Vertex AI sessions); scale out freely |
| Image built by `local-exec` in `apply` | CI (Cloud Build trigger or GitHub Actions) builds on merge; Terraform gets the tag |
| Local `terraform.tfstate` | GCS backend (`future-health-513202-tfstate`, versioned) so the team shares state with locking |
| One environment | `dev` and `prod` workspaces or folders, same modules, different variables |
| Model Armor in `asia-south1` | A UAE region once Model Armor offers one; `PERSON_NAME` with a custom dictionary of site and role words to exclude |
| Demo and eval traffic mixed in `telemetry.agent_events` | A source label per environment |
| Pinned `HEAT_SAFE_TODAY` | Real date and live forecast |
| The hand-made data bucket | Imported into Terraform (exercise 6) |

## Next steps

- After the demo: `terraform destroy`. Then also remove the stray US bucket `future-health-513202_cloudbuild`
  (note 3), which Terraform doesn't own.
- When the frontend exists: a separate `api` service from the same image with a different `CMD`, plus the
  production column above.
