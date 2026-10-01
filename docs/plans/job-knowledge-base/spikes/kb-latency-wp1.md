# KB retrieval latency (WP1)
`npm run build:electron && node scripts/kb-latency.mjs` · 400-item synthetic KB · 300 runs · Apple Silicon Mac, Node dev build.

| | p50 | p95 | max |
|---|---|---|---|
| index build + first query | 4.1 ms | | |
| `retrieve` (k=3) | 0.055 ms | 0.221 ms | 0.697 ms |
| `kbPrefix` | 0.057 ms | 0.206 ms | 1.843 ms |

Target p95 < 5 ms: met (≈ 20× headroom). Relevance on the 60 labelled pairs: recall@3 = 1.000, MRR = 1.000 (the pairs are paraphrases that keep the content words; a harder, no-overlap set would need the optional embedding rerank, M4).
