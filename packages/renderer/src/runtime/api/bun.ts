// The renderer under Bun: draw a board or an architecture with the Bun host installed, and the icon paths and text widths that host serves.
export { iconPaths as diagramIconPaths } from "#runtime/operations/icon-paths.ts";
export { diagramTextWidth, renderArchitecture, renderBoard } from "#runtime/operations/render.ts";
