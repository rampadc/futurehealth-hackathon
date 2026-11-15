"""Validate GitHub events before any privileged cloud operation."""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

REPO_ID = 1444949018
OWNER_ID = 5560025
CI_NAME = "Heat Safe CI"
PROTECTED = (".github/workflows/", ".github/security/", "01_population-health_climate-worker/cloud/")


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def api(path):
    url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/{path}"
    req = Request(url, headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    with urlopen(req, timeout=20) as response:
        return json.load(response)


def validate_repository(repo):
    require(repo.get("id") == REPO_ID, "unexpected repository ID")
    require(repo.get("owner", {}).get("id") == OWNER_ID, "unexpected owner ID")


def validate_run(event, current_main, get_pr, get_files, get_artifacts):
    validate_repository(event["repository"])
    run = event["workflow_run"]
    validate_repository(run["repository"])
    validate_repository(run["head_repository"])
    require(run["name"] == CI_NAME and run["conclusion"] == "success", "CI did not succeed")
    require(run["status"] == "completed", "CI is incomplete")
    require(run["path"].split("@")[0] == ".github/workflows/ci.yml", "unexpected CI workflow")
    require(re.fullmatch(r"[a-f0-9]{40}", run["head_sha"]) is not None, "invalid head SHA")
    require(re.fullmatch(r"[a-f0-9]{40}", current_main) is not None, "invalid main SHA")
    if run["event"] == "push":
        require(run["head_branch"] == "main" and run["head_sha"] == current_main, "stale main run")
        values = {"kind": "main", "sha": run["head_sha"], "run_id": str(run["id"])}
    else:
        require(run["event"] == "pull_request", "unsupported CI event")
        prs = run.get("pull_requests") or []
        require(len(prs) == 1, "CI run must identify exactly one PR")
        number = prs[0]["number"]
        require(type(number) is int and number > 0, "invalid PR number")
        pr = get_pr(number)
        require(pr["number"] == number and pr["state"] == "open", "PR is closed")
        validate_repository(pr["base"]["repo"])
        validate_repository(pr["head"]["repo"])
        require(pr["base"]["ref"] == "main", "PR does not target main")
        require(pr["head"]["sha"] == run["head_sha"], "PR head changed after CI")
        files = list(get_files(number))
        require(len(files) == pr["changed_files"], "incomplete PR file list")
        for filename in files:
            require(not filename.startswith(PROTECTED), f"PR changes trusted control plane: {filename}")
        values = {"kind": "preview", "sha": run["head_sha"], "run_id": str(run["id"]), "pr": str(number)}
    artifacts = get_artifacts(run["id"])
    matching = [item for item in artifacts if item["name"] == f"heat-safe-image-{run['head_sha']}" and not item["expired"]]
    require(len(matching) <= 1, "ambiguous image artifact")
    values["ready"] = "true" if matching else "false"
    return values


def validate_closed(event, get_pr):
    validate_repository(event["repository"])
    require(event["action"] == "closed", "PR is not closed")
    closed = event["pull_request"]
    validate_repository(closed["base"]["repo"])
    require(closed["base"]["ref"] == "main" and closed["state"] == "closed", "wrong cleanup target")
    number = closed["number"]
    require(type(number) is int and number > 0, "invalid PR number")
    current = get_pr(number)
    require(current["number"] == number, "current PR number changed")
    validate_repository(current["base"]["repo"])
    require(current["base"]["ref"] == "main", "current PR has wrong base")
    event_head_repo = closed["head"].get("repo") or {}
    current_head_repo = current["head"].get("repo") or {}
    same_repo = event_head_repo.get("id") == REPO_ID and current_head_repo.get("id") == REPO_ID
    ready = current["state"] == "closed" and same_repo
    values = {"kind": "cleanup", "pr": str(number), "ready": "true" if ready else "false"}
    if ready:
        sha = current["head"]["sha"]
        require(re.fullmatch(r"[a-f0-9]{40}", sha), "invalid current PR SHA")
        values["sha"] = sha
    return values


def pr_files(number):
    page = 1
    while True:
        items = api(f"pulls/{number}/files?per_page=100&page={page}")
        for item in items:
            yield item["filename"]
        if len(items) < 100:
            break
        page += 1


def write_outputs(values):
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        for key, value in values.items():
            require(re.fullmatch(r"[A-Za-z0-9_.-]+", value) is not None, f"unsafe output: {key}")
            output.write(f"{key}={value}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("run", "closed"))
    args = parser.parse_args()
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    if args.mode == "run":
        current_main = api("git/ref/heads/main")["object"]["sha"]
        require(current_main == os.environ["TRUSTED_SHA"], "trusted checkout is no longer current main")
        values = validate_run(event, current_main, lambda n: api(f"pulls/{n}"), pr_files, lambda n: api(f"actions/runs/{n}/artifacts?per_page=100")["artifacts"])
        values["trusted_sha"] = current_main
    else:
        values = validate_closed(event, lambda n: api(f"pulls/{n}"))
    write_outputs(values)


if __name__ == "__main__":
    try:
        main()
    except (KeyError, TypeError, ValueError) as exc:
        print(f"::error::{exc}", file=sys.stderr)
        raise SystemExit(1)
