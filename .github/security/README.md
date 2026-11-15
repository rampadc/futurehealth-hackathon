# Security gate

This is a deliberately reduced adaptation of [rampadc/generic-security-task](https://github.com/rampadc/generic-security-task). It keeps the dependency between successful security checks and deployment, but runs only SAST and dependency auditing. It does not require Codex, Aikido, a Semgrep account, or GitHub Code Security.

Semgrep Community Edition scans with the official Python, JavaScript and TypeScript security rules at the commit pinned in `ci.yml`, plus the local rules. ERROR findings and scanner/configuration errors fail the job; metrics and version telemetry are disabled. The upstream `dangerous-subprocess-use-audit` heuristic is excluded because the reviewed matches use explicit argv lists in tests and the trusted deployment controller; the local `shell=True` rule remains blocking.

Trivy scans library dependencies in the application uv lock, the current frontend npm lock and the fully resolved solver requirements, including development dependencies. Fixable HIGH/CRITICAL findings fail the gate. Container, secret and cloud-configuration scanning are intentionally outside this stage. Tool releases, checksums and action commits are pinned in the workflow.

Do not suppress a failing security gate to obtain a deployment. Update dependencies or fix code; a false-positive exclusion needs a specific documented rationale and review.
