import React from 'react'
import ReactDOM from 'react-dom/client'
import { Shell } from './shell/Shell'
import '@excalidraw/excalidraw/index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
)
