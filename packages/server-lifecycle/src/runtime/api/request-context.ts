// What one CLI invocation says about itself on every request: its board, vault, doing line, write session and expected version.
export {
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	setExpectedVersion,
	setRequestedBoard,
	setRequestedVault,
	setWriteDoing,
	setWriteSession,
} from "#runtime/state/server-client-session.ts";
