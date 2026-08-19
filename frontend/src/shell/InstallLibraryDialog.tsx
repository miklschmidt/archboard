// "A website wants to add 24 shapes to your library."
//
// Excalidraw would skip this whenever the token in the returning hash matches
// the Excalidraw instance that opened the library site. We ask every time: the
// token arrives in the same hash as the URL and proves nothing an attacker
// could not also write, and the cost of asking is one tap.
//
// What it has to say is where the shapes came from and how many there are.
// Everything else — the URL, the item names — is detail nobody reads on a wall
// panel from two metres away.

import React from 'react'
import { Modal } from './Modal'
import type { PendingInstall } from './useLibrary'

interface InstallLibraryDialogProps {
  install: PendingInstall
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function InstallLibraryDialog({
  install, busy, onConfirm, onCancel
}: InstallLibraryDialogProps): JSX.Element {
  return (
    <Modal
      title="Add these shapes to the library?"
      onCancel={onCancel}
      footer={
        <>
          <button className="btn btn-quiet btn-big" data-autofocus onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary btn-big" onClick={onConfirm} disabled={busy}>
            {busy ? 'Adding…' : `Add ${install.items.length} shapes`}
          </button>
        </>
      }
    >
      <p>
        <strong>{install.name}</strong> — {install.items.length} shape
        {install.items.length === 1 ? '' : 's'} from <strong>{install.host}</strong>.
      </p>
      <p className="hint">
        They join the library on this canvas server, so every pane and every tab gets them,
        and they stay until you delete them. Nothing is drawn on the board until you drag
        one onto it.
      </p>
    </Modal>
  )
}
