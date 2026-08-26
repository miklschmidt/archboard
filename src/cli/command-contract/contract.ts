import type { z } from "zod";

export class CliUsageError extends Error {
	readonly exitCode = 2;
}

export type TokenRecord = Record<string, string | boolean | string[] | undefined>;

export type TokenParameter = OptionParameter | PositionalParameter;

export interface OptionParameter {
	kind: "option";
	key: string;
	spellings: readonly [string, ...string[]];
	value: "none" | "required" | "optional";
	occurrences?: "last" | "append";
	description: string;
	route?: "value" | "stdin-or-file" | "pass-through";
}

export interface PositionalParameter {
	kind: "positional";
	key: string;
	name: string;
	repeatable?: boolean;
	description: string;
	route?: "value" | "stdin-or-file" | "pass-through";
}

export interface InputStage {
	name: string;
	when: "before-server" | "after-server" | "after-browser" | "after-read";
	description: string;
	rules?: readonly string[];
	schema: z.ZodType;
}

export interface CommandInput<Shape extends z.ZodRawShape> {
	ingress: z.ZodObject<Shape>;
	stages?: readonly InputStage[];
}

export type Prerequisite = "server" | "browser" | "board" | "doing" | "claim";
export type RuntimePrerequisite = Extract<Prerequisite, "server" | "browser">;
export type CommandEffect = "read" | "write" | "browser" | "local-read" | "local-write";

export interface RefusalContract {
	code: string;
	exit: number;
	stream: "stderr" | "stdout-and-stderr";
	description: string;
}

export interface RestRelationship {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	cardinality: "none" | "one" | "conditional" | "parallel";
	description: string;
}

export type HeldPolicy = "none" | "stderr-note" | "object-field-and-stderr-note";
export type OutputMode = "json" | "text" | "raw" | "file-receipt";

export interface OutputCondition {
	key?: string;
	present?: boolean;
}

export interface OutputCase {
	id: string;
	when: OutputCondition;
	mode: OutputMode;
	held: HeldPolicy;
	description: string;
	artifact?: z.ZodType<PendingArtifact>;
}

export interface OutputPolicy<Input> {
	cases: readonly [OutputCase, ...OutputCase[]];
	select(input: Input): string;
}

export interface PendingArtifact {
	path: string;
	content: string | Uint8Array;
	encoding: "utf8" | "binary";
}

export interface CommandExecution<Result> {
	result: Result;
	pendingArtifact?: unknown;
}

export interface CommandContext {
	require(prerequisite: RuntimePrerequisite, description: string): Promise<void>;
	readStdin(): Promise<string>;
	readTextFile(path: string): string;
	readOptionalTextFile(path: string): string | undefined;
	resolvePath(path: string): string;
	parse<T>(schema: z.ZodType<T>, value: unknown): T;
}

export interface CommandContract<Shape extends z.ZodRawShape, Result> {
	path: readonly [string, ...string[]];
	summary: string;
	usage: string;
	description: string;
	examples: readonly string[];
	parameters: readonly TokenParameter[];
	input: CommandInput<Shape>;
	result: z.ZodType<Result>;
	output: OutputPolicy<z.output<z.ZodObject<Shape>>>;
	prerequisites: readonly Prerequisite[];
	effects: readonly CommandEffect[];
	refusals: readonly RefusalContract[];
	relationships: readonly RestRelationship[];
	handler(
		input: z.output<z.ZodObject<Shape>>,
		context: CommandContext,
	): Promise<CommandExecution<Result>>;
}

export function defineCommand<Shape extends z.ZodRawShape, Result>(
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

	return contract;
}

export type AnyCommandContract = CommandContract<z.ZodRawShape, unknown>;
