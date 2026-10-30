#!/usr/bin/env python3
"""CI-only NGINX 1.24 policy replica; never contacts a deployment host.

The fixture uses a private disposable self-signed TEST certificate, trusted only by
this process, and synthetic canaries. It proves selected-vhost logging semantics,
not production TLS/routing correctness or global/default-server redaction.
"""

import argparse
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote
import uuid


HOST = "mt-workspace.fixture.invalid"
LABEL = "mt.workspace.sso-log-fixture"
POLICY_VARIABLES = {
    "time_iso8601", "server_name", "request_method", "uri", "server_protocol",
    "status", "body_bytes_sent", "request_time", "upstream_status",
    "upstream_response_time", "request_id",
}
LOG_FIELDS = {
    "time", "server", "method", "path", "protocol", "status", "bytes",
    "request_seconds", "upstream_status", "upstream_seconds", "request_id",
}


def require(condition):
    if not condition:
        raise AssertionError("Fixture invariant failed")


def execute(arguments, timeout=30):
    result = subprocess.run(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, check=False)
    require(result.returncode == 0)
    return result.stdout.decode("utf-8", "strict")


def policy_source():
    source = Path(__file__).with_suffix(".conf").read_text(encoding="utf-8")
    match = re.search(r"log_format mt_workspace_prod_safe escape=json\s+(.*?);", source, re.S)
    require(match is not None)
    require(set(re.findall(r"\$([a-zA-Z_][a-zA-Z0-9_]*)", match[1])) == POLICY_VARIABLES)
    require(source.count("error_log /dev/null crit;") == 2)
    require(source.count("access_log /fixture/logs/safe-access.log mt_workspace_prod_safe;") == 2)
    require(source.index("log_format mt_workspace_prod_safe") < source.index("access_log"))
    return source


def port_for(container_id, container_port):
    value = execute(["docker", "port", container_id, f"{container_port}/tcp"]).strip()
    match = re.fullmatch(r"127\.0\.0\.1:(\d{1,5})", value)
    require(match is not None)
    port = int(match[1])
    require(1024 <= port <= 65535)
    return port


def wait_for_tls(port, context):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        try:
            timeout = min(1, max(0.01, deadline - time.monotonic()))
            with socket.create_connection(("127.0.0.1", port), timeout=timeout) as raw:
                with context.wrap_socket(raw, server_hostname=HOST):
                    return
        except (OSError, ssl.SSLError):
            remaining = deadline - time.monotonic()
            if remaining > 0:
                time.sleep(min(0.1, remaining))
    raise AssertionError("Trusted fixture TLS readiness deadline exceeded")


def request(port, target, *, method="GET", headers=None, body=b"", context=None,
            default_server=False):
    # No DNS resolution: both HTTP and HTTPS always connect to explicit loopback.
    stream = socket.create_connection(("127.0.0.1", port), timeout=5)
    try:
        if context is not None:
            # IP SAN validates the missing/unknown-SNI default-server control too.
            peer_name = "127.0.0.1" if default_server else HOST
            stream = context.wrap_socket(stream, server_hostname=peer_name)
        protocol = "HTTP/1.0" if default_server else "HTTP/1.1"
        values = {"Connection": "close"}
        if not default_server:
            values["Host"] = HOST
        values.update(headers or {})
        if body:
            values["Content-Length"] = str(len(body))
        raw = f"{method} {target} {protocol}\r\n"
        raw += "".join(f"{key}: {value}\r\n" for key, value in values.items())
        stream.sendall(raw.encode("ascii") + b"\r\n" + body)
        response = http.client.HTTPResponse(stream)
        response.begin()
        status = response.status
        location = response.getheader("Location", "")
        response.read(8192)
        response.close()
        return status, location
    finally:
        stream.close()


def read_logs(directory):
    values = {}
    for name in ("safe-access.log", "default-access.log", "default-error.log"):
        filename = directory / "logs" / name
        if filename.exists():
            require(filename.stat().st_size <= 256 * 1024)
        values[name] = filename.read_text(encoding="utf-8") if filename.exists() else ""
    return values


def run(image):
    require(re.fullmatch(r"(?:docker\.io/library/)?nginx(?::1\.24\.0)?@sha256:[a-f0-9]{64}", image))
    source = policy_source()
    nonce = uuid.uuid4().hex
    container_name = f"mt-sso-log-{nonce}"
    require(re.fullmatch(r"mt-sso-log-[a-f0-9]{32}", container_name))
    parent = Path(os.environ.get("RUNNER_TEMP", tempfile.gettempdir())).resolve(strict=True)
    directory = Path(tempfile.mkdtemp(prefix="mt-nginx-sso-policy-", dir=parent))
    recorded = directory.resolve(strict=True)
    container_id = None
    phase = "prepare_private_fixture"
    result = None
    try:
        os.chmod(directory, 0o700)
        (directory / "logs").mkdir(mode=0o700)
        (directory / "nginx.conf").write_text(source, encoding="utf-8")
        execute([
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "1", "-nodes",
            "-subj", f"/CN={HOST}", "-addext",
            f"subjectAltName=DNS:{HOST},DNS:default.fixture.invalid,IP:127.0.0.1",
            "-keyout", str(directory / "test-key.pem"), "-out", str(directory / "test-cert.pem"),
        ])
        os.chmod(directory / "test-key.pem", 0o600)
        context = ssl.create_default_context(cafile=str(directory / "test-cert.pem"))
        require(context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED)

        phase = "create_owned_loopback_container"
        container_id = execute([
            "docker", "create", "--name", container_name, "--label", f"{LABEL}={nonce}",
            "--platform", "linux/amd64",
            "--publish", "127.0.0.1::8080", "--publish", "127.0.0.1::8443",
            "--volume", f"{directory}:/fixture:rw", "--entrypoint", "nginx", image,
            "-c", "/fixture/nginx.conf", "-g", "daemon off;",
        ], timeout=120).strip()
        require(re.fullmatch(r"[a-f0-9]{64}", container_id))
        require(execute(["docker", "image", "inspect", "--format", "{{.Os}} {{.Architecture}}", image]).strip()
                == "linux amd64")
        execute(["docker", "start", container_id])
        version = subprocess.run(["docker", "exec", container_id, "nginx", "-v"],
                                 capture_output=True, timeout=10, check=False)
        require(version.returncode == 0)
        require(version.stderr.decode("utf-8").strip() == "nginx version: nginx/1.24.0")
        execute(["docker", "exec", container_id, "nginx", "-t", "-c", "/fixture/nginx.conf"])
        http_port = port_for(container_id, 8080)
        https_port = port_for(container_id, 8443)

        phase = "trusted_tls_readiness"
        # Handshake only: no HTTP request or extra access-log record.
        wait_for_tls(https_port, context)

        phase = "synthetic_selected_vhost_canaries"
        marker = f"SYNTHETIC_SSO_CANARY_{nonce}"
        headers = {
            "Referer": f"https://{HOST}/login?returnTo={marker}_REFERER",
            "User-Agent": f"{marker}_AGENT",
            "Cookie": f"synthetic_fixture={marker}_COOKIE",
            "Authorization": f"Basic {marker}_DUMMY_AUTH",
        }
        cases = [
            ("/api/integrations/smart-search/authorize?code=" + marker + "_CODE&state=" + marker, 400),
            ("/login?returnTo=" + quote("/api/integrations/smart-search/authorize?code=" + marker,
                                        safe=""), 200),
            ("/api/health?probe=" + marker, 200),
            ("/upstream-failure?probe=" + marker, 502),
        ]
        for target, expected in cases:
            status, _ = request(https_port, target, headers=headers, context=context)
            require(status == expected)
        status, _ = request(https_port, "/api/integrations/smart-search/introspect",
                            method="POST", headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
                            body=("token=" + marker + "_BODY&token_type_hint=access_token").encode("ascii"),
                            context=context)
        require(status == 401)
        status, location = request(http_port, "/login?returnTo=" + marker, headers=headers)
        require(status == 301 and location == f"https://{HOST}/login?returnTo={marker}")

        phase = "default_server_scope_controls"
        outside = f"SYNTHETIC_DEFAULT_SCOPE_{nonce}"
        for port, tls in ((http_port, None), (https_port, context)):
            status, _ = request(port, "/default-missing?probe=" + outside,
                                headers={"Referer": f"https://default.fixture.invalid/?probe={outside}"},
                                context=tls, default_server=True)
            require(status == 404)

        phase = "bounded_log_assertions"
        logs = read_logs(directory)
        for _ in range(50):
            if len(logs["safe-access.log"].splitlines()) >= 6 and outside in logs["default-error.log"]:
                break
            time.sleep(0.1)
            logs = read_logs(directory)
        rows = [json.loads(line) for line in logs["safe-access.log"].splitlines()]
        require(len(rows) == 6)
        require(all(set(row) == LOG_FIELDS for row in rows))
        require(all(row["server"] == HOST and "?" not in row["path"] for row in rows))
        require(all(re.fullmatch(r"[a-f0-9]{32}", row["request_id"]) for row in rows))
        require(sorted(row["status"] for row in rows) == ["200", "200", "301", "400", "401", "502"])
        require(any(row["status"] == "502" and row["upstream_status"] == "502" for row in rows))
        require(all(marker not in raw for raw in logs.values()))
        require(outside in logs["default-access.log"] and outside in logs["default-error.log"])
        require(outside not in logs["safe-access.log"])
        result = {
            "policy_pass": True, "nginx_1_24_0_verified": True,
            "safe_access_records": len(rows), "selected_vhost_canary_matches": 0,
            "default_scope_negative_control": True, "tls_certificate_verified": True,
            "scope": "isolated selected-vhost policy only; production TLS/routing not tested",
        }
    except Exception:
        raise RuntimeError(f"NGINX fixture failed during {phase}") from None
    finally:
        if container_id:
            require(re.fullmatch(r"[a-f0-9]{64}", container_id))
            ownership = execute(["docker", "inspect", "--format",
                                 '{{.Id}} {{index .Config.Labels "' + LABEL + '"}}', container_id]).strip()
            require(ownership == f"{container_id} {nonce}")
            execute(["docker", "rm", "--force", "--volumes", container_id])
        require(not directory.is_symlink())
        require(directory.resolve(strict=True) == recorded)
        require(recorded.parent == parent)
        require(re.fullmatch(r"mt-nginx-sso-policy-[a-zA-Z0-9_-]+", recorded.name))
        shutil.rmtree(recorded)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", help="Immutable official nginx@sha256 digest resolved from nginx:1.24.0")
    parser.add_argument("--self-check", action="store_true", help="Pure static validation; no files, Docker or network")
    arguments = parser.parse_args()
    try:
        if arguments.self_check:
            policy_source()
            print(json.dumps({"static_policy_check": True, "runtime_executed": False}))
        else:
            require(arguments.image is not None)
            print(json.dumps(run(arguments.image)))
    except Exception:
        # Never emit raw subprocess output, log lines, URLs, certificate or key data.
        print(json.dumps({"policy_pass": False, "diagnostic": "isolated fixture failed"}))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
