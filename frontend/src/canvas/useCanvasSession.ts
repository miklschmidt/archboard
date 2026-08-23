// One canvas's entire conversation with the server.
//
// Everything that used to make the canvas *be* the application — the socket,
// board adoption, applying what arrives, reporting what a human did, publishing
// the selection, answering export/viewport/mermaid requests — lives here, in a
// hook keyed by pane. That is the seam: hosting a second pane is mounting a
// second <CanvasPane/>, not copying any of this.
//
// The direction of authority is the important part. Nothing here ever sends a
// scene. A pane reports a delta against what it has seen (see ./changes) and
// the server decides what the board becomes; a pane learns the result the same
// way any other client does, over the socket.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { LibraryItems } from '@excalidraw/excalidraw/types'
import { convertMermaidToExcalidraw, DEFAULT_MERMAID_CONFIG } from '../utils/mermaidConverter'
import type {
  BoardHold, BoardIdentity, DoingEntry, LockHolder, NoteWrittenElsewhere, PaneStatus, ServerElement,
  WebSocketMessage
} from '../types'
import { cleanElementForExcalidraw, elementsForScene } from './elements'
import { baselineFrom, diffAgainstBaseline, fingerprint, isEmpty, type Baseline } from './changes'
import {
  armDelivery, readDebt, readDelivery, readOrphanedWindow, watchingForLoss
} from './loss-canary'
import { derivedId, isBlockId } from '../../../src/core/ids'
import {
  BoardConflictError, fetchElements, fetchFiles, holdBoard, loadedBundle, releaseBoard, reportChanges,
  reportPane, takeBoardBack
} from './api'
import type { PaneReport } from './api'

// Messages that say what is on a board, as opposed to messages about the board.
// A pane that owes the server a rebase ignores the first kind and acts on the
// second (see the socket handler).
const CONTENT_MESSAGES = new Set([
  'initial_elements',
  'element_created',
  'element_updated',
  'element_deleted',
  'elements_batch_created',
  'elements_changed',
  'canvas_cleared',
  'files_added'
])

// Every duration this pane waits out. They are in src/core/timing.ts with the
// server's and the change feed's, because they pull against each other and one
// tuned on its own is one tuned in ignorance of the rest (ADR 0016). The
// reasons for the numbers are there too.
import {
  LOCK_RENEW_MS,
  PANE_DEBOUNCE_MS,
  REPORT_DEBOUNCE_MS,
  REPORT_RETRY_MS,
  SELECTION_DEBOUNCE_MS,
  SOCKET_RECONNECT_MS
} from '../../../src/core/timing'

/**
 * The holder a pane assumes before it has been told who has the board.
 *
 * Not a real holder and never printed as one: it is how "I do not know" is
 * spelled in the one field that decides whether a pane accepts a touch, and
 * ADR 0016 says not knowing means held. It is replaced by the truth one message
 * later, or by nothing if the board is free.
 */
const UNKNOWN_HOLDER: LockHolder = {
  id: '', kind: 'agent', since: '', until: '', process: '', reason: 'not yet known'
}

/**
 * Everything about an element that a hand can change.
 *
 * Not everything about an element: `boundElements`, `containerId`, `customData`
 * and the server's own bookkeeping move when the server writes them and never
 * under somebody's finger, and the whole point of the stamp below is to tell
 * those two apart. A field wrongly left out here costs a leading-edge hold and
 * a skipped resync on an edit nobody can make in a canvas; a field wrongly put
 * in costs both on news that arrived from the server.
 */
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

/**
 * A cheap answer to "did the drawing change, or only the view of it".
 *
 * `onChange` fires for scrolling, zooming and selecting, and — since the lock —
 * for this pane going in and out of read-only when a board changes hands. None
 * of those is an edit. Acting on them costs two things that both showed up as
 * bugs: an agent blocked for a second every time somebody pans the wall, and a
 * resync skipped because a broadcast read as a hand moving (`check-live-session`
 * caught the second, as a missing `boundElements` entry).
 *
 * `version` alone is not enough to tell them apart. Excalidraw bumps it on
 * every element *it* mutates, so a real drag moves it — but a scene handed
 * straight to `updateScene` keeps whatever version its elements carry, and that
 * is how anything that is not a pointer writes to a canvas, including this
 * project's own checks. So the fields go in too, and the two together see an
 * edit whichever door it came through.
 *
 * Arithmetic and character codes over the scene on every frame: a few thousand
 * operations on a board four times larger than any real one. Deliberately not
 * `diffAgainstBaseline`, which sorts and stringifies every element and is the
 * expensive thing the report debounce exists to do once per gesture.
 */
function sceneStamp(api: ExcalidrawImperativeAPI | null): string {
  if (!api) return ''
  const elements = api.getSceneElementsIncludingDeleted()
  let hash = elements.length
  for (const element of elements) {
    const fields = element as unknown as Record<string, unknown>
    hash = fold(hash, fields.id)
    hash = fold(hash, fields.version)
    for (const field of HUMAN_FIELDS) hash = fold(hash, fields[field])
    // A path by its length and its far end, rather than every point of it: a
    // freedraw stroke can carry hundreds and this runs on every frame. Bending
    // an arrow moves its last point, and dragging one moves its x and y.
    const points = fields.points
    if (Array.isArray(points)) {
      hash = fold(hash, points.length)
      const last = points[points.length - 1] as number[] | { x: number; y: number } | undefined
      if (Array.isArray(last)) hash = fold(fold(hash, last[0]), last[1])
      else if (last) hash = fold(fold(hash, last.x), last.y)
    }
    hash = fold(hash, Array.isArray(fields.groupIds) ? fields.groupIds.length : 0)
  }
  return String(hash)
}

const EMPTY_WITHHELD: ReadonlySet<string> = new Set()

/** A document the pane has just been given, and what it hashed to on arrival. */
interface Delivered {
  stamp: string
  canary: ReturnType<typeof armDelivery>
}

/**
 * The text element a person has an editor open on, if any.
 *
 * Excalidraw keeps the element it opened the editor for in `editingTextElement`
 * and keeps it there under the id it had at the time, which is what makes this
 * worth asking. Rename that element in the scene and the appState still names
 * the old one: the textarea stays on screen, stays focused, keeps every
 * character, and submits into an element the scene no longer holds. Measured on
 * a hand-drawn text (six characters discarded) and on a hand-added label (all
 * ten).
 */
function idUnderEditor(api: ExcalidrawImperativeAPI | null): string | null {
  const editing = api?.getAppState().editingTextElement
  return editing ? editing.id : null
}

/**
 * The scene, with every named text element answering to its new name.
 *
 * The same rewiring `renameElementId` does on the server side
 * (`src/core/obsidian-md.ts`): the element itself, the container that lists it
 * in `boundElements`, the label that points back through `containerId`, and
 * either end of an arrow bound to it.
 */
function withTextIdsRenamed(
  scene: readonly Record<string, any>[],
  renames: ReadonlyMap<string, string>
): Record<string, any>[] {
  const renamed = (id: unknown): string | undefined =>
    typeof id === 'string' ? renames.get(id) : undefined
  return scene.map((element) => {
    const next: Record<string, any> = { ...element }
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

export interface CanvasSessionOptions {
  paneId: string
  /**
   * Is this the pane the server picks when a request names no pane and no
   * board? Reported, and used for the one message that really is about the
   * browser rather than a pane: a library change, which every pane hears and
   * only one should hand up. Export, viewport and mermaid are addressed to a
   * single socket, so the pane that gets one answers it whether or not it is
   * primary.
   */
  primary: boolean
  /** Is this the pane the human last touched? Reported, not enforced. */
  focused: boolean
  onStatus: (status: PaneStatus) => void
  /**
   * Another tab changed the stencil palette. Handed straight up to the shell,
   * which owns the library — a library item is not board content, so nothing
   * about it touches the element store, the baseline, or a change report.
   */
  onLibraryChanged?: (items: LibraryItems) => void
  /**
   * The server is asking for the layout to change: another pane, or this one
   * gone. A canvas cannot do either — the shell owns how many panes there are
   * — so this is handed straight up, the same way a library change is.
   *
   * It arrives on a socket because that is the only channel the server has
   * into the browser, not because it is a canvas's business.
   */
  onLayoutRequest?: (request: 'open' | 'close') => void
}

export interface CanvasSession {
  attachExcalidraw: (api: ExcalidrawImperativeAPI) => void
  /**
   * The element the canvas fills. Watched for resize, because splitting the
   * shell halves a pane without anything on the canvas changing — and a pane
   * that reported its old size would put itself in the wrong place on screen.
   */
  attachPaneElement: (element: HTMLElement | null) => void
  connected: boolean
  board: BoardIdentity | null
  handleChange: (appState: { selectedElementIds?: Record<string, boolean>; theme?: string } | null) => void
  markInteracted: () => void
  /**
   * Is somebody else writing this board, or can this pane not tell?
   *
   * The canvas goes into Excalidraw's view mode while it is true, which is what
   * ADR 0016 means by stopping accepting changes *before* the touch: a canvas
   * applies a drag the instant a finger moves, so refusing the write afterwards
   * would take the board away mid-gesture.
   */
  readOnly: boolean
  /**
   * Who has it, when somebody does, so the pane can say so rather than only
   * stop responding.
   *
   * Worth saying for a claim and not for a write: an agent's write is twenty
   * milliseconds, and a banner that appeared for it would be a flicker under
   * somebody's hand. A claim may run for minutes, and a 75-inch display that
   * stops for minutes with nothing on it to explain why has simply broken, as
   * far as the person standing at it can tell (ADR 0016).
   */
  heldBy: LockHolder | null
  /**
   * Take a claimed board back.
   *
   * The lock excludes writers from each other; it does not lock somebody out of
   * their own wall. One deliberate tap rather than any touch, because view mode
   * still pans and zooms — somebody watching an agent redraw a board is reading
   * it, and reading it must not end it — and because nothing an agent has
   * written is undone by taking the board, so a stray palm would leave a
   * half-drawn board with nobody having decided anything.
   */
  takeBack: () => void
  /**
   * The last few things an agent said it was doing here, oldest first
   * (TASK-095).
   *
   * The step, where `heldBy.reason` on a claim is the campaign: the banner says
   * what is being attempted and this says how far it has got. Shown whether or
   * not anybody holds the board — most writes are one act and take no claim,
   * and a person watching boxes move is owed the reason either way.
   */
  doing: DoingEntry[]
}

export function useCanvasSession({
  paneId, primary, focused, onStatus, onLibraryChanged, onLayoutRequest
}: CanvasSessionOptions): CanvasSession {
  // A pane is a client in its own right: it holds a selection the server can
  // retire when this pane goes away, and it must be able to skip the echo of
  // its own change reports.
  const clientIdRef = useRef<string>(`${paneId}-${Math.random().toString(36).slice(2, 8)}`)
  const clientId = clientIdRef.current

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const closedRef = useRef(false)

  const [connected, setConnected] = useState(false)
  const connectedRef = useRef(false)

  // Which board this pane is showing. Every server message names the board it
  // is about, so the pane has to know its own to tell "an element was added to
  // what I am looking at" from "an element was added to some other board".
  const [board, setBoard] = useState<BoardIdentity | null>(null)
  const boardKeyRef = useRef<string | null>(null)

  // Everything this pane believes the server holds. The only thing standing
  // between a stale tab and a truncated board.
  const baselineRef = useRef<Baseline>(new Map())

  // Set while the board this pane holds has stopped saving (ADR 0006,
  // TASK-079). Nothing about drawing changes — the human carries on and the
  // canvas keeps taking it — but everything drawn from here is held on the
  // server and is in no note, so the chrome says so until somebody chooses.
  const holdRef = useRef<BoardHold | null>(null)
  // Set while somebody outside archboard has written the note this board came
  // from, so what is on this screen is not what the vault holds (TASK-062). The
  // step before a hold: nothing has been refused, because nothing has been
  // written since, and the person drawing would otherwise find out at their
  // next gesture.
  const writtenElsewhereRef = useRef<NoteWrittenElsewhere | null>(null)
  // What an agent has said it is doing to this board, most recent last
  // (TASK-095). Server-kept and sent whole, so this is assigned rather than
  // accumulated: two panes on one board tell the same story, and a pane that
  // has just been handed the board is not blank until the next write.
  const doingRef = useRef<DoingEntry[]>([])
  // The pane owes the server a statement of what is on its screen. A held
  // board's copy starts as the note the other editor wrote, because that is all
  // the server can read; this is what replaces it with what the human is
  // actually looking at, one round trip after the refusal.
  const rebaseNeededRef = useRef(false)

  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // `settle` closes the suppression window by asking whether a hand moved
  // while it was open, and the thing that answers that is `scheduleReport`,
  // which is built out of `settle`. A ref rather than a rearrangement: the
  // cycle is real — applying a delivery can owe a report, and sending a report
  // applies a delivery — so one of the two directions has to be late-bound.
  const scheduleReportRef = useRef<() => void>(() => { })
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  // Raised while we are writing the server's own news into the scene, so that
  // updateScene() does not read back as a human edit and bounce straight home.
  const suppressRef = useRef(0)
  // What this pane has put on the glass that did not come from a hand, and
  // what the scene hashed to the instant each one landed. Read at the end of
  // the suppression window, where a stamp that has moved since is the only
  // evidence left that somebody edited while the pane was not listening
  // (TASK-099).
  //
  // A queue rather than one slot, because two windows can be open at once: a
  // second delivery arriving before the first window closes would overwrite
  // the first's record, and the first window would then close against a stamp
  // taken after the hand had already moved — which is the bug this exists to
  // prevent, wearing the fix as a disguise. Timeouts fire in the order they
  // were set and `settle` always runs one statement before the delivery it is
  // for, so first in is first out. Nothing in `scripts/` reaches this today,
  // and `readOrphanedWindow` is what would say so if the pairing ever broke.
  const deliveredRef = useRef<Delivered[]>([])
  // How many times this pane has changed under a human's hand. Counted, not
  // diffed, because the question it answers is "did the human touch anything
  // while that write was in flight" and a diff cannot tell a human's edit from
  // another writer's news that arrived in the same moment (TASK-074).
  const localEditsRef = useRef(0)
  const userInteractedRef = useRef(false)
  const lastChangeAtRef = useRef<string | null>(null)

  // ── The board's mutex (ADR 0016) ──
  // Does this pane hold the board's lock right now, and when did it last say
  // so? Refs rather than state: nothing renders off them, and they are read
  // inside callbacks that must see the current value rather than the one that
  // was current when they were made.
  const holdingRef = useRef(false)
  const lastHoldAtRef = useRef(0)
  // What the scene last hashed to, so a scroll can be told from an edit without
  // diffing the board on every frame.
  const sceneStampRef = useRef('')
  /**
   * Who is writing this board, if it is not us. Non-null means read-only.
   *
   * It starts held and stays held until the server says otherwise. A pane that
   * does not know is a pane that has not been told, and ADR 0016 says a pane
   * that cannot be told assumes the board is held rather than that it is free.
   * The server sends the lock state immediately behind every board it hands a
   * pane, so "does not know" lasts one message.
   */
  const [heldBy, setHeldBy] = useState<LockHolder | null>(UNKNOWN_HOLDER)
  // The same list as `doingRef`, for rendering. The ref is what the pane's
  // status carries and the state is what puts it on screen; both are assigned
  // from the server's list together, so they cannot disagree.
  const [doing, setDoing] = useState<DoingEntry[]>([])

  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishedSelectionRef = useRef('')
  const pendingSelectionRef = useRef<string[] | null>(null)

  const statusRef = useRef(onStatus)
  useEffect(() => { statusRef.current = onStatus }, [onStatus])
  const primaryRef = useRef(primary)
  useEffect(() => { primaryRef.current = primary }, [primary])
  const focusedRef = useRef(focused)

  const paneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishedPaneRef = useRef('')
  // The build this tab has already been told about, so it is said once and not
  // once per scroll.
  const staleBuildRef = useRef('')
  const paneElementRef = useRef<HTMLElement | null>(null)
  const paneObserverRef = useRef<ResizeObserver | null>(null)

  const boardRef = useRef<BoardIdentity | null>(null)

  // ─── Telling the server what is on screen ────────────────────

  /**
   * What this pane has in front of the human, right now.
   *
   * The board is the one *this pane* was pointed at. Two panes hold two boards,
   * so there is nothing else it could be — and reporting what the pane is
   * actually rendering, rather than what the server believes it should be,
   * is what makes this a description of the glass.
   */
  const paneReport = useCallback((): PaneReport | null => {
    const api = apiRef.current
    const board = boardKeyRef.current
    if (!api || !board) return null
    const appState = api.getAppState()
    const zoom = appState.zoom?.value || 1
    // Measured off the DOM rather than taken from appState: Excalidraw catches
    // up with a resize on its own schedule, and a pane that reported a stale
    // width would place itself wrong — which is the one thing this must not do.
    const box = paneElementRef.current?.getBoundingClientRect()
    const rect = {
      x: box?.left ?? appState.offsetLeft ?? 0,
      y: box?.top ?? appState.offsetTop ?? 0,
      width: box?.width ?? appState.width ?? 0,
      height: box?.height ?? appState.height ?? 0
    }
    return {
      clientId,
      paneId,
      board,
      primary: primaryRef.current,
      focused: focusedRef.current,
      elementCount: api.getSceneElements().length,
      build: loadedBundle(),
      rect,
      // Scene coordinates, so it can be compared with element positions
      // directly — "the box at 400,200 is on screen in the left pane".
      viewport: {
        x: -(appState.scrollX ?? 0),
        y: -(appState.scrollY ?? 0),
        width: rect.width / zoom,
        height: rect.height / zoom,
        zoom
      }
    }
  }, [clientId, paneId])

  const schedulePaneReport = useCallback((immediate = false): void => {
    // A pane on its way off the glass has nothing to say about what is on it.
    // Excalidraw can fire a last onChange after our teardown, and reporting
    // that would put the pane back in front of an agent after it was gone.
    if (closedRef.current) return
    if (paneTimerRef.current) clearTimeout(paneTimerRef.current)
    const send = (): void => {
      paneTimerRef.current = null
      if (closedRef.current) return
      const report = paneReport()
      if (!report) return
      // Rounded before comparing, so a sub-pixel scroll is not a change worth
      // a POST — this is the difference between cheap and chatty.
      const key = JSON.stringify(report, (_k, v) => typeof v === 'number' ? Math.round(v) : v)
      if (key === publishedPaneRef.current) return
      publishedPaneRef.current = key
      void reportPane(report).then((result) => {
        // The server refuses a pane whose socket is gone. Forget that we sent
        // this, so a reconnection re-announces rather than assuming it stuck.
        if (!result.registered) publishedPaneRef.current = ''
        // Somebody rebuilt the frontend while this tab was open, so this tab is
        // running old code. Said here, at the pane's own pulse, rather than
        // discovered ten seconds later by a command timing out on a tab that
        // does not know how to answer it (TASK-056). Once per build: this
        // fires on every scroll otherwise.
        const stale = result.staleFrontend
        if (stale?.message && staleBuildRef.current !== stale.current) {
          staleBuildRef.current = stale.current ?? ''
          console.warn(stale.message)
        }
      }).catch((error) => {
        // Nothing is lost by a failed report except its freshness, and the next
        // change resends — but only if this one is not remembered as sent.
        publishedPaneRef.current = ''
        console.warn('Pane report failed:', error)
      })
    }
    if (immediate) send()
    else paneTimerRef.current = setTimeout(send, PANE_DEBOUNCE_MS)
  }, [paneReport])

  useEffect(() => {
    focusedRef.current = focused
    schedulePaneReport()
  }, [focused, schedulePaneReport])

  const attachPaneElement = useCallback((element: HTMLElement | null): void => {
    if (paneElementRef.current === element) return
    paneObserverRef.current?.disconnect()
    paneObserverRef.current = null
    paneElementRef.current = element
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => schedulePaneReport())
    observer.observe(element)
    paneObserverRef.current = observer
    schedulePaneReport()
  }, [schedulePaneReport])

  const publishStatus = useCallback((): void => {
    statusRef.current({
      paneId,
      clientId,
      connected: connectedRef.current,
      board: boardRef.current,
      boardKey: boardKeyRef.current,
      elementCount: apiRef.current?.getSceneElements().length ?? 0,
      lastChangeAt: lastChangeAtRef.current,
      hold: holdRef.current,
      writtenElsewhere: writtenElsewhereRef.current,
      doing: doingRef.current
    })
    schedulePaneReport()
  }, [clientId, paneId, schedulePaneReport])

  const setBoardIdentity = useCallback((identity: BoardIdentity | null): void => {
    boardRef.current = identity
    setBoard(identity)
  }, [])

  const noteChange = useCallback((): void => {
    lastChangeAtRef.current = new Date().toISOString()
    publishStatus()
  }, [publishStatus])

  /**
   * Does this pane owe the server something with nothing about to say it?
   *
   * Asked wherever the pane decides it is done talking — see ./loss-canary,
   * and nothing asks unless somebody is watching. An edit is safe while the
   * debt stands *and* something is going to pay it, and every place below is a
   * place where the second half can stop being true without the first.
   */
  const watchDebt = useCallback((kind: string): void => {
    if (!watchingForLoss()) return
    const api = apiRef.current
    if (!api || !userInteractedRef.current) return
    if (inFlightRef.current || reportTimerRef.current || retryTimerRef.current) return
    // A delivery is on the glass whose record has not been written yet, so the
    // debt this would find is the one that settle is a moment away from
    // clearing. The question is only meaningful once the pane is quiet.
    if (suppressRef.current > 0) return
    const editing = idUnderEditor(api)
    readDebt(kind, diffAgainstBaseline(
      api.getSceneElementsIncludingDeleted() as unknown as Record<string, any>[],
      baselineRef.current,
      editing === null ? EMPTY_WITHHELD : new Set([editing])
    ))
  }, [])

  // ─── Writing the server's news into the scene ────────────────

  /**
   * Stop reading the scene as a hand until the delivery about to be written
   * into it has been rendered.
   *
   * The suppression has to span a macrotask, because `updateScene` reaches
   * `onChange` through a React render and there is no synchronous moment at
   * which the delivery is finished arriving. **Nothing about the pane's record
   * of the board is written in here**, and that is the whole of TASK-099: the
   * record used to be, from the live scene, so an edit made in this window went
   * into it as already agreed and was never mentioned again.
   *
   * What is left in here is the two things that genuinely cannot be done until
   * the window closes. The scene stamp is restored to what the delivery left —
   * *not* to what the scene now holds — so a hand that moved while nobody was
   * listening still reads as a change. And then the pane asks, through the
   * ordinary path, whether anything did.
   */
  const settle = useCallback((): void => {
    suppressRef.current += 1
    setTimeout(() => {
      suppressRef.current = Math.max(0, suppressRef.current - 1)
      const delivered = deliveredRef.current.shift()
      // Off unless somebody has created `window.__abLoss`; see ./loss-canary.
      // This is the moment it is asking about.
      readDelivery(delivered?.canary ?? null, apiRef.current?.getSceneElements() as any ?? [])
      // The server's news moved the scene, so it moved the stamp, and the next
      // thing a human does must not read as a change *plus* whatever another
      // writer had just done — that took the board for a broadcast nobody had
      // touched. So the stamp becomes the delivery's own. The difference
      // between it and the scene as it now stands is exactly what a hand did
      // while this window was open, and the line below is what says so.
      if (!delivered) readOrphanedWindow()
      sceneStampRef.current = delivered ? delivered.stamp : sceneStamp(apiRef.current)
      publishStatus()
      scheduleReportRef.current()
      watchDebt('a delivery had just been written down')
    }, 0)
  }, [publishStatus, watchDebt])

  /**
   * The pane has just been handed a document, and this is its record of it.
   *
   * Taken in the same statement sequence as `updateScene`, which is what makes
   * it a record of the delivery rather than of the scene: nothing can have
   * happened in between, so nothing a hand did can be folded into it. The
   * scene is read back rather than the delivery being fingerprinted directly,
   * because Excalidraw repairs a document as it takes it — `syncInvalidIndices`
   * above all — and a record of what was sent rather than of what landed would
   * make every element differ from it and be reported straight back.
   */
  const recordDelivery = useCallback((
    kind: string,
    record: (scene: readonly Record<string, any>[]) => void
  ): void => {
    const api = apiRef.current
    if (!api) return
    const scene = api.getSceneElements() as unknown as Record<string, any>[]
    record(scene)
    deliveredRef.current.push({
      stamp: sceneStamp(api),
      canary: armDelivery(kind, scene, (id) => baselineRef.current.get(id))
    })
  }, [])

  /**
   * Replace the scene outright; the board is now exactly what the server said.
   *
   * Except for what this pane deliberately did not tell the server about. A
   * text element under an open editor is withheld from the report that provoked
   * this answer (see `diffAgainstBaseline`), so the answer cannot contain it,
   * and replacing the scene with the answer alone would take a half-typed
   * label off the glass. Those elements are carried over from the scene and
   * stay out of the baseline, so the first report after the editor closes still
   * owes them.
   */
  const applyServerScene = useCallback((
    elements: Partial<ExcalidrawElement>[],
    withheld: ReadonlySet<string> = EMPTY_WITHHELD
  ): void => {
    const api = apiRef.current
    if (!api) return
    const answered = new Set(elements.map((element) => element.id))
    // Before `elementsForScene`, which drops a `boundElements` entry or a
    // `containerId` pointing at an element the delivery does not carry. The
    // container of a label being typed into is exactly that, and unbinding it
    // would strand the label.
    const kept = withheld.size === 0 ? [] : (api.getSceneElementsIncludingDeleted() as any[])
      .filter((element) => withheld.has(element.id) && !answered.has(element.id))
    settle()
    api.updateScene({
      elements: elementsForScene([...elements, ...kept]) as any,
      captureUpdate: CaptureUpdateAction.NEVER
    })
    recordDelivery('a whole board from the server',
      (scene) => {
        baselineRef.current = baselineFrom(scene.filter((element) => !withheld.has(element.id)))
      })
  }, [recordDelivery, settle])

  /**
   * Fold specific server elements into whatever is on screen, and re-agree the
   * baseline for those ids only — the rest of the scene may hold local edits
   * that have not been reported yet and must not be forgotten.
   */
  const applyServerElements = useCallback((incoming: Partial<ExcalidrawElement>[]): void => {
    const api = apiRef.current
    if (!api || incoming.length === 0) return

    const current = api.getSceneElements()
    const byId = new Map<string, Partial<ExcalidrawElement>>()
    incoming.forEach((element) => { if (element.id) byId.set(element.id, element) })
    const touched = [...byId.keys()]

    const merged: Partial<ExcalidrawElement>[] = current.map((element) => {
      const update = byId.get(element.id)
      if (!update) return element
      byId.delete(element.id)
      return { ...element, ...update }
    })
    merged.push(...byId.values())

    settle()
    api.updateScene({
      elements: elementsForScene(merged) as any,
      captureUpdate: CaptureUpdateAction.NEVER
    })
    recordDelivery("another writer's elements", (scene) => {
      const landed = new Map(scene.map((element) => [element.id as string, element]))
      for (const id of touched) {
        const element = landed.get(id)
        if (element) baselineRef.current.set(id, fingerprint(element))
        else baselineRef.current.delete(id)
      }
    })
  }, [recordDelivery, settle])

  const removeElements = useCallback((ids: string[]): void => {
    const api = apiRef.current
    if (!api || ids.length === 0) return
    const gone = new Set(ids)
    settle()
    api.updateScene({
      elements: api.getSceneElements().filter((el) => !gone.has(el.id)),
      captureUpdate: CaptureUpdateAction.NEVER
    })
    recordDelivery("another writer's deletion",
      () => { ids.forEach((id) => baselineRef.current.delete(id)) })
  }, [recordDelivery, settle])

  // Re-read THIS pane's board from the server. Deliberately not "what board is
  // the server on": there is no such thing, and a pane that asked would be at
  // risk of adopting another pane's board (ADR 0009). A pane learns which board
  // it holds from the server addressing it — initial_elements, board_switched —
  // and nowhere else.
  const loadBoard = useCallback(async (): Promise<void> => {
    if (!apiRef.current || !boardKeyRef.current) return
    try {
      const { elements } = await fetchElements(boardKeyRef.current)
      applyServerScene(elements.map(cleanElementForExcalidraw))
      const { files } = await fetchFiles(boardKeyRef.current)
      if (files && Object.keys(files).length > 0) apiRef.current?.addFiles(Object.values(files) as any)
    } catch (error) {
      console.error('Could not load the board:', error)
    }
  }, [applyServerScene])

  // ─── The board's mutex ───────────────────────────────────────
  //
  // One writer at a time (ADR 0016). Two halves, and they answer different
  // questions.
  //
  // TAKING IT is the pane's job, on the leading edge of a gesture, because a
  // change report is a trailing debounce with no maximum wait: a continuous
  // drag says nothing until 400 ms after the finger lifts, by which point the
  // change is already on screen and refusing it would take the board away
  // mid-gesture. So the first change of a gesture sends a hold, and the write
  // that follows joins it rather than taking a second one.
  //
  // NOT DRAWING AT ALL is the other half, and it is what the ADR means by "the
  // lock is a broadcast, not only a guard". A pane whose board somebody else is
  // writing goes into Excalidraw's view mode, so the touch never happens. That
  // gate fails closed: `!connected` is read-only, because lock news arrives
  // over the socket and a pane that cannot hear it must assume the board is
  // held rather than that it is free.

  /**
   * The board is somebody else's, and this pane was in the middle of something.
   *
   * The board is re-read and whatever was in hand is dropped. Keeping it and
   * reporting it once the lock frees would be merging two people's edits to one
   * board, which is the thing exclusion exists instead of. The window this can
   * happen in is one broadcast's latency — the pane goes read-only when the
   * news arrives, so a hand cannot get far past it.
   */
  const loseBoard = useCallback((holder: LockHolder | null): void => {
    holdingRef.current = false
    setHeldBy(holder ?? UNKNOWN_HOLDER)
    if (reportTimerRef.current) { clearTimeout(reportTimerRef.current); reportTimerRef.current = null }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    void loadBoard()
  }, [loadBoard])

  /**
   * Take the board, or say again that we still have it.
   *
   * Renewal is the same call: the lock is reentrant by holder, so asking again
   * refreshes the lease and nothing else. Rate-limited to LOCK_RENEW_MS so a
   * drag costs one request per second rather than one per frame, and that is
   * also what keeps a long gesture's lease alive — the lease is deliberately
   * too short to cover one on its own.
   */
  const takeHold = useCallback((): void => {
    const target = boardKeyRef.current
    if (!target) return
    const now = Date.now()
    if (holdingRef.current && now - lastHoldAtRef.current < LOCK_RENEW_MS) return
    lastHoldAtRef.current = now
    void holdBoard(target, clientId).then((reply) => {
      // A board switch landed while this was in flight: the answer is about a
      // board this pane is no longer holding.
      if (boardKeyRef.current !== target) return
      holdingRef.current = reply.held
      if (!reply.held) loseBoard(reply.holder)
    }).catch(() => {
      // No answer. Not ours, then — and the write that follows will take the
      // board on its own behalf or be refused, which is the same outcome
      // arriving a beat later.
      holdingRef.current = false
    })
  }, [clientId, loseBoard])

  /**
   * The person takes their board back from an agent that claimed it.
   *
   * Nothing is undone: every write the agent made is in the note, so the board
   * is left part way through whatever it was doing, and the agent is told at
   * its next act rather than being stopped mid-write. The board goes to nobody,
   * not to this pane — the next thing drawn takes it the way any gesture does.
   */
  const takeBack = useCallback((): void => {
    const target = boardKeyRef.current
    void takeBoardBack(target, clientId).then((reply) => {
      if (boardKeyRef.current !== target) return
      // Believed only on success. A refusal means somebody is mid-write and
      // the board is still theirs, and the broadcast will say so anyway.
      if (reply.held) setHeldBy(null)
    }).catch(() => { /* the broadcast is the truth; a failed tap changes nothing */ })
  }, [clientId])

  /**
   * Give the board back, once the gesture is over and its write has landed.
   *
   * A person's hold is a gesture and not a session: holding it for as long as a
   * board is on screen would block every agent for as long as anybody is
   * looking at the wall. "Over" is a report on the wire with nothing queued
   * behind it — a pending debounce or retry means the hand is still moving, and
   * releasing there would hand the board over mid-gesture.
   */
  const releaseIfIdle = useCallback((): void => {
    if (!holdingRef.current) return
    if (reportTimerRef.current || retryTimerRef.current) return
    holdingRef.current = false
    releaseBoard(boardKeyRef.current, clientId)
  }, [clientId])

  // ─── Reporting what the human did ────────────────────────────

  /**
   * What this pane is deliberately not telling the server about right now.
   *
   * One element at most: the one a person has a text editor open on. Reporting
   * it is what would get it renamed, and a rename under an open editor is how
   * typing disappears (TASK-098, `settleForeignTextIds` below).
   */
  const withheldIds = useCallback((): ReadonlySet<string> => {
    const editing = idUnderEditor(apiRef.current)
    return editing === null ? EMPTY_WITHHELD : new Set([editing])
  }, [])

  /**
   * Give every text element Excalidraw minted a name a note can hold, here,
   * before anybody else has to (TASK-098).
   *
   * Excalidraw names what a person draws with a 21-character nanoid. A text
   * element's block id is its element id and the Obsidian plugin's parser reads
   * exactly eight characters (`/\s\^(.{8})[\n]+/`), so a longer one is renamed
   * on the way into a note — and under ADR 0015 the note is the board, so that
   * rename is what comes back to this pane. Measured before this existed: a
   * hand-drawn text lost six characters and a hand-added label lost all ten,
   * with the textarea still on screen, still focused, and holding every one of
   * them.
   *
   * The defence is that no id ever changes under an editor, and it takes both
   * halves of this. The element under the editor is withheld from the report,
   * so the server never sees a name it would want to change; and the moment the
   * editor is gone, the pane renames it itself rather than letting the note
   * writer do it at the far end of a round trip.
   *
   * `derivedId` is the same function the server would have called on the same
   * id, so the two agree on the new name without saying anything to each other,
   * and a rename this pane somehow misses is still the rename the server makes.
   */
  const settleForeignTextIds = useCallback((withheld: ReadonlySet<string>): void => {
    const api = apiRef.current
    if (!api) return
    const scene = api.getSceneElementsIncludingDeleted() as unknown as Record<string, any>[]
    const foreign = scene.filter((element) => element.type === 'text' && !element.isDeleted
      && !withheld.has(element.id) && !isBlockId(element.id))
    if (foreign.length === 0) return

    const taken = new Set(scene.map((element) => element.id as string))
    const renames = new Map<string, string>()
    for (const element of foreign) {
      const name = derivedId(element.id, taken)
      taken.add(name)
      renames.set(element.id, name)
    }
    // Suppressed, because this is the pane putting its own house in order and
    // not a hand moving. The report it is part of is already on its way out.
    settle()
    api.updateScene({
      elements: withTextIdsRenamed(scene, renames) as any,
      captureUpdate: CaptureUpdateAction.NEVER
    })
    // Writes nothing into the baseline — the report this is part of is what
    // does that — so there is nothing here for an edit to be absorbed into.
    recordDelivery('the pane renaming its own text elements', () => { })
  }, [recordDelivery, settle])

  const sendReport = useCallback(async (): Promise<void> => {
    const api = apiRef.current
    if (!api) return
    // Nothing is lost by returning here: the baseline is untouched, so the
    // very same delta is recomputed by the next report, and the debounce that
    // called this has re-armed itself rather than given up (`scheduleReport`).
    if (inFlightRef.current) return
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    // A board that has just stopped saving is owed a statement of what is on
    // this screen, and that is this report rather than a delta: the server's
    // copy of a held board starts as the note somebody else wrote, and a delta
    // on top of that is neither their board nor ours. Diffed against nothing,
    // so every element on the glass is in it (TASK-079).
    const rebase = rebaseNeededRef.current
    // What this pane is keeping to itself, asked once and used three times: the
    // rename skips it, the report leaves it out, and the document that comes
    // back must not be allowed to take it off the glass.
    const withheld = withheldIds()
    settleForeignTextIds(withheld)
    // Including the deleted: a report is built only from live elements, but
    // *why* an element went missing can matter. Emptying a label deletes the
    // bound text element rather than editing it, and the deleted element is
    // the only thing that distinguishes a label somebody cleared from a label
    // that was never expanded (src/core/labels.ts, TASK-029).
    const report = diffAgainstBaseline(
      api.getSceneElementsIncludingDeleted() as unknown as Record<string, any>[],
      rebase ? new Map() : baselineRef.current,
      withheld
    )
    if (!rebase && isEmpty(report)) {
      baselineRef.current = report.nextBaseline
      return
    }

    // The board rides with the delta: if a switch lands while this is in
    // flight the server still files it under the board it came from.
    const target = boardKeyRef.current
    // Where the human had got to when this report was built. The document that
    // comes back is an answer to exactly this much of the session.
    const editsAtSend = localEditsRef.current
    inFlightRef.current = true
    try {
      const reply = await reportChanges(target, report, clientId, rebase)
      // The server took what is on this screen, so the held copy and the pane
      // are the same board again and the ordinary flow resumes.
      if (rebase) rebaseNeededRef.current = false
      // Every reply says whether this board is saving. It is a state rather
      // than an event — it outlives the message that first mentioned it — so
      // it is taken from each reply rather than remembered from the refusal.
      if (reply.held) holdRef.current = reply.held
      else if (holdRef.current) holdRef.current = null

      // The board comes back whole, and this pane renders it (ADR 0015,
      // TASK-074). That is what stops a session accumulating divergence: the
      // pane stops being a running total of deltas and becomes a view of the
      // document, re-agreed on every write.
      //
      // Applying it outright is safe *here* and nowhere else, because this
      // response was computed from what this pane just sent. Another writer's
      // broadcast can be missing local work in flight, which is why that one
      // is still merged by id, in applyServerElements.
      //
      // The one way this response can be missing something is a human editing
      // during the round trip, which is short but not zero. So the check is
      // made rather than assumed: if a hand has moved since the report was
      // built, the document is stale by exactly that edit, and the pane keeps
      // what it is holding and re-agrees on the next write instead.
      //
      // Counted rather than diffed. A diff cannot tell "the human moved a box"
      // from "another writer's broadcast landed while this was in flight", and
      // taking the second for the first would refuse the resync on every
      // interleaved write — which is most of them, in a session with an agent
      // in it.
      const handMoved = localEditsRef.current !== editsAtSend
      if (reply.document && !handMoved) {
        applyServerScene(reply.document.map(cleanElementForExcalidraw), withheld)
      } else {
        // Only now is this what the server holds.
        baselineRef.current = report.nextBaseline
      }
      noteChange()
      // The gesture's write has landed. If nothing is queued behind it the hand
      // has stopped, and the board goes back so an agent waiting on it is not
      // waiting on somebody who has finished (ADR 0016).
      releaseIfIdle()
    } catch (error) {
      // Refused because the note changed underneath (ADR 0006). The board has
      // stopped saving from this moment; it is not a failure to retry into,
      // because retrying the same delta would meet the same refusal every two
      // seconds for as long as the human keeps drawing. What this pane owes the
      // server instead is what is on its screen, and then drawing carries on
      // into the held copy (TASK-079).
      if (error instanceof BoardConflictError) {
        holdRef.current = error.held ?? holdRef.current
        rebaseNeededRef.current = true
        publishStatus()
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null
          void sendReport()
        }, 0)
        return
      }
      // The baseline is untouched, so the very same delta is recomputed next
      // time. Nothing is lost by a failed report except its promptness.
      console.warn('Change report failed; retrying:', error)
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        void sendReport()
      }, REPORT_RETRY_MS)
    } finally {
      inFlightRef.current = false
    }
    watchDebt('a report had just landed')
    // `publishStatus` puts the hold in the pane's status when the write is
    // refused (TASK-079); `releaseIfIdle` gives the board back when it lands
    // (TASK-067). Both are called from the body, so both belong here.
  }, [applyServerScene, clientId, noteChange, publishStatus, releaseIfIdle, settleForeignTextIds,
    watchDebt])

  /** Does this pane hold edits the server has not accepted? */
  const hasPendingChanges = useCallback((): boolean => {
    const api = apiRef.current
    if (!api || !userInteractedRef.current) return false
    return !isEmpty(diffAgainstBaseline(
      api.getSceneElementsIncludingDeleted() as unknown as Record<string, any>[],
      baselineRef.current,
      withheldIds()
    ))
  }, [withheldIds])

  const scheduleReport = useCallback((): void => {
    // Deliberately not gated on the socket: reporting is an HTTP call, so a
    // dropped socket must not also stop a human's edits reaching the server.
    if (!apiRef.current) return
    // Nothing a human has not touched gets reported. A pane that is only
    // watching never writes, which is what makes a second pane safe.
    if (!userInteractedRef.current) return
    if (suppressRef.current > 0) return
    // Past both gates, so this is the human's hand and not the server's news
    // being written into the scene. It is still not necessarily an edit:
    // `onChange` fires for a scroll, a zoom, a selection, and — since the lock
    // — for this pane going in and out of read-only as a board changes hands.
    // The stamp is what separates "the drawing moved" from "something else
    // did", and everything below is for the first.
    const stamp = sceneStamp(apiRef.current)
    if (stamp === sceneStampRef.current) return
    sceneStampRef.current = stamp

    // Counted, because the reply to a report is only applied as a resync when
    // nothing moved during its round trip (TASK-074). Counting anything else
    // here is how that resync gets skipped for no reason, and it did: this used
    // to count every `onChange`, so an agent's write — which broadcasts that
    // the board is held, and again that it is free — read as two edits by the
    // human, the resync was skipped, and the pane never learned about the
    // `boundElements` entry that agent's new arrow had added to the shapes it
    // joins. `check-live-session.mjs` names the element and the field.
    localEditsRef.current += 1
    // And this is the leading edge the report itself cannot be: the board is
    // taken now, rather than 400 ms after the finger lifts (ADR 0016).
    takeHold()
    if (reportTimerRef.current) clearTimeout(reportTimerRef.current)
    // Re-armed rather than dropped when it cannot go out yet, and that is the
    // whole of why this is a named function (TASK-099).
    //
    // Two things stop a report at the moment it comes due. One is already in
    // flight, or a delivery is being written into the scene and this pane is
    // not reading it as a hand. Both used to `return`, on the reasoning that
    // the baseline is untouched so the same delta is recomputed next time —
    // which is true, and says nothing about there being a next time. There is
    // one only if something else arms it, and in both cases there is a
    // sequence in which nothing does: a reply that comes back after a hand has
    // moved applies no document, so no settle runs to notice; and an edit made
    // *before* a delivery is already in the stamp that settle restores, so the
    // drain passes it over.
    //
    // Re-arming is not a retry making a loss less likely. The timer is never
    // dropped, so "owed" implies "armed" by construction, which is the
    // property this file has to hold.
    const due = (): void => {
      reportTimerRef.current = null
      if (inFlightRef.current || suppressRef.current > 0) {
        reportTimerRef.current = setTimeout(due, REPORT_DEBOUNCE_MS)
        return
      }
      void sendReport()
    }
    reportTimerRef.current = setTimeout(due, REPORT_DEBOUNCE_MS)
  }, [sendReport, takeHold])
  useEffect(() => { scheduleReportRef.current = scheduleReport }, [scheduleReport])

  // A tab being closed or hidden still owes the server its last few hundred
  // milliseconds of edits. sendBeacon survives the unload; fetch does not.
  const flushWithBeacon = useCallback((): void => {
    const api = apiRef.current
    if (!api || !userInteractedRef.current || typeof navigator.sendBeacon !== 'function') return
    const report = diffAgainstBaseline(
      api.getSceneElementsIncludingDeleted() as unknown as Record<string, any>[],
      baselineRef.current
    )
    if (isEmpty(report)) return
    const target = boardKeyRef.current
    const url = `/api/elements/changes${target ? `?board=${encodeURIComponent(target)}` : ''}`
    const body = new Blob(
      [JSON.stringify({
        upserts: report.upserts,
        deletes: report.deletes,
        clientId,
        timestamp: new Date().toISOString()
      })],
      { type: 'application/json' }
    )
    navigator.sendBeacon(url, body)
  }, [clientId])

  // ─── Selection ───────────────────────────────────────────────

  const publishSelection = useCallback(async (elementIds: string[]): Promise<void> => {
    try {
      const response = await fetch('/api/selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementIds, clientId })
      })
      if (!response.ok) publishedSelectionRef.current = ''
    } catch (error) {
      console.warn('Selection publish failed:', error)
      publishedSelectionRef.current = ''
    }
  }, [clientId])

  const handleSelectionChange = useCallback((
    appState: { selectedElementIds?: Record<string, boolean> } | null
  ): void => {
    // A pane nobody has touched does not get to speak for the human. Without
    // this a freshly mounted second pane would publish its empty selection and
    // wipe whatever the first pane had picked.
    if (!userInteractedRef.current) return

    const ids = Object.entries(appState?.selectedElementIds ?? {})
      .filter(([, selected]) => selected)
      .map(([id]) => id)
      .sort()
    const key = ids.join(',')
    if (key === publishedSelectionRef.current && pendingSelectionRef.current === null) return
    pendingSelectionRef.current = ids

    if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
    selectionTimerRef.current = setTimeout(() => {
      selectionTimerRef.current = null
      const pending = pendingSelectionRef.current ?? []
      pendingSelectionRef.current = null
      const pendingKey = pending.join(',')
      if (pendingKey === publishedSelectionRef.current) return
      publishedSelectionRef.current = pendingKey
      void publishSelection(pending)
    }, SELECTION_DEBOUNCE_MS)
  }, [publishSelection])

  // ─── Board adoption ──────────────────────────────────────────

  const adoptBoard = useCallback((key: string | undefined, identity: BoardIdentity | undefined): void => {
    if (!key) return
    if (boardKeyRef.current !== key) {
      // Anything queued for the board we just left must not fire into the one
      // we just arrived at.
      if (reportTimerRef.current) { clearTimeout(reportTimerRef.current); reportTimerRef.current = null }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
      // A hold belongs to the board it was taken on, and this pane has stopped
      // looking at that board.
      if (holdingRef.current) {
        holdingRef.current = false
        releaseBoard(boardKeyRef.current, clientId)
      }
      // And the board we are arriving at is somebody else's until we are told
      // it is not. The server sends that immediately behind the board itself,
      // so this is the shortest possible "I have not been told" rather than a
      // state a pane can be stuck in (ADR 0016).
      setHeldBy(UNKNOWN_HOLDER)
      userInteractedRef.current = false
      publishedSelectionRef.current = ''
      baselineRef.current = new Map()
    }
    boardKeyRef.current = key
    setBoardIdentity(identity ?? { board: key, variant: 'current' })
    publishStatus()
    // Immediately, not on the debounce: `panes` is read every turn and a pane
    // that had just been pointed at another board would report the old one for
    // a third of a second.
    schedulePaneReport(true)
  }, [clientId, publishStatus, schedulePaneReport, setBoardIdentity])

  // Re-read THIS pane's board. Deliberately not "what board is the server on":
  // there is no such thing, and a pane that asked would be at risk of adopting
  // another pane's board (ADR 0009). A pane learns which board it holds from
  // the server addressing it — initial_elements, board_switched — and nowhere
  // else.
  // ─── Requests addressed to the browser ───────────────────────

  const answerExport = useCallback(async (data: WebSocketMessage): Promise<void> => {
    const api = apiRef.current
    if (!api || !data.requestId) return
    const respond = (payload: Record<string, unknown>) =>
      fetch('/api/export/image/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: data.requestId, ...payload })
      }).catch(() => { })

    try {
      const elements = api.getSceneElements()
      const appState = { ...api.getAppState(), exportBackground: data.background !== false }
      const files = api.getFiles()

      if (data.format === 'svg') {
        const svg = await exportToSvg({ elements, appState, files })
        await respond({ format: 'svg', data: new XMLSerializer().serializeToString(svg) })
        return
      }

      const blob = await exportToBlob({ elements, appState, files, mimeType: 'image/png' })
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const encoded = (reader.result as string)?.split(',')[1]
          if (encoded) resolve(encoded)
          else reject(new Error('Could not extract base64 data from the export'))
        }
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
        reader.readAsDataURL(blob)
      })
      await respond({ format: 'png', data: base64 })
    } catch (error) {
      console.error('Image export failed:', error)
      await respond({ error: (error as Error).message })
    }
  }, [])

  const answerViewport = useCallback(async (data: WebSocketMessage): Promise<void> => {
    const api = apiRef.current
    if (!api || !data.requestId) return
    const respond = (payload: Record<string, unknown>) =>
      fetch('/api/viewport/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: data.requestId, ...payload })
      }).catch(() => { })

    try {
      const all = api.getSceneElements()
      if (data.scrollToContent) {
        if (all.length > 0) {
          api.scrollToContent(all, {
            fitToViewport: true,
            viewportZoomFactor: data.viewportZoomFactor,
            animate: true
          })
        }
      } else if (data.scrollToElementIds !== undefined) {
        const ids = data.scrollToElementIds
        if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string' && id.length > 0)) {
          throw new Error('scrollToElementIds must be a non-empty array of element IDs')
        }
        const wanted = new Set(ids)
        const targets = all.filter((el) => wanted.has(el.id))
        const found = new Set(targets.map((el) => el.id))
        const missing = ids.filter((id) => !found.has(id))
        if (missing.length > 0) throw new Error(`Elements not found for IDs: ${missing.join(', ')}`)
        api.scrollToContent(targets, {
          fitToViewport: true,
          viewportZoomFactor: data.viewportZoomFactor,
          animate: true
        })
      } else if (data.scrollToElementId) {
        const target = all.find((el) => el.id === data.scrollToElementId)
        if (!target) throw new Error(`Element ${data.scrollToElementId} not found`)
        api.scrollToContent([target], { fitToViewport: false, animate: true })
      } else {
        const appState: any = {}
        if (data.zoom !== undefined) appState.zoom = { value: data.zoom }
        if (data.offsetX !== undefined) appState.scrollX = data.offsetX
        if (data.offsetY !== undefined) appState.scrollY = data.offsetY
        if (Object.keys(appState).length > 0) {
          suppressRef.current += 1
          api.updateScene({ appState })
          setTimeout(() => { suppressRef.current = Math.max(0, suppressRef.current - 1) }, 0)
        }
      }
      await respond({ success: true, message: 'Viewport updated' })
    } catch (error) {
      console.error('Viewport control failed:', error)
      await respond({ error: (error as Error).message })
    }
  }, [])

  const answerMermaid = useCallback(async (data: WebSocketMessage): Promise<void> => {
    const api = apiRef.current
    if (!api || !data.mermaidDiagram) return
    try {
      const result = await convertMermaidToExcalidraw(data.mermaidDiagram, data.config || DEFAULT_MERMAID_CONFIG)
      if (result.error) {
        console.error('Mermaid conversion error:', result.error)
        return
      }
      if (!result.elements || result.elements.length === 0) return

      // Regenerate ids: mermaid emits stable ones like "A", which would collide
      // with a previous conversion already on the board.
      const converted = convertToExcalidrawElements([...result.elements] as any, { regenerateIds: true })
      // These are ours, not the server's — they get onto the board the same way
      // a human's drawing does, by being reported.
      api.updateScene({
        elements: [...api.getSceneElements(), ...converted],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })
      if (result.files) api.addFiles(Object.values(result.files))
      userInteractedRef.current = true
      await sendReport()
    } catch (error) {
      console.error('Mermaid conversion failed:', error)
    }
  }, [sendReport])

  // ─── The socket ──────────────────────────────────────────────

  const handleMessage = useCallback(async (data: WebSocketMessage): Promise<void> => {
    const api = apiRef.current
    if (!api) return

    // board_switched and initial_elements are how a pane learns which board it
    // is on; everything else about another board is not ours to apply.
    if (data.type === 'board_switched' || data.type === 'initial_elements') {
      adoptBoard(data.board, data.identity)
    } else if (data.board && boardKeyRef.current && data.board !== boardKeyRef.current) {
      return
    }

    // Between a refused write and this pane saying what is on its screen, the
    // server's copy of this board is the note another editor wrote. Rendering
    // it would put their scene in front of the human in place of their own, a
    // fraction of a second before the pane replaces it again. So board content
    // waits for the rebase; news about the board itself does not (TASK-079).
    if (rebaseNeededRef.current && CONTENT_MESSAGES.has(data.type)) return

    switch (data.type) {
      // The first frame, and every reconnection. If this pane is holding edits
      // the server never accepted — the socket dropped mid-drawing, say — get
      // them there first and then take the board back from the server, rather
      // than letting a snapshot taken before them quietly undo them.
      case 'initial_elements': {
        if (hasPendingChanges()) {
          await sendReport()
          await loadBoard()
          break
        }
        const elements = (data.elements ?? []).map(cleanElementForExcalidraw)
        // Still this pane's board, so a half-typed label is still this pane's
        // to keep: a reconnection in the middle of somebody typing must not
        // take it off the glass.
        applyServerScene(elements, withheldIds())
        if (data.files) api.addFiles(Object.values(data.files))
        break
      }

      // A different board is on the canvas now. Replace rather than merge —
      // folding board A's elements into board B is exactly what this message
      // exists to prevent — and take an empty board as genuinely empty.
      case 'board_switched': {
        const elements = (data.elements ?? []).map(cleanElementForExcalidraw)
        applyServerScene(elements)
        // The board's images come with it. Without this a pane pointed at a
        // board with pictures on it got the elements and no pictures, and only
        // a reload put them back (TASK-060).
        if (data.files) api.addFiles(Object.values(data.files))
        // Whatever was true about the last board's note is not news about this
        // one, and taking the note (`board open --reload`) arrives as this
        // message. The server sends the new board's answer immediately behind
        // it; clearing here is so the mark comes down with the scene rather
        // than one message later, which on a wall display is a person reading a
        // warning about a board that is already gone.
        writtenElsewhereRef.current = null
        // Nor is what an agent said about the last board news about this one.
        // The server sends this board's own list straight behind the scene.
        doingRef.current = []
        setDoing(doingRef.current)
        noteChange()
        break
      }

      case 'files_added':
        if (Array.isArray(data.files)) api.addFiles(data.files)
        break

      case 'element_created':
      case 'element_updated':
        if (data.element) {
          applyServerElements([cleanElementForExcalidraw(data.element)])
          noteChange()
        }
        break

      case 'elements_batch_created':
        if (data.elements) {
          applyServerElements(data.elements.map(cleanElementForExcalidraw))
          noteChange()
        }
        break

      case 'element_deleted':
        if (data.elementId) {
          removeElements([data.elementId])
          noteChange()
        }
        break

      // The result of somebody's change report. Our own comes back too;
      // re-applying it is at best a wasted render and at worst a shape
      // snapping back under the pointer, so we skip our own echo.
      case 'elements_changed': {
        if (data.origin === clientId) break
        const touched = [...(data.created ?? []), ...(data.updated ?? [])]
        if (touched.length > 0) applyServerElements(touched.map(cleanElementForExcalidraw))
        if (data.deleted && data.deleted.length > 0) removeElements(data.deleted)
        noteChange()
        break
      }

      // Who is writing this board (ADR 0016). The pane that holds the lock is
      // told too, and has to recognise itself: the news that the board is held
      // by *us* is the news that we may keep drawing.
      //
      // This is the only thing that opens a board back up. Everything else here
      // errs the other way, which is the direction the ADR asks for.
      case 'board_lock': {
        const holder = data.holder ?? null
        const mine = !!holder && holder.id === clientId
        holdingRef.current = mine
        setHeldBy(data.held && !mine ? holder : null)
        break
      }

      // The note behind this board has been written by somebody who is not
      // archboard, or it has stopped being (TASK-062). Nothing about drawing
      // changes: this is not a lock, nobody is excluded, and no write has been
      // refused. What changes is that the person can see it.
      //
      // Always assigned, never merged. Null is the news that the pane and the
      // note agree again, which is how the mark comes down by itself after a
      // reload.
      case 'board_note':
        writtenElsewhereRef.current = data.writtenElsewhere ?? null
        publishStatus()
        break

      // An agent has changed this board and said what it was doing (TASK-095).
      // Not a lock and not a refusal: nothing is stopping anybody, and this
      // pane keeps drawing. It is the other half of seeing a change as it
      // happens — the boxes move, and this says what the move was for.
      case 'board_doing':
        if (Array.isArray(data.recent)) {
          doingRef.current = data.recent as DoingEntry[]
          setDoing(doingRef.current)
        }
        publishStatus()
        break

      case 'canvas_cleared':
        applyServerScene([])
        noteChange()
        break

      case 'selection_changed':
        break

      // This board stopped saving, or is saving again. It reaches every pane
      // holding it, not only the one whose write was refused: a second pane
      // showing the same board is drawing into the same held copy and has the
      // same right to know (ADR 0006, TASK-079).
      case 'board_hold':
        holdRef.current = data.hold ?? holdRef.current
        publishStatus()
        break

      case 'board_released':
        holdRef.current = null
        // A reload replaces this pane's scene with the note, and the
        // board_switched that carries it is on its way. Anything owed about
        // the copy that was just discarded is owed no longer.
        rebaseNeededRef.current = false
        publishStatus()
        break

      // Boardless on purpose: one palette sits behind every board, so this is
      // applied whatever this pane is showing. Only the primary pane forwards
      // it, or two panes would hand the shell the same news twice.
      case 'library_changed':
        if (primaryRef.current && Array.isArray(data.items)) {
          onLibraryChanged?.(data.items as LibraryItems)
        }
        break

      // None of these is gated on primary any more. All are addressed to one
      // pane's socket, so the pane that receives one is by definition the pane
      // that was asked. Gating them on primary was what made the second pane
      // impossible to photograph, to frame, or to convert into — an agent could
      // draw a proposal beside the current architecture and never see it, and
      // could not put a mermaid diagram there at all.
      case 'export_image_request':
        await answerExport(data)
        break

      case 'set_viewport':
        await answerViewport(data)
        break

      // Layout: the shell's, not this canvas's. Handed up untouched.
      case 'pane_open':
        onLayoutRequest?.('open')
        break

      case 'pane_close':
        onLayoutRequest?.('close')
        break

      case 'mermaid_convert':
        await answerMermaid(data)
        break

      default:
        console.debug('Unhandled server message:', data.type)
    }
  }, [
    adoptBoard, answerExport, answerMermaid, answerViewport, applyServerElements,
    applyServerScene, clientId, hasPendingChanges, loadBoard, noteChange, onLayoutRequest,
    onLibraryChanged, removeElements, sendReport, withheldIds
  ])

  const connect = useCallback((): void => {
    if (closedRef.current) return
    const existing = socketRef.current
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/?clientId=${encodeURIComponent(clientId)}`
    )
    socketRef.current = socket

    socket.onopen = () => {
      connectedRef.current = true
      setConnected(true)
      // The server retires a pane when its socket closes, so a reconnection has
      // to re-announce this one even though nothing about it changed.
      publishedPaneRef.current = ''
      publishStatus()
      // No fetch here: the server opens every connection, including a
      // reconnection, by sending the board it is holding.
    }
    socket.onmessage = (event) => {
      try {
        void handleMessage(JSON.parse(event.data) as WebSocketMessage)
      } catch (error) {
        console.error('Could not parse a server message:', error, event.data)
      }
    }
    socket.onclose = (event) => {
      connectedRef.current = false
      setConnected(false)
      publishStatus()
      if (event.code !== 1000 && !closedRef.current) setTimeout(connect, SOCKET_RECONNECT_MS)
    }
    socket.onerror = () => {
      connectedRef.current = false
      setConnected(false)
      publishStatus()
    }
  }, [clientId, handleMessage, publishStatus])

  const attachExcalidraw = useCallback((api: ExcalidrawImperativeAPI): void => {
    apiRef.current = api
    connect()
  }, [connect])

  useEffect(() => {
    const flush = () => flushWithBeacon()
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      closedRef.current = true
      if (reportTimerRef.current) clearTimeout(reportTimerRef.current)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
      if (paneTimerRef.current) clearTimeout(paneTimerRef.current)
      // A pane going off the glass with the board in its hand. The lease would
      // have covered it, and this is only so nobody waits out a lease for a
      // pane that closed politely.
      if (holdingRef.current) {
        holdingRef.current = false
        releaseBoard(boardKeyRef.current, clientId)
      }
      paneObserverRef.current?.disconnect()
      // Closing the socket is also how this pane stops being reported: an
      // unsplit pane is off the glass, and the server drops it on the close.
      socketRef.current?.close(1000)
    }
  }, [clientId, flushWithBeacon])

  const handleChange = useCallback((appState: any): void => {
    handleSelectionChange(appState)
    scheduleReport()
    // Scrolling and zooming reach the server nowhere else, and they are half of
    // what "what am I looking at" means.
    schedulePaneReport()
  }, [handleSelectionChange, scheduleReport, schedulePaneReport])

  const markInteracted = useCallback((): void => {
    userInteractedRef.current = true
  }, [])

  return {
    attachExcalidraw,
    attachPaneElement,
    connected,
    board,
    handleChange,
    markInteracted,
    // The gate, and it fails closed on both halves. Somebody else holds the
    // board, or this pane has lost the socket the lock is broadcast over and
    // cannot know (ADR 0016). Change reports are not gated on the socket and
    // must not be, so edits already made still reach the server — what stops
    // is the next one being made at all.
    readOnly: !connected || heldBy !== null,
    heldBy,
    takeBack,
    doing
  }
}
