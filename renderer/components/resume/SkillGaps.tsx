import type { SkillGap } from '../../lib/types'
import { Badge } from '../ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'

const BUCKET = {
  gap: ['danger', 'Missing'],
  supported: ['warn', 'Related'],
  existing: ['success', 'On your résumé'],
} as const

/** Every JD skill with where it stands and the concrete way to add it. Adding one is an Apply on the finding below. */
export function SkillGaps({ gaps }: { gaps: SkillGap[] }) {
  return (
    <Table className="prose-table">
      <TableHeader>
        <TableRow>
          <TableHead>Skill</TableHead>
          <TableHead>Job asks</TableHead>
          <TableHead>Your résumé</TableHead>
          <TableHead className="w-[46%]">How to add it</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {gaps.map(g => {
          const [variant, label] = BUCKET[g.bucket]
          return (
            <TableRow key={g.skill}>
              <TableCell className="font-medium">{g.skill}</TableCell>
              <TableCell>{g.required ? 'Required' : 'Preferred'}</TableCell>
              <TableCell><Badge variant={variant}>{label}</Badge>{g.lowConfidence && <span className="ml-2 text-xs text-muted-foreground">low confidence</span>}</TableCell>
              <TableCell className="muted">{g.howToAdd}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
