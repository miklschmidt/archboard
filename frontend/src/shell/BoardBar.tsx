// The shell's chrome: what is on the canvas, and what can be done to it.
//
// Everything here is about the *board*, not about drawing — Excalidraw's own
// toolbar is the tool for that and we do not duplicate it. What replaced the
// old header is the difference between a POC's controls (a Sync button, a
// spinner, a last-sync clock) and an architecture surface's: which board, which
// variant, which level, whether it is written down.

import React from 'react'
import type { BoardIdentity } from '../types'

interface BoardBarProps {
  identity: BoardIdentity | null
  boardKey: string | null
  elementCount: number
  connected: boolean
  vaultBacked: boolean
  savedAt: string | null
  dirty: boolean
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

function saveState(vaultBacked: boolean, savedAt: string | null, dirty: boolean): string {
  if (!vaultBacked) return 'not in the vault'
  if (dirty) return 'unsaved changes'
  if (savedAt) return `saved ${clock(savedAt)}`
  return 'no changes'
}

export function BoardBar({
  identity, boardKey, elementCount, connected, vaultBacked, savedAt, dirty,
  paneCount, onOpen, onNew, onSave, onClear, onAddPane, onClosePane, busy
}: BoardBarProps): JSX.Element {
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
        <span className={`meta ${dirty ? 'meta-dirty' : ''}`}>
          {saveState(vaultBacked, savedAt, dirty)}
        </span>
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
