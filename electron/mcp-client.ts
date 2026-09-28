// Minimal MCP stdio client (newline-delimited JSON-RPC) for the in-process zen runner:
// initialize, tools/list, tools/call. Only what browser boards need.
import { spawn } from 'node:child_process'

import type { McpServer } from './integrations/browser-args'
import { spawnSpec } from './runner'

export type McpTool = { name: string; description?: string; inputSchema?: Record<string, unknown> }
export type McpClient = { tools: McpTool[]; call: (name: string, args: unknown) => Promise<string>; close: () => void }

export async function connectMcp(server: McpServer, cwd: string, timeoutMs = 120_000): Promise<McpClient> {
  const spec = spawnSpec(server.command, server.args)
  const child = spawn(spec.bin, spec.args, { cwd, env: { ...spec.env, PWD: cwd }, stdio: ['pipe', 'pipe', 'ignore'], shell: false, windowsHide: true, ...(spec.verbatim ? { windowsVerbatimArguments: true } : {}) })
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  let nextId = 1
  let buf = ''
  const failAll = (err: Error) => { for (const p of pending.values()) p.reject(err); pending.clear() }
  child.on('error', err => failAll(err))
  child.on('close', () => failAll(new Error('the browser tool server stopped')))
  child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
    const lines = (buf + chunk).split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      let msg: { id?: number; result?: unknown; error?: { message?: string } }
      try { msg = JSON.parse(line) } catch { continue }
      const p = typeof msg.id === 'number' ? pending.get(msg.id) : undefined
      if (!p) continue
      pending.delete(msg.id!)
      if (msg.error) p.reject(new Error(msg.error.message ?? 'MCP error'))
      else p.resolve(msg.result)
    }
  })
  const send = (msg: object) => child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`)
  const request = (method: string, params: object): Promise<unknown> => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, timeoutMs)
    pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v) }, reject: e => { clearTimeout(timer); reject(e) } })
    send({ id, method, params })
  })
  const close = () => { child.stdin?.end(); child.kill() }
  try {
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'careerloom', version: '1' } })
    send({ method: 'notifications/initialized' })
    const { tools } = (await request('tools/list', {})) as { tools: McpTool[] }
    return {
      tools,
      close,
      call: async (name, args) => {
        const res = (await request('tools/call', { name, arguments: args ?? {} })) as { content?: Array<{ type: string; text?: string }>; isError?: boolean }
        const text = (res.content ?? []).map(c => (c.type === 'text' ? c.text ?? '' : `[${c.type}]`)).join('\n')
        return res.isError ? `Error: ${text}` : text
      },
    }
  } catch (err) {
    close()
    throw err
  }
}
