"""Start the three loopback services used by the local Heat-Safe walkthrough."""

import argparse
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
LOG_DIR = ROOT / ".local" / "logs"
WINDOWS = os.name == "nt"
SERVICES = (
    ("backend", 8001, "/api/health"),
    ("solver", 8765, "/health"),
    ("ui", 5174, "/"),
)


def venv_python(venv: Path, windows: bool = WINDOWS) -> Path:
    """The interpreter inside a virtual environment (Scripts/python.exe on Windows)."""
    return venv / ("Scripts/python.exe" if windows else "bin/python")


def npm() -> str:
    """npm is a .cmd shim on Windows, which subprocess cannot start by bare name."""
    found = shutil.which("npm")
    if not found:
        raise RuntimeError("npm not found; install Node.js 22.12 or newer")
    return found


def setup() -> None:
    subprocess.run(["uv", "sync", "--frozen"], cwd=ROOT, check=True)
    subprocess.run(["uv", "venv", "demo/solver/.venv"], cwd=ROOT, check=True)
    subprocess.run(
        ["uv", "pip", "install", "--python", str(venv_python(ROOT / "demo/solver/.venv")),
         "-r", "demo/solver/requirements.txt"],
        cwd=ROOT, check=True,
    )
    subprocess.run([npm(), "ci"], cwd=ROOT / "supervisor-ui", check=True)


def check_ports() -> None:
    for name, port, _ in SERVICES:
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError as error:
                raise RuntimeError(f"{name} port {port} is occupied; stop that service before starting the demo") from error


def ready(port: int, path: str) -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{port}{path}", timeout=1) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def log_tail(name: str) -> str:
    path = LOG_DIR / f"{name}.log"
    return "\n".join(path.read_text(errors="replace").splitlines()[-25:]) if path.exists() else ""


def kill_tree(process: subprocess.Popen, force: bool) -> None:
    """Stop a service and its children (npm starts node; uvicorn may start workers)."""
    if process.poll() is not None:
        return
    if WINDOWS:
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", *(["/F"] if force else [])],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        return
    try:
        os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)
    except ProcessLookupError:
        pass


def stop(children: list[tuple[str, subprocess.Popen, object]]) -> None:
    for _, process, _ in reversed(children):
        kill_tree(process, force=False)
    for _, process, stream in reversed(children):
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            kill_tree(process, force=True)
            process.wait()
        stream.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--setup", action="store_true", help="install pinned Python and npm dependencies first")
    args = parser.parse_args()
    if args.setup:
        setup()

    check_ports()
    solver_python = venv_python(ROOT / "demo/solver/.venv")
    if not solver_python.exists():
        raise RuntimeError("solver environment missing; rerun with --setup")
    if not (ROOT / "supervisor-ui/node_modules").exists():
        raise RuntimeError("UI dependencies missing; rerun with --setup")
    if not (ROOT / ".env").exists():
        raise RuntimeError(".env missing; create the local private credentials file first")

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    environment = os.environ.copy()
    environment.setdefault("HEAT_SAFE_LOCAL_DIR", str(ROOT / ".local/heat-safe"))
    Path(environment["HEAT_SAFE_LOCAL_DIR"]).mkdir(parents=True, exist_ok=True)
    environment.setdefault("HEAT_CASE_DB", str(Path(environment["HEAT_SAFE_LOCAL_DIR"]) / "cases.sqlite3"))
    commands = (
        ("backend", [sys.executable, "-m", "uvicorn", "heat_safe.application.api:app", "--host", "127.0.0.1", "--port", "8001"], ROOT),
        ("solver", [str(solver_python), "-m", "uvicorn", "api:app", "--app-dir", "demo/solver", "--host", "127.0.0.1", "--port", "8765"], ROOT),
        ("ui", [npm(), "run", "dev"], ROOT / "supervisor-ui"),
    )
    children: list[tuple[str, subprocess.Popen, object]] = []
    interrupted = False

    def interrupt(_signum, _frame):
        nonlocal interrupted
        interrupted = True

    previous = signal.signal(signal.SIGINT, interrupt)
    previous_term = signal.signal(signal.SIGTERM, interrupt)
    try:
        for name, command, cwd in commands:
            stream = (LOG_DIR / f"{name}.log").open("w")
            try:
                # Each service gets its own process group so Ctrl+C here stops all three cleanly.
                group = ({"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WINDOWS
                         else {"start_new_session": True})
                process = subprocess.Popen(command, cwd=cwd, env=environment, stdout=stream,
                                           stderr=subprocess.STDOUT, **group)
            except Exception:
                stream.close()
                raise
            children.append((name, process, stream))
        deadline = time.monotonic() + 60
        while not interrupted:
            failed = next((name for name, process, _ in children if process.poll() is not None), None)
            if failed:
                raise RuntimeError(f"{failed} exited during startup:\n{log_tail(failed)}")
            if all(ready(port, path) for _, port, path in SERVICES):
                break
            if time.monotonic() >= deadline:
                missing = [name for name, port, path in SERVICES if not ready(port, path)]
                raise RuntimeError("startup timed out waiting for " + ", ".join(missing) +
                                   "; logs are in .local/logs/")
            time.sleep(0.3)
        if interrupted:
            return 0
        print("Local demo ready:", flush=True)
        print("  App:          http://127.0.0.1:5174/", flush=True)
        print("  Demo controls: http://127.0.0.1:5174/demo-control", flush=True)
        print("  Backend:      http://127.0.0.1:8001/api/health", flush=True)
        print("  Solver:       http://127.0.0.1:8765/walkthrough", flush=True)
        print("Press Ctrl+C to stop all three services. Logs: .local/logs/", flush=True)
        while not interrupted:
            failed = next((name for name, process, _ in children if process.poll() is not None), None)
            if failed:
                raise RuntimeError(f"{failed} exited:\n{log_tail(failed)}")
            time.sleep(0.3)
        return 0
    finally:
        stop(children)
        signal.signal(signal.SIGINT, previous)
        signal.signal(signal.SIGTERM, previous_term)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"Local demo could not start: {error}", file=sys.stderr)
        sys.exit(1)
