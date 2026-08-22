// The shell's chrome: what is on the canvas, and what can be done to it.
//
// Everything here is about the *board*, not about drawing — Excalidraw's own
// toolbar is the tool for that and we do not duplicate it. What replaced the
// old header is the difference between a POC's controls (a Sync button, a
// spinner, a last-sync clock) and an architecture surface's: which board, which
// variant, which level, whether it is written down.

import React from 'react'
import type { BoardHold, BoardIdentity, DoingEntry, NoteWrittenElsewhere } from '../types'

interface BoardBarProps {
  identity: BoardIdentity | null
  boardKey: string | null
  elementCount: number
  connected: boolean
  /** Set while this board has stopped saving (ADR 0006, TASK-079). */
  hold: BoardHold | null
  onHoldClick: () => void
  /**
   * Set while somebody outside archboard has written this board's note and this
   * pane is still showing the older one (TASK-062). Shown only when there is no
   * hold: a hold is this, one write later, and says more about it.
   */
  writtenElsewhere: NoteWrittenElsewhere | null
  onNoteClick: () => void
  /**
   * The last few things an agent said it was doing to this board (TASK-095).
   * The bar shows the most recent one — one line is what there is room for, and
   * the pane itself carries the list.
   */
  doing: DoingEntry[]
  paneCount: number
  onOpen: () => void
  onNew: () => void
  onSave: () => void
  onClear: () => void
  onAddPane: () => void
  onClosePane: () => void
  busy: boolean
}

const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * What the mark on a held board says, in the bar, where there is room for one
 * line.
 *
 * It is a button rather than a banner because the three outcomes are behind it,
 * and it never opens itself: the refusal that produced it arrived 400 ms after
 * somebody lifted their finger, and a modal at that moment is the thing
 * TASK-079 exists to stop.
 */
function holdLabel(hold: BoardHold): string {
  if (hold.writes === 0) return 'not saving'
  return `not saving · ${hold.writes} change${hold.writes === 1 ? '' : 's'} held`
}

/**
 * The one line for a board whose note somebody else has written (TASK-062).
 *
 * The slot the "saved 14:32" text used to occupy, and it is not a smaller
 * version of that. Under ADR 0015 every gesture is written to the note, so
 * there is no unsaved board to report and no last-save moment worth printing —
 * the text that stood here said "unsaved changes" for the rest of a session
 * about a board that was fully written down.
 *
 * What is worth an alarm is the reverse, which nothing said at all: the note
 * this pane's board came from is not the note in the vault any more.
 */
function noteLabel(written: NoteWrittenElsewhere): string {
  return written.reason === 'changed'
    ? `note changed on disk · ${clock(written.writtenAt)}`
    : 'a note here archboard has not read'
}

export function BoardBar({
  identity, boardKey, elementCount, connected, hold, onHoldClick,
  writtenElsewhere, onNoteClick, doing,
  paneCount, onOpen, onNew, onSave, onClear, onAddPane, onClosePane, busy
}: BoardBarProps): JSX.Element {
  const latest = doing.length > 0 ? doing[doing.length - 1] : null
  return (
    <header className="bar">
      <div className="bar-identity">
        <span className="wordmark">archboard</span>
        <span className="board-name">{identity?.board ?? boardKey ?? 'no board'}</span>
        {identity && (
          <span className={`chip ${identity.variant === 'current' ? 'chip-current' : 'chip-variant'}`}>
            {identity.variant}
          </span>
        )}
        {identity?.level && <span className="chip chip-quiet">{identity.level}</span>}
        <span className="meta">{elementCount} element{elementCount === 1 ? '' : 's'}</span>
        {/*
          Three states, in the order they happen to a board. A hold outranks a
          note somebody else wrote, because a hold IS that one write later and
          says more about it — the mark would otherwise be two marks about one
          thing. Neither is about a lock: another archboard writer holding the
          board is said on the canvas, by the pane going read-only.
        */}
        {hold
          ? (
            <button
              className="chip chip-held"
              onClick={onHoldClick}
              title={`${hold.message}\n\nClick for the three ways out.`}
            >
              {holdLabel(hold)}
            </button>
          )
          : writtenElsewhere
            ? (
              <button
                className="chip chip-elsewhere"
                onClick={onNoteClick}
                title={`${writtenElsewhere.message}\n\nClick to see what you can do about it.`}
              >
                {noteLabel(writtenElsewhere)}
              </button>
            )
            : <span className="meta">in the vault</span>}
        {/*
          And the last thing an agent said it was doing here (TASK-095). Not one
          of the three marks above: nothing is wrong, nothing is refused, and
          this is not a state the board is in — it is what somebody just did to
          it. One line, because that is what the bar has room for; the pane
          carries the last few.
        */}
        {latest && (
          <span className="doing-now" title={`${latest.doing}\n\n${clock(latest.at)}`}>
            {latest.doing}
          </span>
        )}
      </div>

      <div className="bar-actions">
        <span className="status" title={connected ? 'Live' : 'The canvas server is not answering'}>
          <span className={`dot ${connected ? 'dot-live' : 'dot-dead'}`} />
          {connected ? 'live' : 'offline'}
        </span>
        <button className="btn btn-quiet" onClick={onOpen} disabled={busy}>Open…</button>
        <button className="btn btn-quiet" onClick={onNew} disabled={busy}>New…</button>
        <button className="btn btn-primary" onClick={onSave} disabled={busy}>Save</button>
        {paneCount < 2
          ? <button className="btn btn-quiet" onClick={onAddPane} title="Open a second pane">Split</button>
          : <button className="btn btn-quiet" onClick={onClosePane} title="Back to one pane">Unsplit</button>}
        <button className="btn btn-danger-quiet" onClick={onClear} disabled={busy}>Clear…</button>
      </div>
    </header>
  )
}
