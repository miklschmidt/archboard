import { ensureCanvasRunning } from './spawn.js';

// Canvas/scene bookkeeping that belongs to the *application*, not to a
// connection or a protocol session. MCP 2026-07-28 connections are pinned to a
// freshly built server instance per connection (and a discarded `server/discover`
// probe builds one too), so anything stored on a server instance would be lost
// between connections and would differ between the legacy and modern eras.
// Keeping it here means the canvas a caller sees is the same canvas regardless
// of how — or how often — a client connects.
export interface SceneState {
  theme: string;
  viewport: { x: number; y: number; zoom: number };
}

// Selection deliberately does not live here: it is owned by the browser and
// held by the canvas server (GET /api/selection), so that every reader sees
// the same thing the human is looking at.
//
// Nor do groups, which used to. A `groups` map here made this process the
// record of which elements were grouped, so two MCP clients on one canvas
// disagreed and a group died with whichever client made it. A group is a
// statement about the diagram, and board content in a process is what ADR 0015
// forbids: it lives in `groupIds` on the elements, which is a native Excalidraw
// field that round-trips through the note. That is why the CLI never had this
// bug (TASK-064).
export const sceneState: SceneState = {
  theme: 'light',
  viewport: { x: 0, y: 0, zoom: 1 }
};

let canvasEnsurePromise: Promise<unknown> | null = null;

export async function ensureCanvasReadyForMcpTool(): Promise<void> {
  if (!canvasEnsurePromise) {
    canvasEnsurePromise = ensureCanvasRunning().finally(() => {
      canvasEnsurePromise = null;
    });
  }
  await canvasEnsurePromise;
}

export function toolNeedsCanvasBeforeDispatch(name: string): boolean {
  return name !== 'read_diagram_guide' && name !== 'get_resource';
}
