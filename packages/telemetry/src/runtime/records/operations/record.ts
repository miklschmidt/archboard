// Write the local usage records of this process (ADR 0079). Recording never throws and never
// touches the network: a failure to record loses the record, not the command.

import { detectAgent } from "std-env";
import { installation } from "@archboard/workspace/installation";
import { callerOf, RUNNER_VARIABLE } from "#runtime/records/rules/caller.ts";
import { errorKind, ownFrames } from "#runtime/errors/rules/stack-frames.ts";
import { currentConsent } from "#runtime/settings/operations/settings.ts";
import {
	appendDayRecord,
	DIRECTORY_VARIABLE,
	telemetryDirectory,
	writeErrorReport,
} from "#runtime/store/telemetry-files.ts";

/** One CLI command as the CLI saw it. */
interface CommandOutcome {
	/** The command's path, such as `model edit`. */
	readonly command: string;
	readonly exit: number;
	/** How long the command ran, in milliseconds. */
	readonly ms: number;
}

/** The work that an error ended. */
interface ErrorContext {
	readonly process: "cli" | "server";
	/** A command path, or a route's method and pattern. Never a value that a person typed. */
	readonly operation: string;
	/** The command's exit code, or null for a server error. */
	readonly exit: number | null;
}

/**
 * Run a recording, and lose the record if it fails.
 * @param write The recording.
 */
function quietly(write: () => void): void {
	try {
		if (currentConsent().on) write();
	} catch {
		// A record is worth less than the work it describes, so a failure to record stays silent.
	}
}

/**
 * The installation facts of a record.
 * @returns The version and the install mode.
 */
function installFacts(): { version: string; install: "checkout" | "release" } {
	const installed = installation();
	return { version: installed.version, install: installed.mode };
}

/**
 * Record one CLI command.
 * @param outcome The command, its exit code and its duration.
 */
function recordCommand(outcome: CommandOutcome): void {
	quietly(() => {
		appendDayRecord(telemetryDirectory(process.env), {
			kind: "command",
			t: new Date().toISOString(),
			...outcome,
			...callerOf(detectAgent().name, process.env),
			...installFacts(),
		});
	});
}

/**
 * Record one unexpected error: a count in its day, and a report that the server sends within
 * minutes. The report keeps the error's class, its code and Archboard's own frames, never its
 * message.
 * @param thrown What was thrown.
 * @param context The work that it ended.
 */
function recordError(thrown: unknown, context: ErrorContext): void {
	quietly(() => {
		const directory = telemetryDirectory(process.env);
		const t = new Date().toISOString();
		appendDayRecord(directory, { kind: "error", t, process: context.process });
		writeErrorReport(directory, {
			t,
			...context,
			...errorKind(thrown),
			frames: ownFrames(
				thrown instanceof Error ? thrown.stack : undefined,
				installation().programRoot,
			),
			...callerOf(detectAgent().name, process.env),
			...installFacts(),
		});
	});
}

/**
 * The environment that the workbench gives its Codex child, whose environment keeps only an
 * allowlist of the server's. The child's commands then record where this server sends from, and
 * say that the workbench ran them. When usage is off here, it is off there too.
 * @returns The variables to add to the child's environment.
 */
function workbenchTelemetryEnvironment(): Record<string, string> {
	try {
		if (!currentConsent().on) return { ARCHBOARD_TELEMETRY: "0" };
		return {
			[DIRECTORY_VARIABLE]: telemetryDirectory(process.env),
			[RUNNER_VARIABLE]: "workbench",
		};
	} catch {
		return { ARCHBOARD_TELEMETRY: "0" };
	}
}

export { recordCommand, recordError, workbenchTelemetryEnvironment };
