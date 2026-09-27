import { describe, expect, it } from 'vitest'

import { agyFormatter, agyResultOk, agySessionId, agyUsage, argsForPrompt } from './runner'

// Trimmed from a real `agy -p … --output-format stream-json` run.
const STREAM = [
  '{"event":"init","conversation_id":"65f02f8f-1812-4a42-9b39-e98520497b7c","init":{"cwd":"/w"}}',
  '{"event":"step_update","step_update":{"step_index":1,"state":"DONE","step_type":"agent_response","usage":{"input_tokens":23186}}}',
  '{"event":"step_update","step_update":{"step_index":2,"state":"ACTIVE","step_type":"tool","tool_name":"run_command","tool_info":{"name":"run_command","parameters":{"CommandLine":"git log -n 1 --format=%h"}}}}',
  '{"event":"step_update","step_update":{"step_index":2,"state":"DONE","step_type":"tool","tool_name":"run_command","tool_info":{"parameters":{"CommandLine":"git log -n 1 --format=%h"},"output":"2b9fe7e"}}}',
  '{"event":"step_update","step_update":{"step_index":9,"state":"ACTIVE","step_type":"agent_response","text_delta":"The latest commit is `2b9fe7e`, and "}}',
  '{"event":"step_update","step_update":{"step_index":9,"state":"ACTIVE","step_type":"agent_response","text_delta":"the README starts with a logo."}}',
  '{"event":"step_update","step_update":{"step_index":10,"state":"ACTIVE","step_type":"tool","tool_name":"view_file","tool_info":{"parameters":{"AbsolutePath":"/w/README.md"}}}}',
  '{"event":"result","result":{"status":"SUCCESS","duration_seconds":35.9,"num_turns":1,"usage":{"input_tokens":59279,"output_tokens":1593,"thinking_tokens":1236,"cache_read_tokens":61123}}}',
]

describe('agy stream-json', () => {
  it('streams text deltas as-is and puts tool steps on their own lines', () => {
    const fmt = agyFormatter()
    const out = STREAM.map(fmt).filter(Boolean).join('')
    expect(out).toBe(
      '▸ run_command git log -n 1 --format=%h\n'
      + 'The latest commit is `2b9fe7e`, and the README starts with a logo.'
      + '\n▸ view_file /w/README.md\n'
      + '\n✓ done · 61K tokens · 36s\n',
    )
  })

  it('reads the conversation id, usage and final status', () => {
    expect(agySessionId(STREAM[0]!)).toBe('65f02f8f-1812-4a42-9b39-e98520497b7c')
    expect(agyUsage(STREAM.at(-1)!)).toEqual({ costUsd: null, inputTokens: 120402, outputTokens: 2829, turns: 1, durationMs: 35900 })
    expect(agyResultOk(STREAM.at(-1)!)).toBe(true)
    expect(agyResultOk('{"event":"result","result":{"status":"ERROR"}}')).toBe(false)
  })

  it('asks agy for stream-json and continues a conversation', () => {
    const { args } = argsForPrompt('antigravity', '/career-ops x', { resume: '65f02f8f-1812-4a42-9b39-e98520497b7c' })
    expect(args).toEqual(['-p', '/career-ops x', '--output-format', 'stream-json', '--conversation', '65f02f8f-1812-4a42-9b39-e98520497b7c'])
  })
})
