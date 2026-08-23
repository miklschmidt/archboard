import { derivedId, isBlockId } from '../../../src/core/ids'
import { REPORT_DEBOUNCE_MS, REPORT_RETRY_MS } from '../../../src/core/timing'
import {
  baselineFrom, diffAgainstBaseline, fingerprint, isEmpty,
  type Baseline, type ChangeReport
} from './changes'

export type SceneElement = Record<string, any>

export type BaselineUpdate =
  | { type: 'replace'; withheldIds: readonly string[] }
  | { type: 'touch'; ids: readonly string[] }
  | { type: 'delete'; ids: readonly string[] }
  | { type: 'none' }

export interface SceneUpdate {
  elements?: readonly SceneElement[]
  appState?: Record<string, unknown>
  captureUpdate: 'never' | 'immediately'
}

interface ReportContext {
  report: ChangeReport
  editsAtSend: number
  withheldIds: readonly string[]
  fullReport: boolean
  generation: number
}

interface ReportAfterServerUpdate {
  withheldIds: readonly string[]
  fullReport: boolean
}

export interface ServerUpdateRecord {
  stamp: string
}

export interface ChangeReportingState {
  baseline: Baseline
  sceneStamp: string
  localEditCount: number
  userInteracted: boolean
  reportTimerScheduled: boolean
  retryTimerScheduled: boolean
  reportInFlight: boolean
  applyingServerUpdateCount: number
  serverUpdateRecords: readonly ServerUpdateRecord[]
  fullReportNeeded: boolean
  generation: number
  inFlightReport: ReportContext | null
}

export type ChangeReportingEvent =
  | { type: 'user_interacted' }
  | { type: 'scene_changed'; scene: readonly SceneElement[] }
  | { type: 'report_timer_fired'; generation: number; scene: readonly SceneElement[]; withheldIds: readonly string[] }
  | { type: 'retry_timer_fired'; generation: number; scene: readonly SceneElement[]; withheldIds: readonly string[] }
  | { type: 'immediate_report_requested'; scene: readonly SceneElement[]; withheldIds: readonly string[] }
  | {
      type: 'server_update_requested'
      kind: string
      update: SceneUpdate
      baselineUpdate: BaselineUpdate
      reportAfterUpdate?: ReportAfterServerUpdate
    }
  | {
      type: 'server_update_applied'
      generation: number
      kind: string
      scene: readonly SceneElement[]
      baselineUpdate: BaselineUpdate
      reportAfterUpdate?: ReportAfterServerUpdate
    }
  | { type: 'server_update_finished'; generation: number; scene: readonly SceneElement[] }
  | {
      type: 'report_succeeded'
      generation: number
      document?: readonly SceneElement[]
      currentScene: readonly SceneElement[]
    }
  | { type: 'report_refused'; generation: number }
  | { type: 'report_failed'; generation: number }
  | { type: 'board_adopted' }
  | { type: 'reports_cancelled' }
  | { type: 'full_report_cleared' }
  | { type: 'flush_requested'; scene: readonly SceneElement[] }

export type ChangeReportingEffect =
  | { type: 'cancel_report_timer' }
  | { type: 'start_report_timer'; delayMs: number; generation: number }
  | { type: 'cancel_retry_timer' }
  | { type: 'start_retry_timer'; delayMs: number; generation: number }
  | {
      type: 'apply_server_update'
      generation: number
      kind: string
      update: SceneUpdate
      baselineUpdate: BaselineUpdate
      reportAfterUpdate?: ReportAfterServerUpdate
    }
  | { type: 'finish_server_update'; delayMs: 0; generation: number }
  | { type: 'send_report'; report: ChangeReport; fullReport: boolean; generation: number }
  | { type: 'send_beacon'; report: ChangeReport }
  | { type: 'take_hold' }
  | { type: 'note_change' }
  | { type: 'release_if_idle' }
  | { type: 'publish_status' }

export interface ReduceResult {
  state: ChangeReportingState
  effects: ChangeReportingEffect[]
}

const EMPTY_WITHHELD: readonly string[] = []

export function initialState(): ChangeReportingState {
  return {
    baseline: new Map(),
    sceneStamp: '',
    localEditCount: 0,
    userInteracted: false,
    reportTimerScheduled: false,
    retryTimerScheduled: false,
    reportInFlight: false,
    applyingServerUpdateCount: 0,
    serverUpdateRecords: [],
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
export function stampScene(scene: readonly SceneElement[]): string {
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
  return ids.length === 0 ? new Set() : new Set(ids)
}

export function hasPendingEdits(
  state: ChangeReportingState,
  scene: readonly SceneElement[],
  withheldIds: readonly string[] = EMPTY_WITHHELD
): boolean {
  if (!state.userInteracted) return false
  if (state.fullReportNeeded) return true
  return !isEmpty(diffAgainstBaseline(scene, state.baseline, withheldSet(withheldIds)))
}

export function pendingChangeReport(
  state: ChangeReportingState,
  scene: readonly SceneElement[],
  withheldIds: readonly string[] = EMPTY_WITHHELD
): ChangeReport {
  return diffAgainstBaseline(scene, state.baseline, withheldSet(withheldIds))
}

function scheduleReport(state: ChangeReportingState, effects: ChangeReportingEffect[]): ChangeReportingState {
  if (state.reportTimerScheduled) effects.push({ type: 'cancel_report_timer' })
  effects.push({ type: 'start_report_timer', delayMs: REPORT_DEBOUNCE_MS, generation: state.generation })
  return { ...state, reportTimerScheduled: true }
}

function beginReport(
  state: ChangeReportingState,
  scene: readonly SceneElement[],
  withheldIds: readonly string[],
  effects: ChangeReportingEffect[],
  allowWhileApplyingServerUpdate = false
): ChangeReportingState {
  if (state.reportInFlight || (state.applyingServerUpdateCount > 0 && !allowWhileApplyingServerUpdate)) {
    return scheduleReport(state, effects)
  }
  if (state.retryTimerScheduled) effects.push({ type: 'cancel_retry_timer' })

  const fullReport = state.fullReportNeeded
  const renamedScene = renameTextIds(scene, withheldIds)
  if (renamedScene) {
    const baselineUpdate: BaselineUpdate = { type: 'none' }
    effects.push({
      type: 'apply_server_update',
      generation: state.generation,
      kind: 'the pane renaming its own text elements',
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
    return { ...state, baseline: report.nextBaseline, retryTimerScheduled: false }
  }

  effects.push({ type: 'send_report', report, fullReport, generation: state.generation })
  return {
    ...state,
    retryTimerScheduled: false,
    reportInFlight: true,
    inFlightReport: {
      report,
      editsAtSend: state.localEditCount,
      withheldIds,
      fullReport,
      generation: state.generation
    }
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
  const landed = new Map(scene.map((element) => [element.id as string, element]))
  for (const id of update.ids) {
    const element = landed.get(id)
    if (element) next.set(id, fingerprint(element))
    else next.delete(id)
  }
  return next
}

function userEdit(
  state: ChangeReportingState,
  scene: readonly SceneElement[],
  effects: ChangeReportingEffect[]
): ChangeReportingState {
  const stamp = stampScene(scene)
  if (!state.userInteracted || stamp === state.sceneStamp) return state
  effects.push({ type: 'take_hold' })
  return scheduleReport({
    ...state,
    sceneStamp: stamp,
    localEditCount: state.localEditCount + 1
  }, effects)
}

export function reduce(state: ChangeReportingState, event: ChangeReportingEvent): ReduceResult {
  const effects: ChangeReportingEffect[] = []

  switch (event.type) {
    case 'user_interacted':
      return { state: { ...state, userInteracted: true }, effects }

    case 'scene_changed':
      if (state.applyingServerUpdateCount > 0) return { state, effects }
      return { state: userEdit(state, event.scene, effects), effects }

    case 'report_timer_fired': {
      if (event.generation !== state.generation) return { state, effects }
      const ready = { ...state, reportTimerScheduled: false }
      return { state: beginReport(ready, event.scene, event.withheldIds, effects), effects }
    }

    case 'retry_timer_fired': {
      if (event.generation !== state.generation) return { state, effects }
      const ready = { ...state, retryTimerScheduled: false }
      return { state: beginReport(ready, event.scene, event.withheldIds, effects), effects }
    }

    case 'immediate_report_requested':
      return { state: beginReport(state, event.scene, event.withheldIds, effects), effects }

    case 'server_update_requested':
      effects.push({
        type: 'apply_server_update',
        generation: state.generation,
        kind: event.kind,
        update: event.update,
        baselineUpdate: event.baselineUpdate,
        reportAfterUpdate: event.reportAfterUpdate
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
        serverUpdateRecords: [...state.serverUpdateRecords, {
          stamp: stampScene(event.scene)
        }]
      }
      effects.push({ type: 'finish_server_update', delayMs: 0, generation: state.generation })
      if (event.reportAfterUpdate) {
        next = beginReport(next, event.scene, event.reportAfterUpdate.withheldIds, effects, true)
      }
      return { state: next, effects }
    }

    case 'server_update_finished': {
      if (event.generation !== state.generation) return { state, effects }
      const [record, ...records] = state.serverUpdateRecords
      const applying = Math.max(0, state.applyingServerUpdateCount - 1)
      let next: ChangeReportingState = {
        ...state,
        applyingServerUpdateCount: applying,
        serverUpdateRecords: records,
        sceneStamp: record?.stamp ?? stampScene(event.scene)
      }
      if (applying === 0) next = userEdit(next, event.scene, effects)
      return { state: next, effects }
    }

    case 'report_succeeded': {
      const sent = state.inFlightReport
      if (event.generation !== state.generation || !sent || sent.generation !== event.generation) {
        return { state, effects }
      }
      let next: ChangeReportingState = {
        ...state,
        reportInFlight: false,
        inFlightReport: null,
        fullReportNeeded: sent.fullReport ? false : state.fullReportNeeded
      }
      if (event.document && state.localEditCount === sent.editsAtSend) {
        const answered = new Set(event.document.map((element) => element.id))
        const withheld = new Set(sent.withheldIds)
        const kept = event.currentScene.filter((element) => withheld.has(element.id) && !answered.has(element.id))
        const baselineUpdate: BaselineUpdate = { type: 'replace', withheldIds: sent.withheldIds }
        effects.push({
          type: 'apply_server_update',
          generation: state.generation,
          kind: 'a whole board from the server',
          update: { elements: [...event.document, ...kept], captureUpdate: 'never' },
          baselineUpdate
        })
        next = { ...next, applyingServerUpdateCount: next.applyingServerUpdateCount + 1 }
      } else {
        next = { ...next, baseline: sent.report.nextBaseline }
      }
      effects.push({ type: 'note_change' }, { type: 'release_if_idle' })
      return { state: next, effects }
    }

    case 'report_refused':
      if (event.generation !== state.generation) return { state, effects }
      effects.push({ type: 'publish_status' })
      effects.push({ type: 'start_retry_timer', delayMs: 0, generation: state.generation })
      return {
        state: {
          ...state,
          reportInFlight: false,
          inFlightReport: null,
          fullReportNeeded: true,
          retryTimerScheduled: true
        },
        effects
      }

    case 'report_failed':
      if (event.generation !== state.generation) return { state, effects }
      effects.push({ type: 'start_retry_timer', delayMs: REPORT_RETRY_MS, generation: state.generation })
      return {
        state: {
          ...state,
          reportInFlight: false,
          inFlightReport: null,
          retryTimerScheduled: true
        },
        effects
      }

    case 'board_adopted':
      if (state.reportTimerScheduled) effects.push({ type: 'cancel_report_timer' })
      if (state.retryTimerScheduled) effects.push({ type: 'cancel_retry_timer' })
      return {
        state: { ...initialState(), generation: state.generation + 1 },
        effects
      }

    case 'reports_cancelled':
      if (state.reportTimerScheduled) effects.push({ type: 'cancel_report_timer' })
      if (state.retryTimerScheduled) effects.push({ type: 'cancel_retry_timer' })
      return {
        state: { ...state, reportTimerScheduled: false, retryTimerScheduled: false },
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
