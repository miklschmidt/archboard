import type { z } from "zod";
import type {
	AnyCommandContract,
	CommandOutcomeDeclaration,
	CommandContext,
	OutputCase,
	PendingArtifact,
} from "../contract.js";
import { CliUsageError } from "../contract.js";
import { CommanderArgvParser } from "./commander-adapter.js";
import { processCommandHost } from "./host.js";
import { applyHeld, commitArtifact, presentResult } from "./presentation.js";
import { requirePrerequisite } from "./prerequisites.js";

const commanderParser = new CommanderArgvParser();

function selectedCase(contract: AnyCommandContract, input: unknown): OutputCase {
	const id = contract.output.select(input as Record<string, unknown>);
	const outputCase = contract.output.cases.find((candidate) => candidate.id === id);
	if (!outputCase) throw new Error(`${contract.path.join(" ")}: unknown output case ${id}`);
	return outputCase;
}

function selectedOutcome(
	contract: AnyCommandContract,
	id: string | undefined,
): CommandOutcomeDeclaration | undefined {
	if (id === undefined) return undefined;
	const outcome = contract.outcomes?.find((candidate) => candidate.id === id);
	if (!outcome) throw new Error(`${contract.path.join(" ")}: undeclared outcome ${id}`);
	return outcome;
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
		diagnostic: (message) => processCommandHost.writeStderr(message + "\n"),
	};
	const execution = await contract.handler(input, context);
	const outcome = selectedOutcome(contract, execution.outcome);
	const outputCase = selectedCase(contract, input);
	const held = processCommandHost.held();
	const heldPolicy = outcome?.held ?? outputCase.held;
	const publicResult = applyHeld(execution.result, held, heldPolicy);
	const validatedResult = contract.result.parse(publicResult);
	const artifact = outputCase.artifact
		? outputCase.artifact.parse(execution.pendingArtifact)
		: undefined;
	commitArtifact(outputCase, artifact as PendingArtifact | undefined);
	presentResult({
		outputCase,
		result: validatedResult,
		held,
		diagnostics: execution.diagnostics ?? [],
		...(outcome ? { outcome } : {}),
	});
	if (outcome) processCommandHost.setExitCode(outcome.exit);
}
