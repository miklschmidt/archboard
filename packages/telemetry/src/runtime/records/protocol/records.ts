// The local records of an installation (ADR 0079). A record holds ids, names of Archboard's own
// commands and operations, counts and codes. It never holds a module, file, repository or model
// name, a path outside Archboard, a prompt or the text of an error message.

import { z } from "zod";

/** How Archboard runs: from a checkout's source, or as a release executable. */
const InstallSchema = z.enum(["checkout", "release"]);

/** Who ran a command: the agent that `std-env` detected, and whether Archboard's workbench ran it. */
const CallerSchema = z.object({
	/** The agent's short name, such as `claude` or `codex`, or null for a person. */
	agent: z.string().nullable(),
	/** `workbench` when Archboard's own workbench ran the command, else null. */
	runner: z.literal("workbench").nullable(),
});

/** One CLI command. */
const CommandRecordSchema = CallerSchema.extend({
	kind: z.literal("command"),
	/** When the command ended, as an ISO time. */
	t: z.string(),
	/** The command's path, such as `model edit`. */
	command: z.string(),
	/** The exit code. */
	exit: z.number().int(),
	/** How long the command ran, in milliseconds. */
	ms: z.number().nonnegative(),
	version: z.string(),
	install: InstallSchema,
});

/** One unexpected error, counted in its day. Its full report waits in a file of its own. */
const ErrorCountRecordSchema = z.object({
	kind: z.literal("error"),
	t: z.string(),
	/** The process that failed. */
	process: z.enum(["cli", "server"]),
});

/** A record in the file of a day. */
const DayRecordSchema = z.discriminatedUnion("kind", [CommandRecordSchema, ErrorCountRecordSchema]);

/** One stack frame of Archboard's own code. */
const FrameSchema = z.object({
	/** The function name, or an empty string for an anonymous one. */
	function: z.string(),
	/** The path relative to the program root, such as `apps/cli/src/bin.ts`. */
	filename: z.string(),
	lineno: z.number().int().optional(),
	colno: z.number().int().optional(),
});

/** The full report of one unexpected error. */
const ErrorReportSchema = CallerSchema.extend({
	t: z.string(),
	process: z.enum(["cli", "server"]),
	/** The work that failed: a command path, or a route's method and pattern. */
	operation: z.string(),
	/** The error's class name, such as `TypeError`. */
	type: z.string(),
	/** The error's machine-readable code, such as `ENOENT`, or null. */
	code: z.string().nullable(),
	/** The command's exit code, or null for a server error. */
	exit: z.number().int().nullable(),
	/** Archboard's own frames, innermost first. */
	frames: z.array(FrameSchema),
	version: z.string(),
	install: InstallSchema,
});

type Caller = z.infer<typeof CallerSchema>;
type CommandRecord = z.infer<typeof CommandRecordSchema>;
type DayRecord = z.infer<typeof DayRecordSchema>;
type ErrorReport = z.infer<typeof ErrorReportSchema>;
type Frame = z.infer<typeof FrameSchema>;
type Install = z.infer<typeof InstallSchema>;

export {
	DayRecordSchema,
	ErrorReportSchema,
	type Caller,
	type CommandRecord,
	type DayRecord,
	type ErrorReport,
	type Frame,
	type Install,
};
