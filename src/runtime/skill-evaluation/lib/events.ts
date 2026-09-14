// What a Codex exec run said about itself, read from its `--json` event
// stream: the commands it ran, what it said at the end, and what it cost.
//
// Codex 0.154 prints one JSON object per line: thread.started, turn.started,
// item.started/updated/completed (agent_message, reasoning, command_execution,
// file_change, mcp_tool_call, web_search, todo_list), turn.completed with
// usage, and turn.failed or error. Only fields this harness reports are read;
// everything else stays in the retained raw file.

/** One shell command the author ran. */
interface CommandRecord {
	readonly command: string;
	readonly exitCode: number | null;
	readonly status: string;
	/** What the command printed, as Codex aggregated it; empty when it was not reported. */
	readonly output: string;
}

/** Token usage as the producer reports it. `cached` is a subset of `input`; `total` is input plus output. */
interface Usage {
	readonly input: number;
	readonly cached: number;
	readonly cacheWrite: number | null;
	readonly output: number;
	readonly reasoning: number | null;
	readonly total: number;
}

/**
 * One file the author changed through Codex's own editing tool rather than
 * through a shell command. A `file_change` item is the only record of such a
 * write: no command_execution carries it, so a harness that read only the
 * commands would never see a board patched directly in the vault.
 */
interface FileChange {
	readonly path: string;
	/** What Codex says it did: add, update or delete. */
	readonly kind: string;
}

/** Everything a run's event stream said that the reports read. */
interface AuthorTrace {
	readonly threadId: string | null;
	readonly commands: readonly CommandRecord[];
	readonly fileChanges: readonly FileChange[];
	readonly messages: readonly string[];
	readonly usage: Usage | null;
	readonly failure: string | null;
	readonly events: number;
	readonly malformedLines: number;
}

type CommandClass = "discovery" | "operation" | "code-investigation" | "setup" | "ambiguous";

/**
 * Material an author must not read: the scenario definitions, fixtures, rubric
 * and coverage it is being measured against; the harness's own source; and the
 * private world of another run of the same batch.
 */
type ExposureKind = "evaluation-inputs" | "harness-source" | "other-run";

/** A command with how the harness read it, and why. */
interface ClassifiedCommand extends CommandRecord {
	readonly class: CommandClass;
	readonly rule: string;
	/** True for an archboard write: semantic new, edit, branch, resolve or adopt. */
	readonly write: boolean;
	/** The evaluation material this command reached for, when it reached for any. */
	readonly exposure: ExposureKind | null;
}

/** Where the evaluation material lives, so a command that touches it is seen. */
interface ExposureRoots {
	/** The canonical inputs: evals.json, the fixtures, the rubric, the coverage. */
	readonly evaluationInputs: string;
	/** The harness's source. */
	readonly harnessSource: string;
	/** The batch every run of this comparison lives under. */
	readonly batchRoot: string;
	/** This run's own directory, which it may of course read. */
	readonly runRoot: string;
}

/** What the classifier knows about where the run happened. */
interface ClassificationContext {
	readonly skillRoot: string;
	readonly checkoutRoot: string;
	readonly vault: string;
	/** Absent only in tests of the classes alone; a run always knows its roots. */
	readonly exposure?: ExposureRoots | undefined;
}

type Json = Record<string, unknown>;

/**
 * Whether a value is a JSON object.
 * @param value The value.
 * @returns True for a non-null object.
 */
function isJson(value: unknown): value is Json {
	return typeof value === "object" && value !== null;
}

/**
 * A number field, or null when the producer did not say.
 * @param record The object.
 * @param key The field.
 * @returns The number or null.
 */
function numberField(record: Json, key: string): number | null {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A string field, or null.
 * @param record The object.
 * @param key The field.
 * @returns The string or null.
 */
function stringField(record: Json, key: string): string | null {
	const value = record[key];
	return typeof value === "string" ? value : null;
}

/**
 * Usage from a turn.completed event, under the producer's semantics: cached
 * input is part of input, so the total is input plus output and never adds
 * cached again.
 * @param raw The usage object.
 * @returns The usage, or null when the input and output counts are absent.
 */
function usageFrom(raw: unknown): Usage | null {
	if (!isJson(raw)) return null;
	const input = numberField(raw, "input_tokens");
	const output = numberField(raw, "output_tokens");
	if (input === null || output === null) return null;
	return {
		input,
		cached: Math.min(numberField(raw, "cached_input_tokens") ?? 0, input),
		cacheWrite: numberField(raw, "cache_write_input_tokens"),
		output,
		reasoning: numberField(raw, "reasoning_output_tokens"),
		total: input + output,
	};
}

/**
 * The command text of a command_execution item, whichever spelling it has.
 * @param item The item.
 * @returns The command as one line.
 */
function commandText(item: Json): string {
	const command = item["command"];
	if (Array.isArray(command)) return command.map(String).join(" ");
	return typeof command === "string" ? command : "";
}

/**
 * A command record from a completed command_execution item.
 * @param item The item.
 * @returns The record.
 */
function commandRecord(item: Json): CommandRecord {
	return {
		command: commandText(item),
		exitCode: numberField(item, "exit_code"),
		status: stringField(item, "status") ?? "unknown",
		output: stringField(item, "aggregated_output") ?? "",
	};
}

/**
 * The file changes of a completed file_change item.
 * @param item The item.
 * @returns One record per changed file.
 */
function fileChanges(item: Json): FileChange[] {
	const changes = item["changes"];
	if (!Array.isArray(changes)) return [];
	return changes.flatMap((change: unknown) => {
		if (!isJson(change)) return [];
		const changed = stringField(change, "path");
		return changed === null
			? []
			: [{ path: changed, kind: stringField(change, "kind") ?? "unknown" }];
	});
}

/** A trace under construction. */
interface TraceBuilder {
	threadId: string | null;
	commands: CommandRecord[];
	fileChanges: FileChange[];
	messages: string[];
	usage: Usage | null;
	failure: string | null;
	events: number;
	malformedLines: number;
}

/**
 * The message of a failure event.
 * @param event The event.
 * @returns The message, or the event's type when it carries none.
 */
function failureText(event: Json): string {
	const error = event["error"];
	const nested = isJson(error) ? stringField(error, "message") : null;
	return nested ?? stringField(event, "message") ?? String(event["type"]);
}

/**
 * Folds one completed item into the trace.
 * @param trace The trace so far.
 * @param item The item.
 */
function takeItem(trace: TraceBuilder, item: unknown): void {
	if (!isJson(item)) return;
	if (item["type"] === "command_execution") trace.commands.push(commandRecord(item));
	if (item["type"] === "file_change") trace.fileChanges.push(...fileChanges(item));
	const text = stringField(item, "text");
	if (item["type"] === "agent_message" && text !== null) trace.messages.push(text);
}

/**
 * Remembers the thread, for resuming.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeThreadStarted(trace: TraceBuilder, event: Json): void {
	trace.threadId = stringField(event, "thread_id") ?? trace.threadId;
}

/**
 * Takes a finished command or message.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeItemCompleted(trace: TraceBuilder, event: Json): void {
	takeItem(trace, event["item"]);
}

/**
 * Takes the turn's usage.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeTurnCompleted(trace: TraceBuilder, event: Json): void {
	trace.usage = usageFrom(event["usage"]) ?? trace.usage;
}

/**
 * Records why the turn, or the stream, failed.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeFailure(trace: TraceBuilder, event: Json): void {
	trace.failure = failureText(event);
}

const TAKERS: Record<string, (trace: TraceBuilder, event: Json) => void> = {
	"thread.started": takeThreadStarted,
	"item.completed": takeItemCompleted,
	"turn.completed": takeTurnCompleted,
	"turn.failed": takeFailure,
	error: takeFailure,
};

/**
 * Folds one event into the trace.
 * @param trace The trace so far.
 * @param event The event.
 */
function takeEvent(trace: TraceBuilder, event: Json): void {
	trace.events += 1;
	TAKERS[stringField(event, "type") ?? ""]?.(trace, event);
}

/**
 * Folds one line of the stream into the trace; a line that is not an event is counted.
 * @param trace The trace so far.
 * @param line The line.
 */
function takeLine(trace: TraceBuilder, line: string): void {
	try {
		const event: unknown = JSON.parse(line);
		if (isJson(event)) takeEvent(trace, event);
		else trace.malformedLines += 1;
	} catch {
		trace.malformedLines += 1;
	}
}

/**
 * Reads a whole JSONL stream. A line that is not JSON is counted, never fatal:
 * Codex may print a warning to stdout before the first event.
 * @param text The stream's text.
 * @returns The trace.
 */
function parseTrace(text: string): AuthorTrace {
	const trace: TraceBuilder = {
		threadId: null,
		commands: [],
		fileChanges: [],
		messages: [],
		usage: null,
		failure: null,
		events: 0,
		malformedLines: 0,
	};
	for (const line of text.split("\n")) {
		if (line.trim() !== "") takeLine(trace, line);
	}
	return trace;
}

/**
 * The command without its `bash -lc` wrapper and outer quotes.
 * @param command The command as recorded.
 * @returns The inner script.
 */
function unwrapped(command: string): string {
	const match = /^(?:\/bin\/)?(?:ba|z)?sh\s+-l?c\s+(.*)$/su.exec(command.trim());
	const inner = match?.[1] ?? command;
	return inner.replace(/^(['"])(.*)\1$/su, "$2").trim();
}

const WRITE_RE = /\barchboard\s+semantic\s+(?:new|edit|branch|resolve|adopt)\b/u;
const HELP_RE = /\barchboard\b(?:\s+\S+)*\s+(?:help|--help|-h)\b|\barchboard\s+help\b/u;
/** The harness's own source, by its module name. */
const HARNESS_SOURCE_RE = /\bskill-evaluation\//u;
/** The words that begin a read of evaluation inputs by their canonical names. */
const EVALUATION_INPUT_RE =
	/\bevals\/(?:evals\.json|pins\.json|coverage\.json|rubric\.md|README\.md|fixtures\/S\d{2}\.json)\b/u;
const OPERATION_RE =
	/\barchboard\s+(?:semantic|repo|check|claim|release|start|stop|status|install-skill|browser)\b/u;
const INVESTIGATION_RE =
	/\b(?:rg|grep|cat|sed|head|tail|less|find|ls|tree|python3?|awk|wc|bat|fd|git\s+(?:log|show|grep|ls-files|blame|diff))\b/u;
const SOURCE_RE = /\b(?:src|tests|docs)\/|\.(?:py|rst|toml|cfg|md|txt)\b/u;
const SETUP_RE =
	/^(?:cd|export|env|echo|pwd|which|mkdir|true|printf|set|type|command\s+-v|source|\.)\b/u;

/** One classification rule: the first whose test holds decides. */
interface Rule {
	readonly class: CommandClass;
	readonly rule: string;
	readonly test: (script: string, context: ClassificationContext) => boolean;
}

/**
 * Whether a command reads the installed skill.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsSkill(script: string, context: ClassificationContext): boolean {
	return script.includes(context.skillRoot) || /skills\/archboard\b/u.test(script);
}

/**
 * Whether a command asks the CLI for help.
 * @param script The command.
 * @returns True when it does.
 */
function asksHelp(script: string): boolean {
	return HELP_RE.test(script);
}

/**
 * Whether a command reads the vault vocabulary.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsVocabulary(script: string, context: ClassificationContext): boolean {
	return (
		/\barchboard\s+semantic\s+config\b/u.test(script) ||
		(INVESTIGATION_RE.test(script) &&
			script.includes(context.vault) &&
			/\bconfig\.ya?ml\b/u.test(script))
	);
}

/**
 * Whether a command runs a known archboard command.
 * @param script The command.
 * @returns True when it does.
 */
function runsArchboard(script: string): boolean {
	return OPERATION_RE.test(script);
}

/**
 * Whether a command mentions archboard at all.
 * @param script The command.
 * @returns True when it does.
 */
function mentionsArchboard(script: string): boolean {
	return /\barchboard\b/u.test(script);
}

/**
 * Whether a command reads the checkout.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsCheckout(script: string, context: ClassificationContext): boolean {
	return (
		INVESTIGATION_RE.test(script) &&
		(script.includes(context.checkoutRoot) || SOURCE_RE.test(script))
	);
}

/**
 * Whether a command is shell setup.
 * @param script The command.
 * @returns True when it is.
 */
function isSetup(script: string): boolean {
	return SETUP_RE.test(script);
}

const RULES: readonly Rule[] = [
	{ class: "discovery", rule: "reads the installed skill", test: readsSkill },
	{ class: "discovery", rule: "asks the CLI for help", test: asksHelp },
	{ class: "discovery", rule: "reads the vault vocabulary", test: readsVocabulary },
	{ class: "operation", rule: "runs an archboard command", test: runsArchboard },
	{
		class: "ambiguous",
		rule: "mentions archboard outside a known command",
		test: mentionsArchboard,
	},
	{ class: "code-investigation", rule: "reads the checkout", test: readsCheckout },
	{ class: "setup", rule: "shell setup", test: isSetup },
];

/**
 * The simple commands of a script: what runs between `;`, `&&`, `||`, `|` and
 * newlines, each without the environment assignments in front of it.
 * @param script The unwrapped script.
 * @returns The simple commands, trimmed.
 */
function simpleCommands(script: string): string[] {
	return script
		.split(/\s*(?:&&|\|\||[;|\n])\s*/u)
		.map((part) => part.replace(/^(?:\s*[A-Z_][A-Z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+)*/u, "").trim())
		.filter((part) => part !== "");
}

/**
 * Whether a script actually invokes an archboard write: a simple command that
 * begins with `archboard semantic <write>` and is not asking for help. A
 * `cat` of a recipe or an `rg` for the word "semantic edit" mentions a write
 * and performs none, and `semantic edit --help` reads.
 * @param script The unwrapped script.
 * @returns True when it writes.
 */
function invokesWrite(script: string): boolean {
	return simpleCommands(script).some(
		(command) =>
			/^archboard\s+semantic\s+(?:new|edit|branch|resolve|adopt)\b/u.test(command) &&
			!HELP_RE.test(command),
	);
}

/**
 * Whether a script reaches into a directory another run of the batch owns.
 * @param script The unwrapped script.
 * @param roots Where the batch and this run live.
 * @returns True when it names a run directory that is not this run's.
 */
function reachesAnotherRun(script: string, roots: ExposureRoots): boolean {
	const runs = `${roots.batchRoot}/runs/`;
	let at = script.indexOf(runs);
	while (at >= 0) {
		if (!script.startsWith(roots.runRoot, at)) return true;
		at = script.indexOf(runs, at + runs.length);
	}
	return false;
}

/**
 * The evaluation material a script reaches for, if any: the canonical inputs
 * by path or by their names, the harness's source, or another run's world.
 * An archboard invocation itself is never exposure, whatever paths its
 * environment carries.
 * @param script The unwrapped script.
 * @param context Where the run happened.
 * @returns The kind of exposure, or null.
 */
function exposureOf(script: string, context: ClassificationContext): ExposureKind | null {
	const roots = context.exposure;
	if (roots === undefined) return null;
	const reached: readonly [ExposureKind, boolean][] = [
		[
			"evaluation-inputs",
			script.includes(roots.evaluationInputs) || EVALUATION_INPUT_RE.test(script),
		],
		["harness-source", script.includes(roots.harnessSource) || HARNESS_SOURCE_RE.test(script)],
		["other-run", reachesAnotherRun(script, roots)],
	];
	return reached.find(([, found]) => found)?.[0] ?? null;
}

/**
 * Every command of a trace, classified with the rule that decided it.
 * @param commands The commands.
 * @param context Where the run happened.
 * @returns The classified commands, in order.
 */
function classifyCommands(
	commands: readonly CommandRecord[],
	context: ClassificationContext,
): ClassifiedCommand[] {
	return commands.map((record) => {
		const script = unwrapped(record.command);
		const decided = RULES.find((rule) => rule.test(script, context));
		return {
			...record,
			class: decided?.class ?? "ambiguous",
			rule: decided?.rule ?? "no rule matched",
			write: WRITE_RE.test(script) && invokesWrite(script),
			exposure: exposureOf(script, context),
		};
	});
}

/**
 * How many commands reached for each kind of evaluation material.
 * @param commands The classified commands.
 * @returns Counts by kind, every kind present.
 */
function exposureCounts(commands: readonly ClassifiedCommand[]): Record<ExposureKind, number> {
	const counts: Record<ExposureKind, number> = {
		"evaluation-inputs": 0,
		"harness-source": 0,
		"other-run": 0,
	};
	for (const command of commands) {
		if (command.exposure !== null) counts[command.exposure] += 1;
	}
	return counts;
}

/**
 * How many commands fell in each class.
 * @param commands The classified commands.
 * @returns Counts by class, every class present.
 */
function classCounts(commands: readonly ClassifiedCommand[]): Record<CommandClass, number> {
	const counts: Record<CommandClass, number> = {
		discovery: 0,
		operation: 0,
		"code-investigation": 0,
		setup: 0,
		ambiguous: 0,
	};
	for (const command of commands) counts[command.class] += 1;
	return counts;
}

export {
	classCounts,
	classifyCommands,
	exposureCounts,
	parseTrace,
	simpleCommands,
	unwrapped,
	usageFrom,
	type AuthorTrace,
	type ClassificationContext,
	type ClassifiedCommand,
	type CommandClass,
	type CommandRecord,
	type ExposureKind,
	type ExposureRoots,
	type FileChange,
	type Usage,
};
