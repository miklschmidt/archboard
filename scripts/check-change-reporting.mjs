#!/usr/bin/env bun

// The change-reporting reducer runs here with no browser. The scene adapter,
// server and clock are all in memory, so each ordering can be stated directly.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const reporting = await import(join(repoRoot, 'frontend', 'src', 'canvas', 'change-reporting.ts'))
const {
  hasPendingEdits, initialState, mergeIncoming, reduce
} = reporting

let failures = 0
let checks = 0
const check = (label, condition, detail = '') => {
  checks += 1
  if (!condition) failures += 1
  console.log(`${condition ? 'ok  ' : 'FAIL'} - ${label}${detail ? ` (${detail})` : ''}`)
}

const copy = value => structuredClone(value)
const box = (id, x = 0, y = 0) => ({
  id, type: 'rectangle', x, y, width: 120, height: 80, version: 1
})
const initialScene = () => [box('a'), box('b', 200)]

class ManualClock {
  now = 0
  nextId = 1
  timers = new Map()

  start(kind, delayMs, callback) {
    if (kind !== 'finish') this.cancel(kind)
    const id = this.nextId++
    this.timers.set(id, { id, kind, at: this.now + delayMs, callback })
  }

  cancel(kind) {
    for (const [id, timer] of this.timers) {
      if (timer.kind === kind) this.timers.delete(id)
    }
  }

  advance(ms) {
    const target = this.now + ms
    for (;;) {
      const due = [...this.timers.values()]
        .filter(timer => timer.at <= target)
        .sort((left, right) => left.at - right.at || left.id - right.id)[0]
      if (!due) break
      this.timers.delete(due.id)
      this.now = due.at
      due.callback()
    }
    this.now = target
  }
}

class ScriptedServer {
  document
  requests = []

  constructor(scene) {
    this.document = copy(scene)
  }

  receive(effect) {
    this.requests.push(effect)
  }

  accept() {
    const request = this.requests.shift()
    if (!request) throw new Error('No change report is waiting for a server reply')
    const byId = new Map(this.document.map(element => [element.id, element]))
    for (const id of request.report.deletes) byId.delete(id)
    for (const element of request.report.upserts) byId.set(element.id, copy(element))
    this.document = [...byId.values()]
    return { request, document: copy(this.document) }
  }

  refuse() {
    const request = this.requests.shift()
    if (!request) throw new Error('No change report is waiting for a refusal')
    return request
  }
}

class Harness {
  state = initialState()
  scene
  clock = new ManualClock()
  server
  withheldIds = []

  constructor(scene = initialScene()) {
    this.scene = copy(scene)
    this.server = new ScriptedServer(scene)
    this.dispatch({
      type: 'server_update_requested',
      update: { elements: copy(scene), captureUpdate: 'never' },
      baselineUpdate: { type: 'replace', withheldIds: [] }
    })
    this.clock.advance(0)
    this.dispatch({ type: 'user_interacted' })
    this.assertSafe('initial state')
  }

  dispatch(event) {
    const result = reduce(this.state, event)
    this.state = result.state
    for (const effect of result.effects) this.execute(effect)
  }

  execute(effect) {
    switch (effect.type) {
      case 'cancel_report_timer':
        this.clock.cancel('report')
        break
      case 'start_report_timer':
        this.clock.start('report', effect.delayMs, () => this.dispatch({
          type: 'report_timer_fired', generation: effect.generation,
          scene: copy(this.scene), withheldIds: this.withheldIds
        }))
        break
      case 'cancel_retry_timer':
        this.clock.cancel('retry')
        break
      case 'start_retry_timer':
        this.clock.start('retry', effect.delayMs, () => this.dispatch({
          type: 'retry_timer_fired', generation: effect.generation,
          scene: copy(this.scene), withheldIds: this.withheldIds
        }))
        break
      case 'apply_server_update':
        if (effect.update.elements) this.scene = copy(effect.update.elements)
        this.dispatch({
          type: 'server_update_applied', generation: effect.generation,
          scene: copy(this.scene), baselineUpdate: effect.baselineUpdate,
          reportAfterUpdate: effect.reportAfterUpdate
        })
        break
      case 'finish_server_update':
        this.clock.start('finish', 0, () => this.dispatch({
          type: 'server_update_finished', generation: effect.generation, scene: copy(this.scene)
        }))
        break
      case 'send_report':
        this.server.receive(effect)
        break
      case 'send_beacon':
      case 'take_hold':
      case 'note_change':
      case 'release_if_idle':
      case 'publish_status':
        break
      default:
        throw new Error(`Unhandled effect ${effect.type}`)
    }
  }

  assertSafe(step) {
    const pending = hasPendingEdits(this.state, this.scene, this.withheldIds)
    const scheduled = this.state.reportTimerScheduled || this.state.retryTimerScheduled
    check(`${step}: pending edits have a report in flight or scheduled`,
      !pending || this.state.inFlightReport !== null || scheduled,
      `pending=${pending} inFlight=${this.state.inFlightReport !== null} scheduled=${scheduled}`)
  }

  step(label, action) {
    action()
    this.assertSafe(label)
  }

  edit(id, changes) {
    this.scene = this.scene.map(element => element.id === id
      ? { ...element, ...changes, version: (element.version ?? 0) + 1 }
      : element)
    this.dispatch({ type: 'scene_changed', scene: copy(this.scene) })
  }

  due() {
    this.clock.advance(10_000)
  }

  accept() {
    const { request, document } = this.server.accept()
    this.dispatch({
      type: 'report_succeeded', generation: request.generation,
      document, currentScene: copy(this.scene)
    })
    this.clock.advance(0)
  }

  refuse() {
    const request = this.server.refuse()
    this.dispatch({ type: 'report_refused', generation: request.generation })
  }

  applyServerElements(incoming) {
    const { elements, touchedIds } = mergeIncoming(this.scene, incoming)
    this.dispatch({
      type: 'server_update_requested',
      update: { elements, captureUpdate: 'never' },
      baselineUpdate: { type: 'touch', ids: touchedIds }
    })
  }
}

// The reply to the first report must not replace a later user edit.
{
  const h = new Harness()
  h.step('own reply after a first user edit is pending', () => h.edit('a', { x: 10 }))
  h.step('the first report starts', () => h.due())
  h.step('a later user edit schedules another report', () => h.edit('a', { x: 20 }))
  h.step('the earlier reply does not replace the later user edit', () => h.accept())
  check('the later user edit remains in the scene', h.scene.find(element => element.id === 'a').x === 20)
  h.step('the later user edit starts its report', () => h.due())
  h.step('the later user edit is accepted', () => h.accept())
  check('the server holds the later user edit', h.server.document.find(element => element.id === 'a').x === 20)
}

// A server update can be applied while a user report is waiting for its reply.
{
  const h = new Harness()
  h.step('a report is in flight before a server update', () => { h.edit('a', { x: 10 }); h.due() })
  h.server.document = h.server.document.map(element => element.id === 'b' ? { ...element, y: 40 } : element)
  h.step('a server update is applied while the report is in flight', () => {
    h.applyServerElements([{ ...h.scene.find(element => element.id === 'b'), y: 40 }])
    h.clock.advance(0)
  })
  h.step('the reply keeps both accepted changes', () => h.accept())
  check('the scene keeps the user edit and the server update',
    h.scene.find(element => element.id === 'a').x === 10
      && h.scene.find(element => element.id === 'b').y === 40)
}

// A user edit can occur before the server update completion timer runs.
{
  const h = new Harness()
  h.step('a user edit during a server update schedules a report when application finishes', () => {
    h.applyServerElements([{ ...h.scene.find(element => element.id === 'b'), y: 30 }])
    h.scene = h.scene.map(element => element.id === 'a' ? { ...element, x: 15, version: 2 } : element)
    h.dispatch({ type: 'scene_changed', scene: copy(h.scene) })
    h.clock.advance(0)
  })
  check('the reducer counted the user edit during the server update', h.state.localEditCount === 1)
  h.step('the user edit during the server update starts a report', () => h.due())
}

// Completion records remain ordered when server updates overlap.
{
  const h = new Harness()
  h.step('two overlapping server updates both finish', () => {
    h.applyServerElements([{ ...h.scene.find(element => element.id === 'a'), x: 5 }])
    h.applyServerElements([{ ...h.scene.find(element => element.id === 'b'), y: 5 }])
    check('both server updates are being applied', h.state.applyingServerUpdateCount === 2)
    check('both server update stamps are queued', h.state.serverUpdateStamps.length === 2)
    h.clock.advance(0)
  })
  check('the applying count returns to zero', h.state.applyingServerUpdateCount === 0)
  check('the server update stamp queue is empty', h.state.serverUpdateStamps.length === 0)
}

// A refused delta is followed by a full report using the existing wire flag.
{
  const h = new Harness()
  h.step('a delta report starts before refusal', () => { h.edit('a', { x: 25 }); h.due() })
  h.step('a refused write schedules a full report', () => h.refuse())
  h.step('the retry starts immediately', () => h.clock.advance(0))
  const retry = h.server.requests[0]
  check('the retry uses the full-report state', retry?.fullReport === true)
  check('the full report includes every live element', retry?.report.upserts.length === h.scene.length)
}

// A timer belongs to the board on which it was scheduled.
{
  const h = new Harness()
  h.step('a report is scheduled before board adoption', () => h.edit('a', { x: 9 }))
  h.step('board adoption cancels the scheduled report', () => {
    h.dispatch({ type: 'board_adopted' })
    const next = [box('c', 400)]
    h.scene = copy(next)
    h.server = new ScriptedServer(next)
    h.dispatch({
      type: 'server_update_requested',
      update: { elements: next, captureUpdate: 'never' },
      baselineUpdate: { type: 'replace', withheldIds: [] }
    })
    h.clock.advance(20_000)
  })
  check('the old board produced no report after adoption', h.server.requests.length === 0)
}

// Text ids are renamed before the reducer builds the report.
{
  const longId = 'text-element-from-excalidraw'
  const h = new Harness([box('a'), { id: longId, type: 'text', text: 'Name', x: 0, y: 100, version: 1 }])
  h.step('a text edit schedules a report', () => h.edit(longId, { text: 'Changed' }))
  h.step('the report waits for the text id rename to be applied', () => h.due())
  const request = h.server.requests[0]
  check('the reducer reports the renamed text id',
    request?.report.upserts.some(element => element.type === 'text'
      && element.id !== longId && element.id.length <= 8))
}

if (failures > 0) {
  console.error(`\nchange-reporting: ${failures} of ${checks} checks failed`)
  process.exit(1)
}

console.log(`\nchange-reporting: ${checks} checks passed`)
