#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
离线自检 Native Messaging 主机：不需要浏览器。

用法（先把 commands.test.json 复制成 host 目录下的 commands.json）：
    python tests/host_test.py <host 目录>
"""

from __future__ import annotations

import json
import queue
import shutil
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def encode(payload: dict) -> bytes:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return struct.pack("<i", len(body)) + body


class Host:
    def __init__(self, exe: Path):
        self.proc = subprocess.Popen(
            [str(exe)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        assert self.proc.stdin and self.proc.stdout
        # Windows 的管道不支持 select，用读线程 + 队列做超时
        self._messages: queue.Queue = queue.Queue()
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self) -> None:
        try:
            while True:
                header = self.proc.stdout.read(4)
                if len(header) < 4:
                    break
                size = struct.unpack("<i", header)[0]
                body = self.proc.stdout.read(size)
                self._messages.put(json.loads(body.decode("utf-8")))
        except Exception:
            pass

    def send(self, payload: dict) -> None:
        self.proc.stdin.write(encode(payload))
        self.proc.stdin.flush()

    def read(self, timeout: float = 10.0):
        """读一条消息；超时返回 None。"""
        try:
            return self._messages.get(timeout=timeout)
        except queue.Empty:
            return None

    def collect_until_exit(self, timeout: float = 30.0):
        """收到 exit 为止，返回 (日志行列表, exit 消息)。"""
        lines: list[str] = []
        deadline = time.time() + timeout
        while time.time() < deadline:
            msg = self.read(timeout=deadline - time.time())
            if msg is None:
                break
            if msg.get("type") == "log":
                lines.append(f"{msg.get('stream')}:{msg.get('line')}")
            elif msg.get("type") == "exit":
                return lines, msg
            elif msg.get("type") == "error":
                lines.append(f"error:{msg.get('message')}")
        return lines, None

    def close(self) -> None:
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    host_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if host_dir is None or not (host_dir / "MediaHouseScraperHost.exe").exists():
        print("用法: python tests/host_test.py <包含 MediaHouseScraperHost.exe 的目录>", file=sys.stderr)
        return 1

    shutil.copy(ROOT / "tests" / "commands.test.json", host_dir / "commands.json")

    failures: list[str] = []
    host = Host(host_dir / "MediaHouseScraperHost.exe")

    try:
        # 1) list
        host.send({"action": "list"})
        msg = host.read()
        ids = [c["id"] for c in (msg or {}).get("commands", [])]
        print(f"[list] {ids}")
        if msg is None or msg.get("type") != "commands" or "echo" not in ids:
            failures.append("list 没有返回预期的命令列表")

        # 2) 普通命令：stdout + exit 0
        host.send({"action": "run", "commandId": "echo", "params": {}, "context": {}})
        lines, exit_msg = host.collect_until_exit()
        print(f"[echo] {lines} -> exit={exit_msg and exit_msg.get('code')}")
        if not any("hello-from-cmd" in line for line in lines):
            failures.append("echo 没有输出 hello-from-cmd")
        if not exit_msg or exit_msg.get("code") != 0:
            failures.append("echo 退出码不是 0")

        # 3) stderr 捕获
        host.send({"action": "run", "commandId": "err", "params": {}, "context": {}})
        lines, exit_msg = host.collect_until_exit()
        print(f"[err] {lines}")
        if not any(line.startswith("stderr:") and "oops-to-stderr" in line for line in lines):
            failures.append("没有捕获到 stderr")

        # 4) 取消
        host.send({"action": "run", "commandId": "slow", "params": {}, "context": {}})
        started = host.read()
        if not started or started.get("type") != "started":
            failures.append("slow 没有返回 started")
        else:
            run_id = started["runId"]
            first_log = host.read()
            print(f"[slow] first={first_log and first_log.get('line')!r}")
            host.send({"action": "cancel", "runId": run_id})
            deadline = time.time() + 10
            saw_exit = None
            while time.time() < deadline:
                msg = host.read(timeout=deadline - time.time())
                if msg is None:
                    break
                if msg.get("type") == "exit":
                    saw_exit = msg
                    break
            print(f"[slow] exit={saw_exit}")
            if saw_exit is None:
                failures.append("取消后没有收到 exit")

        # 5) 同一连接上继续可用
        host.send({"action": "ping"})
        msg = host.read()
        print(f"[ping] {msg}")
        if not msg or msg.get("type") != "pong":
            failures.append("取消后连接不可用")
    finally:
        host.close()

    print()
    if failures:
        print("❌ 失败:")
        for item in failures:
            print(f"   - {item}")
        return 1

    print("✅ 主机自检通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
