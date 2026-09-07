import fs from "node:fs";
import { z } from "zod";

const CANVAS_STARTUP_TERMINAL_FD_ENV = "ARCHBOARD_STARTUP_TERMINAL_FD";
const PROTOCOL = "archboard-canvas-startup-terminal/v2";

interface CanvasStartupProcessGroupIdentity {
	readonly leaderPid: number;
	readonly pgid: number;
	readonly leaderStartTime: string;
}

interface CanvasStartupOwnershipRecord {
	readonly protocol: typeof PROTOCOL;
	readonly kind: "ownership";
	readonly canvasPid: number;
	readonly codexGroup: CanvasStartupProcessGroupIdentity;
}

interface CanvasStartupTerminalRecord {
	readonly protocol: typeof PROTOCOL;
	readonly kind: "terminal";
	readonly canvasPid: number;
	readonly cleanup: "proven" | "unproven";
	readonly message: string | null;
}

type CanvasStartupProtocolRecord = CanvasStartupOwnershipRecord | CanvasStartupTerminalRecord;

type CanvasStartupProtocolEvent =
	| { readonly kind: "record"; readonly record: CanvasStartupProtocolRecord }
	| { readonly kind: "invalid"; readonly message: string }
	| { readonly kind: "closed" };

/**
 * A pid or pgid as the kernel hands it out: a positive safe integer.
 *
 * @param value - Any JSON value read from the startup pipe.
 * @returns True when the value is a positive integer.
 */
function positiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) > 0;
}

/**
 * Builds the ownership record the canvas child writes once it owns the Codex
 * process group, so the launcher can clean that group up if the child dies.
 *
 * @param input - The canvas pid and the process-group identity it now owns.
 * @returns A frozen ownership record carrying the protocol tag.
 */
function canvasStartupOwnershipRecord(input: {
	readonly canvasPid: number;
	readonly codexGroup: CanvasStartupProcessGroupIdentity;
}): CanvasStartupOwnershipRecord {
	return Object.freeze({
		protocol: PROTOCOL,
		kind: "ownership",
		canvasPid: input.canvasPid,
		codexGroup: Object.freeze({ ...input.codexGroup }),
	});
}

/**
 * Builds the terminal record the canvas child writes on the way out, stating
 * whether it proved its own cleanup so the launcher knows what is left to do.
 *
 * @param input - The canvas pid, whether cleanup was proven, and an optional message.
 * @returns A frozen terminal record carrying the protocol tag.
 */
function canvasStartupTerminalRecord(input: {
	readonly canvasPid: number;
	readonly cleanupProven: boolean;
	readonly message?: string | null;
}): CanvasStartupTerminalRecord {
	return Object.freeze({
		protocol: PROTOCOL,
		kind: "terminal",
		canvasPid: input.canvasPid,
		cleanup: input.cleanupProven ? "proven" : "unproven",
		message: input.message ?? null,
	});
}

const positiveIntegerSchema = z.number().refine(positiveInteger);

// The envelope every record shares; the kind decides which body follows.
const envelopeSchema = z.looseObject({
	protocol: z.literal(PROTOCOL),
	canvasPid: positiveIntegerSchema,
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
 * Parses one line the canvas child wrote to the startup pipe into a typed
 * record, refusing anything that is not exactly an ownership or terminal
 * record of this protocol version.
 *
 * @param line - One newline-delimited JSON line from the pipe.
 * @returns The frozen ownership or terminal record the line spells.
 * @throws {Error} when the line is not a valid record of either kind.
 */
function parseCanvasStartupProtocolRecord(line: string): CanvasStartupProtocolRecord {
	const envelope = envelopeSchema.safeParse(JSON.parse(line));
	if (!envelope.success) {
		throw new Error("The canvas child returned an invalid startup cleanup record.");
	}
	if (envelope.data.kind === "ownership") {
		const body = ownershipBodySchema.safeParse(envelope.data);
		if (!body.success) {
			throw new Error("The canvas child returned an invalid startup cleanup ownership record.");
		}
		return canvasStartupOwnershipRecord({
			canvasPid: envelope.data.canvasPid,
			codexGroup: body.data.codexGroup,
		});
	}
	const body = terminalBodySchema.safeParse(envelope.data);
	if (!body.success) {
		throw new Error("The canvas child returned an invalid startup cleanup terminal record.");
	}
	return Object.freeze({
		protocol: PROTOCOL,
		kind: "terminal",
		canvasPid: envelope.data.canvasPid,
		cleanup: body.data.cleanup,
		message: body.data.message,
	});
}

/**
 * Tells whether a write failure means the launcher has already gone away,
 * which is expected rather than an error.
 *
 * @param error - The value thrown by the write.
 * @returns True for a closed or invalid pipe descriptor.
 */
function isDepartedReader(error: unknown): boolean {
	const code = z.object({ code: z.string() }).safeParse(error);
	return code.success && (code.data.code === "EPIPE" || code.data.code === "EBADF");
}

/**
 * Reads the launcher's pipe descriptor from the environment.
 *
 * @returns The descriptor number, or null when no launcher is listening.
 * @throws {Error} when the environment names a descriptor that cannot be a pipe.
 */
function launcherDescriptor(): number | null {
	const descriptor = process.env[CANVAS_STARTUP_TERMINAL_FD_ENV];
	if (descriptor === undefined) {
		return null;
	}
	const fd = Number(descriptor);
	if (!Number.isSafeInteger(fd) || fd < 3) {
		throw new Error(`Invalid ${CANVAS_STARTUP_TERMINAL_FD_ENV} descriptor.`);
	}
	return fd;
}

/**
 * Report to the exact launcher pipe. A departed launcher is an expected closed reader.
 *
 * @param record - The ownership or terminal record to write as one JSON line.
 */
function writeCanvasStartupProtocolRecord(record: CanvasStartupProtocolRecord): void {
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

export {
	CANVAS_STARTUP_TERMINAL_FD_ENV,
	type CanvasStartupProcessGroupIdentity,
	type CanvasStartupOwnershipRecord,
	type CanvasStartupTerminalRecord,
	type CanvasStartupProtocolRecord,
	type CanvasStartupProtocolEvent,
	canvasStartupOwnershipRecord,
	canvasStartupTerminalRecord,
	parseCanvasStartupProtocolRecord,
	writeCanvasStartupProtocolRecord,
};
