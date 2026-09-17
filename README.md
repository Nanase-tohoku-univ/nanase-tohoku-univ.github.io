# nanase-tohoku-univ.github.io

髙橋那々世（Nanase Takahashi）のプロフィールサイトです。

https://nanase-tohoku-univ.github.io/

開くと、修了日（2027年3月）までの日めくりカレンダーが表示されます。ページをめくると、毎日変わる演出で残り日数が現れ、下にスクロールすると経歴が表示されます。演出エンジンは [Advent-Calender](https://github.com/Nanase-tohoku-univ/Advent-Calender) のものを使っています。

## 内容を更新する
- 経歴・連絡先：`src/profile/data.ts`
- 未来の予定（`future: true` を付けた項目、または `{{ }}` で囲んだ部分）は、ノイズのかかった「未確定」表示になります

## ライブ検索（Google Programmable Search Engine）
1. https://programmablesearchengine.google.com/ で検索エンジンを作成し、「ウェブ全体を検索」をオンにします
2. 表示された「検索エンジン ID（cx）」を `src/profile/data.ts` の `SEARCH_ENGINE_ID` に貼り付けて push します

## 開発
```bash
npm install
npm run dev      # ?effect=quantum で演出を指定、?skip で日めくりを飛ばす
npm test
npm run build
```

`main` ブランチに push すると、GitHub Actions でビルドされ GitHub Pages に公開されます。

## ライセンス
コードは MIT License です。サードパーティのライセンス表記は `public/THIRD_PARTY_NOTICES.txt` にあります。
