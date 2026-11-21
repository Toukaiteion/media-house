#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""验证 params → 命令行参数 的拼装规则（不需要浏览器、不需要联网）。

用法: python tests/args_test.py <host 目录>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from host_test import Host  # noqa: E402


def build_commands() -> dict:
    return {
        "commands": [
            {
                "id": "argv",
                "name": "argv echo",
                "type": "process",
                "executable": "cmd.exe",
                "args": ["/c", "echo"],
                "timeoutSeconds": 30,
                "params": [
                    {"key": "text", "label": "Text", "type": "text", "default": "hello",
                     "arg": ["--text", "${value}"]},
                    {"key": "on", "label": "On", "type": "boolean", "default": "true",
                     "flagTrue": "--on", "flagFalse": "--off"},
                    {"key": "extra", "label": "Extra", "type": "text",
                     "arg": ["--extra", "${value}"]},
                ],
            },
            {
                "id": "required",
                "name": "required check",
                "type": "process",
                "executable": "cmd.exe",
                "args": ["/c", "echo", "should-not-run"],
                "timeoutSeconds": 30,
                "params": [
                    {"key": "must", "label": "必填项", "type": "text", "required": True},
                ],
            },
        ]
    }


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    if len(sys.argv) < 2:
        print("用法: python tests/args_test.py <host 目录>", file=sys.stderr)
        return 1

    host_dir = Path(sys.argv[1])
    (host_dir / "commands.json").write_text(json.dumps(build_commands(), ensure_ascii=False), encoding="utf-8")

    failures: list[str] = []
    host = Host(host_dir / "MediaHouseScraperHost.exe")

    try:
        # 1) 默认值 + boolean 为 true
        host.send({"action": "run", "commandId": "argv", "params": {}, "context": {}})
        logs, exit_msg = host.collect_until_exit()
        text = "\n".join(logs)
        print("[default]", text.replace("\n", " | "))
        if "--text hello" not in text:
            failures.append("默认值没有展开成 --text hello")
        if "--on" not in text:
            failures.append("boolean 默认 true 没有加 --on")
        if "--extra" in text:
            failures.append("空的可选参数不应该出现")

        # 2) boolean 关掉 + 额外参数
        host.send({
            "action": "run",
            "commandId": "argv",
            "params": {"text": "world", "on": "false", "extra": "xyz"},
            "context": {},
        })
        logs, exit_msg = host.collect_until_exit()
        text = "\n".join(logs)
        print("[override]", text.replace("\n", " | "))
        if "--text world" not in text:
            failures.append("参数覆盖没有生效")
        if "--off" not in text:
            failures.append("boolean false 没有加 --off")
        if "--extra xyz" not in text:
            failures.append("可选参数没有拼进去")

        # 3) 必填校验
        host.send({"action": "run", "commandId": "required", "params": {}, "context": {}})
        msg = host.read()
        print("[required]", msg)
        if not msg or msg.get("type") != "error" or "必填" not in msg.get("message", ""):
            failures.append("必填参数为空时没有报错")

        # 4) 默认值可用占位符从 context 取（模拟 catch-upload 的 ${num}）
        (host_dir / "commands.json").write_text(
            json.dumps(
                {
                    "commands": [{
                        "id": "ctx",
                        "name": "context default",
                        "type": "process",
                        "executable": "cmd.exe",
                        "args": ["/c", "echo", "-k", "${key}"],
                        "timeoutSeconds": 30,
                        "params": [{"key": "key", "label": "番号", "type": "text",
                                    "required": True, "default": "${num}"}],
                    }]
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        # 命令列表是启动时读的，这里重启一个 host 让它加载新配置
        host.close()
        host = Host(host_dir / "MediaHouseScraperHost.exe")
        host.send({"action": "run", "commandId": "ctx", "params": {}, "context": {"num": "ABC-001"}})
        logs, exit_msg = host.collect_until_exit()
        text = "\n".join(logs)
        print("[context default]", text.replace("\n", " | "))
        if "-k ABC-001" not in text:
            failures.append("默认值没有从 context 解析出番号")
    finally:
        host.close()

    print()
    if failures:
        print("❌ 失败:")
        for item in failures:
            print(f"   - {item}")
        return 1

    print("✅ 参数拼装通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
