// Scripted fake LLM: replies by matching the system prompt, so tests never touch a network.
export type Call = (system: string, user: string) => Promise<string>
export type Script = Array<{ when: RegExp; reply: string | ((user: string) => string) }>

export const scripted = (script: Script): Call & { calls: Array<{ system: string; user: string }> } => {
  const calls: Array<{ system: string; user: string }> = []
  const fn = (async (system: string, user: string): Promise<string> => {
    calls.push({ system, user })
    const hit = script.find(s => s.when.test(system))
    if (!hit) throw new Error(`no scripted reply for: ${system.slice(0, 60)}`)
    return typeof hit.reply === 'function' ? hit.reply(user) : hit.reply
  }) as Call & { calls: typeof calls }
  fn.calls = calls
  return fn
}
