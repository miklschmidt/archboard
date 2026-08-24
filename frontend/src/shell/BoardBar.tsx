// The shell's chrome: what is on the canvas, and what can be done to it.
//
// Everything here is about the *board*, not about drawing — Excalidraw's own
// toolbar is the tool for that and we do not duplicate it. What replaced the
// old header is the difference between a POC's controls (a Sync button, a
// spinner, a last-sync clock) and an architecture surface's: which board, which
// variant, which level, whether it is written down.

import React from 'react'
import type { BoardHold, BoardIdentity, NoteWrittenElsewhere } from '../types'
import { Icon } from './Icons'

interface BoardBarProps {
  identity: BoardIdentity | null
  boardKey: string | null
  vault: string | null
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
  paneCount: number
  onOpen: () => void
  onNew: () => void
  onClear: () => void
  onAddPane: () => void
  onClosePane: () => void
  theme: 'light' | 'dark'
  onThemeChange: (theme: 'light' | 'dark') => void
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
/*
 * And which side is newer, now that a note carries a version (TASK-091). The
 * mark could say only that the note is not this board; "which of the two is
 * ahead" is the question a person actually has, and the answer changes what
 * they would do about it. Another archboard being three writes ahead is a
 * board somebody else is working on; a rollback is somebody's undo arriving
 * from the vault. Only the first two lines below could be said before.
 */
function noteLabel(written: NoteWrittenElsewhere): string {
  if (written.reason !== 'changed') return 'a note here archboard has not read'
  if (written.versionMove === 'ahead') {
    const by = (written.version ?? 0) - (written.ourVersion ?? 0)
    return `note is ${by} write${by === 1 ? '' : 's'} ahead · ${clock(written.writtenAt)}`
  }
  if (written.versionMove === 'behind') return `note was rolled back · ${clock(written.writtenAt)}`
  return `note changed on disk · ${clock(written.writtenAt)}`
}

export function BoardBar({
  identity, boardKey, vault, elementCount, connected, hold, onHoldClick,
  writtenElsewhere, onNoteClick,
  paneCount, onOpen, onNew, onClear, onAddPane, onClosePane,
  theme, onThemeChange, busy
}: BoardBarProps): JSX.Element {
  const boardTitle = identity
    ? `${identity.board}${identity.variant === 'current' ? '' : ` / ${identity.variant}`}`
    : boardKey ?? 'No board'
  return (
    <header className="bar">
      <div className="bar-brand" aria-label="archboard">
        <span className="brand-mark"><Icon name="boards" size={19} /></span>
        <span className="brand-copy">
          <span className="wordmark">Archboard</span>
          <span className="vault-name" title={vault ?? undefined}>{vault ? `${vault} / autowrite` : 'Connecting to vault'}</span>
        </span>
      </div>

      <div className="bar-board bar-identity">
        <div className="bar-board-title">
          <span className="board-name">{boardTitle}</span>
          {identity?.level && <span className="level-tag">{identity.level}</span>}
        </div>
        <div className="bar-board-meta">
          <span className={`status ${connected ? 'status-live' : 'status-offline'}`} title={connected ? 'Canvas server connected' : 'The canvas server is not answering'}>
            <span className={`dot ${connected ? 'dot-live' : 'dot-dead'}`} />
            {connected ? 'Live board' : 'Offline'}
          </span>
          <span className="meta">&bull;</span>
          <span className="meta">{elementCount} element{elementCount === 1 ? '' : 's'}</span>
          {/* A hold outranks the earlier note-changed state. */}
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
              : <span className="meta meta-vault"><Icon name="check" size={13} /><span>in the vault</span></span>}
        </div>
      </div>

      <nav className="bar-actions" aria-label="Board actions">
        <button className="btn btn-secondary btn-compact" onClick={onOpen} disabled={busy} aria-label="Open board">
          <Icon name="folder" /><span className="optional-label">Open</span>
        </button>
        {paneCount < 2
          ? <button className="btn btn-secondary btn-compact" onClick={onAddPane} title="Open a second pane" aria-label="Split"><Icon name="split" /><span className="optional-label">Split</span></button>
          : <button className="btn btn-secondary btn-compact" onClick={onClosePane} title="Back to one pane" aria-label="Unsplit"><Icon name="split" /><span className="optional-label">Unsplit</span></button>}
        <button className="btn btn-icon btn-danger-quiet" onClick={onClear} disabled={busy} title="Clear board" aria-label="Clear board">
          <Icon name="trash" />
        </button>
        <button
          className="btn btn-icon"
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
          aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="btn btn-primary" onClick={onNew} disabled={busy}>
          <Icon name="plus" /><span>New board</span>
        </button>
      </nav>
    </header>
  )
}
