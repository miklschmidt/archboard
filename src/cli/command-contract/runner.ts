import type { z } from "zod";
import type {
	AnyCommandContract,
	CommandContext,
	OutputCase,
	PendingArtifact,
} from "./contract.js";
import { CliUsageError } from "./contract.js";
import { CommanderArgvParser, type ArgvParser } from "./lib/commander-adapter.js";
import { processCommandHost, type CommandHost } from "./lib/host.js";
import { productionPrerequisites, type PrerequisiteResolver } from "./lib/prerequisites.js";
import { applyHeld, emitResult } from "./lib/presentation.js";

export interface CommandDependencies {
	parser: ArgvParser;
	host: CommandHost;
	prerequisites: PrerequisiteResolver;
}

const productionDependencies: CommandDependencies = {
	parser: new CommanderArgvParser(),
	host: processCommandHost,
	prerequisites: productionPrerequisites,
};

function selectedCase(contract: AnyCommandContract, input: unknown): OutputCase {
	const id = contract.output.select(input as Record<string, unknown>);
	const outputCase = contract.output.cases.find((candidate) => candidate.id === id);
	if (!outputCase) throw new Error(`${contract.path.join(" ")}: unknown output case ${id}`);
	return outputCase;
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
	const parsed = schema.safeParse(value);
	if (parsed.success) return parsed.data;
	throw new CliUsageError(parsed.error.issues[0]?.message ?? "Invalid command input");
}

export async function runCommand(
	contract: AnyCommandContract,
	argv: readonly string[],
	dependencies: CommandDependencies = productionDependencies,
): Promise<void> {
	const tokens = await dependencies.parser.parse(contract, argv);
	const input = parseInput(contract.input.ingress, tokens);
	const context: CommandContext = {
		require: (prerequisite, description) =>
			dependencies.prerequisites.require(prerequisite, description),
		readStdin: () => dependencies.host.readStdin(),
		readTextFile: (file) => dependencies.host.readTextFile(file),
		readOptionalTextFile: (file) => dependencies.host.readOptionalTextFile(file),
		resolvePath: (file) => dependencies.host.resolvePath(file),
		parse: <T>(schema: z.ZodType<T>, value: unknown) => parseInput(schema, value),
	};
	const execution = await contract.handler(input, context);
	const outputCase = selectedCase(contract, input);
	const held = dependencies.host.held();
	const publicResult = applyHeld(execution.result, held, outputCase.held);
	const validatedResult = contract.result.parse(publicResult);
	const artifact = outputCase.artifact
		? outputCase.artifact.parse(execution.pendingArtifact)
		: undefined;
	emitResult(
		dependencies.host,
		outputCase,
		validatedResult,
		artifact as PendingArtifact | undefined,
		held,
	);
}

export type { ArgvParser, CommandHost, PrerequisiteResolver };
