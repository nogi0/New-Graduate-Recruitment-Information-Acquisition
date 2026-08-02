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
SEEN_PATH = DATA_DIR / ".collected-seen.json"

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

# 会員登録・購読しないと本文が読めないことが多い媒体を、RSSの<source>名で除外する。
# URLはGoogle News経由の難読化リンクなので、媒体名での判定が現実的な落とし所。
# 新しく気づいた会員制媒体があればここに追記する。
PAYWALL_SOURCE_KEYWORDS = [
    "日本経済新聞",
    "日経",  # 日経ビジネス、日経ビジネス電子版、日経クロステック 等
    "東洋経済オンライン",
    "ダイヤモンド・オンライン",
    "nikkei.com",  # <source>が媒体名でなくドメイン表記になるケース対策
    "toyokeizai.net",
    "diamond.jp",
]


def is_paywalled(source: str) -> bool:
    return any(keyword in (source or "") for keyword in PAYWALL_SOURCE_KEYWORDS)


def fetch_rss(query: str) -> bytes:
    url = f"https://news.google.com/rss/search?q={quote(query)}&hl=ja&gl=JP&ceid=JP:ja"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return html.unescape(text).strip()


def normalize_title(title: str) -> str:
    # Google Newsのタイトルは "本文 - 媒体名" の形式で同じ記事が複数媒体に
    # 配信されるため、末尾の " - 媒体名" を除いて比較する。
    base = re.split(r"\s[-–]\s", title)[0]
    return re.sub(r"\s+", "", base).lower()


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

    # data/*.json 全体 + 過去に収集済み（その後手動で削除されたものも含む）の
    # URL・正規化タイトルを横断で集めておく。Google Newsは同じプレスリリースを
    # 複数媒体から配信するため、ファイル単位のチェックだけでは重複や
    # 「一度削除したのに次回また追加される」問題を防げない。
    seen_urls = set()
    seen_titles = set()

    seen_registry = load_json(SEEN_PATH) if SEEN_PATH.exists() else []
    for entry in seen_registry:
        seen_urls.add(entry.get("url"))
        seen_titles.add(entry.get("title"))

    all_existing = {}
    for target in TARGETS:
        path = DATA_DIR / target["file"]
        existing = load_json(path)
        all_existing[target["file"]] = existing
        for e in existing:
            if e.get("url"):
                seen_urls.add(e["url"])
            if e.get("title"):
                seen_titles.add(normalize_title(e["title"]))

    for target in TARGETS:
        existing = all_existing[target["file"]]

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
            if is_paywalled(item["source"]):
                continue
            norm_title = normalize_title(item["title"])
            if item["url"] in seen_urls or norm_title in seen_titles:
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
            seen_registry.append({"url": item["url"], "title": normalize_title(item["title"])})
            seen_urls.add(item["url"])
            seen_titles.add(norm_title)
            added += 1

        if added:
            save_json(DATA_DIR / target["file"], existing)
            print(f"[info] {target['file']}: {added}件追加しました")
        else:
            print(f"[info] {target['file']}: 新着なし")

    save_json(SEEN_PATH, seen_registry)


if __name__ == "__main__":
    main()
