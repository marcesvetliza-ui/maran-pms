#!/usr/bin/env python3
"""Inventario público y local de solo lectura. No consulta datos del hotel.

Ejecutar desde el checkout elegido: python docs/xenia/relevar_entorno.py --output ...
No modifica servicios, DNS, variables, ramas remotas ni datos operativos.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.request


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    report = {
        "checked_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scope": "Lectura de referencias Git, fuentes locales, DNS y health públicos. Sin datos de huéspedes ni valores de secretos.",
        "branch": git("branch", "--show-current"),
        "checkout_revision": git("rev-parse", "HEAD"),
        "remote_refs": {},
        "comparisons": {},
        "hosts": [],
        "credential_presence_only": {
            name: bool(os.environ.get(name))
            for name in ("RAILWAY_TOKEN", "RAILWAY_XENIA_TOKEN")
        },
    }
    for name in ("main", "feature/xenia-channex-staging", "advance/assistant-pilot-20261114"):
        ref = "origin/" + name
        report["remote_refs"][name] = git("rev-parse", ref)
        if name != "main":
            left, right = git("rev-list", "--left-right", "--count", "origin/main..." + ref).split()
            report["comparisons"][name] = {
                "commits_only_main": int(left),
                "commits_only_other_branch": int(right),
                "merge_base": git("merge-base", "origin/main", ref),
                "diff_summary": git("diff", "--shortstat", "origin/main", ref),
                "meaning": "Conteos de commits, no de funcionalidades ni de calidad.",
            }
    for host in ("maranpms.com.ar", "demo.maranpms.com.ar"):
        entry = {"host": host, "checked_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            entry["dns_resolves"] = bool(socket.getaddrinfo(host, 443))
            req = urllib.request.Request(
                "https://" + host + "/api/health?check=" + str(time.time_ns()),
                headers={"User-Agent": "xenia-readonly-inventory/1.0", "Cache-Control": "no-cache"},
            )
            with urllib.request.urlopen(req, timeout=20) as response:
                data = json.load(response)
                entry["http_status"] = response.status
                entry["health"] = {key: data[key] for key in (
                    "status", "database", "revision", "financialReady",
                    "otaIntegrationPrepared", "otaProductionEnabled"
                ) if key in data}
        except Exception as error:
            entry["error"] = type(error).__name__
        report["hosts"].append(entry)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
