// The archboard shell.
//
// Excalidraw used to be the application; this inverts that. The shell owns the
// chrome, the board identity, the destructive actions and the pane layout, and
// *hosts* canvases. A canvas is a component with a hook, so the number of them
// on screen is a piece of shell state (`panes`) rather than an architectural
// question — which is the seam TASK-006 (panes reporting what the human is
// looking at) lands on.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CanvasPane } from '../canvas/CanvasPane'
import { BoardBar } from './BoardBar'
import { BoardNavigator } from './BoardNavigator'
import { AgentRail } from './AgentRail'
import { BoardDialog, type BoardDialogMode } from './BoardDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { ConflictDialog } from './ConflictDialog'
import { InstallLibraryDialog } from './InstallLibraryDialog'
import { Icon } from './Icons'
import { useLibrary } from './useLibrary'
import { BoardConflictError, clearBoard, fetchBoardInfo, fetchBoards, newBoard, openBoard, saveBoard } from '../canvas/api'
import type { SaveRequest } from '../canvas/api'
import type { BoardHold, BoardInfo, BoardListing, BoardSaveResult, BoardWriteConflict, LockHolder, PaneRef, PaneStatus } from '../types'
import './shell.css'

const THEME_KEY = 'archboard-theme'

// How many panes the shell lays out. The grid has a column rule for two
// (shell.css) and the canvas server refuses to ask for a third, so this is the
// same number said in the one place that renders it. It mirrors MAX_PANES in
// src/core/panes.ts, which is where the server's copy lives.
const MAX_PANES = 2

function initialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  try {
    const saved = window.localStorage?.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* private mode */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// `hold` keeps a notice up until it is clicked away. A message that tells you
// what to type is no use if it leaves before you have typed it.
interface Notice { kind: 'info' | 'error'; text: string; hold?: boolean }
interface AgentState { heldBy: LockHolder | null; takeBack: () => void }

/** "the only pane", "the left pane", "the left and right panes". */
function listPanes(refs: PaneRef[]): string {
  const places = refs.map((ref) => (ref.place === 'the only pane' ? 'only' : ref.place))
  if (places.length === 1) return `the ${places[0]} pane`
  return `the ${places.slice(0, -1).join(', ')} and ${places[places.length - 1]} panes`
}

/**
 * What to say about a save. Three acts wear one button (ADR 0012), and the one
 * that needs saying out loud is the branch: it writes a second board and puts
 * it nowhere, so the message names the panes still holding the source and the
 * command that puts the branch on screen.
 */
function saveNotice(saved: BoardSaveResult, paneCount: number): Notice {
  const wrote = saved.forced
    ? `Overwrote ${saved.file}. Whatever that note held is gone.`
    : `Saved "${saved.board}" to ${saved.file}.`
  const moved = saved.panes?.moved ?? []
  const kept = saved.panes?.kept ?? []

  // The board had stopped saving and this is one of the two outcomes that end
  // that, so the news is not the file it wrote but that the drawing is written
  // down again — and, for a save elsewhere, which board is now which.
  const ended = saved.resolvedHold
  if (ended) {
    const held = `${ended.writes} change${ended.writes === 1 ? '' : 's'}`
    return {
      kind: 'info',
      hold: true,
      text: ended.outcome === 'overwrite'
        ? `${wrote} "${ended.board}" is saving again, with the ${held} that were held on the canvas.`
        : `${wrote} The ${held} that were held are in it, and the panes are showing it. ` +
          `"${ended.board}" is saving again and holds the version the other editor wrote.`
    }
  }

  if (saved.saveKind === 'branch') {
    const source = `"${saved.savedFrom}"`
    const stayed = kept.length
      ? `${listPanes(kept)} still ${kept.length > 1 ? 'hold' : 'holds'} ${source}`
      : `no pane was holding ${source}`
    // `pane open` makes a pane rather than taking one, so it is the move that
    // cannot overwrite the board being read. It has nowhere to go once the
    // shell is full, and then the only way up is over a board on screen.
    const show = paneCount < MAX_PANES
      ? `Put it up beside this one with \`pane open --board ${saved.board}\`.`
      : `Both panes are full, so put it up with \`board open ${saved.board} --pane left\`` +
        ' or `--pane right`, which replaces the board in that pane.'
    return {
      kind: 'info',
      hold: true,
      text: `${wrote} That branches ${source}, and a branch moves nothing: ` +
        `${stayed}, and the branch is not on screen anywhere. ${show}`
    }
  }

  if (moved.length) {
    return {
      kind: 'info',
      text: `${wrote} It is showing in ${listPanes(moved)}, which held "${saved.savedFrom}".`
    }
  }

  return { kind: 'info', text: wrote }
}

export function Shell(): JSX.Element {
  // A pane is a slot holding its own canvas. One is the normal case; the list
  // is what makes a second one a mount rather than a rewrite.
  const [panes, setPanes] = useState<string[]>(['pane-1'])
  const [focused, setFocused] = useState('pane-1')
  const [statuses, setStatuses] = useState<Record<string, PaneStatus>>({})
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({})
  // Pane ids are never reused. Numbering by list length would assign a reopened
  // pane the id of the one just closed, and the server keys a pane's selection
  // and its board by that id.
  const nextPaneNumber = useRef(2)

  // Layout can now be changed from outside the browser (`archboard pane open`),
  // so these are the shell's two moves, reachable from the buttons and from a
  // request arriving on a pane's socket.
  const addPane = useCallback(() => {
    setPanes((previous) => (
      previous.length >= MAX_PANES ? previous : [...previous, `pane-${nextPaneNumber.current++}`]
    ))
  }, [])

  const closePane = useCallback((paneId: string) => {
    // Never the last one: an empty shell shows nothing and offers no way back.
    setPanes((previous) => (
      previous.length < 2 ? previous : previous.filter((id) => id !== paneId)
    ))
  }, [])

  // The canvas server owns the layout request; the shell owns the layout. A
  // pane hands one up when the request arrives on its socket.
  const handleLayoutRequest = useCallback((paneId: string, request: 'open' | 'close') => {
    if (request === 'open') addPane()
    else closePane(paneId)
  }, [addPane, closePane])

  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme)
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null)
  const [dialog, setDialog] = useState<BoardDialogMode | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  // The human has clicked the mark saying somebody else wrote this board's note
  // (TASK-062). Not the mark going up: that is a state of the board and it puts
  // nothing in front of anybody.
  const [askingAboutNote, setAskingAboutNote] = useState(false)
  // A refused save, plus the request that was refused — so "overwrite" repeats
  // exactly the save the human already asked for, rather than a rebuilt guess —
  // plus the hold, when this board has stopped saving altogether. The hold is
  // what turns the dialog from a report of one refused save into a choice about
  // a board, and it is set both when the human clicks the mark in the bar and
  // when a save runs into the same wall.
  const [conflict, setConflict] = useState<
    { conflict: BoardWriteConflict; request: SaveRequest; hold?: BoardHold | null } | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  // One palette behind however many panes are on screen, held on the server so
  // that a second tab, a second machine and the agent all see the same one.
  const library = useLibrary()
  const [boardListing, setBoardListing] = useState<BoardListing | null>(null)
  const [boardListingError, setBoardListingError] = useState<string | null>(null)

  const refreshBoardListing = useCallback(async () => {
    try {
      setBoardListing(await fetchBoards())
      setBoardListingError(null)
    } catch (error) {
      setBoardListingError((error as Error).message)
    }
  }, [])

  const onStatus = useCallback((status: PaneStatus) => {
    setStatuses((previous) => {
      const existing = previous[status.paneId]
      if (
        existing &&
        existing.connected === status.connected &&
        existing.clientId === status.clientId &&
        existing.boardKey === status.boardKey &&
        existing.elementCount === status.elementCount &&
        existing.lastChangeAt === status.lastChangeAt &&
        // The hold by value, because it is a different object every time and
        // because the mark in the bar counts what is held. Left out of this
        // comparison, a board that started saving again kept its mark up: the
        // release changes nothing else about the pane, so the whole status
        // update was discarded as identical.
        existing.hold?.since === status.hold?.since &&
        existing.hold?.writes === status.hold?.writes &&
        // And the same for a note somebody else wrote, for the same reason: it
        // is the only thing that changed about the pane, so leaving it out of
        // this comparison throws the whole update away and the mark never
        // appears (TASK-062). This comparison is the thing that has now eaten
        // two marks; anything new in the bar belongs in it.
        existing.writtenElsewhere?.writtenAt === status.writtenElsewhere?.writtenAt &&
        existing.writtenElsewhere?.reason === status.writtenElsewhere?.reason &&
        // The mark now says which side is ahead, so the version is part of what
        // it shows and part of what makes an update worth applying (TASK-091).
        existing.writtenElsewhere?.version === status.writtenElsewhere?.version &&
        // And the third thing this has eaten, exactly as advertised: an agent
        // saying what it is doing changes nothing else about the pane, so
        // without this the bar keeps showing the line before last (TASK-095).
        // The newest line is enough, because the list only ever grows at that
        // end and the bar shows that one.
        existing.doing.at(-1)?.at === status.doing.at(-1)?.at &&
        existing.doing.length === status.doing.length &&
        existing.board?.variant === status.board?.variant &&
        existing.board?.level === status.board?.level
      ) {
        return previous
      }
      return { ...previous, [status.paneId]: status }
    })
  }, [])

  const onAgentState = useCallback((paneId: string, heldBy: LockHolder | null, takeBack: () => void) => {
    setAgentStates((previous) => {
      const existing = previous[paneId]
      if (existing?.heldBy === heldBy && existing.takeBack === takeBack) return previous
      return { ...previous, [paneId]: { heldBy, takeBack } }
    })
  }, [])

  const status = statuses[focused] ?? statuses[panes[0] ?? ''] ?? null
  const agentState = agentStates[focused] ?? agentStates[panes[0] ?? ''] ?? null
  const boardKey = status?.boardKey ?? null
  const identity = status?.board ?? boardInfo?.identity ?? null
  // Whether the board in front of the human is being written down. It comes
  // from the pane rather than being asked for, because the pane is what finds
  // out — the write it made was the one that was refused (TASK-079).
  const hold = status?.hold ?? null
  // Whether the note behind that board is still the one this pane came from.
  // From the pane for the same reason, and it says a different thing: a hold is
  // a write that was refused, this is a write that has not happened yet
  // (TASK-062).
  const writtenElsewhere = status?.writtenElsewhere ?? null
  const onScreenKeys = panes.map((paneId) => statuses[paneId]?.boardKey ?? '').join('|')

  useEffect(() => { void refreshBoardListing() }, [refreshBoardListing, onScreenKeys])

  useEffect(() => {
    try { window.localStorage?.setItem(THEME_KEY, theme) } catch { /* private mode */ }
  }, [theme])

  // Whoever closed a pane — the button, or a command from outside the browser
  // — the focus has to land somewhere that still exists.
  useEffect(() => {
    if (!panes.includes(focused)) setFocused(panes[0] ?? 'pane-1')
  }, [panes, focused])

  // The page title is the board, because a tab in a taskbar is one of the
  // places somebody looks to answer "which board am I on".
  useEffect(() => {
    const name = identity
      ? identity.board + (identity.variant === 'current' ? '' : `@${identity.variant}`)
      : 'no board'
    const level = identity?.level ? ` · ${identity.level}` : ''
    document.title = `${name}${level} · archboard`
  }, [identity])

  // About the board in the pane being worked in, named explicitly. The server
  // has no "current board" to ask for, and asking for one would be asking it
  // to guess which of two panes the chrome is describing (ADR 0009).
  const refreshBoardInfo = useCallback(async (key: string | null) => {
    if (!key) { setBoardInfo(null); return }
    try {
      setBoardInfo(await fetchBoardInfo(key))
    } catch (error) {
      console.warn('Could not read the board:', error)
    }
  }, [])

  useEffect(() => { void refreshBoardInfo(boardKey) }, [refreshBoardInfo, boardKey])

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
        // The pane rides along, in the one place every save goes through: it
        // is what tells the server a person pressed this rather than an agent
        // that has not said what it is doing (TASK-095).
        const saved = await saveBoard({ clientId: status?.clientId, ...request })
        // Whether this pane is now holding what was written is the server's
        // answer to give, not the shell's to assume. A save used to move the
        // panes on the board it wrote, so adopting the answer was always
        // right; a branch writes a second board and moves nothing (ADR 0012),
        // and adopting it there dates this pane's board by another board's
        // save. `boardInfo` is what the chrome says this pane is showing, so
        // that is the chrome describing a board nobody is looking at.
        const kind = saved.saveKind ?? 'same-board'
        const holdingIt = kind === 'branch'
          ? false
          : kind === 'named'
            ? (saved.panes?.moved ?? []).some((pane) => pane.clientId === status?.clientId)
            : saved.board === boardKey
        if (holdingIt) setBoardInfo(saved)
        else void refreshBoardInfo(boardKey)
        setDialog(null)
        setConflict(null)
        setNotice(saveNotice(saved, panes.length))
        void refreshBoardListing()
      } catch (error) {
        if (!(error instanceof BoardConflictError)) throw error
        setDialog(null)
        setDialogError(null)
        setConflict({ conflict: error.conflict, request, hold: error.held ?? hold })
      }
    }), [run, boardKey, status?.clientId, refreshBoardInfo, refreshBoardListing, panes.length, hold])

  // A board is opened INTO a pane. Always name the focused pane when the shell
  // knows it: another browser tab may have registered a pane even when this
  // particular shell is not split, and the server must never guess between
  // them. An explicit picker choice still wins.
  const paneTarget = (address: { pane?: string }): { pane?: string } =>
    address.pane ? { pane: address.pane } : (status ? { pane: status.clientId } : {})

  const handleOpen = (address: { board: string; variant?: string; level?: string; pane?: string }) =>
    run(async () => {
      const opened = await openBoard({ ...address, ...paneTarget(address) })
      setBoardInfo(opened)
      setDialog(null)
      setNotice({ kind: 'info', text: `Opened ${opened.board}.` })
      void refreshBoardListing()
    })

  const handleNew = (address: { board: string; variant?: string; level?: string; pane?: string }) =>
    run(async () => {
      const created = await newBoard({ ...address, ...paneTarget(address) })
      setBoardInfo(created)
      setDialog(null)
      setNotice({ kind: 'info', text: `${created.board} started. It is not in the vault until you save it.` })
      void refreshBoardListing()
    })

  const handleNavigate = (key: string): void => {
    const showing = panes.find((paneId) => statuses[paneId]?.boardKey === key)
    if (showing) {
      setFocused(showing)
      return
    }
    void handleOpen({ board: key })
  }

  const handleSaveAs = (address: { board: string; variant?: string; level?: string }) => {
    if (!boardKey) return
    void attemptSave({ board: boardKey, name: address.board, variant: address.variant, level: address.level })
  }

  // Every gesture on a named board is already written through to its note.
  // Scratch is the one exception that needs an explicit action: not to save
  // the drawing, but to give it a durable address in the vault.
  const handleNameBoard = () => {
    if (!boardKey || !boardInfo?.placeholder) return
    setDialog('save-as')
  }

  // The three ways out of a conflict. Each is the human picking which copy
  // survives; the shell never picks one on its own.
  const handleReload = () => {
    const key = conflict?.conflict.board
    if (!key) return
    // What it cost, said afterwards as well as before. This is the one outcome
    // that ends work rather than writing it somewhere, so the notice holds
    // until it is clicked away.
    const discarded = conflict?.hold?.writes ?? 0
    void run(async () => {
      const opened = await openBoard({
        board: key,
        reload: true,
        ...(panes.length > 1 && status ? { pane: status.clientId } : {})
      })
      setBoardInfo(opened)
      setConflict(null)
      setNotice(discarded > 0
        ? {
          kind: 'info',
          hold: true,
          text: `Reloaded ${opened.board} from the vault. It is saving again, and the ` +
            `${discarded} change${discarded === 1 ? '' : 's'} held on the canvas ${discarded === 1 ? 'is' : 'are'} gone.`
        }
        : { kind: 'info', text: `Reloaded ${opened.board} from the vault.` })
    })
  }

  // Asked for from the mark, before anything has been refused. One of ADR
  // 0006's three and not all three: nothing is held, so there is no held copy
  // to overwrite the note with and none to save elsewhere. Carrying on drawing
  // is the other answer and it is the Cancel.
  const handleTakeTheNote = () => {
    const key = writtenElsewhere?.board ?? boardKey
    if (!key) return
    void run(async () => {
      const opened = await openBoard({
        board: key,
        reload: true,
        ...(panes.length > 1 && status ? { pane: status.clientId } : {})
      })
      setBoardInfo(opened)
      setAskingAboutNote(false)
      setNotice({
        kind: 'info',
        hold: true,
        text: `${opened.board} is now the note in the vault. What was on this canvas is gone.`
      })
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
      const result = await clearBoard(boardKey, status?.clientId ?? '')
      setConfirmingClear(false)
      setNotice({ kind: 'info', text: `Cleared ${result.count} element${result.count === 1 ? '' : 's'}.` })
    })

  useEffect(() => {
    if (!notice || notice.hold) return
    const timer = setTimeout(() => setNotice(null), 9000)
    return () => clearTimeout(timer)
  }, [notice])

  // A refused or failed library install says so in the same place everything
  // else does. It is taken off the library rather than left there, so the
  // notice bar stays the one thing that shows a message.
  useEffect(() => {
    if (!library.error) return
    setNotice({ kind: 'error', text: library.error })
    library.dismissError()
  }, [library.error, library.dismissError])

  return (
    <div className="shell" data-theme={theme}>
      <BoardBar
        identity={identity}
        boardKey={boardKey}
        vault={boardListing?.vault ?? null}
        elementCount={status?.elementCount ?? 0}
        connected={status?.connected ?? false}
        hold={hold}
        // The one thing that opens the conflict dialog while somebody is
        // drawing: them asking for it (TASK-079).
        onHoldClick={() => {
          if (!hold) return
          setDialogError(null)
          setConflict({ conflict: hold.conflict, request: { board: hold.board }, hold })
        }}
        writtenElsewhere={writtenElsewhere}
        // The mark is a button and the button is not the action. Taking the
        // note replaces this canvas with theirs, and nothing has been refused
        // yet, so this pane's scene is the only copy left of the board archboard
        // last wrote. One stray touch on a 75-inch panel must not be what ends
        // it.
        onNoteClick={() => setAskingAboutNote(true)}
        paneCount={panes.length}
        theme={theme}
        onThemeChange={setTheme}
        busy={busy}
        onOpen={() => { setDialogError(null); setDialog('open') }}
        onNew={() => { setDialogError(null); setDialog('new') }}
        onClear={() => setConfirmingClear(true)}
        onAddPane={addPane}
        // The button names no pane, so it drops the last one and keeps the
        // one the human started in. `pane close <spec>` is how a caller says
        // which half goes.
        onClosePane={() => closePane(panes[panes.length - 1] ?? '')}
      />

      <div className="workspace">
        <BoardNavigator
          listing={boardListing}
          error={boardListingError}
          currentKey={boardKey}
          busy={busy}
          onSelect={handleNavigate}
          onRefresh={() => { void refreshBoardListing() }}
          onNew={() => { setDialogError(null); setDialog('new') }}
          needsName={boardInfo?.placeholder ?? false}
          onName={handleNameBoard}
        />

        <main className="canvas-zone">
          <div className="pane-bar">
            <div className="pane-tabs">
              {panes.map((paneId, index) => {
                const paneStatus = statuses[paneId]
                const paneIdentity = paneStatus?.board
                const paneTitle = paneIdentity
                  ? `${paneIdentity.board}${paneIdentity.variant === 'current' ? '' : ` / ${paneIdentity.variant}`}`
                  : '…'
                return (
                  <button
                    type="button"
                    key={paneId}
                    className={`pane-tab${paneId === focused ? ' focused' : ''}`}
                    onClick={() => setFocused(paneId)}
                  >
                    <span className="focus-dot" />
                    <span>Pane {String.fromCharCode(65 + index)} · {paneTitle}</span>
                  </button>
                )
              })}
            </div>
            <span className="pane-tip">Select a variant to replace the focused pane</span>
          </div>

          <div className={`panes panes-${panes.length}`}>
            {panes.map((paneId, index) => (
              <CanvasPane
                key={paneId}
                paneId={paneId}
                primary={index === 0}
                focused={paneId === focused}
                theme={theme}
                onStatus={onStatus}
                onAgentState={onAgentState}
                onThemeChange={setTheme}
                onFocus={setFocused}
                label={`Pane ${String.fromCharCode(65 + index)}`}
                libraryItems={library.items}
                onLibraryChange={library.reportFromPane}
                onLibraryChangedElsewhere={library.applyFromServer}
                onLayoutRequest={handleLayoutRequest}
              />
            ))}
          </div>

          {notice && (
            <div
              className={`notice notice-shell notice-${notice.kind}${notice.hold ? ' notice-hold' : ''}`}
              role={notice.kind === 'error' ? 'alert' : 'status'}
            >
              <span className="notice-icon"><Icon name={notice.kind === 'error' ? 'close' : 'check'} size={16} /></span>
              <span className="notice-text">{notice.text}</span>
              <button className="notice-dismiss" type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
                <Icon name="close" size={17} />
              </button>
            </div>
          )}
        </main>

        <AgentRail
          connected={status?.connected ?? false}
          heldBy={agentState?.heldBy ?? null}
          doing={status?.doing ?? []}
          takeBack={agentState?.takeBack}
        />
      </div>

      <footer className="statusbar">
        <div className="status-cluster">
          <span className={`status-item ${status?.connected ? 'status-good' : 'status-bad'}`}><span className="live-dot" />{status?.connected ? 'Connected' : 'Offline'}</span>
          <span className="status-item"><Icon name="check" size={14} />{hold ? 'Changes held' : writtenElsewhere ? 'Note changed' : 'In the vault'}</span>
          <span className="status-item">{status?.elementCount ?? 0} elements</span>
        </div>
        <div className="status-cluster status-muted"><span>{boardKey ?? boardListing?.vault ?? 'Waiting for board'}</span></div>
      </footer>

      {dialog && (
        <BoardDialog
          mode={dialog}
          current={identity}
          panes={panes.map((paneId, index) => ({
            clientId: statuses[paneId]?.clientId ?? paneId,
            label: `pane ${index + 1}`,
            board: statuses[paneId]?.boardKey ?? null
          }))}
          defaultPane={status?.clientId ?? null}
          busy={busy}
          error={dialogError}
          onSubmit={dialog === 'open' ? handleOpen : dialog === 'new' ? handleNew : handleSaveAs}
          onCancel={() => { setDialog(null); setDialogError(null) }}
        />
      )}

      {conflict && (
        <ConflictDialog
          conflict={conflict.conflict}
          hold={conflict.hold ?? null}
          busy={busy}
          onReload={handleReload}
          onOverwrite={handleOverwrite}
          onSaveAs={() => { setConflict(null); setDialogError(null); setDialog('save-as') }}
          onCancel={() => setConflict(null)}
        />
      )}

      {library.pending && (
        <InstallLibraryDialog
          install={library.pending}
          busy={library.busy}
          onConfirm={library.acceptInstall}
          onCancel={library.declineInstall}
        />
      )}

      {/*
        Two choices, because two is all there is before a write has been
        refused. Cancel is the default and the one focus lands on: carrying on
        drawing costs nothing and loses nothing, and the next change is refused
        rather than written over theirs — which is when the three outcomes
        become reachable and the hold offers them.

        It closes itself if the mark comes down while it is up, which is what
        happens when somebody takes the note from a command line instead.
      */}
      {askingAboutNote && writtenElsewhere && (
        <ConfirmDialog
          title="Somebody else wrote this note"
          confirmLabel="Show me the note"
          busy={busy}
          onCancel={() => setAskingAboutNote(false)}
          onConfirm={handleTakeTheNote}
          detail={
            <>
              <p>
                <strong>{writtenElsewhere.file}</strong>{' '}
                {writtenElsewhere.reason === 'changed'
                  ? <>was written at {new Date(writtenElsewhere.writtenAt).toLocaleTimeString()} by
                    something that is not archboard — Obsidian, a sync client, an editor, a{' '}
                    <code>git pull</code>. This pane is showing the board as archboard last wrote it.</>
                  : <>is a note archboard has never read, so it cannot say what this board would
                    replace.</>}
              </p>
              <p>
                Nothing has been lost. Nothing has been written either: the next change to this
                board will be refused rather than saved over theirs, and you will be offered the
                full choice then.
              </p>
              <p className="hint">
                Showing you the note replaces what is on this canvas with what is in the vault.
                Keep a board open in one editor at a time.
              </p>
            </>
          }
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
                {boardInfo?.savedAt || boardInfo?.loadedAt
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
