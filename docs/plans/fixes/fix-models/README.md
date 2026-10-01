# FIX-MODELS: OpenRouter data policy vs default models

**Symptom:** with the default `provider.data_collection: 'deny'`, free models (`qwen/qwen3.8-27b:free`, ...) fail Test with
"No endpoints found matching your data policy (Free model training)"; the picker says "Data policy unknown".

**Root cause (sources, read 2026-10-01):**
- OpenRouter docs, *Provider routing* (`openrouter.ai/docs/guides/routing/provider-selection`): `data_collection: "deny"` restricts routing to providers that do not store/train on prompts; the Data Policy tag on model pages is "best knowledge", not definitive.
- OpenRouter docs, *Privacy and logging* (`openrouter.ai/docs/features/privacy-and-logging`): the account settings have "separate settings for paid and free models" for routing to providers that may train. So free endpoints can be excluded by the request (`deny`) **and** by the account.
- `GET /api/v1/models` and `GET /api/v1/models/:id/endpoints` (no key) expose **no** data-policy/training field (checked: 462 models; endpoint keys are pricing, quantization, uptime, tags...). Only signal: `:free` id / zero price. Paid models' real fit is learned by a Test probe under `deny` (cached in `copilot-llm-probes.json`).
- Curated defaults were already paid, but `google/gemini-2.5-flash-lite` (the fast default) carries `expiration_date: 2026-10-20`; dropped. Fast default is now `openai/gpt-4.1-nano` ($0.10/$0.40 per M).

**Fix:** free = "May use your prompts" badge; warning + one-click "Allow free models (they may train on your text)" under `deny` (default stays `deny`); 404 policy/unavailable and other errors mapped to friendly messages with actions (Change model, Open OpenRouter privacy settings, Manage key); engine attaches a *suggested* fallback model on policy errors and never switches silently.

**Evidence:** `before-{dark,light}.png`, `after-{dark,light}.png` (static mock-bridge harness `scripts/fix-models-qa`, data shaped like the old/new backend; the backend itself is covered by fake-fetch tests for each error shape: policy 404, other 404, 401, 402, 429, 5xx, no key).

**Not verified live:** no key, so the claim "paid curated models pass `deny`" rests on OpenRouter's docs/tags, not a call. Follow-up risk: balanced/deep curated models mostly have mandatory reasoning while the request sends `reasoning: { enabled: false }` (WP2 behaviour, untouched).
