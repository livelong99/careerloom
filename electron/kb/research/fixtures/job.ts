import type { PipelineDeps } from '../pipeline'

/** A CV full of PII: none of it may appear in any outgoing query or page request. */
export const CV = `Priya Raghunathan
priya.raghunathan@example.com | +91 98765 43210 | 14 Lotus Street, Pune
Led the migration of the checkout surface from a legacy jQuery bundle to React and cut median load time by thirty percent across four release trains.
Mentored five junior engineers and ran weekly design reviews for the payments squad.
Skills: JavaScript, TypeScript, React, Node.js, accessibility testing`

export const JOB: PipelineDeps['job'] = {
  jobId: 'https://jobs.example.com/acme/senior-frontend', title: 'Senior Frontend Engineer', company: 'Acme Corp', seniority: 'Senior',
  techStack: ['React', 'TypeScript', 'GraphQL', 'Node.js'], skills: ['System design', 'Leadership', 'Testing'], requirements: ['Strong React and TypeScript experience', 'Experience with GraphQL APIs'],
  gaps: ['GraphQL'], cv: CV, userName: 'Priya Raghunathan',
}
