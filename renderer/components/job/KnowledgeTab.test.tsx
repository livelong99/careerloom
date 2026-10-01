// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { KnowledgeTab } from './KnowledgeTab'

describe('KnowledgeTab stub', () => {
  it('renders the placeholder for a job', () => {
    render(<KnowledgeTab jobId="job-1" />)
    expect(screen.getByText('Knowledge base')).toBeInTheDocument()
    expect(screen.getByText(/will appear here/i)).toBeInTheDocument()
  })
})
