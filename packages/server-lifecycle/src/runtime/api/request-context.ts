// What one CLI invocation says about itself on every request: its board, vault, doing line, write session and expected version.
export {
	type InvocationStatement,
	stateInvocation,
	statedInvocation,
} from "#runtime/state/server-client-session.ts";
