# B2: Search and fetch backends for the per-job research pipeline

Date: 2026-10-01. Method: WebFetch/WebSearch only. Tags: **V** = VERIFIED (read at the URL), **I** = INFERENCE (mine), **U** = UNVERIFIED (not confirmed; do not rely on it).
Where a fact came from a WebSearch snippet only (not a page I read), I tag it **V-snippet**. Treat that as weaker than V.

## 1. Summary table (search/fetch APIs)

| Backend | Price | Free tier | Rate limit | Notes | Source |
|---|---|---|---|---|---|
| Firecrawl cloud | scrape/crawl/map 1 credit per page; search 2 credits per 10 results (V). Hobby $16/mo for 5k credits, Standard $83/mo for 100k, Growth $333/mo for 500k, billed annually (V) | 1,000 credits/mo, 2 concurrent browsers (V) | Free 2/min on scrape/map/search; Hobby 100/min; Standard 500/min (V) | One vendor for search plus fetch plus markdown | https://www.firecrawl.dev/pricing |
| Firecrawl self-host | $0 licence; you run Docker | n/a | Your hardware | AGPL-3.0 (SDKs/UI MIT) (V). Docs example is v2.11.162 (V). Baseline stack lacks screenshots, page actions and Fire-engine (V). Cloud-only features exist (V). | https://github.com/firecrawl/firecrawl , https://docs.firecrawl.dev/contributing/self-host |
| SearXNG (self-host) | $0 | n/a | Bounded by upstream engines | AGPL-3.0 (V). `format=json` must be enabled in `settings.yml` or you get 403 (V). | https://github.com/searxng/searxng , https://docs.searxng.org/dev/search_api.html |
| Brave Search API | Search plan $5 per 1,000 requests (V) | $5 free monthly credit, about 1,000 queries (V; the 1,000 is my arithmetic, I) | 50 queries/sec on Search plan (V) | Storing results needs a plan that grants storage rights (V). No rights to third-party page content (V). | https://brave.com/search/api/ |
| Tavily | Pay-as-you-go $0.008/credit; Project $30/mo for 4,000 credits (V). Search 1 credit basic, 2 advanced. Extract 1-2 credits per 5 URLs. Map 1-2 credits per 10 pages (V) | 1,000 credits/mo, no card (V) | Not stated on pages read (U) | Returns snippets/LLM-ready content | https://www.tavily.com/pricing , https://docs.tavily.com/documentation/api-credits |
| Exa | Instant search $4/1k, fast/auto $7/1k, +$1/1k results above 10; contents $1/1k pages per content type (V) | $10 credit on signup, resets to $10 monthly (about 2,500 Instant searches) (V) | Not published on pricing page (U) | Neural/semantic search, useful for company/people discovery (I) | https://exa.ai/pricing |
| Serper | Starter $50 for 50k credits ($1.00/1k) down to $0.30/1k at volume (V-snippet). 1 credit = up to 10 results; 11-100 results costs 2 credits. Credits expire after 6 months (V-snippet) | 2,500 free queries, no card (V) | Not found (U) | Google SERP via scraping. ToS on storing/LLM use not read (U). | https://serper.dev , https://coldiq.com/blog/serper-pricing (secondary) |
| Google Custom Search JSON API | $5 per 1,000 queries, up to 10k/day (V) | 100 queries/day (V) | 10k/day cap (V) | **Closed to new customers; existing customers must move by 2027-01-01** (V). No whole-web search; Google points to Vertex AI Search (50 domains) (V). **Not an option.** | https://developers.google.com/custom-search/v1/overview |
| Bing Search API | n/a | n/a | n/a | **Retired 2025-08-11**, no new signups (V-snippet, from the Microsoft Learn URL, not opened by me). Replacement is Grounding with Bing inside Azure AI Agents. | https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement |
| DuckDuckGo | n/a | Instant Answer API is free, no key, no published rate limit (V-snippet) | n/a | No official web-search API. Instant Answer returns almost nothing for most queries. Anything else is an unofficial scraper with ToS risk (V-snippet). | https://link.sc/blog/duckduckgo-search-api-guide |
| Jina Reader r.jina.ai | Token-based; failed requests are not charged (V) | New users get an API key with free tokens (V; amount not stated) | No key 20 RPM; free/paid key 500 RPM; premium 5,000 RPM (V) | Fetch to markdown | https://jina.ai/reader/ |
| Jina Search s.jina.ai | Each request costs a fixed token amount "starting from 10,000 tokens" (V) | needs key (V: blocked without key) | Free/paid 100 RPM; premium 1,000 RPM (V) | Returns top 5 results with content. Page lists CC-BY-NC for Jina's models, commercial use needs a licence (V). Whether this covers the Reader service or repo is unclear (U). Check before shipping. | https://jina.ai/reader/ |

## 2. Provider-native web search in LLM APIs

| Provider | Per-search price | Free allowance | Notes | Source |
|---|---|---|---|---|
| Anthropic web search tool | **$10 per 1,000 searches** plus normal token cost; results are counted as input tokens, errors not billed (V) | none stated | `max_uses` cap; domain allow/block lists; citations always on and must be shown when displaying output to end users (V). Dynamic filtering (`web_search_20260209`+) runs search inside code execution so only filtered text enters context, no extra code-execution fee (V). Batch API supported at same price (V). Not on Bedrock (V). Versions seen: `web_search_20250305`, `_20260209`, `_20260318` (V). | https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool |
| OpenAI web search tool | $10/1k calls plus search-content tokens at model rate (reasoning models); $25/1k calls with free content tokens (non-reasoning); gpt-4o-mini/4.1-mini billed as fixed 8,000 input tokens per call (V) | none stated | Model may issue several calls per request (V-snippet) | https://developers.openai.com/api/docs/pricing |
| OpenRouter `:online` / web plugin | Exa engine $0.007 per request (auto mode, up to 10 results) then $0.001 per extra result. Native search is passed through at the provider price (V) | none; charges apply even on free models (V) | `max_results` default 5; engines native/Exa/Firecrawl/Parallel/Perplexity; `include_domains`/`exclude_domains`; results come as `url_citation` annotations (V). Firecrawl/Parallel engine prices not read (U). | https://openrouter.ai/docs/guides/features/plugins/web-search |
| Gemini Grounding with Google Search | 3.x models: $14 per 1,000 requests after free tier. 2.5 models: $35 per 1,000 grounded prompts (V) | 3.x: 5,000/month free, shared across 3.x models. 2.5: 1,500 requests/day free (V) | Retrieved context is not charged as input tokens (V). A grounded prompt may bill per prompt, not per query (I from "grounded prompts" wording). | https://ai.google.dev/gemini-api/docs/pricing |

Native search ToS on storing results: Anthropic requires citation display (V, above). I did not find explicit storage/LLM-training wording for OpenAI, Gemini or OpenRouter-Exa (U).

## 3. Licensing, ToS and blocking risks

| Topic | Finding | Tag | Source |
|---|---|---|---|
| Firecrawl AGPL | AGPL-3.0 applies if you modify and offer it over a network. Careerloom already has a self-hosted client. Running it unmodified as a separate local service is not linking it into the app. | V (licence), I (consequence) | https://github.com/firecrawl/firecrawl |
| SearXNG AGPL | Same: run as a separate process, do not embed or modify. Needs legal check before bundling in an installer. | V (licence), I (advice) | https://github.com/searxng/searxng |
| SearXNG upstream blocking | 429 suspends an engine for 3,600 s; CAPTCHA or access-denied for 1 day; Cloudflare CAPTCHA for 15 days (V-snippet). One report: about 70 searches in 2.5 min suspended Brave, DuckDuckGo and Google CSE engines on a private instance (V-snippet). Check `/stats/errors` on your instance. | V-snippet | https://www.ssdnodes.com/learn/searxng-rate-limits-and-429-errors , https://github.com/searxng/searxng/issues/3927 |
| SearXNG JSON | Disabled by default on many public instances; a private instance must list `json` under `search.formats` | V | https://docs.searxng.org/dev/search_api.html |
| Brave storage | Storing results (even to tune an LLM) requires a plan with explicit storage rights. A KB that caches Brave results on disk is a grey area on the standard plan. | V (quote), I (applies to caching) | https://brave.com/search/api/ |
| Page content rights | Search APIs give URLs only; the page publisher's terms govern fetch/reuse (Brave states this, V). The same holds for every backend (I). | V/I | https://brave.com/search/api/ |
| Serper / Tavily / Exa ToS on storing or LLM use | Not read. Check their terms pages before caching raw results. | U | n/a |

Practical reading: storing **derived facts with source URLs** (not raw SERPs or full page copies) is the lowest-risk design under all of these (I).

## 4. Cost model for one job

Assumptions (all I, adjust after measuring): 20 searches, 30 page fetches, about 4k tokens per extracted page, so about 120k input + 10k output tokens through a cheap extraction model. LLM token price is unknown to me for the user's model, so I show search+fetch cost separately and add a placeholder LLM line of $0.05-0.15 (U; depends on the model the user brings).

| Config | Search (20) | Fetch (30) | Search+fetch total | Free-tier jobs per month | Basis |
|---|---|---|---|---|---|
| A. All-API, Brave + Firecrawl Hobby | $0.10 (Brave $5/1k) | about $0.10 (30 credits at $16/5k = $0.0032 each) | about $0.20 | Brave $5 credit alone covers about 50 jobs of search | V prices, I arithmetic |
| A'. Exa + Firecrawl Standard | $0.14 (20 x $0.007) | about $0.025 (30 credits at $83/100k) | about $0.17 | $10 Exa credit is about 70 jobs of search | V prices, I arithmetic |
| A''. Tavily only | $0.16 (20 basic at $0.008) | $0.05-0.10 (30 URLs = 6-12 credits) | about $0.21-0.26 | 1,000 credits is about 25-30 jobs | V prices, I arithmetic |
| A'''. Anthropic native web search | $0.20 + results-as-input tokens | model fetches inside search | $0.20 + tokens, likely over $0.30 with extraction | none | V price, I |
| B. Hybrid free tier: Brave $5 credit + Exa $10/mo credit + Serper 2,500 + local CDP fetch | $0 until credits run out | $0 (local) | $0 for roughly 100-170 jobs/mo, then falls to config A | Brave about 50 jobs + Exa about 125 jobs (20 searches each) | V free tiers, I arithmetic |
| C. Local: SearXNG + raw CDP/Firecrawl self-host | $0 | $0 | $0 plus CPU/RAM and engine-block risk | unlimited, but throttled by upstream | V licences, I |

Notes:
- Firecrawl Free (1,000 credits/mo) covers about 33 jobs of 30 fetches (I). Free tier concurrency is 2/min on scrape/search (V), so 30 fetches take at least 15 min on Free. That breaks the 5 min target (I). Local CDP fetch avoids this.
- Fetch cost is dominated by whether pages need JS rendering. Most ATS and career pages are static or JSON-LD (existing Careerloom tiers, project memory). Use plain HTTP first, CDP only when empty (I).
- LLM extraction likely exceeds search+fetch cost in config B and C. Budget the $0.30 mostly for tokens, and strip HTML to text before sending (I).
- Latency: no benchmark read for any backend. Firecrawl claims P95 3.4 s per page (V, vendor claim: https://github.com/firecrawl/firecrawl). Fetch 30 pages at concurrency 6-8 locally, about 30-60 s (I, U until measured).

## 5. Agent loop vs deterministic pipeline

| Question | Evidence | Tag |
|---|---|---|
| Token cost of agents | Anthropic: agents use about 4x tokens of chat, multi-agent about 15x | V https://www.anthropic.com/engineering/multi-agent-research-system |
| Quality gain | Multi-agent (Opus 4 lead + Sonnet 4 subagents) beat single-agent Opus 4 by 90.2% on their internal research eval | V (same URL) |
| What drives quality | Token usage explains 80% of variance on BrowseComp | V (same URL) |
| Latency | Parallel tool calling cut research time by up to 90% on complex queries | V (same URL) |
| Effort scaling | Simple fact-finding: 1 agent, 3-10 tool calls. Comparisons: 2-4 subagents, 10-15 calls each. Complex: 10+ subagents | V (same URL) |
| Economic fit | Only worth it when task value pays for the extra tokens; poor fit where shared context or tight dependencies exist | V (same URL) |
| Anthropic server tool risk | `max_uses` is the only hard cap on searches per request; Claude decides when to search | V https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool |

Trade-off for Careerloom (I):
- Our task is bounded and repetitive (same fields per job: company, role, comp, interview process, culture, tech stack). That fits a **deterministic pipeline** with fixed query templates, parallel fetch, and LLM only at the extract and classify steps. Cost is predictable, so the $0.30 cap is enforceable in code.
- An agent loop adds 4-15x token cost (V above) and variable latency, but gains recall on odd queries (obscure startups, name collisions).
- Hybrid: deterministic pass first; run a bounded agent loop (cap 5 extra searches, 1 cheap model) only if coverage of required fields is below a threshold. Default off, user opt-in.
- Fits existing runners: Claude Code/Codex CLI runners are agent loops with no per-call price visibility; OpenRouter/Zen in-process loops give token counts and caps (I from project memory).

## 6. Caching and refresh policy ideas (all I)

| Layer | Key | TTL / refresh | Why |
|---|---|---|---|
| Query result cache | normalized query + backend | 7 days | Same company appears across many jobs; do not re-search |
| Page cache | canonical URL + content hash | 14 days; send If-None-Match / If-Modified-Since where servers support it | Avoids re-fetch and re-extract; content-hash skips unchanged LLM calls |
| Extracted facts | (entity, field) with source URL, fetched_at, confidence | Company facts 30 days; compensation and hiring status 7 days; interview-process 90 days | Different volatility |
| Job-level refresh | on job open | Refresh only stale fields, only when user opens the job page or moves it to interview stage | Spend only on jobs the user cares about |
| Negative cache | URL that returned 403/empty | 24 h, then try CDP tier | Stops retry storms |
| Storage rule | store extracted facts + URL + snippet, not full SERPs or page bodies | n/a | Lowers licence risk (Section 3) |
| Budget guard | per-job cap $0.30 and 5 min, per-day cap in settings | hard stop and mark "partial" | Keeps spend bounded |
| Dedupe | collapse by canonical URL, then by domain+title shingle | n/a | Reduces extract calls |

## 7. Recommendation

**Default (works out of the box, no new install):**
- Search: Brave Search API with the user's key (V price $5/1k, $5 free credit, 50 qps). Optionally Exa as second source (V free $10/mo) for company/people discovery.
- Fetch: existing raw-CDP/plain HTTP fetch first, existing self-hosted Firecrawl client second. Pass only cleaned text to the LLM.
- Pipeline: deterministic plan -> search -> fetch -> extract; agent loop is opt-in fallback for low-coverage jobs.
- Store only facts + URLs; surface Brave's storage-rights clause in settings help (V) and check it before caching raw results.

**Fallback chain:** Brave -> Exa -> Serper (2,500 free) -> local SearXNG (private, JSON enabled, low concurrency, expect engine suspensions) -> provider-native web search (Anthropic/OpenAI $10/1k, Gemini 3.x $14/1k after 5,000/mo free) only when the user has that key and no search key.

**Do not use:** Google Custom Search JSON API (closed to new customers, V), Bing Search API (retired, V-snippet), DuckDuckGo scraping (no official API, V-snippet).

**Offline/no-key mode:** SearXNG (AGPL, run as separate process) + CDP. It is the only $0 option that does not need any key. It is also the least reliable (V-snippet on blocking), so label it "best effort" in the UI.

## 8. Open items (U, resolve before building)

1. Tavily, Exa, Serper rate limits and ToS on storing results or using them with LLMs: not read.
2. Jina licence scope for Reader service vs models (page mentions CC-BY-NC for models).
3. Firecrawl `/search` on self-host: whether it needs a SearXNG endpoint or cloud only. Not confirmed from pages read.
4. OpenRouter Firecrawl/Parallel engine prices.
5. Real latency and cost numbers: run a 10-job measurement on a cloned profile once the pipeline exists.
6. Serper tier prices come from a secondary site (coldiq), not serper.dev (its /pricing returned 404).
7. LLM token price line depends on user model; measure rather than trust the placeholder.
