// Two ways a pane can decide it has nothing to say about an edit somebody
// made, and a witness for each.
//
// The pane owes the server every difference between the scene and its baseline
// (./changes). An edit is safe while that debt stands and something is going to
// pay it. It is lost the moment either half stops being true, and both halves
// can stop quietly:
//
//   ABSORBED   The baseline is written down from the live scene rather than
//              from the delivery it is meant to record. Anything a hand did in
//              between goes into the record as already agreed, and the pane
//              will never mention it again.
//
//   UNARMED    The debt stands, and nothing is going to pay it. No report in
//              flight, no debounce running, no retry pending — the pane is
//              simply holding an edit and waiting for the person to touch
//              something else.
//
// Neither is visible from outside. `check-live-session` sees the two documents
// disagree six seconds later and cannot say which of forty-two cycles did it,
// or by which of these two routes. These say so at the moment it happens, with
// the element, the field and both values (TASK-099).
//
// OFF UNLESS SOMEBODY IS ASKING. Both cost a walk of the scene, which is the
// expensive thing the report debounce exists to do once per gesture, so a page
// pays for them only when something has created `window.__abLoss` — nothing in
// the frontend ever does. `check-live-session` creates it and asserts both
// counts stay at zero.

import { fingerprint } from './changes'

/** What the canary has seen, once created by whoever wants to read it. */
export interface LossCanary {
  /** Deliveries watched. */
  deliveries: number
  /** Deliveries during which the scene moved at all. */
  moved: number
  /** Deliveries whose record covered an element the scene had moved on from. */
  absorbed: number
  /** Times the pane was found owing the server something with nothing armed. */
  unarmed: number
  events: LossEvent[]
}

export interface LossEvent {
  loss: 'absorbed' | 'unarmed' | 'moved'
  kind: string
  what: string[]
}

interface Armed {
  kind: string
  /** The scene as the delivery left it, by id. */
  delivered: Map<string, Record<string, any>>
  /** Whether the record this delivery is about to write will cover that id. */
  records: (id: string) => boolean
}

function canary(): LossCanary | null {
  const found = (globalThis as any).__abLoss
  return found && typeof found === 'object' ? found as LossCanary : null
}

/** Is anybody watching? Asked before the scene is walked, so nobody else pays. */
export function watchingForLoss(): boolean {
  return canary() !== null
}

function saw(loss: LossEvent['loss'], kind: string, what: string[]): void {
  const watching = canary()
  if (!watching) return
  if (loss === 'absorbed') watching.absorbed += 1
  if (loss === 'unarmed') watching.unarmed += 1
  watching.events.push({ loss, kind, what })
  const line = `[loss canary] ${loss}: ${kind}`
  if (loss === 'moved') console.warn(line, what)
  else console.error(line, what)
}

/**
 * The scene as the delivery left it. Taken synchronously by the caller, in the
 * same statement sequence as `updateScene`, so nothing can have happened yet.
 */
export function armDelivery(
  kind: string,
  scene: readonly Record<string, any>[],
  records: (id: string) => boolean
): Armed | null {
  if (!canary()) return null
  const delivered = new Map<string, Record<string, any>>()
  for (const element of scene) {
    if (element && typeof element.id === 'string') delivered.set(element.id, { ...element })
  }
  return { kind, delivered, records }
}

const describe = (value: unknown): string => {
  const said = JSON.stringify(value)
  return said === undefined ? 'undefined' : said.length > 60 ? `${said.slice(0, 57)}...` : said
}

/** What the scene is now, held against what the delivery left. */
export function readDelivery(armed: Armed | null, scene: readonly Record<string, any>[]): void {
  const watching = canary()
  if (!armed || !watching) return
  watching.deliveries += 1

  const live = new Map<string, Record<string, any>>()
  for (const element of scene) {
    if (element && typeof element.id === 'string') live.set(element.id, element)
  }

  const what: string[] = []
  let absorbed = false
  const note = (id: string, said: string): void => {
    const covered = armed.records(id)
    what.push(`${covered ? 'absorbed' : 'survives'} ${id}: ${said}`)
    if (covered) absorbed = true
  }

  for (const [id, was] of armed.delivered) {
    const now = live.get(id)
    if (!now) {
      note(id, 'gone from the scene')
      continue
    }
    if (fingerprint(was) === fingerprint(now)) continue
    const fields = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()
      .filter((key) => !['version', 'versionNonce', 'updated'].includes(key))
      .filter((key) => describe(was[key]) !== describe(now[key]))
      .map((key) => `.${key} ${describe(was[key])} -> ${describe(now[key])}`)
    if (fields.length > 0) note(id, fields.join(', '))
  }
  for (const id of live.keys()) {
    if (!armed.delivered.has(id)) note(id, 'new in the scene')
  }

  if (what.length === 0) return
  watching.moved += 1
  saw(absorbed ? 'absorbed' : 'moved', armed.kind, what)
}

/**
 * The pane owes the server this, and nothing is going to say it.
 *
 * Called from every place the pane decides it is done talking. `owed` is the
 * report it would send if it sent one now; an empty one is the healthy case
 * and says nothing.
 */
export function readDebt(
  kind: string,
  owed: { upserts: Record<string, any>[]; deletes: string[] }
): void {
  if (!canary()) return
  if (owed.upserts.length === 0 && owed.deletes.length === 0) return
  saw('unarmed', kind, [
    ...owed.upserts.map((element) => `owes an upsert of ${element.id} (${element.type})`),
    ...owed.deletes.map((id) => `owes the deletion of ${id}`)
  ])
}
