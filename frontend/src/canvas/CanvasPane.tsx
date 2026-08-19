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
// The one thing the browser half shares with the server half by import rather
// than by copy: the two defaults have to be the same colour, or a box someone
// draws by hand and a box the agent draws stop matching.
import { DEFAULT_FILL_STYLE, DEFAULT_SHAPE_BACKGROUND } from '../../../src/core/appearance'

interface CanvasPaneProps {
  paneId: string
  /** The pane that answers export / viewport / mermaid requests. */
  primary: boolean
  /**
   * Is this the pane the human last touched? Reported to the server as part of
   * "what am I looking at", and only drawn as a highlight when there is more
   * than one pane to distinguish — a lone pane is trivially the focused one.
   */
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
  const session = useCanvasSession({ paneId, primary, focused, onStatus })

  const interacted = (): void => {
    session.markInteracted()
    onFocus(paneId)
  }

  return (
    <section
      className={`pane${label && focused ? ' pane-focused' : ''}`}
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
      <div className="pane-canvas" ref={session.attachPaneElement}>
        <Excalidraw
          excalidrawAPI={(api: ExcalidrawImperativeAPI) => session.attachExcalidraw(api)}
          onChange={(_elements, appState) => {
            if (appState?.theme && appState.theme !== theme) onThemeChange(appState.theme)
            session.handleChange(appState)
          }}
          // Excalidraw defaults new shapes to a transparent background, and a
          // transparent shape is only hit-testable on its stroke — so a box
          // drawn by hand could not be tapped in the middle to select it, which
          // is the first half of every promotion. Seeding the item defaults
          // fixes it at the moment of drawing; the picker still overrides.
          initialData={{
            elements: [],
            appState: {
              theme,
              currentItemBackgroundColor: DEFAULT_SHAPE_BACKGROUND,
              currentItemFillStyle: DEFAULT_FILL_STYLE
            }
          }}
        />
      </div>
    </section>
  )
}
