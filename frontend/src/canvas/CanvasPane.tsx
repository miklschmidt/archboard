// One pane: a slot holding its own canvas.
//
// Deliberately thin. Everything a canvas knows how to do lives in
// useCanvasSession, so this component is only the mount point and the border
// around it — which is what makes a second pane a one-line change in the shell
// rather than a second copy of the sync logic.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, getLibraryItemsHash } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, LibraryItems } from '@excalidraw/excalidraw/types'
import { useCanvasSession } from './useCanvasSession'
import type { PaneStatus } from '../types'
// The one thing the browser half shares with the server half by import rather
// than by copy: the two defaults have to be the same colour, or a box the user
// draws and a box the agent draws stop matching.
import { DEFAULT_FILL_STYLE, DEFAULT_SHAPE_BACKGROUND } from '../../../src/core/appearance'

/** Just the time, because these are minutes old at most and a date would be noise. */
const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

interface CanvasPaneProps {
  paneId: string
  /** The pane that answers export / viewport / mermaid requests. */
  primary: boolean
  /**
   * Is this the pane the user last interacted with? Reported to the server as part of
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
  /**
   * The stencil palette, owned by the shell. A pane renders it and reports
   * what the human did to it; it is not board content and never reaches the
   * element store or a change report.
   */
  libraryItems: LibraryItems
  onLibraryChange: (items: LibraryItems) => void
  onLibraryChangedElsewhere: (items: LibraryItems) => void
  /**
   * The server asked for another pane, or for this one to go. Passed up
   * because how many panes there are is the shell's business; a canvas only
   * happens to own the socket the request arrived on.
   */
  onLayoutRequest: (paneId: string, request: 'open' | 'close') => void
}

export function CanvasPane({
  paneId, primary, focused, theme, onStatus, onThemeChange, onFocus, label,
  libraryItems, onLibraryChange, onLibraryChangedElsewhere, onLayoutRequest
}: CanvasPaneProps): JSX.Element {
  const layout = useCallback(
    (request: 'open' | 'close') => onLayoutRequest(paneId, request),
    [onLayoutRequest, paneId]
  )
  const session = useCanvasSession({
    paneId, primary, focused, onStatus,
    onLibraryChanged: onLibraryChangedElsewhere,
    onLayoutRequest: layout
  })

  // Excalidraw keeps its own copy of the library per instance, so the shell's
  // copy has to be pushed in. Guarded by content hash: pushing fires
  // onLibraryChange, and an ungated push would return what the shell just sent
  // and write it to the server again, forever.
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const appliedHashRef = useRef(0)

  useEffect(() => {
    if (!api) return
    const hash = getLibraryItemsHash(libraryItems)
    if (hash === appliedHashRef.current) return
    appliedHashRef.current = hash
    void api.updateLibrary({ libraryItems, merge: false })
  }, [api, libraryItems])

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
      {session.doing.length > 0 && (
        // What has been happening here, most recent first (TASK-095). One
        // story with the banner above rather than two accounts of it: that
        // says what an agent has this board for, and these are the steps it
        // has taken towards it. Without a claim there is no banner and these
        // stand on their own, which is the common case — most writes are one
        // act and take no claim.
        //
        // Over the canvas, like the banner, because a band that took up layout
        // would resize the pane, and a pane's size is what it reports as "what
        // I am looking at".
        <ol className={`pane-doing${session.heldBy?.claimed ? ' pane-doing-under-claim' : ''}`} role="status">
          {[...session.doing].reverse().map((said) => (
            <li key={`${said.at}-${said.by}`} className="pane-doing-line">
              <span className="pane-doing-when">{clock(said.at)}</span>
              {said.doing}
            </li>
          ))}
        </ol>
      )}
      {session.heldBy?.claimed && (
        // Somebody has taken this board for a stretch of work, and the user
        // is owed the reason (ADR 0016). A per-write hold gets nothing: it is
        // twenty milliseconds, and its banner would flicker while the user is
        // editing. A claim lasts for minutes, and without this banner editing
        // stops for no reason the user can see.
        //
        // Over the canvas rather than above it, because a band that took up
        // layout would resize the pane, and a pane's size is what it reports as
        // "what I am looking at".
        <div className="pane-claim" role="status">
          <span className="pane-claim-what">
            An agent has this board{session.heldBy.reason ? `: ${session.heldBy.reason}` : ''}
          </span>
          <button
            type="button"
            className="pane-claim-take"
            // Deliberate, and one activation. Revoking on any pointer event
            // could end a restructure accidentally, and nothing puts back what
            // was already written.
            onClick={session.takeBack}
          >
            Take it back
          </button>
        </div>
      )}
      <div className="pane-canvas" ref={session.attachPaneElement}>
        <Excalidraw
          // Somebody else is writing this board, or this pane has lost the
          // socket the lock is broadcast over and cannot know (ADR 0016). A
          // canvas applies a drag the instant the pointer moves, so the edit
          // has to be refused before it happens rather than the write after it.
          // View mode is Excalidraw's own word for that: the scene still pans,
          // zooms and renders, and nothing about it can be edited.
          viewModeEnabled={session.readOnly}
          excalidrawAPI={(instance: ExcalidrawImperativeAPI) => {
            setApi(instance)
            session.attachExcalidraw(instance)
          }}
          onLibraryChange={(next) => {
            appliedHashRef.current = getLibraryItemsHash(next)
            onLibraryChange(next)
          }}
          onChange={(_elements, appState) => {
            if (appState?.theme && appState.theme !== theme) onThemeChange(appState.theme)
            session.handleChange(appState)
          }}
          // Excalidraw defaults new shapes to a transparent background, and a
          // transparent shape is only hit-testable on its stroke — so a box
          // drawn by the user could not be selected in the middle, which is the
          // first step of every promotion. Seeding the item defaults
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
