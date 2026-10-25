import fs from "node:fs";
import { z } from "zod";

const SERVER_STARTUP_TERMINAL_FD_ENV = "ARCHBOARD_STARTUP_TERMINAL_FD";
const PROTOCOL = "archboard-server-startup-terminal/v2";

interface ServerStartupProcessGroupIdentity {
	readonly leaderPid: number;
	readonly pgid: number;
	readonly leaderStartTime: string;
}

interface ServerStartupOwnershipRecord {
	readonly protocol: typeof PROTOCOL;
	readonly kind: "ownership";
	readonly serverPid: number;
	readonly codexGroup: ServerStartupProcessGroupIdentity;
}

interface ServerStartupTerminalRecord {
	readonly protocol: typeof PROTOCOL;
	readonly kind: "terminal";
	readonly serverPid: number;
	readonly cleanup: "proven" | "unproven";
	readonly message: string | null;
}

type ServerStartupProtocolRecord = ServerStartupOwnershipRecord | ServerStartupTerminalRecord;

type ServerStartupProtocolEvent =
	| { readonly kind: "record"; readonly record: ServerStartupProtocolRecord }
	| { readonly kind: "invalid"; readonly message: string }
	| { readonly kind: "closed" };

/**
 * A pid or pgid as the kernel hands it out: a positive safe integer.
 * @param value - Any JSON value read from the startup pipe.
 * @returns True when the value is a positive integer.
 */
function positiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) > 0;
}

/**
 * Builds the ownership record the server child writes once it owns the Codex
 * process group, so the launcher can clean that group up if the child dies.
 * @param input - The facts the launcher needs to clean up after the child.
 * @param input.serverPid - The server child's pid.
 * @param input.codexGroup - The process-group identity it now owns.
 * @returns A frozen ownership record carrying the protocol tag.
 */
function serverStartupOwnershipRecord(input: {
	readonly serverPid: number;
	readonly codexGroup: ServerStartupProcessGroupIdentity;
}): ServerStartupOwnershipRecord {
	return Object.freeze({
		protocol: PROTOCOL,
		kind: "ownership",
		serverPid: input.serverPid,
		codexGroup: Object.freeze({ ...input.codexGroup }),
	});
}

/**
 * Builds the terminal record the server child writes on the way out, stating
 * whether it proved its own cleanup so the launcher knows what is left to do.
 * @param input - What the child can say about its own exit.
 * @param input.serverPid - The server child's pid.
 * @param input.cleanupProven - Whether the child proved its cleanup completed.
 * @param input.message - An optional explanation for the launcher's log.
 * @returns A frozen terminal record carrying the protocol tag.
 */
function serverStartupTerminalRecord(input: {
	readonly serverPid: number;
	readonly cleanupProven: boolean;
	readonly message?: string | null;
}): ServerStartupTerminalRecord {
	return Object.freeze({
		protocol: PROTOCOL,
		kind: "terminal",
		serverPid: input.serverPid,
		cleanup: input.cleanupProven ? "proven" : "unproven",
		message: input.message ?? null,
	});
}

const positiveIntegerSchema = z.number().refine(positiveInteger);

// The envelope every record shares; the kind decides which body follows.
const envelopeSchema = z.looseObject({
	protocol: z.literal(PROTOCOL),
	serverPid: positiveIntegerSchema,
	kind: z.unknown(),
});

// A group whose leader is its own pgid: the identity the launcher can kill safely.
const processGroupSchema = z
	.object({
		leaderPid: positiveIntegerSchema,
		pgid: positiveIntegerSchema,
		leaderStartTime: z.string().min(1),
	})
	.refine((group) => group.leaderPid === group.pgid);

const ownershipBodySchema = z.looseObject({ codexGroup: processGroupSchema });

const terminalBodySchema = z.looseObject({
	kind: z.literal("terminal"),
	cleanup: z.enum(["proven", "unproven"]),
	message: z.string().nullable(),
});

/**
 * Parses one line the server child wrote to the startup pipe into a typed
 * record, refusing anything that is not exactly an ownership or terminal
 * record of this protocol version.
 * @param line - One newline-delimited JSON line from the pipe.
 * @returns The frozen ownership or terminal record the line spells.
 * @throws {Error} when the line is not a valid record of either kind.
 */
function parseServerStartupProtocolRecord(line: string): ServerStartupProtocolRecord {
	const envelope = envelopeSchema.safeParse(JSON.parse(line));
	if (!envelope.success) {
		throw new Error("The server child returned an invalid startup cleanup record.");
	}
	if (envelope.data.kind === "ownership") {
		const body = ownershipBodySchema.safeParse(envelope.data);
		if (!body.success) {
			throw new Error("The server child returned an invalid startup cleanup ownership record.");
		}
		return serverStartupOwnershipRecord({
			serverPid: envelope.data.serverPid,
			codexGroup: body.data.codexGroup,
		});
	}
	const body = terminalBodySchema.safeParse(envelope.data);
	if (!body.success) {
		throw new Error("The server child returned an invalid startup cleanup terminal record.");
	}
	return Object.freeze({
		protocol: PROTOCOL,
		kind: "terminal",
		serverPid: envelope.data.serverPid,
		cleanup: body.data.cleanup,
		message: body.data.message,
	});
}

/**
 * Tells whether a write failure means the launcher has already gone away,
 * which is expected rather than an error.
 * @param error - The value thrown by the write.
 * @returns True for a closed or invalid pipe descriptor.
 */
function isDepartedReader(error: unknown): boolean {
	const code = z.object({ code: z.string() }).safeParse(error);
	return code.success && (code.data.code === "EPIPE" || code.data.code === "EBADF");
}

/**
 * Reads the launcher's pipe descriptor from the environment.
 * @returns The descriptor number, or null when no launcher is listening.
 * @throws {Error} when the environment names a descriptor that cannot be a pipe.
 */
function launcherDescriptor(): number | null {
	const descriptor = process.env[SERVER_STARTUP_TERMINAL_FD_ENV];
	if (descriptor === undefined) {
		return null;
	}
	const fd = Number(descriptor);
	if (!Number.isSafeInteger(fd) || fd < 3) {
		throw new Error(`Invalid ${SERVER_STARTUP_TERMINAL_FD_ENV} descriptor.`);
	}
	return fd;
}

/**
 * Report to the exact launcher pipe. A departed launcher is an expected closed reader.
 * @param record - The ownership or terminal record to write as one JSON line.
 */
function writeServerStartupProtocolRecord(record: ServerStartupProtocolRecord): void {
	const fd = launcherDescriptor();
	if (fd === null) {
		return;
	}
	try {
		fs.writeSync(fd, `${JSON.stringify(record)}\n`);
	} catch (error) {
		if (isDepartedReader(error)) {
			return;
		}
		throw error;
	}
}

/**
 * Tell the launcher that this server process now owns a Codex process group, so
 * the launcher can clean that group up if the process dies before readiness.
 * @param codexGroup - The process group this process owns.
 */
function reportStartupOwnership(codexGroup: ServerStartupProcessGroupIdentity): void {
	writeServerStartupProtocolRecord(
		serverStartupOwnershipRecord({ serverPid: process.pid, codexGroup }),
	);
}

/**
 * Tell the launcher that this server process is ending, and whether it proved
 * its own cleanup, so the launcher knows what is left to do.
 * @param ending - What this process can say about its end.
 * @param ending.cleanupProven - Whether it proved its cleanup completed.
 * @param ending.message - Why it ended, for the launcher to show, or null for an ordinary stop.
 */
function reportStartupEnd(ending: { cleanupProven: boolean; message: string | null }): void {
	writeServerStartupProtocolRecord(
		serverStartupTerminalRecord({
			serverPid: process.pid,
			cleanupProven: ending.cleanupProven,
			message: ending.message,
		}),
	);
}

export {
	reportStartupEnd,
	reportStartupOwnership,
	SERVER_STARTUP_TERMINAL_FD_ENV,
	type ServerStartupProcessGroupIdentity,
	type ServerStartupOwnershipRecord,
	type ServerStartupTerminalRecord,
	type ServerStartupProtocolRecord,
	type ServerStartupProtocolEvent,
	serverStartupOwnershipRecord,
	serverStartupTerminalRecord,
	parseServerStartupProtocolRecord,
};
