#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""端到端验证「内置动作：搜刮并上传」。

前置：后端已启动，且已有一部 id 为 <media_id> 的影片。
流程：配置一个假搜刮器作为 scrape-upload 命令 → 执行 → 断言收到 4 个步骤日志且退出码 0。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from host_test import Host  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    if len(sys.argv) < 5:
        print("用法: python tests/upload_test.py <host目录> <后端地址> <token> <mediaId>", file=sys.stderr)
        return 1

    host_dir = Path(sys.argv[1])
    server_url = sys.argv[2].rstrip("/")
    token = sys.argv[3]
    media_id = sys.argv[4]

    fake = ROOT / "tests" / "fake_scrape.ps1"
    (host_dir / "commands.json").write_text(
        json.dumps(
            {
                "commands": [
                    {
                        "id": "fake-catch",
                        "name": "假搜刮并上传",
                        "type": "scrape-upload",
                        # 用 PowerShell 写假产出：比 python 在此环境下更可靠，
                        # 且同样走完整的「建临时目录 → 执行 → 打包 → 上传」路径
                        "executable": "powershell.exe",
                        "args": [
                            "-NoProfile",
                            "-ExecutionPolicy", "Bypass",
                            "-File", str(fake),
                            "-Num", "${num}",
                            "-Out", "${outputDir}",
                        ],
                        "timeoutSeconds": 120,
                    }
                ]
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    host = Host(host_dir / "MediaHouseScraperHost.exe")
    try:
        host.send({"action": "list"})
        listing = host.read()
        ids = [c["id"] for c in (listing or {}).get("commands", [])]
        print(f"[list] {ids}")
        if "fake-catch" not in ids:
            print("❌ 命令列表里没有 fake-catch")
            return 1

        host.send(
            {
                "action": "run",
                "commandId": "fake-catch",
                "params": {},
                "context": {
                    "mediaId": media_id,
                    "serverUrl": server_url,
                    "token": token,
                    "title": "test",
                },
            }
        )

        logs, exit_msg = host.collect_until_exit(timeout=300)
        for line in logs:
            print(f"  {line}")

        if exit_msg is None:
            print("❌ 没有收到 exit")
            return 1
        if exit_msg.get("code") != 0:
            print(f"❌ 退出码 {exit_msg.get('code')}")
            return 1

        joined = "\n".join(logs)
        for step in ("[1/4]", "[2/4]", "[3/4]", "[4/4]"):
            if step not in joined:
                print(f"❌ 缺少日志阶段 {step}")
                return 1

        print("✅ 搜刮上传流程通过")
        return 0
    finally:
        host.close()


if __name__ == "__main__":
    sys.exit(main())
