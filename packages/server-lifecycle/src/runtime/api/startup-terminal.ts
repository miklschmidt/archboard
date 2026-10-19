// The records a starting server writes to the launcher on the startup pipe.
export {
	serverStartupOwnershipRecord,
	serverStartupTerminalRecord,
	writeServerStartupProtocolRecord,
} from "#runtime/protocol/server-startup-terminal.ts";
