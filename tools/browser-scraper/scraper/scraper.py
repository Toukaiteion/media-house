#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MediaHouse 本地搜刮器（示例骨架）

契约与项目里的插件规范一致（见 media-house-admin/PLUGIN_SYSTEM_DESIGN.md）：

  输入  (stdin)  {"action":"scrape","media_id":"12","title":"...","num":"ABC-123",
                  "file_path":"/media/Movies/ABC-123/ABC-123.mp4","output_dir":"C:\\Temp\\..."}
  输出  (stdout) {"status":"success","metadata":{...},"created_files":{...}}
  进度  (stderr) {"type":"progress","step":"searching","message":"...","percent":10}

只依赖标准库。把 scrape() 换成你现有的 jcatch 逻辑即可，其余不用动。
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
from pathlib import Path
from xml.sax.saxutils import escape

# 1x1 白色 JPEG，纯粹为了让整条链路（打包 → 上传 → 落盘 → 重扫）能跑通
TINY_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof"
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB"
    "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
)


def progress(step: str, message: str, percent: int) -> None:
    """向 stderr 输出一行进度 JSON，宿主进程会转成浏览器里的进度条。"""
    sys.stderr.write(
        json.dumps(
            {"type": "progress", "step": step, "message": message, "percent": percent},
            ensure_ascii=False,
        )
        + "\n"
    )
    sys.stderr.flush()


def build_nfo(meta: dict) -> str:
    """生成 Emby/Jellyfin 兼容的 movie.nfo（字段名必须和 MetadataService 解析的一致）。"""
    lines = ['<?xml version="1.0" encoding="utf-8"?>', "<movie>"]
    if meta.get("title"):
        lines.append(f"  <title>{escape(meta['title'])}</title>")
    if meta.get("original_title"):
        lines.append(f"  <originaltitle>{escape(meta['original_title'])}</originaltitle>")
    if meta.get("year"):
        lines.append(f"  <year>{escape(str(meta['year']))}</year>")
    if meta.get("release_date"):
        lines.append(f"  <premiered>{escape(meta['release_date'])}</premiered>")
    if meta.get("summary"):
        lines.append(f"  <plot>{escape(meta['summary'])}</plot>")
    if meta.get("runtime"):
        lines.append(f"  <runtime>{int(meta['runtime'])}</runtime>")
    if meta.get("studio"):
        lines.append(f"  <studio>{escape(meta['studio'])}</studio>")
    if meta.get("maker"):
        lines.append(f"  <maker>{escape(meta['maker'])}</maker>")
    if meta.get("num"):
        lines.append(f"  <num>{escape(meta['num'])}</num>")
    for tag in meta.get("tags") or []:
        lines.append(f"  <tag>{escape(str(tag))}</tag>")
    for actor in meta.get("actors") or []:
        name = actor.get("name") if isinstance(actor, dict) else actor
        if not name:
            continue
        lines.append("  <actor>")
        lines.append(f"    <name>{escape(str(name))}</name>")
        if isinstance(actor, dict) and actor.get("role"):
            lines.append(f"    <role>{escape(str(actor['role']))}</role>")
        lines.append("  </actor>")
    lines.append("</movie>")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# >>> 用你现有的 jcatch / python 抓取逻辑替换这个函数 <<<
# 入参 request 里有 media_id / title / num / file_path，返回上面那种 dict。
# 网络请求、代理、Playwright、Cookies 全部随便用，只要最终返回这个结构。
# ---------------------------------------------------------------------------
def scrape(request: dict) -> dict:
    num = (request.get("num") or "").strip()
    title = (request.get("title") or "").strip() or "未命名影片"

    progress("searching", f"正在搜索 {num or title}…", 20)
    time.sleep(0.6)  # 模拟网络耗时，替换掉

    progress("parsing", "解析详情页…", 45)
    time.sleep(0.4)

    metadata = {
        "title": f"[DEMO] {title}",
        "original_title": title,
        "year": 2024,
        "release_date": "2024-01-01",
        "summary": "这是示例数据，请把 scraper.py 里的 scrape() 换成真实的抓取逻辑。",
        "runtime": 120,
        "studio": "DEMO Studio",
        "maker": "DEMO Maker",
        "num": num or "DEMO-000",
        "tags": ["示例标签", "请替换"],
        "actors": [{"name": "示例演员", "role": "主演"}],
    }
    return {"status": "success", "metadata": metadata}


def write_files(metadata: dict, output_dir: Path) -> dict:
    progress("downloading", "下载封面…", 60)
    output_dir.mkdir(parents=True, exist_ok=True)

    (output_dir / "poster.jpg").write_bytes(TINY_JPEG)
    (output_dir / "fanart.jpg").write_bytes(TINY_JPEG)

    progress("saving", "保存截图…", 75)
    extrafanart = output_dir / "extrafanart"
    extrafanart.mkdir(exist_ok=True)
    (extrafanart / "shot1.jpg").write_bytes(TINY_JPEG)
    (extrafanart / "shot2.jpg").write_bytes(TINY_JPEG)

    progress("saving", "写入 NFO…", 85)
    (output_dir / "movie.nfo").write_text(build_nfo(metadata), encoding="utf-8")

    return {
        "nfo": "movie.nfo",
        "poster": "poster.jpg",
        "fanart": "fanart.jpg",
        "screenshots": ["shot1.jpg", "shot2.jpg"],
    }


def main() -> int:
    # Windows 下被重定向时 Python 默认用系统代码页（cp936）写 stdout，会导致中文乱码 / JSON 解析失败
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    if "--selftest" in sys.argv:
        request = {
            "action": "scrape",
            "media_id": "1",
            "title": "自检影片",
            "num": "TEST-001",
            "file_path": "/media/Movies/TEST-001/TEST-001.mp4",
            "output_dir": str(Path.cwd() / "_selftest_output"),
        }
    else:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"status": "error", "message": "没有收到输入"}, ensure_ascii=False))
            return 1
        try:
            request = json.loads(raw)
        except json.JSONDecodeError as exc:
            print(json.dumps({"status": "error", "message": f"输入不是合法 JSON: {exc}"}, ensure_ascii=False))
            return 1

    output_dir = Path(request.get("output_dir") or os.path.join(os.getcwd(), "_output"))

    try:
        progress("initializing", "初始化搜刮器…", 10)
        result = scrape(request)
        if result.get("status") != "success":
            print(json.dumps(result, ensure_ascii=False))
            return 0

        created = write_files(result["metadata"], output_dir)
        progress("completed", "完成", 100)
        print(
            json.dumps(
                {
                    "status": "success",
                    "message": "scraping completed",
                    "metadata": result["metadata"],
                    "created_files": created,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:  # noqa: BLE001 - 一律转成契约里的错误结构
        print(json.dumps({"status": "error", "message": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    sys.exit(main())
