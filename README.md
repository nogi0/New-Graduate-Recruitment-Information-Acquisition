# 新卒採用インフォメーションハブ

新卒採用の最新ニュース、マーケットレポート（月次調査など）、AI活用事例を1箇所でキャッチアップするための静的サイト。
ビルド不要（node/npm不要）。`index.html` を開くだけ、または GitHub Pages でそのまま公開できる。

## 構成

```
index.html          サイト本体（3タブ構成）
css/style.css        スタイル
js/main.js           JSONを読み込んでカード表示するロジック
data/news.json           新卒採用ニュース
data/market-reports.json マーケットレポート・白書
data/ai-cases.json       新卒採用×AI活用事例
```

## コンテンツの追加方法

各 `data/*.json` に以下の形式でオブジェクトを追加するだけ。

```json
{
  "title": "記事タイトル",
  "source": "情報源（媒体名・企業名）",
  "url": "https://...",
  "date": "2026-07-21",  // わかる範囲でOK。YYYY-MM-DD / YYYY-MM / YYYY
  "summary": "1〜2文の要約",
  "tags": ["タグ1", "タグ2"]
}
```

- `date` は新しい順に自動ソートされる（文字列比較なので YYYY-MM-DD 形式推奨）。
- カードのタイトルは `url` にリンクする。

## ローカルで確認

ブラウザで `index.html` を直接開けば動作する（`fetch` でJSONを読むため、ブラウザによっては
`file://` だとCORSでブロックされる場合がある。その場合は簡易サーバーを立てる）。

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

## GitHub Pages での公開

1. GitHubに空のリポジトリを作成
2. このディレクトリを push
3. リポジトリの Settings > Pages で Source を `main` ブランチ / ルートに設定
4. 数分後に公開URLが発行される

## 自動収集（GitHub Actions）

`scripts/collect_news.py` が Google News の検索RSS（新卒採用ニュース／AI活用事例／マーケットレポート系の3クエリ）
を取得し、`data/*.json` に未登録のものだけ追記する。外部APIキーは不要（標準ライブラリのみ）。

- `.github/workflows/collect-news.yml` が毎週月曜 9:00 JST に自動実行（`workflow_dispatch` で手動実行も可能）
- 収集結果は `main` に直接コミットされず、レビュー用のプルリクエストとして作成される
  （[peter-evans/create-pull-request](https://github.com/peter-evans/create-pull-request) を使用）
- 新着が無ければPRは作成されない
- Google Newsの検索結果ベースのため精度は完全ではない。無関係な記事や重複が混ざることがあるので、
  PRの内容は必ず目視確認してからマージすること

ローカルで試す場合:

```bash
python3 scripts/collect_news.py
git diff data/
```
