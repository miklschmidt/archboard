// The archboard shell.
//
// Excalidraw used to be the application; this inverts that. The shell owns the
// chrome, the board identity, the destructive actions and the pane layout, and
// *hosts* canvases. A canvas is a component with a hook, so the number of them
// on screen is a piece of shell state (`panes`) rather than an architectural
// question — which is the seam TASK-006 (panes reporting what the human is
// looking at) lands on.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CanvasPane } from '../canvas/CanvasPane'
import { BoardBar } from './BoardBar'
import { BoardDialog, type BoardDialogMode } from './BoardDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { ConflictDialog } from './ConflictDialog'
import { BoardConflictError, clearBoard, fetchCurrentBoard, newBoard, openBoard, saveBoard } from '../canvas/api'
import type { SaveRequest } from '../canvas/api'
import type { BoardInfo, BoardWriteConflict, PaneStatus } from '../types'
import './shell.css'

const THEME_KEY = 'archboard-theme'

function initialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = window.localStorage?.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* private mode */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface Notice { kind: 'info' | 'error'; text: string }

export function Shell(): JSX.Element {
  // A pane is a slot holding its own canvas. One is the normal case; the list
  // is what makes a second one a mount rather than a rewrite.
  const [panes, setPanes] = useState<string[]>(['pane-1'])
  const [focused, setFocused] = useState('pane-1')
  const [statuses, setStatuses] = useState<Record<string, PaneStatus>>({})

  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null)
  const [dialog, setDialog] = useState<BoardDialogMode | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  // A refused save, plus the request that was refused — so "overwrite" repeats
  // exactly the save the human already asked for, rather than a rebuilt guess.
  const [conflict, setConflict] = useState<{ conflict: BoardWriteConflict; request: SaveRequest } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const onStatus = useCallback((status: PaneStatus) => {
    setStatuses((previous) => {
      const existing = previous[status.paneId]
      if (
        existing &&
        existing.connected === status.connected &&
        existing.boardKey === status.boardKey &&
        existing.elementCount === status.elementCount &&
        existing.lastChangeAt === status.lastChangeAt &&
        existing.board?.variant === status.board?.variant &&
        existing.board?.level === status.board?.level
      ) {
        return previous
      }
      return { ...previous, [status.paneId]: status }
    })
  }, [])

  const status = statuses[focused] ?? statuses[panes[0] ?? ''] ?? null
  const boardKey = status?.boardKey ?? null
  const identity = status?.board ?? boardInfo?.identity ?? null

  useEffect(() => {
    try { window.localStorage?.setItem(THEME_KEY, theme) } catch { /* private mode */ }
  }, [theme])

  // The page title is the board, because a tab in a taskbar is one of the
  // places somebody looks to answer "which board am I on".
  useEffect(() => {
    const name = identity
      ? identity.board + (identity.variant === 'current' ? '' : `@${identity.variant}`)
      : 'no board'
    const level = identity?.level ? ` · ${identity.level}` : ''
    document.title = `${name}${level} · archboard`
  }, [identity])

  const refreshBoardInfo = useCallback(async () => {
    try {
      setBoardInfo(await fetchCurrentBoard())
    } catch (error) {
      console.warn('Could not read the current board:', error)
    }
  }, [])

  useEffect(() => { void refreshBoardInfo() }, [refreshBoardInfo, boardKey])

  // "Written down" is a comparison, not a flag: the board is dirty when it has
  // changed since the last time it was written to the vault.
  const dirty = useMemo(() => {
    const changed = status?.lastChangeAt
    if (!changed) return false
    if (!boardInfo?.savedAt) return (status?.elementCount ?? 0) > 0
    return new Date(changed).getTime() > new Date(boardInfo.savedAt).getTime()
  }, [status?.lastChangeAt, status?.elementCount, boardInfo?.savedAt])

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true)
    setDialogError(null)
    try {
      await work()
    } catch (error) {
      const text = (error as Error).message
      if (dialog) setDialogError(text)
      else setNotice({ kind: 'error', text })
    } finally {
      setBusy(false)
    }
  }, [dialog])

  // Every path that writes the vault goes through here, so there is exactly one
  // place that knows a save can come back refused.
  const attemptSave = useCallback((request: SaveRequest) =>
    run(async () => {
      try {
        const saved = await saveBoard(request)
        setBoardInfo(saved)
        setDialog(null)
        setConflict(null)
        setNotice({
          kind: 'info',
          text: saved.forced
            ? `Overwrote ${saved.file}. Whatever that note held is gone.`
            : `Saved ${saved.board} to ${saved.file}.`
        })
      } catch (error) {
        if (!(error instanceof BoardConflictError)) throw error
        setDialog(null)
        setDialogError(null)
        setConflict({ conflict: error.conflict, request })
      }
    }), [run])

  const handleOpen = (address: { board: string; variant?: string; level?: string }) =>
    run(async () => {
      const opened = await openBoard(address)
      setBoardInfo(opened)
      setDialog(null)
      setNotice({ kind: 'info', text: `Opened ${opened.board}.` })
    })

  const handleNew = (address: { board: string; variant?: string; level?: string }) =>
    run(async () => {
      const created = await newBoard(address)
      setBoardInfo(created)
      setDialog(null)
      setNotice({ kind: 'info', text: `${created.board} started. It is not in the vault until you save it.` })
    })

  const handleSaveAs = (address: { board: string; variant?: string; level?: string }) =>
    attemptSave({ name: address.board, variant: address.variant, level: address.level })

  const handleSave = () => {
    // The scratch board has no home in the vault, so saving it is a naming
    // question rather than a write.
    if (boardInfo && !boardInfo.vaultBacked) {
      setDialog('save-as')
      return
    }
    void attemptSave({})
  }

  // The three ways out of a conflict. Each is the human picking which copy
  // survives; the shell never picks one on its own.
  const handleReload = () => {
    const key = conflict?.conflict.board
    if (!key) return
    void run(async () => {
      const opened = await openBoard({ board: key, reload: true })
      setBoardInfo(opened)
      setConflict(null)
      setNotice({ kind: 'info', text: `Reloaded ${opened.board} from the vault.` })
    })
  }

  const handleOverwrite = () => {
    if (!conflict) return
    void attemptSave({ ...conflict.request, force: true })
  }

  const handleClear = () =>
    run(async () => {
      // One call, not one DELETE per element: the server empties the board and
      // tells every pane, so nothing depends on this tab finishing the job.
      const result = await clearBoard(boardKey)
      setConfirmingClear(false)
      setNotice({ kind: 'info', text: `Cleared ${result.count} element${result.count === 1 ? '' : 's'}.` })
    })

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <div className="shell" data-theme={theme}>
      <BoardBar
        identity={identity}
        boardKey={boardKey}
        elementCount={status?.elementCount ?? 0}
        connected={status?.connected ?? false}
        vaultBacked={boardInfo?.vaultBacked ?? false}
        savedAt={boardInfo?.savedAt ?? null}
        dirty={dirty}
        paneCount={panes.length}
        busy={busy}
        onOpen={() => { setDialogError(null); setDialog('open') }}
        onNew={() => { setDialogError(null); setDialog('new') }}
        onSave={handleSave}
        onClear={() => setConfirmingClear(true)}
        onAddPane={() => setPanes((previous) => [...previous, `pane-${previous.length + 1}`])}
        onClosePane={() => setPanes((previous) => {
          const kept = previous.slice(0, 1)
          setFocused(kept[0] ?? 'pane-1')
          return kept
        })}
      />

      {notice && (
        <div className={`notice notice-${notice.kind}`} onClick={() => setNotice(null)}>
          {notice.text}
        </div>
      )}

      <main className={`panes panes-${panes.length}`}>
        {panes.map((paneId, index) => (
          <CanvasPane
            key={paneId}
            paneId={paneId}
            primary={index === 0}
            focused={paneId === focused}
            theme={theme}
            onStatus={onStatus}
            onThemeChange={setTheme}
            onFocus={setFocused}
            label={panes.length > 1 ? `pane ${index + 1}` : undefined}
          />
        ))}
      </main>

      {dialog && (
        <BoardDialog
          mode={dialog}
          current={identity}
          busy={busy}
          error={dialogError}
          onSubmit={dialog === 'open' ? handleOpen : dialog === 'new' ? handleNew : handleSaveAs}
          onCancel={() => { setDialog(null); setDialogError(null) }}
        />
      )}

      {conflict && (
        <ConflictDialog
          conflict={conflict.conflict}
          busy={busy}
          onReload={handleReload}
          onOverwrite={handleOverwrite}
          onSaveAs={() => { setConflict(null); setDialogError(null); setDialog('save-as') }}
          onCancel={() => setConflict(null)}
        />
      )}

      {confirmingClear && (
        <ConfirmDialog
          title="Clear this board?"
          confirmLabel="Clear the board"
          busy={busy}
          onCancel={() => setConfirmingClear(false)}
          onConfirm={handleClear}
          detail={
            <>
              <p>
                Every one of the <strong>{status?.elementCount ?? 0}</strong> element
                {(status?.elementCount ?? 0) === 1 ? '' : 's'} on{' '}
                <strong>{identity?.board ?? boardKey ?? 'this board'}</strong>
                {identity && identity.variant !== 'current' ? <> <strong>@{identity.variant}</strong></> : null}
                {' '}will be removed from the canvas.
              </p>
              <p className="hint">
                {boardInfo?.vaultBacked
                  ? 'The note in the vault keeps whatever was last saved to it, until you save the empty board over it.'
                  : 'This board has never been written to the vault, so there is nothing to recover it from.'}
              </p>
            </>
          }
        />
      )}
    </div>
  )
}
