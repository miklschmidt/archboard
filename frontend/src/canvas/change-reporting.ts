import { derivedId, isBlockId } from '../../../src/core/ids'
import {
  REPORT_IDLE_SETTLE_MS, REPORT_PROGRESS_MS, REPORT_RETRY_MS
} from '../../../src/core/timing'
import {
  baselineFrom, diffAgainstBaseline, fingerprint, isEmpty,
  type Baseline, type ChangeReport
} from './changes'

export type SceneElement = Record<string, any>

type BaselineUpdate =
  | { type: 'replace'; withheldIds: readonly string[] }
  | { type: 'touch'; elements: readonly SceneElement[] }
  | { type: 'delete'; ids: readonly string[] }
  | { type: 'none' }

export interface SceneUpdate {
  elements?: readonly SceneElement[]
  appState?: Record<string, unknown>
  captureUpdate: 'never' | 'immediately'
}

interface ReportContext {
  report: ChangeReport
  withheldIds: readonly string[]
  fullReport: boolean
}

interface ReportAfterServerUpdate {
  withheldIds: readonly string[]
  fullReport: boolean
}

export interface ChangeReportingState {
  baseline: Baseline
  sceneStamp: string
  localEditCount: number
  userInteracted: boolean
  progressTimerScheduled: boolean
  progressHasContinuation: boolean
  idleTimerScheduled: boolean
  retryTimerScheduled: boolean
  deliveryQueued: boolean
  applyingServerUpdateCount: number
  serverUpdateStamps: readonly string[]
  fullReportNeeded: boolean
  generation: number
  inFlightReport: ReportContext | null
}

export type ChangeReportingEvent =
  | { type: 'user_interacted' }
  | { type: 'scene_changed'; scene: readonly SceneElement[] }
  | { type: 'local_update_requested'; update: SceneUpdate }
  | { type: 'local_update_applied'; generation: number; scene: readonly SceneElement[] }
  | { type: 'progress_timer_fired'; generation: number; scene: readonly SceneElement[]; withheldIds: readonly string[] }
  | { type: 'idle_timer_fired'; generation: number; scene: readonly SceneElement[]; withheldIds: readonly string[] }
  | { type: 'retry_timer_fired'; generation: number; scene: readonly SceneElement[]; withheldIds: readonly string[] }
  | { type: 'immediate_report_requested'; scene: readonly SceneElement[]; withheldIds: readonly string[] }
  | {
      type: 'server_update_requested'
      update: SceneUpdate
      baselineUpdate: BaselineUpdate
    }
  | {
      type: 'server_update_applied'
      generation: number
      scene: readonly SceneElement[]
      baselineUpdate: BaselineUpdate
      reportAfterUpdate?: ReportAfterServerUpdate
    }
  | {
      type: 'server_update_finished'
      generation: number
      scene: readonly SceneElement[]
      withheldIds: readonly string[]
    }
  | {
      type: 'report_succeeded'
      generation: number
      corrections: { upserts: readonly SceneElement[]; deletes: readonly string[] }
      currentScene: readonly SceneElement[]
    }
  | { type: 'report_refused'; generation: number }
  | { type: 'report_failed'; generation: number }
  | { type: 'board_adopted' }
  | { type: 'reports_cancelled' }
  | { type: 'full_report_cleared' }
  | { type: 'flush_requested'; scene: readonly SceneElement[] }

export type ChangeReportingEffect =
  | { type: 'cancel_progress_timer' }
  | { type: 'start_progress_timer'; delayMs: number; generation: number }
  | { type: 'cancel_idle_timer' }
  | { type: 'start_idle_timer'; delayMs: number; generation: number }
  | { type: 'cancel_retry_timer' }
  | { type: 'start_retry_timer'; delayMs: number; generation: number }
  | { type: 'apply_local_update'; generation: number; update: SceneUpdate }
  | {
      type: 'apply_server_update'
      generation: number
      update: SceneUpdate
      baselineUpdate: BaselineUpdate
      reportAfterUpdate?: ReportAfterServerUpdate
    }
  | { type: 'finish_server_update'; generation: number }
  | { type: 'send_report'; report: ChangeReport; fullReport: boolean; generation: number }
  | { type: 'send_beacon'; report: ChangeReport }
  | { type: 'take_hold' }
  | { type: 'note_change' }
  | { type: 'release_if_idle' }
  | { type: 'publish_status' }

interface ReduceResult {
  state: ChangeReportingState
  effects: ChangeReportingEffect[]
}

export const EMPTY_WITHHELD: readonly string[] = []

export function initialState(): ChangeReportingState {
  return {
    baseline: new Map(),
    sceneStamp: '',
    localEditCount: 0,
    userInteracted: false,
    progressTimerScheduled: false,
    progressHasContinuation: false,
    idleTimerScheduled: false,
    retryTimerScheduled: false,
    deliveryQueued: false,
    applyingServerUpdateCount: 0,
    serverUpdateStamps: [],
    fullReportNeeded: false,
    generation: 0,
    inFlightReport: null
  }
}

const HUMAN_FIELDS = [
  'x', 'y', 'width', 'height', 'angle', 'isDeleted', 'text', 'fontSize', 'fontFamily',
  'textAlign', 'verticalAlign', 'backgroundColor', 'strokeColor', 'strokeStyle',
  'strokeWidth', 'fillStyle', 'roughness', 'opacity', 'link', 'locked',
  'startArrowhead', 'endArrowhead', 'index'
] as const

function fold(hash: number, value: unknown): number {
  if (typeof value === 'number') return (hash * 31 + Math.round(value * 64)) | 0
  if (typeof value === 'boolean') return (hash * 31 + (value ? 1 : 2)) | 0
  if (typeof value === 'string') {
    let folded = (hash * 31 + value.length) | 0
    for (let at = 0; at < value.length; at += 1) folded = (folded * 31 + value.charCodeAt(at)) | 0
    return folded
  }
  return (hash * 31) | 0
}

/** A cheap fingerprint of fields a user edit can change. */
function stampScene(scene: readonly SceneElement[]): string {
  let hash = scene.length
  for (const element of scene) {
    hash = fold(hash, element.id)
    hash = fold(hash, element.version)
    for (const field of HUMAN_FIELDS) hash = fold(hash, element[field])
    const points = element.points
    if (Array.isArray(points)) {
      hash = fold(hash, points.length)
      const last = points[points.length - 1] as number[] | { x: number; y: number } | undefined
      if (Array.isArray(last)) hash = fold(fold(hash, last[0]), last[1])
      else if (last) hash = fold(fold(hash, last.x), last.y)
    }
    hash = fold(hash, Array.isArray(element.groupIds) ? element.groupIds.length : 0)
  }
  return String(hash)
}

function renameTextIds(scene: readonly SceneElement[], withheldIds: readonly string[]): SceneElement[] | null {
  const withheld = new Set(withheldIds)
  const foreign = scene.filter((element) => element.type === 'text' && !element.isDeleted
    && !withheld.has(element.id) && !isBlockId(element.id))
  if (foreign.length === 0) return null

  const taken = new Set(scene.map((element) => element.id as string))
  const renames = new Map<string, string>()
  for (const element of foreign) {
    const name = derivedId(element.id, taken)
    taken.add(name)
    renames.set(element.id, name)
  }

  const renamed = (id: unknown): string | undefined =>
    typeof id === 'string' ? renames.get(id) : undefined
  return scene.map((element) => {
    const next: SceneElement = { ...element }
    next.id = renamed(next.id) ?? next.id
    if (Array.isArray(next.boundElements)) {
      next.boundElements = next.boundElements.map((bound: any) =>
        bound && renamed(bound.id) ? { ...bound, id: renames.get(bound.id) } : bound
      )
    }
    if (renamed(next.containerId)) next.containerId = renames.get(next.containerId)
    if (next.startBinding && renamed(next.startBinding.elementId)) {
      next.startBinding = { ...next.startBinding, elementId: renames.get(next.startBinding.elementId) }
    }
    if (next.endBinding && renamed(next.endBinding.elementId)) {
      next.endBinding = { ...next.endBinding, elementId: renames.get(next.endBinding.elementId) }
    }
    return next
  })
}

function withheldSet(ids: readonly string[]): ReadonlySet<string> {
  return new Set(ids)
}

export function hasPendingEdits(
  state: ChangeReportingState,
  scene: readonly SceneElement[],
  withheldIds: readonly string[] = EMPTY_WITHHELD
): boolean {
  if (!state.userInteracted) return false
  if (state.fullReportNeeded) return true
  const withheld = withheldSet(withheldIds)
  const present = new Set<string>()
  for (const element of scene) {
    if (!element || typeof element.id !== 'string' || element.isDeleted) continue
    if (withheld.has(element.id)) {
      if (state.baseline.has(element.id)) present.add(element.id)
      continue
    }
    if (state.baseline.get(element.id) !== fingerprint(element)) return true
    present.add(element.id)
  }
  return present.size !== state.baseline.size
}

export function reportsSettled(state: ChangeReportingState): boolean {
  return state.inFlightReport === null
    && !state.progressTimerScheduled
    && !state.idleTimerScheduled
    && !state.retryTimerScheduled
    && !state.deliveryQueued
}

export function userHasInteracted(state: ChangeReportingState): boolean {
  return state.userInteracted
}

export function needsFullReport(state: ChangeReportingState): boolean {
  return state.fullReportNeeded
}

export function carryWithheld(
  scene: readonly SceneElement[],
  answered: ReadonlySet<string>,
  withheldIds: readonly string[]
): SceneElement[] {
  if (withheldIds.length === 0) return []
  const withheld = new Set(withheldIds)
  return scene.filter((element) => withheld.has(element.id) && !answered.has(element.id))
}

export function mergeIncoming(
  scene: readonly SceneElement[],
  incoming: readonly SceneElement[],
  baseline?: Baseline
): { elements: SceneElement[]; touchedIds: string[] } {
  const byId = new Map<string, SceneElement>()
  for (const element of incoming) {
    if (typeof element.id === 'string' && element.id.length > 0) byId.set(element.id, element)
  }
  const touchedIds = [...byId.keys()]
  const elements = scene.map((element) => {
    const update = byId.get(element.id)
    if (!update) return element
    byId.delete(element.id)
    const agreed = baseline?.get(element.id)
    if (baseline && (agreed === undefined || fingerprint(element) !== agreed)) return element
    return { ...element, ...update }
  })
  for (const [id, element] of byId) {
    // Missing from the visible scene but present in the agreed baseline means
    // the person deleted it locally after that baseline. Keep it absent and
    // pending. An id the baseline never held is a true remote addition.
    if (!baseline || !baseline.has(id)) elements.push(element)
  }
  return { elements, touchedIds }
}

export function mergeIncomingDeletes(
  scene: readonly SceneElement[],
  deletedIds: readonly string[],
  baseline: Baseline
): SceneElement[] {
  const deleted = new Set(deletedIds)
  return scene.filter(element => {
    if (!deleted.has(element.id)) return true
    const agreed = baseline.get(element.id)
    return agreed !== undefined && fingerprint(element) !== agreed
  })
}

function scheduleDelivery(
  state: ChangeReportingState,
  effects: ChangeReportingEffect[],
  contentEdit = false
): ChangeReportingState {
  let next = state
  if (!state.progressTimerScheduled && !state.deliveryQueued) {
    effects.push({
      type: 'start_progress_timer', delayMs: REPORT_PROGRESS_MS, generation: state.generation
    })
    next = { ...next, progressTimerScheduled: true, progressHasContinuation: false }
  } else if (state.progressTimerScheduled && contentEdit) {
    // The progress deadline is deliberately non-restarting. It only delivers
    // while work is continuing; a lone final edit belongs to the idle deadline.
    next = { ...next, progressHasContinuation: true }
  }
  if (state.idleTimerScheduled) effects.push({ type: 'cancel_idle_timer' })
  effects.push({
    type: 'start_idle_timer', delayMs: REPORT_IDLE_SETTLE_MS, generation: state.generation
  })
  return { ...next, idleTimerScheduled: true }
}

function cancelDeliveryTimers(
  state: ChangeReportingState,
  effects: ChangeReportingEffect[]
): ChangeReportingState {
  if (state.progressTimerScheduled) effects.push({ type: 'cancel_progress_timer' })
  if (state.idleTimerScheduled) effects.push({ type: 'cancel_idle_timer' })
  return {
    ...state,
    progressTimerScheduled: false,
    progressHasContinuation: false,
    idleTimerScheduled: false
  }
}

function beginReport(
  state: ChangeReportingState,
  scene: readonly SceneElement[],
  withheldIds: readonly string[],
  effects: ChangeReportingEffect[],
  allowWhileApplyingServerUpdate = false
): ChangeReportingState {
  if (state.inFlightReport !== null || (state.applyingServerUpdateCount > 0 && !allowWhileApplyingServerUpdate)) {
    return { ...state, deliveryQueued: true }
  }
  if (state.retryTimerScheduled) effects.push({ type: 'cancel_retry_timer' })

  const fullReport = state.fullReportNeeded
  const renamedScene = renameTextIds(scene, withheldIds)
  if (renamedScene) {
    const baselineUpdate: BaselineUpdate = { type: 'none' }
    effects.push({
      type: 'apply_server_update',
      generation: state.generation,
      update: { elements: renamedScene, captureUpdate: 'never' },
      baselineUpdate,
      reportAfterUpdate: { withheldIds, fullReport }
    })
    return {
      ...state,
      retryTimerScheduled: false,
      applyingServerUpdateCount: state.applyingServerUpdateCount + 1
    }
  }

  const report = diffAgainstBaseline(
    scene,
    fullReport ? new Map() : state.baseline,
    withheldSet(withheldIds)
  )
  if (!fullReport && isEmpty(report)) {
    const settled = cancelDeliveryTimers({
      ...state,
      baseline: report.nextBaseline,
      retryTimerScheduled: false,
      deliveryQueued: false
    }, effects)
    if (reportsSettled(settled)) effects.push({ type: 'release_if_idle' })
    return settled
  }

  effects.push({ type: 'send_report', report, fullReport, generation: state.generation })
  return {
    ...state,
    retryTimerScheduled: false,
    inFlightReport: {
      report,
      withheldIds,
      fullReport
    },
    deliveryQueued: false
  }
}

function applyBaselineUpdate(
  baseline: Baseline,
  update: BaselineUpdate,
  scene: readonly SceneElement[]
): Baseline {
  if (update.type === 'none') return baseline
  if (update.type === 'replace') {
    const withheld = new Set(update.withheldIds)
    return baselineFrom(scene.filter((element) => !withheld.has(element.id)))
  }
  const next = new Map(baseline)
  if (update.type === 'delete') {
    for (const id of update.ids) next.delete(id)
    return next
  }
  const landed = new Map(update.elements.map((element) => [element.id as string, element]))
  for (const id of landed.keys()) {
    const element = landed.get(id)
    if (element) next.set(id, fingerprint(element))
    else next.delete(id)
  }
  return next
}

function baselineAfterCorrections(
  submitted: Baseline,
  corrections: { upserts: readonly SceneElement[]; deletes: readonly string[] }
): Baseline {
  const next = new Map(submitted)
  for (const id of corrections.deletes) next.delete(id)
  for (const element of corrections.upserts) {
    if (element && typeof element.id === 'string' && !element.isDeleted) {
      next.set(element.id, fingerprint(element))
    }
  }
  return next
}

function applyVisibleCorrections(
  scene: readonly SceneElement[],
  submitted: Baseline,
  corrections: { upserts: readonly SceneElement[]; deletes: readonly string[] }
): SceneElement[] | null {
  const byId = new Map(scene.map(element => [element.id as string, element]))
  let changed = false

  for (const id of corrections.deletes) {
    const visible = byId.get(id)
    if (!visible) continue
    const sent = submitted.get(id)
    if (sent === undefined || fingerprint(visible) !== sent) continue
    byId.delete(id)
    changed = true
  }

  for (const canonical of corrections.upserts) {
    if (!canonical || typeof canonical.id !== 'string') continue
    const visible = byId.get(canonical.id)
    const sent = submitted.get(canonical.id)
    const unchangedSinceSend = sent === undefined
      ? visible === undefined
      : visible !== undefined && fingerprint(visible) === sent
    if (!unchangedSinceSend) continue
    if (visible && fingerprint(visible) === fingerprint(canonical)) continue
    byId.set(canonical.id, canonical)
    changed = true
  }

  return changed ? [...byId.values()] : null
}

function userEdit(
  state: ChangeReportingState,
  scene: readonly SceneElement[],
  effects: ChangeReportingEffect[]
): ChangeReportingState {
  if (!state.userInteracted) return state
  const stamp = stampScene(scene)
  if (stamp === state.sceneStamp) return state
  effects.push({ type: 'take_hold' })
  return scheduleDelivery({
    ...state,
    sceneStamp: stamp,
    localEditCount: state.localEditCount + 1
  }, effects, true)
}

type ReportingTimer = 'progress' | 'idle' | 'retry'

function timerFired(
  state: ChangeReportingState,
  event: { scene: readonly SceneElement[]; withheldIds: readonly string[] },
  which: ReportingTimer,
  effects: ChangeReportingEffect[]
): ChangeReportingState {
  const ready = which === 'progress'
    ? { ...state, progressTimerScheduled: false, progressHasContinuation: false }
    : which === 'idle'
      ? { ...state, idleTimerScheduled: false }
      : { ...state, retryTimerScheduled: false }
  if (which === 'progress' && !state.progressHasContinuation) return ready
  return beginReport(ready, event.scene, event.withheldIds, effects)
}

function afterFailedReport(
  state: ChangeReportingState,
  effects: ChangeReportingEffect[],
  options: { delayMs: number; fullReport: boolean; publish: boolean }
): ChangeReportingState {
  if (options.publish) effects.push({ type: 'publish_status' })
  const withoutDeliveryTimers = cancelDeliveryTimers(state, effects)
  effects.push({ type: 'start_retry_timer', delayMs: options.delayMs, generation: state.generation })
  return {
    ...withoutDeliveryTimers,
    inFlightReport: null,
    fullReportNeeded: options.fullReport || state.fullReportNeeded,
    retryTimerScheduled: true,
    deliveryQueued: false
  }
}

export function reduce(state: ChangeReportingState, event: ChangeReportingEvent): ReduceResult {
  const effects: ChangeReportingEffect[] = []

  switch (event.type) {
    case 'user_interacted':
      return { state: { ...state, userInteracted: true }, effects }

    case 'scene_changed':
      if (state.applyingServerUpdateCount > 0) return { state, effects }
      return { state: userEdit(state, event.scene, effects), effects }

    case 'local_update_requested':
      effects.push({ type: 'apply_local_update', generation: state.generation, update: event.update })
      return { state: { ...state, userInteracted: true }, effects }

    case 'local_update_applied':
      if (event.generation !== state.generation) return { state, effects }
      return { state: userEdit(state, event.scene, effects), effects }

    case 'progress_timer_fired': {
      if (event.generation !== state.generation) return { state, effects }
      return { state: timerFired(state, event, 'progress', effects), effects }
    }

    case 'idle_timer_fired': {
      if (event.generation !== state.generation) return { state, effects }
      return { state: timerFired(state, event, 'idle', effects), effects }
    }

    case 'retry_timer_fired': {
      if (event.generation !== state.generation) return { state, effects }
      return { state: timerFired(state, event, 'retry', effects), effects }
    }

    case 'immediate_report_requested':
      return { state: beginReport(state, event.scene, event.withheldIds, effects), effects }

    case 'server_update_requested':
      effects.push({
        type: 'apply_server_update',
        generation: state.generation,
        update: event.update,
        baselineUpdate: event.baselineUpdate
      })
      return {
        state: { ...state, applyingServerUpdateCount: state.applyingServerUpdateCount + 1 },
        effects
      }

    case 'server_update_applied': {
      if (event.generation !== state.generation) return { state, effects }
      let next: ChangeReportingState = {
        ...state,
        baseline: applyBaselineUpdate(state.baseline, event.baselineUpdate, event.scene),
        serverUpdateStamps: [...state.serverUpdateStamps, stampScene(event.scene)]
      }
      effects.push({ type: 'finish_server_update', generation: state.generation })
      if (event.reportAfterUpdate) {
        next = beginReport(next, event.scene, event.reportAfterUpdate.withheldIds, effects, true)
      }
      return { state: next, effects }
    }

    case 'server_update_finished': {
      if (event.generation !== state.generation) return { state, effects }
      const [stamp, ...stamps] = state.serverUpdateStamps
      const applying = Math.max(0, state.applyingServerUpdateCount - 1)
      let next: ChangeReportingState = {
        ...state,
        applyingServerUpdateCount: applying,
        serverUpdateStamps: stamps,
        sceneStamp: stamp ?? stampScene(event.scene)
      }
      if (applying === 0 && next.deliveryQueued) {
        next = beginReport(next, event.scene, event.withheldIds, effects)
      } else if (applying === 0) {
        next = userEdit(next, event.scene, effects)
        // Excalidraw may expose a local edit before its onChange callback runs.
        // If an incoming update records that already-edited scene, the stamp
        // above matches and userEdit cannot see the transition. The baseline
        // still can: keep that dirty delta reachable without waiting for a
        // second human edit to wake reporting.
        if (hasPendingEdits(next, event.scene, event.withheldIds) && reportsSettled(next)) {
          effects.push({ type: 'take_hold' })
          next = scheduleDelivery({
            ...next,
            sceneStamp: stampScene(event.scene),
            localEditCount: next.localEditCount + 1
          }, effects, true)
        }
      }
      return { state: next, effects }
    }

    case 'report_succeeded': {
      const sent = state.inFlightReport
      if (event.generation !== state.generation || !sent) {
        return { state, effects }
      }
      const baseline = baselineAfterCorrections(sent.report.nextBaseline, event.corrections)
      const correctedScene = applyVisibleCorrections(
        event.currentScene, sent.report.nextBaseline, event.corrections
      )
      let next: ChangeReportingState = {
        ...state,
        inFlightReport: null,
        baseline,
        fullReportNeeded: sent.fullReport ? false : state.fullReportNeeded,
        deliveryQueued: false
      }
      if (correctedScene) {
        effects.push({
          type: 'apply_server_update',
          generation: state.generation,
          update: { elements: correctedScene, captureUpdate: 'never' },
          baselineUpdate: { type: 'none' },
          ...(state.deliveryQueued
            ? { reportAfterUpdate: { withheldIds: sent.withheldIds, fullReport: false } }
            : {})
        })
        next = { ...next, applyingServerUpdateCount: next.applyingServerUpdateCount + 1 }
      } else if (state.deliveryQueued) {
        next = beginReport(next, event.currentScene, sent.withheldIds, effects)
      } else if (!hasPendingEdits(next, event.currentScene, sent.withheldIds)) {
        next = cancelDeliveryTimers(next, effects)
      } else if (!next.progressTimerScheduled && !next.idleTimerScheduled) {
        // Excalidraw may have normalized an id after send without a separate
        // content onChange. If that makes a canonical correction stale, keep
        // the visible element and schedule its converging delta explicitly.
        next = scheduleDelivery(next, effects)
      }
      effects.push({ type: 'note_change' }, { type: 'release_if_idle' })
      return { state: next, effects }
    }

    case 'report_refused':
      if (event.generation !== state.generation) return { state, effects }
      return {
        state: afterFailedReport(state, effects, { delayMs: 0, fullReport: true, publish: true }),
        effects
      }

    case 'report_failed':
      if (event.generation !== state.generation) return { state, effects }
      return {
        state: afterFailedReport(
          state,
          effects,
          { delayMs: REPORT_RETRY_MS, fullReport: false, publish: false }
        ),
        effects
      }

    case 'board_adopted':
      if (state.progressTimerScheduled) effects.push({ type: 'cancel_progress_timer' })
      if (state.idleTimerScheduled) effects.push({ type: 'cancel_idle_timer' })
      if (state.retryTimerScheduled) effects.push({ type: 'cancel_retry_timer' })
      return {
        state: { ...initialState(), generation: state.generation + 1 },
        effects
      }

    case 'reports_cancelled':
      if (state.progressTimerScheduled) effects.push({ type: 'cancel_progress_timer' })
      if (state.idleTimerScheduled) effects.push({ type: 'cancel_idle_timer' })
      if (state.retryTimerScheduled) effects.push({ type: 'cancel_retry_timer' })
      return {
        state: {
          ...state,
          progressTimerScheduled: false,
          idleTimerScheduled: false,
          retryTimerScheduled: false,
          deliveryQueued: false
        },
        effects
      }

    case 'full_report_cleared':
      return { state: { ...state, fullReportNeeded: false }, effects }

    case 'flush_requested': {
      if (!state.userInteracted) return { state, effects }
      const report = diffAgainstBaseline(event.scene, state.baseline)
      if (!isEmpty(report)) effects.push({ type: 'send_beacon', report })
      return { state, effects }
    }
  }
}
