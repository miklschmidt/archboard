import fs from "node:fs";

export const CANVAS_STARTUP_TERMINAL_FD_ENV = "ARCHBOARD_STARTUP_TERMINAL_FD";
const PROTOCOL = "archboard-canvas-startup-terminal/v1";

export interface CanvasStartupTerminalRecord {
	readonly protocol: typeof PROTOCOL;
	readonly canvasPid: number;
	readonly cleanup: "proven" | "unproven";
	readonly message: string | null;
}

export function canvasStartupTerminalRecord(input: {
	readonly canvasPid: number;
	readonly cleanupProven: boolean;
	readonly message?: string | null;
}): CanvasStartupTerminalRecord {
	return Object.freeze({
		protocol: PROTOCOL,
		canvasPid: input.canvasPid,
		cleanup: input.cleanupProven ? "proven" : "unproven",
		message: input.message ?? null,
	});
}

export function parseCanvasStartupTerminalRecord(line: string): CanvasStartupTerminalRecord {
	const value = JSON.parse(line) as Partial<CanvasStartupTerminalRecord>;
	if (
		value.protocol !== PROTOCOL ||
		!Number.isSafeInteger(value.canvasPid) ||
		Number(value.canvasPid) <= 0 ||
		(value.cleanup !== "proven" && value.cleanup !== "unproven") ||
		(value.message !== null && typeof value.message !== "string")
	)
		throw new Error("The canvas child returned an invalid startup terminal record.");
	return Object.freeze({
		protocol: value.protocol,
		canvasPid: value.canvasPid as number,
		cleanup: value.cleanup,
		message: value.message,
	});
}

/** Report to the exact launcher pipe. A departed launcher is an expected closed reader. */
export function writeCanvasStartupTerminalRecord(record: CanvasStartupTerminalRecord): void {
	const descriptor = process.env[CANVAS_STARTUP_TERMINAL_FD_ENV];
	if (descriptor === undefined) return;
	const fd = Number(descriptor);
	if (!Number.isSafeInteger(fd) || fd < 3)
		throw new Error(`Invalid ${CANVAS_STARTUP_TERMINAL_FD_ENV} descriptor.`);
	try {
		fs.writeSync(fd, `${JSON.stringify(record)}\n`);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EPIPE" || code === "EBADF") return;
		throw error;
	}
}
