import type { z } from "zod";

class CliUsageError extends Error {
	readonly exitCode = 2;
}

type TokenRecord = Record<string, string | boolean | string[] | undefined>;

type TokenParameter = OptionParameter | PositionalParameter;

/**
 * How a parameter reaches the handler. `value` is the ordinary parsed token;
 * `stdin-or-file` and `pass-through` say what the value stands for; a
 * `staged-tokens` collection is the raw tail a staged command validates only
 * after its prerequisites, and a `staged` parameter is one the person may
 * write inside that tail — declared here so help and introspection know it,
 * parsed by the stage rather than by the ordinary parser.
 */
type ParameterRoute = "value" | "stdin-or-file" | "pass-through" | "staged-tokens" | "staged";

interface OptionParameter {
	kind: "option";
	key: string;
	spellings: readonly [string, ...string[]];
	value: "none" | "required" | "optional";
	occurrences?: "last" | "append";
	description: string;
	route?: ParameterRoute;
	/** What the value stands for in help, without brackets; `value` when absent. */
	placeholder?: string;
	/** Whether the option must be present. Distinct from `value`, which says a present option needs a value. */
	required?: boolean;
	/** When the option is required, in words, for an option that is required only sometimes. */
	requiredWhen?: string;
	/** The only values the option accepts, when it accepts a closed set. */
	choices?: readonly string[];
	/** The value in effect when the option is absent, when there is one worth saying. */
	default?: string;
	/** Parsed but never advertised: a tail the command ignores and no person should write. */
	hidden?: boolean;
	/** Shared options that do not apply when this local option is present. */
	excludesShared?: readonly SharedOptionKey[];
}

interface PositionalParameter {
	kind: "positional";
	key: string;
	name: string;
	repeatable?: boolean;
	description: string;
	route?: ParameterRoute;
	/** Whether the argument must be given. */
	required?: boolean;
	/** What the argument stands for in help, when `name` is not the whole story. */
	placeholder?: string;
	/** Parsed but never advertised: a tail the command ignores and no person should write. */
	hidden?: boolean;
}

/**
 * The options every command may share, and which one command actually reads.
 *
 * They are stripped by routing before a command's own parser sees them, so a
 * command that does nothing with one would otherwise accept it in silence. A
 * command lists the ones it reads; any other is refused as a usage error.
 */
type SharedOptionKey = "url" | "board" | "doing" | "expect-version" | "as-session";

interface InputStage {
	name: string;
	when: "before-server" | "after-server" | "after-browser" | "after-read";
	description: string;
	rules?: readonly string[];
	schema: z.ZodType;
}

interface CommandInput<Shape extends z.ZodRawShape> {
	ingress: z.ZodObject<Shape>;
	stages?: readonly InputStage[];
}

type Prerequisite = "server" | "browser" | "board" | "doing" | "claim";
type RuntimePrerequisite = Extract<Prerequisite, "server" | "browser">;
type CommandEffect =
	| "read"
	| "write"
	| "server-state-write"
	| "browser"
	| "local-read"
	| "local-write";

interface RefusalContract {
	code: string;
	exit: number;
	stream: "stderr" | "stdout-and-stderr";
	description: string;
}

interface RestRelationship {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	cardinality: "none" | "one" | "conditional" | "parallel";
	description: string;
}

type OutputMode = "json" | "text" | "raw" | "file-receipt";

interface OutputCondition {
	key?: string;
	present?: boolean;
}

interface OutputCase {
	id: string;
	when: OutputCondition;
	mode: OutputMode;
	description: string;
	presentation?: readonly [OutcomePresentationStep, ...OutcomePresentationStep[]];
	artifact?: z.ZodType<PendingArtifact>;
}

interface OutputPolicy<Input> {
	cases: readonly [OutputCase, ...OutputCase[]];
	select(input: Input): string;
}

type OutcomeStreamPolicy = "stdout-only" | "stderr-only" | "stdout-and-stderr";
type OutcomePresentationStep = "diagnostics" | "result";

/** A public, declared nonzero command result. Ordinary success is always exit 0. */
interface CommandOutcomeDeclaration {
	id: string;
	exit: number;
	description: string;
	stream: OutcomeStreamPolicy;
	presentation: readonly [OutcomePresentationStep, ...OutcomePresentationStep[]];
}

type PendingArtifact =
	| { path: string; content: string; encoding: "utf8" }
	| { path: string; content: Uint8Array; encoding: "binary" }
	| {
			path: string;
			encoding: "files";
			files: { name: string; content: Uint8Array }[];
			manifest: { name: "manifest.json"; content: string };
	  };

interface CommandExecution<Result> {
	result: Result;
	/** Selects one public declaration; it carries no policy of its own. */
	outcome?: string;
	/** Deferred diagnostic content, presented only after result and artifact validation. */
	diagnostics?: readonly string[];
	pendingArtifact?: unknown;
}

interface CommandContext {
	readonly signal: AbortSignal;
	readonly require: (prerequisite: RuntimePrerequisite, description: string) => Promise<void>;
	readonly readStdin: () => Promise<string>;
	readonly readTextFile: (path: string) => string;
	readonly readOptionalTextFile: (path: string) => string | undefined;
	readonly resolvePath: (path: string) => string;
	readonly prompt: (question: string, fallback: string) => Promise<string>;
	readonly parse: <T>(schema: z.ZodType<T>, value: unknown) => T;
	/** The sole lane that may write a diagnostic before public result validation. */
	readonly diagnostic: (message: string) => void;
}

interface CommandContract<Shape extends z.ZodRawShape, Result> {
	path: readonly [string, ...string[]];
	summary: string;
	description: string;
	examples: readonly string[];
	parameters: readonly TokenParameter[];
	/** The shared options this command reads; every other one is refused. */
	shared: readonly SharedOptionKey[];
	input: CommandInput<Shape>;
	result: z.ZodType<Result>;
	output: OutputPolicy<z.output<z.ZodObject<Shape>>>;
	outcomes?: readonly CommandOutcomeDeclaration[];
	prerequisites: readonly Prerequisite[];
	effects: readonly CommandEffect[];
	refusals: readonly RefusalContract[];
	relationships: readonly RestRelationship[];
	handler(
		input: z.output<z.ZodObject<Shape>>,
		context: CommandContext,
	): Promise<CommandExecution<Result>>;
}

/** Which streams each policy insists an outcome write, and what to say when it does not. */
const STREAM_REQUIREMENTS: Readonly<
	Record<OutcomeStreamPolicy, { stdout: boolean; stderr: boolean; complaint: string }>
> = {
	"stdout-only": { stdout: true, stderr: false, complaint: "violates stdout-only" },
	"stderr-only": { stdout: false, stderr: true, complaint: "violates stderr-only" },
	"stdout-and-stderr": { stdout: true, stderr: true, complaint: "needs both streams" },
};

/**
 * Refuses an option whose spelling another parameter already claims, or one
 * that collects repeats without taking a value to collect.
 * @param contract - The contract being defined.
 * @param parameter - The option to check.
 * @param spellings - Spellings claimed so far; this option's are added to it.
 * @throws {Error} When a spelling is claimed twice, or an append option takes no value.
 */
function assertOptionSpellings(
	contract: CommandContract<z.ZodRawShape, unknown>,
	parameter: OptionParameter,
	spellings: Set<string>,
): void {
	for (const spelling of parameter.spellings) {
		if (spellings.has(spelling)) {
			throw new Error(`${contract.path.join(" ")}: duplicate token spelling ${spelling}`);
		}
		spellings.add(spelling);
	}
	if (parameter.occurrences === "append" && parameter.value === "none") {
		throw new Error(
			`${contract.path.join(" ")}: append option ${parameter.spellings[0]} needs a value`,
		);
	}
}

/**
 * Refuses option facts that contradict each other: a default or a choice list
 * on an option that takes no value, a default outside its own choices, and a
 * conditional requirement on an option that is always required.
 * @param contract - The contract being defined.
 * @param parameter - The option to check.
 * @throws {Error} Naming the first contradiction.
 */
function assertOptionFacts(
	contract: CommandContract<z.ZodRawShape, unknown>,
	parameter: OptionParameter,
): void {
	const contradiction = optionContradiction(parameter);
	if (contradiction !== null) {
		throw new Error(
			`${contract.path.join(" ")}: option ${parameter.spellings[0]} ${contradiction}`,
		);
	}
}

/**
 * Refuses an option that excludes a shared option the command never declared.
 * @param contract - The contract being defined.
 * @param parameter - The local option with conditional exclusions.
 */
function assertExcludedShared(
	contract: CommandContract<z.ZodRawShape, unknown>,
	parameter: OptionParameter,
): void {
	for (const excluded of parameter.excludesShared ?? []) {
		if (!contract.shared.includes(excluded)) {
			throw new Error(
				`${contract.path.join(" ")}: option ${parameter.spellings[0]} excludes undeclared shared option ${excluded}`,
			);
		}
	}
}

/**
 * The first way an option's facts contradict each other, in words.
 * @param parameter - The option.
 * @returns The contradiction, or null when the facts agree.
 */
function optionContradiction(parameter: OptionParameter): string | null {
	const found = CONTRADICTIONS.find(([holds]) => holds(parameter));
	return found === undefined ? null : found[1];
}

/**
 * Whether an option that takes no value carries a default or choices anyway.
 * @param parameter - The option.
 * @returns True when it does.
 */
function valuelessButValued(parameter: OptionParameter): boolean {
	return (
		parameter.value === "none" &&
		(parameter.default !== undefined || parameter.choices !== undefined)
	);
}

/**
 * Whether an option's default is not one of its own choices.
 * @param parameter - The option.
 * @returns True when it is not.
 */
function defaultOutsideChoices(parameter: OptionParameter): boolean {
	return (
		parameter.default !== undefined && parameter.choices?.includes(parameter.default) === false
	);
}

/**
 * Whether an option is declared both always required and required only sometimes.
 * @param parameter - The option.
 * @returns True when it is.
 */
function requiredBothWays(parameter: OptionParameter): boolean {
	return parameter.required === true && parameter.requiredWhen !== undefined;
}

/** Each way an option's facts can contradict each other, and the words for it. */
const CONTRADICTIONS: readonly (readonly [(parameter: OptionParameter) => boolean, string])[] = [
	[valuelessButValued, "takes no value, so it can have no default or choices"],
	[defaultOutsideChoices, "defaults to a value outside its choices"],
	[requiredBothWays, "is always required, so it cannot also be required only sometimes"],
];

/**
 * Refuses parameters the ingress schema cannot receive, duplicate option
 * spellings, and a positional after a repeatable one, which could never be
 * given a value of its own.
 * @param contract - The contract being defined.
 * @throws {Error} Naming the first parameter that breaks one of those rules.
 */
function assertParameters(contract: CommandContract<z.ZodRawShape, unknown>): void {
	const inputKeys = new Set(Object.keys(contract.input.ingress.shape));
	const spellings = new Set<string>();
	let sawRepeatablePositional = false;
	for (const parameter of contract.parameters) {
		// A staged parameter arrives inside the staged token collection, so it
		// has no ingress key of its own: the collection's key receives it.
		if (parameter.route !== "staged" && !inputKeys.has(parameter.key)) {
			throw new Error(`${contract.path.join(" ")}: token ${parameter.key} has no Zod ingress key`);
		}
		if (parameter.kind === "option") {
			assertOptionSpellings(contract, parameter, spellings);
			assertOptionFacts(contract, parameter);
			assertExcludedShared(contract, parameter);
			continue;
		}
		if (parameter.route === "staged") {
			continue;
		}
		sawRepeatablePositional = positionalAfter(contract, parameter, sawRepeatablePositional);
	}
}

/**
 * Refuses a positional after a repeatable one, which could never be given a
 * value of its own, and says whether this one is repeatable for the next.
 * @param contract - The contract being defined.
 * @param parameter - The positional.
 * @param sawRepeatable - Whether a repeatable positional came before it.
 * @returns Whether a repeatable positional has now been seen.
 * @throws {Error} When a positional follows a repeatable one.
 */
function positionalAfter(
	contract: CommandContract<z.ZodRawShape, unknown>,
	parameter: PositionalParameter,
	sawRepeatable: boolean,
): boolean {
	if (sawRepeatable) {
		throw new Error(`${contract.path.join(" ")}: no positional may follow a repeatable one`);
	}
	return parameter.repeatable === true;
}

/**
 * Refuses an output case that writes a file without a schema to validate it,
 * or declares an artifact it will never write.
 * @param contract - The contract being defined.
 * @throws {Error} Naming the first case that does either.
 */
function assertOutputCases(contract: CommandContract<z.ZodRawShape, unknown>): void {
	for (const outputCase of contract.output.cases) {
		if (outputCase.mode === "file-receipt" && !outputCase.artifact) {
			throw new Error(`${contract.path.join(" ")}: file output ${outputCase.id} needs a schema`);
		}
		if (outputCase.mode !== "file-receipt" && outputCase.artifact) {
			throw new Error(`${contract.path.join(" ")}: only file output may declare an artifact`);
		}
	}
}

/**
 * Refuses an outcome whose presentation does not write the streams its own
 * stream policy promises.
 * @param contract - The contract being defined.
 * @param outcome - The outcome to check.
 * @throws {Error} When the presentation and the stream policy disagree.
 */
function assertOutcomeStream(
	contract: CommandContract<z.ZodRawShape, unknown>,
	outcome: CommandOutcomeDeclaration,
): void {
	const required = STREAM_REQUIREMENTS[outcome.stream];
	const writesStdout = outcome.presentation.includes("result");
	const writesStderr = outcome.presentation.some((step) => step !== "result");
	if (writesStdout !== required.stdout || writesStderr !== required.stderr) {
		throw new Error(`${contract.path.join(" ")}: outcome ${outcome.id} ${required.complaint}`);
	}
}

/**
 * Refuses duplicate outcome ids, an outcome that claims exit 0 (ordinary
 * success is never a declared outcome), and one whose streams do not match
 * its policy.
 * @param contract - The contract being defined.
 * @throws {Error} Naming the first outcome that breaks one of those rules.
 */
function assertOutcomes(contract: CommandContract<z.ZodRawShape, unknown>): void {
	const outcomeIds = new Set<string>();
	for (const outcome of contract.outcomes ?? []) {
		if (outcomeIds.has(outcome.id)) {
			throw new Error(`${contract.path.join(" ")}: duplicate outcome ${outcome.id}`);
		}
		outcomeIds.add(outcome.id);
		if (!Number.isInteger(outcome.exit) || outcome.exit <= 0) {
			throw new Error(`${contract.path.join(" ")}: outcome ${outcome.id} needs a nonzero exit`);
		}
		assertOutcomeStream(contract, outcome);
	}
}

/**
 * Checks a command contract against the rules a contract must satisfy before
 * anything can run it, and returns it unchanged. Declaring a command through
 * this function is what makes those rules a definition-time failure rather
 * than something a person meets at the command line.
 * @param contract - The contract to check.
 * @returns The same contract.
 * @throws {Error} Naming the first rule the contract breaks.
 */
function defineCommand<Shape extends z.ZodRawShape, Result>(
	contract: CommandContract<Shape, Result>,
): CommandContract<Shape, Result> {
	assertParameters(contract);
	assertOutputCases(contract);
	assertOutcomes(contract);
	return contract;
}

type AnyCommandContract = CommandContract<z.ZodRawShape, unknown>;

export {
	CliUsageError,
	type TokenRecord,
	type TokenParameter,
	type ParameterRoute,
	type SharedOptionKey,
	type OptionParameter,
	type PositionalParameter,
	type InputStage,
	type CommandInput,
	type Prerequisite,
	type RuntimePrerequisite,
	type CommandEffect,
	type RefusalContract,
	type RestRelationship,
	type OutputMode,
	type OutputCondition,
	type OutputCase,
	type OutputPolicy,
	type OutcomeStreamPolicy,
	type OutcomePresentationStep,
	type CommandOutcomeDeclaration,
	type PendingArtifact,
	type CommandExecution,
	type CommandContext,
	type CommandContract,
	defineCommand,
	type AnyCommandContract,
};
