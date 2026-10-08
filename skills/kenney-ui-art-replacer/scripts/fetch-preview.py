#!/usr/bin/env python3
"""
从 Kenney 素材页提取并下载预览图。

关键点：素材页的「你可能也喜欢」区块会混入其他包的预览图，
必须用「包名精确相等」过滤，不能用包含匹配。

用法：
    python3 fetch-preview.py <package-slug> [--out DIR] [--all]
    python3 fetch-preview.py pixel-platformer --out ./previews
"""

import argparse
import os
import re
import sys
import urllib.error
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
BASE = "https://kenney.nl/assets/"

# 素材页中预览图与素材包名的提取规则（已实测）
# URL 形如：/media/pages/assets/<pkg>/<hash>-<ts>/<name>.png
# 注意有三段路径，必须全部匹配，否则会把 hash 目录误当文件名。
RE_MEDIA = re.compile(
    r"https://kenney\.nl/media/pages/assets/([^/]+)/([^/\"'\s]+)/([^/\"'\s]+)\.(png|jpg)"
)
RE_ZIP = re.compile(r"https://kenney\.nl/media/pages/assets/[^\"'\s]+\.zip")
RE_LICENSE = re.compile(r"CC0", re.IGNORECASE)


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_text(url, timeout=30):
    return fetch(url, timeout).decode("utf-8", "ignore")


def get_page(slug):
    url = BASE + slug
    try:
        return url, fetch_text(url)
    except urllib.error.HTTPError as e:
        sys.exit(f"[错误] 素材页返回 HTTP {e.code}：{url}\n       请检查包名是否正确。")
    except Exception as e:
        sys.exit(f"[错误] 无法访问 {url}\n       {e}\n       请先确认网络可达：curl -sI https://kenney.nl/assets")


def is_preview_name(name):
    """过滤掉非预览类文件（如 svg 源、图集等）。"""
    low = name.lower()
    return not low.endswith("_vector")


def main():
    ap = argparse.ArgumentParser(description="下载 Kenney 素材包预览图")
    ap.add_argument("slug", help="素材包 slug，如 pixel-platformer")
    ap.add_argument("--out", default="./kenney-previews", help="输出目录")
    ap.add_argument("--all", action="store_true",
                    help="也下载本包目录下的全部图片（默认只下 sample/preview）")
    args = ap.parse_args()

    url, html = get_page(args.slug)
    print(f"[1/4] 已获取素材页：{url}")

    # 提取所有 (包名, 文件名, 完整URL)
    medias = []
    for pkg, ver, fname, ext in RE_MEDIA.findall(html):
        full = f"https://kenney.nl/media/pages/assets/{pkg}/{ver}/{fname}.{ext}"
        medias.append((pkg, f"{fname}.{ext}", full))

    # 去重并保序
    seen = set()
    uniq = []
    for item in medias:
        if item[2] not in seen:
            seen.add(item[2])
            uniq.append(item)
    medias = uniq

    if not medias:
        sys.exit("[错误] 页内未找到任何媒体链接。素材页结构可能已变更。")

    # 关键：包名精确匹配
    exact = [m for m in medias if m[0] == args.slug]
    fuzzy = [m for m in medias if args.slug in m[0] and m[0] != args.slug]

    print(f"[2/4] 页内共 {len(medias)} 个媒体链接")
    print(f"      其中其他包的链接 {len(fuzzy)} 个（已排除）：")
    for pkg, fname, _ in fuzzy:
        print(f"        - {pkg}/{fname}")

    if not exact:
        print(f"[警告] 未找到包名精确等于 '{args.slug}' 的预览图。")
        print(f"       页内出现的包名：{sorted(set(m[0] for m in medias))}")
        print(f"       回退：下载本页全部 {len(medias)} 个图片。")
        exact = medias

    if not args.all:
        keyed = [m for m in exact if any(k in m[1].lower() for k in ("sample", "preview"))]
        if keyed:
            exact = keyed

    exact = [m for m in exact if is_preview_name(m[1])]

    # 授权校验
    has_cc0 = bool(RE_LICENSE.search(html))
    print(f"[3/4] 授权校验：页面含 CC0 标记 -> {'是' if has_cc0 else '否 ⚠'}")
    if not has_cc0:
        print("      ⚠ 未检测到 CC0。请人工核对素材页授权说明后再用于商用。")

    zips = sorted(set(RE_ZIP.findall(html)))
    if zips:
        print("      本包 ZIP 直链：")
        for z in zips:
            print(f"        {z}")

    os.makedirs(args.out, exist_ok=True)
    print(f"[4/4] 下载 {len(exact)} 个预览图 -> {args.out}")
    ok = 0
    for pkg, fname, full in exact:
        dest = os.path.join(args.out, fname)
        try:
            data = fetch(full)
            with open(dest, "wb") as f:
                f.write(data)
            magic_ok = data[:8] == b"\x89PNG\r\n\x1a\n" if fname.lower().endswith(".png") else True
            print(f"      [OK] {fname}  {len(data)} 字节"
                  + ("" if magic_ok else "  ⚠ 非有效PNG"))
            ok += 1
        except Exception as e:
            print(f"      [失败] {fname}: {e}")

    print(f"\n完成：{ok}/{len(exact)} 个预览图已下载到 {os.path.abspath(args.out)}")
    print("下一步：实际查看这些预览图，确认内容与风格符合需求。")


if __name__ == "__main__":
    main()
