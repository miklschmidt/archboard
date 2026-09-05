import fs from "node:fs";

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

function positiveInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && Number(value) > 0;
}

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

function parseCanvasStartupProtocolRecord(line: string): CanvasStartupProtocolRecord {
	const value = JSON.parse(line) as Partial<CanvasStartupProtocolRecord>;
	if (value.protocol !== PROTOCOL || !positiveInteger(value.canvasPid)) {
		throw new Error("The canvas child returned an invalid startup cleanup record.");
	}
	if (value.kind === "ownership") {
		const group = value.codexGroup;
		if (
			group === undefined ||
			!positiveInteger(group.leaderPid) ||
			!positiveInteger(group.pgid) ||
			group.leaderPid !== group.pgid ||
			typeof group.leaderStartTime !== "string" ||
			group.leaderStartTime.length === 0
		) {
			throw new Error("The canvas child returned an invalid startup cleanup ownership record.");
		}
		return canvasStartupOwnershipRecord({ canvasPid: value.canvasPid, codexGroup: group });
	}
	if (
		value.kind !== "terminal" ||
		(value.cleanup !== "proven" && value.cleanup !== "unproven") ||
		(value.message !== null && typeof value.message !== "string")
	) {
		throw new Error("The canvas child returned an invalid startup cleanup terminal record.");
	}
	return Object.freeze({
		protocol: PROTOCOL,
		kind: "terminal",
		canvasPid: value.canvasPid,
		cleanup: value.cleanup,
		message: value.message,
	});
}

/** Report to the exact launcher pipe. A departed launcher is an expected closed reader. */
function writeCanvasStartupProtocolRecord(record: CanvasStartupProtocolRecord): void {
	const descriptor = process.env[CANVAS_STARTUP_TERMINAL_FD_ENV];
	if (descriptor === undefined) {
		return;
	}
	const fd = Number(descriptor);
	if (!Number.isSafeInteger(fd) || fd < 3) {
		throw new Error(`Invalid ${CANVAS_STARTUP_TERMINAL_FD_ENV} descriptor.`);
	}
	try {
		fs.writeSync(fd, `${JSON.stringify(record)}\n`);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EPIPE" || code === "EBADF") {
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
