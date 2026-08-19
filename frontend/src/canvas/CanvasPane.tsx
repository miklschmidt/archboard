// One pane: a slot holding its own canvas.
//
// Deliberately thin. Everything a canvas knows how to do lives in
// useCanvasSession, so this component is only the mount point and the border
// around it — which is what makes a second pane a one-line change in the shell
// rather than a second copy of the sync logic.

import React from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useCanvasSession } from './useCanvasSession'
import type { PaneStatus } from '../types'

interface CanvasPaneProps {
  paneId: string
  /** The pane that answers export / viewport / mermaid requests. */
  primary: boolean
  focused: boolean
  theme: 'light' | 'dark'
  onStatus: (status: PaneStatus) => void
  onThemeChange: (theme: 'light' | 'dark') => void
  onFocus: (paneId: string) => void
  /** Shown only when more than one pane is mounted. */
  label?: string
}

export function CanvasPane({
  paneId, primary, focused, theme, onStatus, onThemeChange, onFocus, label
}: CanvasPaneProps): JSX.Element {
  const session = useCanvasSession({ paneId, primary, onStatus })

  const interacted = (): void => {
    session.markInteracted()
    onFocus(paneId)
  }

  return (
    <section
      className={`pane${focused ? ' pane-focused' : ''}`}
      onPointerDownCapture={interacted}
      onKeyDownCapture={interacted}
      aria-label={label ?? 'canvas'}
    >
      {label && (
        <div className="pane-tab">
          <span className="pane-tab-name">{session.board?.board ?? '…'}</span>
          {session.board && session.board.variant !== 'current' && (
            <span className="pane-tab-variant">@{session.board.variant}</span>
          )}
          <span className={`dot ${session.connected ? 'dot-live' : 'dot-dead'}`} />
        </div>
      )}
      <div className="pane-canvas">
        <Excalidraw
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => session.attachExcalidraw(api)}
          onChange={(_elements, appState) => {
            if (appState?.theme && appState.theme !== theme) onThemeChange(appState.theme)
            session.handleChange(appState)
          }}
          initialData={{ elements: [], appState: { theme } }}
        />
      </div>
    </section>
  )
}
