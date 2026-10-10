import { describe, expect, it } from 'vitest'

import { PAGES, isPageId } from '../components/settings/pages'
import { GOALS, PIPELINE, TOPICS, searchTopics, topicById } from './topics'

describe('help topics', () => {
  it('has unique ids and every cross-reference resolves', () => {
    expect(new Set(TOPICS.map(t => t.id)).size).toBe(TOPICS.length)
    for (const id of [...GOALS.flatMap(g => g.path), ...PIPELINE.map(p => p.id)]) expect(topicById(id), id).toBeTruthy()
  })
  it('links only to real Settings pages', () => {
    for (const g of TOPICS.flatMap(t => t.go ?? [])) if (g.page) expect(isPageId(g.page), g.page).toBe(true)
  })
  it('documents every Settings page and every sidebar screen', () => {
    const linked = new Set(TOPICS.flatMap(t => t.go ?? []).filter(g => g.section === 'settings').map(g => g.page))
    for (const p of PAGES) expect(linked.has(p.id), `Settings › ${p.label}`).toBe(true)
    const screens = new Set(TOPICS.flatMap(t => t.go ?? []).map(g => g.section))
    for (const s of ['overview', 'jobs', 'boards', 'resume', 'agent', 'monitoring', 'runs', 'copilot', 'settings']) expect(screens.has(s as never), s).toBe(true)
  })
  it('searches by title, body and keywords', () => {
    expect(searchTopics('firecrawl').map(t => t.id)).toContain('integrations')
    expect(searchTopics('chords')[0].id).toBe('shortcuts')
    expect(searchTopics('zzzz')).toEqual([])
    expect(searchTopics('')).toHaveLength(TOPICS.length)
  })
})
