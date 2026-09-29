export type GeneralReply = { text: string; highlight: string[] }

export async function askGeneral(body: { d?: string; q?: string }): Promise<GeneralReply> {
  const r = await fetch('/api/general', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error ?? (r.status >= 500 ? 'The General is offline right now. Try again in a few minutes.' : `Request failed (${r.status})`))
  return data
}
