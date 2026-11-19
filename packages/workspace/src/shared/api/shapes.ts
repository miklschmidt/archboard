// The shapes of what crosses a process boundary: the repositories of this machine as the navigator
// lists them and a repository entry, the choice of a checkout, a language server file, how a command
// came to its vault, and the languages a server can be configured for. Safe for the browser.
export { workspaceShape } from "#shared/schemas/shapes.ts";
export type { RepositoryEntry } from "#shared/schemas/repositories.ts";
