// One section's translations. `en` is the source of truth; other locales are
// optional; a missing key falls back to `en`. Keys are
// dotted, grouped by section, and stable across wording changes.
export type SectionCatalog = {
  en: Record<string, string>
  fr?: Record<string, string>
  ja?: Record<string, string>
  ko?: Record<string, string>
  zhCN?: Record<string, string>
  zhTW?: Record<string, string>
}
