// The controller that runs each thread link and sign-in command against the pane it was asked from, with the snapshots and completions of an action. Safe for the browser.
export type {
	ThreadLinkActionCompletion,
	ThreadLinkActionSnapshot,
	ThreadLinkController,
} from "#ui/state/thread-link/contracts.ts";
export { createThreadLinkController } from "#ui/state/thread-link/controller.ts";
export type { ThreadLinkLoginParams } from "#ui/state/thread-link/transport-port.ts";
