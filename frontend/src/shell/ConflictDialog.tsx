// What the shell shows when a save is refused.
//
// The server checked the note's hash before writing, found bytes it had never
// seen, and wrote nothing (ADR 0006). Excalidraw scenes do not merge, so one of
// the two copies has to lose — and archboard is not allowed to pick. This
// dialog is that refusal made choosable: the same three outcomes the CLI
// prints, as three buttons.
//
// Built on Modal like ConfirmDialog, and follows its conventions: the safe
// control is what focus lands on, Escape and a tap outside cancel. Unlike
// ConfirmDialog there is no single confirm — three of the four ways out of
// here lose somebody's work, so each one gets a line saying whose.

import React from 'react'
import { Modal } from './Modal'
import type { BoardWriteConflict } from '../types'

interface ConflictDialogProps {
  conflict: BoardWriteConflict
  busy?: boolean
  onReload: () => void
  onOverwrite: () => void
  onSaveAs: () => void
  onCancel: () => void
}

const clock = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString() : 'an unknown time'

export function ConflictDialog({
  conflict, busy, onReload, onOverwrite, onSaveAs, onCancel
}: ConflictDialogProps): JSX.Element {
  return (
    <Modal
      title="Not saved — the note changed on disk"
      wide
      onCancel={onCancel}
      footer={
        <button className="btn btn-quiet btn-big" data-autofocus onClick={onCancel} disabled={busy}>
          Do nothing
        </button>
      }
    >
      <p>
        {conflict.reason === 'changed'
          ? <>
              <strong>{conflict.board}</strong> changed on disk after archboard read it, so saving
              would have deleted that change. <strong>Nothing was written.</strong>
            </>
          : <>
              There is already a note at this address that archboard has never read, so it cannot
              tell what saving would delete. <strong>Nothing was written.</strong>
            </>}
      </p>
      <p className="hint">
        <code>{conflict.file}</code><br />
        {conflict.reason === 'changed' && <>archboard read it at {clock(conflict.lastReadAt)}; </>}
        last modified {clock(conflict.fileModifiedAt)}.
      </p>
      <p>Excalidraw scenes do not merge, so one copy has to lose. Which?</p>

      {/* Ordered by what each one costs, cheapest first: the only outcome that
          loses nothing is the one nearest to hand. */}
      <div className="choices">
        <button className="btn btn-quiet btn-big" onClick={onSaveAs} disabled={busy}>
          Save as…
        </button>
        <span className="choice-why">Keep both, under another name. Nothing is lost.</span>

        <button className="btn btn-danger-quiet btn-big" onClick={onReload} disabled={busy}>
          Reload the note
        </button>
        <span className="choice-why">Take what is on disk. The canvas as it stands now is lost.</span>

        <button className="btn btn-danger btn-big" onClick={onOverwrite} disabled={busy}>
          Overwrite the note
        </button>
        <span className="choice-why">Keep the canvas. Whatever that note holds is lost.</span>
      </div>
    </Modal>
  )
}
