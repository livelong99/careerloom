import { useEffect, useState, type ReactNode } from 'react'

import { version } from '../../package.json'
import { t } from '../i18n'
import { careerloom } from '../lib/ipc'
import { isMacPlatform, isModifierChord, shortcutLabel } from '../lib/platform'
import loomi from '../assets/loomi.svg'
import { Icon } from './icons'

export type Section = 'overview' | 'jobs' | 'boards' | 'resume' | 'agent' | 'monitoring' | 'runs' | 'settings' | 'job' | 'copilot'

type NavItem = { id: Section; label: string; key: string; icon: ReactNode }

/** A function, not a module-level constant: it must re-read t() on every call
 *  so a language switch (which remounts the app subtree, not the module) is
 *  reflected. */
export function navGroups(): Array<{ label?: string; items: NavItem[] }> {
  return [
    { items: [{ id: 'overview', label: t('shell.nav.overview'), key: '1', icon: <Icon name="layout-dashboard" /> }] },
    {
      label: 'Job search',
      items: [
        { id: 'jobs', label: 'Jobs', key: '2', icon: <Icon name="list" /> },
        { id: 'boards', label: 'Boards', key: '3', icon: <Icon name="layout-grid" /> },
        { id: 'resume', label: 'Resume', key: '4', icon: <Icon name="tag" /> },
      ],
    },
    {
      label: 'Agents',
      items: [
        { id: 'agent', label: 'Agent', key: '5', icon: <Icon name="sparkles" /> },
        { id: 'monitoring', label: 'Monitoring', key: '6', icon: <Icon name="chart-column" /> },
        { id: 'runs', label: 'Runs', key: '7', icon: <Icon name="history" /> },
      ],
    },
    // macOS only for now (plan §3.1): no half-working section elsewhere.
    ...(isMacPlatform() ? [{ label: 'Interview', items: [{ id: 'copilot' as const, label: 'Copilot', key: '8', icon: <Icon name="mic" /> }] }] : []),
    { items: [{ id: 'settings', label: t('shell.nav.settings'), key: ',', icon: <Icon name="settings" /> }] },
  ]
}

export function Sidebar({
  active,
  onNavigate,
  attention = false,
}: {
  active: Section
  onNavigate: (section: Section) => void
  /** Something in Settings needs the user: a dot on the Settings item. */
  attention?: boolean
  status?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => { writeCollapsed(collapsed) }, [collapsed])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isModifierChord(event) || event.key.toLowerCase() !== 'b') return
      event.preventDefault()
      setCollapsed(value => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <nav className={collapsed ? 'sb collapsed' : 'sb'} aria-label="Main">
        <div className="app">
          <img className="brand-mark" src={loomi} alt="" width={24} height={24} />
          <b className="brand-text">Career<span className="loom">loom</span></b>
          <button
            type="button"
            className="sb-collapse"
            aria-label={collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')}
            aria-expanded={!collapsed}
            data-tip={`${collapsed ? t('shell.sidebar.expand') : t('shell.sidebar.collapse')} ${shortcutLabel('B')}`}
            onClick={() => setCollapsed(value => !value)}
          >
            <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} />
          </button>
        </div>
        {navGroups().map((group, i) => (
          <div className="grp" key={i}>
            {group.label ? <div className="grp-label">{group.label}</div> : null}
            {group.items.map(item => (
              <div
                key={item.id}
                className={item.id === active ? 'ni on' : 'ni'}
                role="button"
                aria-current={item.id === active ? 'page' : undefined}
                data-tip={`${item.label} ${shortcutLabel(item.key)}`}
                title={`${item.label} ${shortcutLabel(item.key)}`}
                tabIndex={0}
                onClick={() => onNavigate(item.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onNavigate(item.id)
                  }
                }}
              >
                {item.icon}
                <span className="ni-label">{item.label}</span>
                {item.id === 'settings' && attention && <span role="img" aria-label="Needs attention" className="ml-auto size-2 rounded-full" style={{ background: 'var(--warn)' }} />}
              </div>
            ))}
          </div>
        ))}
        <div className="push" />
        <div className="foot">
          <button
            type="button"
            className="about"
            data-tip="Help and docs"
            onClick={() => void careerloom.openExternal(HELP_URL)}
          >
            <Icon name="info" />
            <span className="ni-label">Help</span>
            <span className="ver">v{version}</span>
          </button>
        </div>
      </nav>
    </>
  )
}

const COLLAPSE_KEY = 'careerloom.sidebarCollapsed'
const HELP_URL = 'https://github.com/career-ops-hq/career-ops'

/** Read at first render, not in an effect, so a collapsed sidebar never paints
 *  wide for a frame before snapping shut. */
function readCollapsed(): boolean {
  try { return globalThis.localStorage?.getItem(COLLAPSE_KEY) === '1' } catch { return false }
}

function writeCollapsed(collapsed: boolean): void {
  try { globalThis.localStorage?.setItem(COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* storage can be unavailable */ }
}
