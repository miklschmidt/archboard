import type { z } from "zod";

class CliUsageError extends Error {
	readonly exitCode = 2;
}

type TokenRecord = Record<string, string | boolean | string[] | undefined>;

type TokenParameter = OptionParameter | PositionalParameter;

interface OptionParameter {
	kind: "option";
	key: string;
	spellings: readonly [string, ...string[]];
	value: "none" | "required" | "optional";
	occurrences?: "last" | "append";
	description: string;
	route?: "value" | "stdin-or-file" | "pass-through" | "staged-tokens";
}

interface PositionalParameter {
	kind: "positional";
	key: string;
	name: string;
	repeatable?: boolean;
	description: string;
	route?: "value" | "stdin-or-file" | "pass-through" | "staged-tokens";
}

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

type HeldPolicy = "none" | "stderr-note" | "object-field-and-stderr-note";
type OutputMode = "json" | "text" | "raw" | "file-receipt";

interface OutputCondition {
	key?: string;
	present?: boolean;
}

interface OutputCase {
	id: string;
	when: OutputCondition;
	mode: OutputMode;
	held: HeldPolicy;
	description: string;
	presentation?: readonly [OutcomePresentationStep, ...OutcomePresentationStep[]];
	artifact?: z.ZodType<PendingArtifact>;
}

interface OutputPolicy<Input> {
	cases: readonly [OutputCase, ...OutputCase[]];
	select(input: Input): string;
}

type OutcomeStreamPolicy = "stdout-only" | "stderr-only" | "stdout-and-stderr";
type OutcomePresentationStep = "diagnostics" | "result" | "held-note" | "continuation";

/** A public, declared nonzero command result. Ordinary success is always exit 0. */
interface CommandOutcomeDeclaration {
	id: string;
	exit: number;
	description: string;
	stream: OutcomeStreamPolicy;
	held: HeldPolicy;
	presentation: readonly [OutcomePresentationStep, ...OutcomePresentationStep[]];
}

type PendingArtifact =
	| { path: string; content: string; encoding: "utf8" }
	| { path: string; content: Uint8Array; encoding: "binary" }
	| {
			path: string;
			encoding: "files";
			files: Array<{ name: string; content: Uint8Array }>;
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
	require(prerequisite: RuntimePrerequisite, description: string): Promise<void>;
	readStdin(): Promise<string>;
	readTextFile(path: string): string;
	readOptionalTextFile(path: string): string | undefined;
	resolvePath(path: string): string;
	prompt(question: string, fallback: string): Promise<string>;
	parse<T>(schema: z.ZodType<T>, value: unknown): T;
	/** The sole lane that may write a diagnostic before public result validation. */
	diagnostic(message: string): void;
}

interface CommandContract<Shape extends z.ZodRawShape, Result> {
	path: readonly [string, ...string[]];
	summary: string;
	usage: string;
	description: string;
	examples: readonly string[];
	parameters: readonly TokenParameter[];
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

function defineCommand<Shape extends z.ZodRawShape, Result>(
	contract: CommandContract<Shape, Result>,
): CommandContract<Shape, Result> {
	const inputKeys = new Set(Object.keys(contract.input.ingress.shape));
	const spellings = new Set<string>();
	let sawRepeatablePositional = false;

	for (const parameter of contract.parameters) {
		if (!inputKeys.has(parameter.key)) {
			throw new Error(`${contract.path.join(" ")}: token ${parameter.key} has no Zod ingress key`);
		}
		if (parameter.kind === "option") {
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
			continue;
		}

		if (sawRepeatablePositional) {
			throw new Error(`${contract.path.join(" ")}: no positional may follow a repeatable one`);
		}
		sawRepeatablePositional = parameter.repeatable === true;
	}

	for (const outputCase of contract.output.cases) {
		if (outputCase.mode === "file-receipt" && !outputCase.artifact) {
			throw new Error(`${contract.path.join(" ")}: file output ${outputCase.id} needs a schema`);
		}
		if (outputCase.mode !== "file-receipt" && outputCase.artifact) {
			throw new Error(`${contract.path.join(" ")}: only file output may declare an artifact`);
		}
	}

	const outcomeIds = new Set<string>();
	for (const outcome of contract.outcomes ?? []) {
		if (outcomeIds.has(outcome.id)) {
			throw new Error(`${contract.path.join(" ")}: duplicate outcome ${outcome.id}`);
		}
		outcomeIds.add(outcome.id);
		if (!Number.isInteger(outcome.exit) || outcome.exit <= 0) {
			throw new Error(`${contract.path.join(" ")}: outcome ${outcome.id} needs a nonzero exit`);
		}
		const writesStdout = outcome.presentation.includes("result");
		const writesStderr = outcome.presentation.some((step) => step !== "result");
		if (outcome.stream === "stdout-only" && (!writesStdout || writesStderr)) {
			throw new Error(`${contract.path.join(" ")}: outcome ${outcome.id} violates stdout-only`);
		}
		if (outcome.stream === "stderr-only" && (writesStdout || !writesStderr)) {
			throw new Error(`${contract.path.join(" ")}: outcome ${outcome.id} violates stderr-only`);
		}
		if (outcome.stream === "stdout-and-stderr" && (!writesStdout || !writesStderr)) {
			throw new Error(`${contract.path.join(" ")}: outcome ${outcome.id} needs both streams`);
		}
	}

	return contract;
}

type AnyCommandContract = CommandContract<z.ZodRawShape, unknown>;

export {
	CliUsageError,
	type TokenRecord,
	type TokenParameter,
	type OptionParameter,
	type PositionalParameter,
	type InputStage,
	type CommandInput,
	type Prerequisite,
	type RuntimePrerequisite,
	type CommandEffect,
	type RefusalContract,
	type RestRelationship,
	type HeldPolicy,
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
