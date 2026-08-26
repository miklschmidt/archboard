import type { z } from "zod";
import type {
	AnyCommandContract,
	CommandContext,
	OutputCase,
	PendingArtifact,
} from "../contract.js";
import { CliUsageError } from "../contract.js";
import { CommanderArgvParser } from "./commander-adapter.js";
import { processCommandHost } from "./host.js";
import { applyHeld, emitResult } from "./presentation.js";
import { requirePrerequisite } from "./prerequisites.js";

const commanderParser = new CommanderArgvParser();

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

export async function executeCommand(
	contract: AnyCommandContract,
	argv: readonly string[],
): Promise<void> {
	const tokens = await commanderParser.parse(contract, argv);
	const input = parseInput(contract.input.ingress, tokens);
	const context: CommandContext = {
		require: requirePrerequisite,
		readStdin: () => processCommandHost.readStdin(),
		readTextFile: (file) => processCommandHost.readTextFile(file),
		readOptionalTextFile: (file) => processCommandHost.readOptionalTextFile(file),
		resolvePath: (file) => processCommandHost.resolvePath(file),
		parse: <T>(schema: z.ZodType<T>, value: unknown) => parseInput(schema, value),
	};
	const execution = await contract.handler(input, context);
	const outputCase = selectedCase(contract, input);
	const held = processCommandHost.held();
	const publicResult = applyHeld(execution.result, held, outputCase.held);
	const validatedResult = contract.result.parse(publicResult);
	const artifact = outputCase.artifact
		? outputCase.artifact.parse(execution.pendingArtifact)
		: undefined;
	emitResult(outputCase, validatedResult, artifact as PendingArtifact | undefined, held);
}
