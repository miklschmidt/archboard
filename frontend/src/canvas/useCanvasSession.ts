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
import {
  hasPendingEdits, initialState, reduce,
  type ChangeReportingEffect, type ChangeReportingEvent,
  type ChangeReportingState, type SceneElement, type SceneUpdate
} from './change-reporting'
import {
  BoardConflictError, fetchElements, fetchFiles, holdBoard, loadedBundle, releaseBoard, reportChanges,
  reportPane, takeBoardBack
} from './api'
import type { PaneReport } from './api'

// Messages that say what is on a board, as opposed to messages about the board.
// A pane that must send a full report ignores the first kind and acts on the
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

const EMPTY_WITHHELD: readonly string[] = []

/**
 * The text element a person has an editor open on, if any.
 *
 * Excalidraw keeps the element it opened the editor for in `editingTextElement`
 * and keeps it there under the id it had at the time, which is what makes this
 * worth asking. Rename that element in the scene and the appState still names
 * the old one: the textarea stays on screen, stays focused, keeps every
 * character, and submits into an element the scene no longer holds. Measured on
 * a user-drawn text (six characters discarded) and on a user-added label (all
 * ten).
 */
function idUnderEditor(api: ExcalidrawImperativeAPI | null): string | null {
  const editing = api?.getAppState().editingTextElement
  return editing ? editing.id : null
}

function assertNever(value: never): never {
  throw new Error(`Unhandled change-reporting effect: ${JSON.stringify(value)}`)
}

interface ReportingRuntime {
  state: ChangeReportingState
  reportTimer: ReturnType<typeof setTimeout> | null
  retryTimer: ReturnType<typeof setTimeout> | null
  reportPromise: Promise<void> | null
}

export interface CanvasSessionOptions {
  paneId: string
  /**
   * Is this the pane the server picks when a request names no pane and no
   * board? Reported, and used for the one message that really is about the
   * browser rather than a pane: a library change, which every pane hears and
   * only one should send to the shell. Export, viewport and mermaid are
   * addressed to a
   * single socket, so the pane that gets one answers it whether or not it is
   * primary.
   */
  primary: boolean
  /** Is this the pane the human last touched? Reported, not enforced. */
  focused: boolean
  onStatus: (status: PaneStatus) => void
  /**
   * Another tab changed the stencil palette. Sent straight to the shell,
   * which owns the library — a library item is not board content, so nothing
   * about it touches the element store, the baseline, or a change report.
   */
  onLibraryChanged?: (items: LibraryItems) => void
  /**
   * The server is asking for the layout to change: another pane, or this one
   * gone. A canvas cannot do either — the shell owns how many panes there are
   * — so this is sent straight up, the same way a library change is.
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
   * a user edit. A claim may run for minutes, and a 75-inch display that
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
   * and a person watching boxes move should see the reason either way.
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

  const reportingRef = useRef<ReportingRuntime>({
    state: initialState(),
    reportTimer: null,
    retryTimer: null,
    reportPromise: null
  })

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
  // has just received the board is not blank until the next write.
  const doingRef = useRef<DoingEntry[]>([])
  const lastChangeAtRef = useRef<string | null>(null)

  // ── The board's mutex (ADR 0016) ──
  // Does this pane hold the board's lock right now, and when did it last say
  // so? Refs rather than state: nothing renders off them, and they are read
  // inside callbacks that must see the current value rather than the one that
  // was current when they were made.
  const holdingRef = useRef(false)
  const lastHoldAtRef = useRef(0)
  /**
   * Who is writing this board, if it is not us. Non-null means read-only.
   *
   * It starts held and stays held until the server says otherwise. A pane that
   * does not know is a pane that has not been told, and ADR 0016 says a pane
   * that cannot be told assumes the board is held rather than that it is free.
   * The server sends the lock state immediately behind every board it sends a
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
   * is what makes this a description of the displayed scene.
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
    // A pane being removed has nothing to say about its displayed scene.
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

  // ─── Writing the server's news into the scene ────────────────

  const currentScene = (): SceneElement[] =>
    apiRef.current?.getSceneElementsIncludingDeleted() as unknown as SceneElement[] ?? []

  const currentWithheldIds = (): readonly string[] => {
    const editing = idUnderEditor(apiRef.current)
    return editing === null ? EMPTY_WITHHELD : [editing]
  }

  /** The only function that calls Excalidraw's programmatic scene update. */
  const applySceneUpdate = (
    update: SceneUpdate,
    serverUpdate?: Extract<ChangeReportingEffect, { type: 'apply_server_update' }>
  ): void => {
    const api = apiRef.current
    if (!api) return
    api.updateScene({
      ...(update.elements
        ? { elements: elementsForScene(update.elements as Partial<ExcalidrawElement>[]) as any }
        : {}),
      ...(update.appState ? { appState: update.appState as any } : {}),
      captureUpdate: update.captureUpdate === 'immediately'
        ? CaptureUpdateAction.IMMEDIATELY
        : CaptureUpdateAction.NEVER
    })
    if (!serverUpdate) return
    const scene = currentScene()
    dispatchReporting({
      type: 'server_update_applied',
      generation: serverUpdate.generation,
      scene,
      baselineUpdate: serverUpdate.baselineUpdate,
      reportAfterUpdate: serverUpdate.reportAfterUpdate
    })
  }

  const executeReportingEffect = (effect: ChangeReportingEffect): void => {
    const runtime = reportingRef.current
    switch (effect.type) {
      case 'cancel_report_timer':
        if (runtime.reportTimer) clearTimeout(runtime.reportTimer)
        runtime.reportTimer = null
        return
      case 'start_report_timer':
        if (runtime.reportTimer) clearTimeout(runtime.reportTimer)
        runtime.reportTimer = setTimeout(() => {
          runtime.reportTimer = null
          dispatchReporting({
            type: 'report_timer_fired', generation: effect.generation,
            scene: currentScene(), withheldIds: currentWithheldIds()
          })
        }, effect.delayMs)
        return
      case 'cancel_retry_timer':
        if (runtime.retryTimer) clearTimeout(runtime.retryTimer)
        runtime.retryTimer = null
        return
      case 'start_retry_timer':
        if (runtime.retryTimer) clearTimeout(runtime.retryTimer)
        runtime.retryTimer = setTimeout(() => {
          runtime.retryTimer = null
          dispatchReporting({
            type: 'retry_timer_fired', generation: effect.generation,
            scene: currentScene(), withheldIds: currentWithheldIds()
          })
        }, effect.delayMs)
        return
      case 'apply_server_update':
        applySceneUpdate(effect.update, effect)
        return
      case 'finish_server_update':
        setTimeout(() => {
          dispatchReporting({
            type: 'server_update_finished', generation: effect.generation, scene: currentScene()
          })
          publishStatus()
        }, 0)
        return
      case 'send_report': {
        const target = boardKeyRef.current
        const request = reportChanges(target, effect.report, clientId, effect.fullReport)
          .then((reply) => {
            if (reply.held) holdRef.current = reply.held
            else if (holdRef.current) holdRef.current = null
            dispatchReporting({
              type: 'report_succeeded', generation: effect.generation,
              document: reply.document?.map(cleanElementForExcalidraw) as SceneElement[] | undefined,
              currentScene: currentScene()
            })
          })
          .catch((error) => {
            if (error instanceof BoardConflictError) {
              holdRef.current = error.held ?? holdRef.current
              dispatchReporting({ type: 'report_refused', generation: effect.generation })
              return
            }
            console.warn('Change report failed; retrying:', error)
            dispatchReporting({ type: 'report_failed', generation: effect.generation })
          })
          .finally(() => {
            if (runtime.reportPromise === request) runtime.reportPromise = null
          })
        runtime.reportPromise = request
        return
      }
      case 'send_beacon': {
        if (typeof navigator.sendBeacon !== 'function') return
        const target = boardKeyRef.current
        const url = `/api/elements/changes${target ? `?board=${encodeURIComponent(target)}` : ''}`
        const body = new Blob(
          [JSON.stringify({
            upserts: effect.report.upserts,
            deletes: effect.report.deletes,
            clientId,
            timestamp: new Date().toISOString()
          })],
          { type: 'application/json' }
        )
        navigator.sendBeacon(url, body)
        return
      }
      case 'take_hold':
        takeHold()
        return
      case 'note_change':
        noteChange()
        return
      case 'release_if_idle':
        releaseIfIdle()
        return
      case 'publish_status':
        publishStatus()
        return
      default:
        assertNever(effect)
    }
  }

  const dispatchReporting = (event: ChangeReportingEvent): void => {
    const result = reduce(reportingRef.current.state, event)
    reportingRef.current.state = result.state
    for (const effect of result.effects) executeReportingEffect(effect)
  }

  /**
   * Replace the scene outright; the board is now exactly what the server said.
   *
   * Except for what this pane deliberately did not tell the server about. A
   * text element under an open editor is withheld from the report that provoked
   * this answer (see `diffAgainstBaseline`), so the answer cannot contain it,
   * and replacing the scene with the answer alone would take a half-typed
   * label out of the scene. Those elements are carried over from the scene and
   * stay out of the baseline, so the first report after the editor closes still
   * includes them as pending edits.
   */
  const applyServerScene = useCallback((
    elements: Partial<ExcalidrawElement>[],
    withheldIds: readonly string[] = EMPTY_WITHHELD
  ): void => {
    if (!apiRef.current) return
    const answered = new Set(elements.map((element) => element.id))
    // `elementsForScene` drops a `boundElements` entry or a `containerId`
    // pointing at an element the server update does not carry. The
    // container of a label being typed into is exactly that, and unbinding it
    // would strand the label.
    const withheld = new Set(withheldIds)
    const kept = withheld.size === 0 ? [] : currentScene()
      .filter((element) => withheld.has(element.id) && !answered.has(element.id))
    dispatchReporting({
      type: 'server_update_requested',
      update: { elements: [...elements, ...kept] as SceneElement[], captureUpdate: 'never' },
      baselineUpdate: { type: 'replace', withheldIds }
    })
  }, [])

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

    dispatchReporting({
      type: 'server_update_requested',
      update: { elements: merged as SceneElement[], captureUpdate: 'never' },
      baselineUpdate: { type: 'touch', ids: touched }
    })
  }, [])

  const removeElements = useCallback((ids: string[]): void => {
    const api = apiRef.current
    if (!api || ids.length === 0) return
    const gone = new Set(ids)
    dispatchReporting({
      type: 'server_update_requested',
      update: {
        elements: api.getSceneElements().filter((element) => !gone.has(element.id)) as unknown as SceneElement[],
        captureUpdate: 'never'
      },
      baselineUpdate: { type: 'delete', ids }
    })
  }, [])

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
   * The board is re-read and the interrupted user edit is dropped. Keeping it
   * and
   * reporting it once the lock frees would be merging two people's edits to one
   * board, which is the thing exclusion exists instead of. This can happen
   * during one broadcast's latency. The pane goes read-only when the server
   * update arrives, so a user edit cannot progress far past it.
   */
  const loseBoard = useCallback((holder: LockHolder | null): void => {
    holdingRef.current = false
    setHeldBy(holder ?? UNKNOWN_HOLDER)
    dispatchReporting({ type: 'reports_cancelled' })
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
   * behind it. A pending report or retry means the user edit has not reached
   * the server, so releasing there would end the hold mid-gesture.
   */
  const releaseIfIdle = useCallback((): void => {
    if (!holdingRef.current) return
    const state = reportingRef.current.state
    if (state.reportTimerScheduled || state.retryTimerScheduled) return
    holdingRef.current = false
    releaseBoard(boardKeyRef.current, clientId)
  }, [clientId])

  // ─── Reporting user edits ───────────────────────────────────

  const sendReport = useCallback(async (): Promise<void> => {
    if (!apiRef.current) return
    dispatchReporting({
      type: 'immediate_report_requested', scene: currentScene(), withheldIds: currentWithheldIds()
    })
    await reportingRef.current.reportPromise
  }, [])

  const hasPendingChanges = useCallback((): boolean => {
    return hasPendingEdits(reportingRef.current.state, currentScene(), currentWithheldIds())
  }, [])

  const scheduleReport = useCallback((): void => {
    if (!apiRef.current) return
    dispatchReporting({ type: 'scene_changed', scene: currentScene() })
  }, [])

  const flushWithBeacon = useCallback((): void => {
    if (!apiRef.current || typeof navigator.sendBeacon !== 'function') return
    dispatchReporting({ type: 'flush_requested', scene: currentScene() })
  }, [])

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
    if (!reportingRef.current.state.userInteracted) return

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
      // Reports scheduled for the previous board cannot run on the next board.
      dispatchReporting({ type: 'board_adopted' })
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
      publishedSelectionRef.current = ''
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
          dispatchReporting({
            type: 'server_update_requested',
            update: { appState, captureUpdate: 'never' },
            baselineUpdate: { type: 'none' }
          })
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
      // The conversion is a user edit and is reported immediately.
      dispatchReporting({ type: 'user_interacted' })
      applySceneUpdate({
        elements: [...api.getSceneElements(), ...converted] as unknown as SceneElement[],
        captureUpdate: 'immediately'
      })
      if (result.files) api.addFiles(Object.values(result.files))
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
    // waits for the full report; status from the server does not (TASK-079).
    if (reportingRef.current.state.fullReportNeeded && CONTENT_MESSAGES.has(data.type)) return

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
        // remove it from the scene.
        applyServerScene(elements, currentWithheldIds())
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
        // board_switched that carries it is on its way. The discarded copy has
        // no pending edits after that replacement.
        dispatchReporting({ type: 'full_report_cleared' })
        publishStatus()
        break

      // Boardless on purpose: one palette sits behind every board, so this is
      // applied whatever this pane is showing. Only the primary pane forwards
      // it, or two panes would send the shell the same news twice.
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

      // Layout: the shell's, not this canvas's. Sent up untouched.
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
    onLibraryChanged, removeElements, sendReport
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
      dispatchReporting({ type: 'reports_cancelled' })
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
      if (paneTimerRef.current) clearTimeout(paneTimerRef.current)
      // A pane closing while it holds the board. The lease would
      // have covered it, and this is only so nobody waits out a lease for a
      // pane that closed politely.
      if (holdingRef.current) {
        holdingRef.current = false
        releaseBoard(boardKeyRef.current, clientId)
      }
      paneObserverRef.current?.disconnect()
      // Closing the socket is also how this pane stops being reported: an
      // unsplit pane is no longer displayed, and the server drops it on the
      // close.
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
    dispatchReporting({ type: 'user_interacted' })
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
