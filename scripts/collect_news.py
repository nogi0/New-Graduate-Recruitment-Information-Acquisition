"""
Google NewsのRSS検索を使って新卒採用まわりの最新記事を集め、
data/*.json に新着分だけ追記するスクリプト。
外部APIキーは使わず、標準ライブラリのみで動く。
"""

import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# ファイルごとに検索クエリとカテゴリタグ、1回あたりの最大追加件数を定義
TARGETS = [
    {
        "file": "news.json",
        "query": "新卒採用",
        "tag": "ニュース",
        "max_items": 5,
    },
    {
        "file": "ai-cases.json",
        "query": "新卒採用 AI活用",
        "tag": "AI活用",
        "max_items": 5,
    },
    {
        "file": "market-reports.json",
        "query": "新卒採用 白書 OR 調査 OR レポート",
        "tag": "マーケットレポート",
        "max_items": 3,
    },
]

LOOKBACK_DAYS = 10
USER_AGENT = "Mozilla/5.0 (compatible; ShinsotsuInfoHubBot/1.0)"


def fetch_rss(query: str) -> bytes:
    url = f"https://news.google.com/rss/search?q={quote(query)}&hl=ja&gl=JP&ceid=JP:ja"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return html.unescape(text).strip()


def parse_items(xml_bytes: bytes):
    root = ET.fromstring(xml_bytes)
    for item in root.findall("./channel/item"):
        title = strip_html(item.findtext("title") or "")
        link = (item.findtext("link") or "").strip()
        pub_date_raw = item.findtext("pubDate")
        source_el = item.find("source")
        source = source_el.text.strip() if source_el is not None and source_el.text else "Google News"
        description = strip_html(item.findtext("description") or "")

        pub_date = None
        if pub_date_raw:
            try:
                pub_date = parsedate_to_datetime(pub_date_raw)
            except (TypeError, ValueError):
                pub_date = None

        yield {
            "title": title,
            "url": link,
            "source": source,
            "summary": description[:200],
            "pub_date": pub_date,
        }


def load_json(path: Path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)

    for target in TARGETS:
        path = DATA_DIR / target["file"]
        existing = load_json(path)
        existing_urls = {e.get("url") for e in existing if e.get("url")}
        existing_titles = {e.get("title") for e in existing if e.get("title")}

        try:
            xml_bytes = fetch_rss(target["query"])
        except Exception as e:
            print(f"[warn] {target['file']}: RSS取得に失敗しました ({e})")
            continue

        added = 0
        for item in parse_items(xml_bytes):
            if added >= target["max_items"]:
                break
            if not item["url"] or not item["title"]:
                continue
            if item["url"] in existing_urls or item["title"] in existing_titles:
                continue
            if item["pub_date"] and item["pub_date"] < cutoff:
                continue

            date_str = (
                item["pub_date"].astimezone(timezone.utc).strftime("%Y-%m-%d")
                if item["pub_date"]
                else datetime.now(timezone.utc).strftime("%Y-%m-%d")
            )

            existing.append(
                {
                    "title": item["title"],
                    "source": item["source"],
                    "url": item["url"],
                    "date": date_str,
                    "summary": item["summary"] or "(要約は元記事を参照)",
                    "tags": [target["tag"], "自動収集"],
                }
            )
            existing_urls.add(item["url"])
            existing_titles.add(item["title"])
            added += 1

        if added:
            save_json(path, existing)
            print(f"[info] {target['file']}: {added}件追加しました")
        else:
            print(f"[info] {target['file']}: 新着なし")


if __name__ == "__main__":
    main()
