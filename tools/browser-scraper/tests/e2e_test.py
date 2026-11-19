#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
离线端到端自检：不需要浏览器，也不需要真实的 MediaHouse 服务器。

它会：
  1. 在本机起一个假的 MediaHouse API（/api/movies/{id} + /update-metadata）
  2. 按 Chrome 的 Native Messaging 协议启动 dist/MediaHouseScraperHost.exe
  3. 校验返回的 progress/done 消息、上传的 zip 结构、NFO 内容

用法：python tests/e2e_test.py
"""

from __future__ import annotations

import io
import json
import struct
import subprocess
import sys
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOST_EXE = ROOT / "dist" / "MediaHouseScraperHost.exe"
PORT = 18777
VIDEO_PATH = "/media/Movies/TEST-001/TEST-001.mp4"

captured: dict = {}


class MockApi(BaseHTTPRequestHandler):
    def log_message(self, *_args):  # 静音
        pass

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/movies/"):
            self._json(
                {
                    "id": "1",
                    "title": "测试影片",
                    "num": "TEST-001",
                    "file_path": VIDEO_PATH,
                }
            )
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        if not self.path.endswith("/update-metadata"):
            return self._json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length", "0"))
        captured["body"] = self.rfile.read(length)
        captured["auth"] = self.headers.get("Authorization", "")
        captured["content_type"] = self.headers.get("Content-Type", "")
        self._json({"message": "Metadata updated successfully", "mediaId": 1, "title": "测试影片"})


def read_frames(stream):
    while True:
        header = stream.read(4)
        if len(header) < 4:
            return
        size = struct.unpack("<i", header)[0]
        payload = stream.read(size)
        if len(payload) < size:
            return
        yield json.loads(payload.decode("utf-8"))


def extract_zip(body: bytes) -> zipfile.ZipFile:
    start = body.find(b"PK\x03\x04")
    eocd = body.rfind(b"PK\x05\x06")
    if start < 0 or eocd < 0:
        raise AssertionError("上传内容里找不到 zip 数据")
    comment_len = struct.unpack("<H", body[eocd + 20 : eocd + 22])[0]
    end = eocd + 22 + comment_len
    return zipfile.ZipFile(io.BytesIO(body[start:end]))


def main() -> int:
    # Windows 控制台默认 cp936，不重设的话中文和 ✅ 会直接抛 UnicodeEncodeError
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    if not HOST_EXE.exists():
        print(f"找不到 {HOST_EXE}，先运行 build.ps1", file=sys.stderr)
        return 1

    server = ThreadingHTTPServer(("127.0.0.1", PORT), MockApi)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    message = {
        "action": "scrapeAndUpload",
        "media_id": "1",
        "server_url": f"http://127.0.0.1:{PORT}",
        "token": "test-token",
    }
    raw = json.dumps(message, ensure_ascii=False).encode("utf-8")

    proc = subprocess.Popen(
        [str(HOST_EXE)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert proc.stdin and proc.stdout
    proc.stdin.write(struct.pack("<i", len(raw)) + raw)
    proc.stdin.close()

    final = None
    progress_count = 0
    for msg in read_frames(proc.stdout):
        if msg.get("type") == "progress":
            progress_count += 1
            print(f"  [progress] {msg.get('percent'):>3}%  {msg.get('message')}")
        else:
            final = msg
            break

    proc.wait(timeout=60)
    server.shutdown()

    failures = []

    if not final or final.get("type") != "done":
        failures.append(f"最终消息不是 done：{final}")
    else:
        print(f"  [done] {json.dumps(final, ensure_ascii=False)}")

    if progress_count == 0:
        failures.append("没有收到任何 progress 消息")

    if captured.get("auth") != "Bearer test-token":
        failures.append(f"Authorization 头不对：{captured.get('auth')!r}")

    if "multipart/form-data" not in captured.get("content_type", ""):
        failures.append(f"Content-Type 不是 multipart：{captured.get('content_type')!r}")

    body = captured.get("body", b"")
    if not body:
        failures.append("服务器没有收到上传内容")
    else:
        try:
            archive = extract_zip(body)
            names = set(archive.namelist())
            print(f"  [zip] {sorted(names)}")
            expected = {
                "TEST-001.nfo",
                "poster.jpg",
                "fanart.jpg",
                "extrafanart/shot1.jpg",
                "extrafanart/shot2.jpg",
            }
            missing = expected - names
            if missing:
                failures.append(f"zip 缺少文件：{sorted(missing)}")
            extra = names - expected
            if extra:
                failures.append(f"zip 多了不该有的文件：{sorted(extra)}")
            if any(n.lower().endswith(".mp4") for n in names):
                failures.append("zip 里混进了视频文件（会覆盖原片！）")

            nfo = archive.read("TEST-001.nfo").decode("utf-8")
            if "<movie>" not in nfo:
                failures.append("NFO 不是合法的 movie XML")
            if "测试影片" not in nfo:
                failures.append("NFO 里没有影片标题")
        except Exception as exc:  # noqa: BLE001
            failures.append(f"解析 zip 失败：{exc}")

    print()
    if failures:
        print("❌ 自检失败：", file=sys.stderr)
        for item in failures:
            print(f"   - {item}", file=sys.stderr)
        return 1

    print("✅ 自检通过：协议帧、Python 调用、打包、上传全部正常")
    return 0


if __name__ == "__main__":
    sys.exit(main())
