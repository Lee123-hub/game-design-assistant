#!/usr/bin/env python3
"""
下载并解压 Kenney 素材包，附授权校验。

用法：
    python3 fetch-package.py <package-slug> [--out DIR] [--list-only]
    python3 fetch-package.py pixel-platformer --out ./assets-download
"""

import argparse
import hashlib
import os
import re
import sys
import urllib.error
import urllib.request
import zipfile

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
BASE = "https://kenney.nl/assets/"
RE_ZIP = re.compile(r"https://kenney\.nl/media/pages/assets/[^\"'\s]+\.zip")


def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get_zip_url(slug):
    page = BASE + slug
    try:
        html = fetch(page, timeout=30).decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        sys.exit(f"[错误] 素材页 HTTP {e.code}：{page}")
    except Exception as e:
        sys.exit(f"[错误] 无法访问 {page}\n       {e}")

    # 只取与本次 slug 精确匹配的 zip（页面同样会混入其他包链接）
    zips = set(RE_ZIP.findall(html))
    exact = [z for z in zips if re.search(rf"/{re.escape(slug)}/[^/]+\.zip$", z)]

    if not exact:
        # 回退：包名可能带后缀，取唯一含 slug 的
        cands = [z for z in zips if slug in z]
        if len(cands) == 1:
            return page, cands[0], html
        if cands:
            print(f"[警告] 多个候选 ZIP，请人工确认：")
            for c in cands:
                print(f"        {c}")
            sys.exit("[错误] 无法自动判定，请手动指定。")
        sys.exit(f"[错误] 页内未找到 ZIP 链接：{page}")

    return page, exact[0], html


def main():
    ap = argparse.ArgumentParser(description="下载并解压 Kenney 素材包")
    ap.add_argument("slug", help="素材包 slug，如 pixel-platformer")
    ap.add_argument("--out", default="./kenney-packages", help="输出目录")
    ap.add_argument("--list-only", action="store_true", help="只列出内容清单，不解压")
    args = ap.parse_args()

    page, zip_url, html = get_zip_url(args.slug)
    print(f"[1/5] 素材页：{page}")
    print(f"      ZIP 直链：{zip_url}")

    # 授权校验
    has_cc0 = "CC0" in html
    print(f"[2/5] 授权校验：页面含 CC0 -> {'是' if has_cc0 else '否 ⚠'}")
    if not has_cc0:
        print("      ⚠ 未检测到 CC0。Kenney 全站为 CC0，但此处异常，请人工核对。")

    os.makedirs(args.out, exist_ok=True)
    zip_path = os.path.join(args.out, f"kenney_{args.slug}.zip")

    print(f"[3/5] 下载中……")
    try:
        data = fetch(zip_url)
    except Exception as e:
        sys.exit(f"[错误] 下载失败：{e}")

    with open(zip_path, "wb") as f:
        f.write(data)

    digest = hashlib.sha256(data).hexdigest()
    print(f"      大小：{len(data)} 字节")
    print(f"      SHA-256：{digest}")
    print(f"      位置：{zip_path}")

    if not zipfile.is_zipfile(zip_path):
        sys.exit("[错误] 下载内容不是有效 ZIP。可能下载到了错误页面的 HTML。")

    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        print(f"[4/5] 包内 {len(names)} 个条目")

        # 授权文件检查
        lic = [n for n in names if n.lower().endswith("license.txt")]
        if lic:
            print(f"      授权文件：{lic[0]}")
            content = z.read(lic[0]).decode("utf-8", "ignore")
            if "CC0" in content or "Creative Commons Zero" in content:
                print("      ✓ License.txt 确认 CC0")
            else:
                print("      ⚠ License.txt 未含 CC0 字样，请人工核对：")
                print("        " + content.strip()[:300])
        else:
            print("      ⚠ 包内无 License.txt，请人工核对授权")

        print("      内容预览（前 25 项）：")
        for n in names[:25]:
            print(f"        {n}")

        if args.list_only:
            print("\n[--list-only] 未解压。")
            return

        print(f"[5/5] 解压到 {os.path.abspath(args.out)}")
        z.extractall(args.out)

    print(f"\n完成。素材位置：{os.path.abspath(args.out)}")
    print("提醒：License.txt 请随素材一起保留，作为合规追溯依据。")


if __name__ == "__main__":
    main()
