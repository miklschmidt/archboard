# Build on mcp_excalidraw rather than a fresh canvas or another agent whiteboard

Archboard's premise is that a human rearranges the architecture and the agent
**reads the rearrangement back** — the read path matters more than the draw
path. We built on [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
v2.0.0 because it was the only option where read-back already worked: element
level CRUD, a text scene description, screenshots the model can see, and
`.excalidraw` files we can commit.

## Considered Options

Recorded because these will be suggested again.

- **[get-vix/vix](https://github.com/get-vix/vix)** — has a browser whiteboard per
  session with voice narration, which looks close. It is write-only: the canvas
  is rendered from a URL payload and the only channel back to the agent is a
  text prompt, so dragging a box tells the agent nothing. It is also a standalone
  agent, not something Claude Code or Codex plugs into.
- **[tldraw MCP app](https://tldraw.dev/blog/tldraw-mcp-app)** — nicest canvas,
  passes state back into chat context, but Cursor-first, three tools
  (create/edit/delete shape), and oriented at in-chat UI rather than repo
  artifacts.
- **kamiazya/whiteboard** — real-time co-drawing and JSON Canvas persistence, but
  very young and read-back is render-only.
- **Text diagrams in git (Mermaid, D2)** — perfect read-back and clean diffs, and
  genuinely competitive for the refactoring half. Rejected because it cannot do
  the exploring half: dragging clusters around until the seams show.
