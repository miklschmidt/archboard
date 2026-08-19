import React from 'react'
import ReactDOM from 'react-dom/client'
import { Shell } from './shell/Shell'
import '@excalidraw/excalidraw/index.css'

// Name the tab so libraries.excalidraw.com can come back to it.
//
// Excalidraw's Browse button sends `target=${window.name || "_blank"}`, and the
// library site returns with window.open(referrer + '#addLibrary=…', target). An
// unnamed tab therefore gets "_blank" and the human ends up looking at a second
// copy of archboard, with the first one none the wiser. Naming it makes the
// return a hashchange in the tab they started from.
window.name = 'archboard'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
)
