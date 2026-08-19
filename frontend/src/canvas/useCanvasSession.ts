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
import { convertMermaidToExcalidraw, DEFAULT_MERMAID_CONFIG } from '../utils/mermaidConverter'
import type { BoardIdentity, PaneStatus, ServerElement, WebSocketMessage } from '../types'
import { cleanElementForExcalidraw, convertElementsPreservingImageProps } from './elements'
import { baselineFrom, diffAgainstBaseline, fingerprint, isEmpty, type Baseline } from './changes'
import { fetchCurrentBoard, fetchElements, fetchFiles, reportChanges } from './api'

// A human edit should be on the server before they finish saying what they
// did. The report is a delta now, not the scene, so this can be short without
// being expensive.
const REPORT_DEBOUNCE_MS = 400
const REPORT_RETRY_MS = 2000

// Selection is high-frequency and cheap (ids only), so it gets its own, much
// shorter debounce: 150ms coalesces a lasso drag into one POST while still
// feeling immediate to someone talking to an agent about "these boxes".
const SELECTION_DEBOUNCE_MS = 150

export interface CanvasSessionOptions {
  paneId: string
  /**
   * Request/response traffic — image export, viewport control, mermaid — is
   * addressed to "the browser", not to a pane, and must be answered exactly
   * once. The primary pane answers; the rest only render.
   */
  primary: boolean
  onStatus: (status: PaneStatus) => void
}

export interface CanvasSession {
  attachExcalidraw: (api: ExcalidrawImperativeAPI) => void
  connected: boolean
  board: BoardIdentity | null
  handleChange: (appState: { selectedElementIds?: Record<string, boolean>; theme?: string } | null) => void
  markInteracted: () => void
}

export function useCanvasSession({ paneId, primary, onStatus }: CanvasSessionOptions): CanvasSession {
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

  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  // Raised while we are writing the server's own news into the scene, so that
  // updateScene() does not read back as a human edit and bounce straight home.
  const suppressRef = useRef(0)
  const userInteractedRef = useRef(false)
  const lastChangeAtRef = useRef<string | null>(null)

  const selectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const publishedSelectionRef = useRef('')
  const pendingSelectionRef = useRef<string[] | null>(null)

  const statusRef = useRef(onStatus)
  useEffect(() => { statusRef.current = onStatus }, [onStatus])
  const primaryRef = useRef(primary)
  useEffect(() => { primaryRef.current = primary }, [primary])

  const boardRef = useRef<BoardIdentity | null>(null)

  const publishStatus = useCallback((): void => {
    statusRef.current({
      paneId,
      connected: connectedRef.current,
      board: boardRef.current,
      boardKey: boardKeyRef.current,
      elementCount: apiRef.current?.getSceneElements().length ?? 0,
      lastChangeAt: lastChangeAtRef.current
    })
  }, [paneId])

  const setBoardIdentity = useCallback((identity: BoardIdentity | null): void => {
    boardRef.current = identity
    setBoard(identity)
  }, [])

  const noteChange = useCallback((): void => {
    lastChangeAtRef.current = new Date().toISOString()
    publishStatus()
  }, [publishStatus])

  // ─── Writing the server's news into the scene ────────────────

  const settle = useCallback((after: () => void): void => {
    suppressRef.current += 1
    setTimeout(() => {
      suppressRef.current = Math.max(0, suppressRef.current - 1)
      after()
      publishStatus()
    }, 0)
  }, [publishStatus])

  /** Replace the scene outright; the board is now exactly what the server said. */
  const applyServerScene = useCallback((elements: Partial<ExcalidrawElement>[]): void => {
    const api = apiRef.current
    if (!api) return
    settle(() => {
      baselineRef.current = baselineFrom(api.getSceneElements() as unknown as Record<string, any>[])
    })
    api.updateScene({ elements: elements as any, captureUpdate: CaptureUpdateAction.NEVER })
  }, [settle])

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

    settle(() => {
      const scene = new Map(
        (api.getSceneElements() as unknown as Record<string, any>[]).map((el) => [el.id as string, el])
      )
      for (const id of touched) {
        const element = scene.get(id)
        if (element) baselineRef.current.set(id, fingerprint(element))
        else baselineRef.current.delete(id)
      }
    })
    api.updateScene({
      elements: convertElementsPreservingImageProps(merged) as any,
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [settle])

  const removeElements = useCallback((ids: string[]): void => {
    const api = apiRef.current
    if (!api || ids.length === 0) return
    const gone = new Set(ids)
    settle(() => { ids.forEach((id) => baselineRef.current.delete(id)) })
    api.updateScene({
      elements: api.getSceneElements().filter((el) => !gone.has(el.id)),
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [settle])

  // ─── Reporting what the human did ────────────────────────────

  const sendReport = useCallback(async (): Promise<void> => {
    const api = apiRef.current
    if (!api) return
    if (inFlightRef.current) return
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    const report = diffAgainstBaseline(
      api.getSceneElements() as unknown as Record<string, any>[],
      baselineRef.current
    )
    if (isEmpty(report)) {
      baselineRef.current = report.nextBaseline
      return
    }

    // The board rides with the delta: if a switch lands while this is in
    // flight the server still files it under the board it came from.
    const target = boardKeyRef.current
    inFlightRef.current = true
    try {
      await reportChanges(target, report, clientId)
      // Only now is this what the server holds.
      baselineRef.current = report.nextBaseline
      noteChange()
    } catch (error) {
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
  }, [clientId, noteChange])

  /** Does this pane hold edits the server has not accepted? */
  const hasPendingChanges = useCallback((): boolean => {
    const api = apiRef.current
    if (!api || !userInteractedRef.current) return false
    return !isEmpty(diffAgainstBaseline(
      api.getSceneElements() as unknown as Record<string, any>[],
      baselineRef.current
    ))
  }, [])

  const scheduleReport = useCallback((): void => {
    // Deliberately not gated on the socket: reporting is an HTTP call, so a
    // dropped socket must not also stop a human's edits reaching the server.
    if (!apiRef.current) return
    // Nothing a human has not touched gets reported. A pane that is only
    // watching never writes, which is what makes a second pane safe.
    if (!userInteractedRef.current) return
    if (suppressRef.current > 0) return
    if (reportTimerRef.current) clearTimeout(reportTimerRef.current)
    reportTimerRef.current = setTimeout(() => {
      reportTimerRef.current = null
      if (suppressRef.current > 0) return
      void sendReport()
    }, REPORT_DEBOUNCE_MS)
  }, [sendReport])

  // A tab being closed or hidden still owes the server its last few hundred
  // milliseconds of edits. sendBeacon survives the unload; fetch does not.
  const flushWithBeacon = useCallback((): void => {
    const api = apiRef.current
    if (!api || !userInteractedRef.current || typeof navigator.sendBeacon !== 'function') return
    const report = diffAgainstBaseline(
      api.getSceneElements() as unknown as Record<string, any>[],
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
      userInteractedRef.current = false
      publishedSelectionRef.current = ''
      baselineRef.current = new Map()
    }
    boardKeyRef.current = key
    setBoardIdentity(identity ?? { board: key, variant: 'current' })
    publishStatus()
  }, [publishStatus, setBoardIdentity])

  const loadBoard = useCallback(async (): Promise<void> => {
    if (!apiRef.current) return
    try {
      const current = await fetchCurrentBoard()
      adoptBoard(current.board, current.identity)
    } catch (error) {
      console.warn('Could not read the current board:', error)
    }
    try {
      const { elements } = await fetchElements(boardKeyRef.current)
      applyServerScene(convertElementsPreservingImageProps(elements.map(cleanElementForExcalidraw)))
      const { files } = await fetchFiles()
      if (files && Object.keys(files).length > 0) apiRef.current?.addFiles(Object.values(files) as any)
    } catch (error) {
      console.error('Could not load the board:', error)
    }
  }, [adoptBoard, applyServerScene])

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
        applyServerScene(elements.length > 0 ? convertElementsPreservingImageProps(elements) : [])
        if (data.files) api.addFiles(Object.values(data.files))
        break
      }

      // A different board is on the canvas now. Replace rather than merge —
      // folding board A's elements into board B is exactly what this message
      // exists to prevent — and take an empty board as genuinely empty.
      case 'board_switched': {
        const elements = (data.elements ?? []).map(cleanElementForExcalidraw)
        applyServerScene(elements.length > 0 ? convertElementsPreservingImageProps(elements) : [])
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

      case 'canvas_cleared':
        applyServerScene([])
        noteChange()
        break

      case 'selection_changed':
        break

      case 'export_image_request':
        if (primaryRef.current) await answerExport(data)
        break

      case 'set_viewport':
        if (primaryRef.current) await answerViewport(data)
        break

      case 'mermaid_convert':
        if (primaryRef.current) await answerMermaid(data)
        break

      default:
        console.debug('Unhandled server message:', data.type)
    }
  }, [
    adoptBoard, answerExport, answerMermaid, answerViewport, applyServerElements,
    applyServerScene, clientId, hasPendingChanges, loadBoard, noteChange, removeElements, sendReport
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
      if (event.code !== 1000 && !closedRef.current) setTimeout(connect, 3000)
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
      socketRef.current?.close(1000)
    }
  }, [flushWithBeacon])

  const handleChange = useCallback((appState: any): void => {
    handleSelectionChange(appState)
    scheduleReport()
  }, [handleSelectionChange, scheduleReport])

  const markInteracted = useCallback((): void => {
    userInteractedRef.current = true
  }, [])

  return { attachExcalidraw, connected, board, handleChange, markInteracted }
}
