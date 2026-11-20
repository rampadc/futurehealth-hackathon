"""Maintain one bot-owned preview status comment without access codes."""

import argparse
import json
import os
import re
from urllib.request import Request, urlopen
from urllib.error import HTTPError

MARKER = "<!-- heat-safe-preview -->"


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def request(method, path, body=None):
    url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/{path}"
    payload = json.dumps(body).encode() if body is not None else None
    req = Request(url, data=payload, method=method, headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Accept": "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28"})
    with urlopen(req, timeout=20) as response:
        return json.load(response) if response.status != 204 else None


def body(pr, status, sha, url):
    require(re.fullmatch(r"[1-9][0-9]*", pr), "invalid PR number")
    require(status in ("deployed", "removed"), "invalid status")
    require(re.fullmatch(r"[a-f0-9]{40}", sha), "invalid SHA")
    if status == "deployed":
        require(url.startswith("https://") and "\n" not in url and ")" not in url, "invalid preview URL")
        location = f"Preview: {url}\n"
        access = "Access codes: request them privately from an authorized maintainer. The codes are never posted here.\n"
    else:
        location = "Preview: removed\n"
        access = "Access code: removed with the preview.\n"
    return f"{MARKER}\nHeat Safe preview status: **{status}**\n{location}Deployed commit: `{sha}`\n{access}"


def update(pr, status, sha, url):
    content = body(pr, status, sha, url)
    existing = []
    page = 1
    while True:
        comments = request("GET", f"issues/{pr}/comments?per_page=100&page={page}")
        existing.extend(comment for comment in comments if comment["user"]["login"] == "github-actions[bot]" and MARKER in comment["body"])
        if len(comments) < 100:
            break
        page += 1
    if existing:
        request("PATCH", f"issues/comments/{existing[0]['id']}", {"body": content})
        for duplicate in existing[1:]:
            request("DELETE", f"issues/comments/{duplicate['id']}")
    elif status == "deployed":
        request("POST", f"issues/{pr}/comments", {"body": content})


def mark_reconciled(removed_prs):
    if not removed_prs:
        return
    require(re.fullmatch(r"[1-9][0-9]*(?:,[1-9][0-9]*)*", removed_prs), "invalid reconciled PR list")
    for number in removed_prs.split(","):
        try:
            pr = request("GET", f"pulls/{number}")
        except HTTPError as exc:
            if exc.code == 404:
                continue
            raise
        base = pr["base"]
        head_repo = pr["head"].get("repo") or {}
        if (pr["number"] == int(number) and pr["state"] == "closed" and base["ref"] == "main"
                and base["repo"]["id"] == 1444949018 and base["repo"]["owner"]["id"] == 5560025
                and head_repo.get("id") == 1444949018):
            update(number, "removed", pr["head"]["sha"], "")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pr")
    parser.add_argument("--status", choices=("deployed", "removed"))
    parser.add_argument("--sha")
    parser.add_argument("--url", default="")
    parser.add_argument("--removed-prs")
    args = parser.parse_args()
    if args.removed_prs is not None:
        mark_reconciled(args.removed_prs)
    else:
        if not (args.pr and args.status and args.sha):
            parser.error("--pr, --status, and --sha are required")
        update(args.pr, args.status, args.sha, args.url)
