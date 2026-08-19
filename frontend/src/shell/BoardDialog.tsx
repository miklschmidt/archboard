// Opening a board or a variant, and starting a new one.
//
// Addressing follows the vault's, not a UI of its own: `current` is the
// privileged variant and owns the bare name, so it is offered as the default
// and everything else is `name@variant`. Level is a controlled vocabulary that
// is allowed to grow, so the field suggests the tiers we have but does not
// refuse a new one.

import React, { useEffect, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { fetchBoards } from '../canvas/api'
import type { BoardIdentity, BoardListing } from '../types'

export type BoardDialogMode = 'open' | 'new' | 'save-as'

const LEVELS = ['system', 'service', 'module']

/** How the vault will address this board — `current` owns the bare name. */
const address = (name: string, variant: string): string => {
  const board = name.trim() || 'board'
  const chosen = variant.trim()
  return !chosen || chosen === 'current' ? board : `${board}@${chosen}`
}

interface BoardDialogProps {
  mode: BoardDialogMode
  /** The board on the canvas, used to seed "another variant of this one". */
  current: BoardIdentity | null
  busy?: boolean
  error?: string | null
  onSubmit: (address: { board: string; variant?: string; level?: string }) => void
  onCancel: () => void
}

const TITLES: Record<BoardDialogMode, string> = {
  open: 'Open a board',
  new: 'New board',
  'save-as': 'Save this board as'
}

export function BoardDialog({
  mode, current, busy, error, onSubmit, onCancel
}: BoardDialogProps): JSX.Element {
  const [listing, setListing] = useState<BoardListing | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [name, setName] = useState(mode === 'open' ? '' : (current?.board ?? ''))
  const [variant, setVariant] = useState('current')
  const [level, setLevel] = useState(current?.level ?? '')

  useEffect(() => {
    if (mode !== 'open') return
    let live = true
    fetchBoards()
      .then((result) => { if (live) setListing(result) })
      .catch((err: Error) => { if (live) setListError(err.message) })
    return () => { live = false }
  }, [mode])

  const entries = useMemo(() => {
    if (!listing) return []
    const open = new Set(listing.open.map((entry) => entry.key))
    const keys = new Set<string>([
      ...listing.boards.map((entry) => entry.key),
      ...listing.open.map((entry) => entry.key)
    ])
    return [...keys]
      .sort()
      .filter((key) => key.toLowerCase().includes(filter.trim().toLowerCase()))
      .map((key) => ({
        key,
        open: open.has(key),
        active: key === listing.active,
        inVault: listing.boards.some((entry) => entry.key === key)
      }))
  }, [listing, filter])

  const submitTyped = (): void => {
    const board = (mode === 'open' ? filter : name).trim()
    if (!board) return
    onSubmit(
      mode === 'open'
        ? { board }
        : {
          board,
          variant: variant.trim() || 'current',
          ...(level.trim() ? { level: level.trim() } : {})
        }
    )
  }

  return (
    <Modal
      title={TITLES[mode]}
      onCancel={onCancel}
      wide={mode === 'open'}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submitTyped} disabled={busy}>
            {busy ? 'Working…' : mode === 'open' ? 'Open' : mode === 'new' ? 'Create' : 'Save'}
          </button>
        </>
      }
    >
      {error && <p className="notice notice-error">{error}</p>}

      {mode === 'open' ? (
        <>
          <label className="field">
            <span>Board address</span>
            <input
              data-autofocus
              value={filter}
              placeholder="payments, or payments@option-a"
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submitTyped() }}
            />
          </label>
          {listError && <p className="notice notice-error">{listError}</p>}
          {!listing && !listError && <p className="hint">Reading the vault…</p>}
          {listing && (
            <ul className="board-list">
              {entries.length === 0 && <li className="hint">Nothing in the vault matches.</li>}
              {entries.map((entry) => (
                <li key={entry.key}>
                  <button
                    className={`board-row${entry.active ? ' board-row-active' : ''}`}
                    onClick={() => onSubmit({ board: entry.key })}
                    disabled={busy}
                  >
                    <span className="board-row-key">{entry.key}</span>
                    {entry.active && <span className="chip chip-quiet">on the canvas</span>}
                    {!entry.active && entry.open && <span className="chip chip-quiet">open</span>}
                    {!entry.inVault && <span className="chip chip-quiet">unsaved</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Vault: {listing?.vault ?? 'unknown'}</p>
        </>
      ) : (
        <>
          <label className="field">
            <span>Name</span>
            <input
              data-autofocus
              value={name}
              placeholder="payments"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submitTyped() }}
            />
          </label>
          <label className="field">
            <span>Variant</span>
            <input
              value={variant}
              placeholder="current"
              onChange={(event) => setVariant(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submitTyped() }}
            />
          </label>
          <label className="field">
            <span>Level</span>
            <input
              value={level}
              list="archboard-levels"
              placeholder="system, service, module…"
              onChange={(event) => setLevel(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') submitTyped() }}
            />
            <datalist id="archboard-levels">
              {LEVELS.map((value) => <option key={value} value={value} />)}
            </datalist>
          </label>
          <p className="hint">
            <code>current</code> is the architecture that exists and owns the bare name;
            every other variant is a proposal. This one is addressed{' '}
            <code>{address(name, variant)}</code>.
          </p>
        </>
      )}
    </Modal>
  )
}
