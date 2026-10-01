import type { PageId } from './pages'
import { PAGES } from './pages'
import { Group, Note } from '../kit/Group'

/** Placeholder body until the owning work package replaces the page file (export name and props stay the same). */
export function PageStub({ page, owner }: { page: PageId; owner: string }) {
  const label = PAGES.find(p => p.id === page)?.label
  return (
    <Group title={label}>
      <Note>This page arrives with {owner}. Nothing here is lost: your existing settings keep working.</Note>
    </Group>
  )
}
