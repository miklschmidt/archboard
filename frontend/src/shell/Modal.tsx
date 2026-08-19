// The shell's one modal primitive.
//
// Not window.confirm(): a native dialog blocks the event loop (which stalls
// anything driving this canvas from outside) and renders at whatever size the
// browser feels like — unreadable on a 75in panel.

import React, { useEffect, useRef } from 'react'

interface ModalProps {
  title: string
  onCancel: () => void
  children: React.ReactNode
  footer: React.ReactNode
  wide?: boolean
}

export function Modal({ title, onCancel, children, footer, wide }: ModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    // Focus lands inside the dialog, and on the safe control: see
    // ConfirmDialog, where the first focusable is Cancel by construction.
    panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onPointerDown={onCancel}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  )
}
