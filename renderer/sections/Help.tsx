import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Article } from '../help/Article'
import { HelpRail } from '../help/HelpRail'
import { Landing } from '../help/Landing'
import { TOPICS, searchTopics, topicById } from '../help/topics'
import { useRead } from '../help/useRead'

/** In-app documentation: a contents rail beside either the landing (pipeline map + goals) or one topic. */
export function Help({ focusId, onFocusHandled }: { focusId?: string | null; onFocusHandled?: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(() => (topicById(focusId) ? focusId! : null))
  const [query, setQuery] = useState('')
  const [read, markRead] = useRead()
  const searchRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)

  // Deep link from elsewhere ("Learn more" on a screen) opens that topic.
  useEffect(() => {
    if (!focusId) return
    if (topicById(focusId)) { setActiveId(focusId); setQuery('') }
    onFocusHandled?.()
  }, [focusId, onFocusHandled])

  const topic = topicById(activeId)
  useEffect(() => {
    if (!topic) return
    markRead(topic.id)
    mainRef.current?.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [topic, markRead])

  // "/" jumps to search unless the reader is already typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key !== '/' || e.metaKey || e.ctrlKey || el?.closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo(() => searchTopics(query), [query])
  const pick = useCallback((id: string) => { setActiveId(id); setQuery('') }, [])
  const at = topic ? TOPICS.indexOf(topic) : -1

  return (
    <div className="workspace workspace-fill"><div className="flex min-h-0 flex-1 flex-col gap-5 md:flex-row md:gap-8">
      <HelpRail topics={results} searching={query.trim() !== ''} activeId={activeId} read={read} query={query} onQuery={setQuery} onPick={pick} onHome={() => { setActiveId(null); setQuery('') }} searchRef={searchRef} />
      <div ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1 md:pr-4">
        {topic
          ? <Article ref={headingRef} topic={topic} prev={TOPICS[at - 1]} next={TOPICS[at + 1]} onPick={pick} />
          : <Landing read={read} onPick={pick} />}
      </div>
    </div></div>
  )
}
