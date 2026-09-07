import { z } from "zod";
import type {
	AnyCommandContract,
	CommandOutcomeDeclaration,
	CommandContext,
	HeldPolicy,
	OutputCase,
} from "@/cli/command-contract/contract";
import { CliUsageError } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
import { CommanderArgvParser } from "@/cli/command-contract/lib/commander-adapter";
import { processCommandHost } from "@/cli/command-contract/lib/host";
import { applyHeld, commitArtifact, presentResult } from "@/cli/command-contract/lib/presentation";
import { requirePrerequisite } from "@/cli/command-contract/lib/prerequisites";

const commanderParser = new CommanderArgvParser();

/** Parsed command input, seen as the plain record the output policy selects on. */
const inputRecordSchema = z.record(z.string(), z.unknown());

/**
 * Finds the output case the contract's own policy selects for this input.
 * @param contract - The command contract.
 * @param input - The parsed input, which the ingress schema guarantees is an object.
 * @returns The selected output case.
 * @throws {Error} When the policy names a case the contract does not declare.
 */
function selectedCase(contract: AnyCommandContract, input: unknown): OutputCase {
	const id = contract.output.select(inputRecordSchema.parse(input));
	const outputCase = contract.output.cases.find((candidate) => candidate.id === id);
	if (!outputCase) {
		throw new Error(`${contract.path.join(" ")}: unknown output case ${id}`);
	}
	return outputCase;
}

/**
 * Resolves the outcome a handler selected, if it selected one.
 * @param contract - The command contract.
 * @param id - The outcome the handler named, or undefined for ordinary success.
 * @returns The declared outcome, or undefined.
 * @throws {Error} When the handler named an outcome the contract does not declare.
 */
function selectedOutcome(
	contract: AnyCommandContract,
	id: string | undefined,
): CommandOutcomeDeclaration | undefined {
	if (id === undefined) {
		return undefined;
	}
	const outcome = contract.outcomes?.find((candidate) => candidate.id === id);
	if (!outcome) {
		throw new Error(`${contract.path.join(" ")}: undeclared outcome ${id}`);
	}
	return outcome;
}

/**
 * Validates a value against a schema, reporting a failure as a usage error so
 * the person sees the first problem rather than a stack trace.
 * @param schema - The schema to validate against.
 * @param value - The value to validate.
 * @returns The parsed value.
 * @throws {CliUsageError} With the first issue's message when validation fails.
 */
function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
	const parsed = schema.safeParse(value);
	if (parsed.success) {
		return parsed.data;
	}
	throw new CliUsageError(parsed.error.issues[0]?.message ?? "Invalid command input");
}

/**
 * Builds the capabilities a handler is given: the process host's I/O, the
 * shared parser, and prerequisite checks memoised so a handler that asks
 * twice starts the server once.
 * @param signal - The abort signal the command runs under.
 * @returns The context handed to the handler.
 */
function createCommandContext(signal: AbortSignal): CommandContext {
	const prerequisiteCache = new Map<string, Promise<void>>();
	return {
		signal,
		/**
		 * Ensures a prerequisite, at most once per command run.
		 * @param prerequisite - What the command needs running.
		 * @param description - What the command is doing, for the refusal message.
		 * @returns The pending or already-started check.
		 */
		require(prerequisite, description) {
			const existing = prerequisiteCache.get(prerequisite);
			if (existing) {
				return existing;
			}
			const pending = requirePrerequisite(prerequisite, description);
			prerequisiteCache.set(prerequisite, pending);
			return pending;
		},
		/**
		 * Reads all of standard input.
		 * @returns The input as text, empty when standard input is a terminal.
		 */
		readStdin: () => processCommandHost.readStdin(),
		/**
		 * Reads a text file the command was pointed at.
		 * @param file - The path to read.
		 * @returns The file's contents.
		 */
		readTextFile: (file) => processCommandHost.readTextFile(file),
		/**
		 * Reads a text file that may not exist.
		 * @param file - The path to read.
		 * @returns The contents, or undefined when the file cannot be read.
		 */
		readOptionalTextFile: (file) => processCommandHost.readOptionalTextFile(file),
		/**
		 * Resolves a path against the working directory.
		 * @param file - The path as the person wrote it.
		 * @returns The absolute path.
		 */
		resolvePath: (file) => processCommandHost.resolvePath(file),
		/**
		 * Asks the person a question, taking the fallback when nothing is typed
		 * or nobody is at a terminal.
		 * @param question - What to ask.
		 * @param fallback - The answer to use when none is given.
		 * @returns The answer.
		 */
		prompt: (question, fallback) => processCommandHost.prompt(question, fallback),
		/**
		 * Validates a value mid-handler, refusing as a usage error.
		 * @param schema - The schema to validate against.
		 * @param value - The value to validate.
		 * @returns The parsed value.
		 */
		parse: <T>(schema: z.ZodType<T>, value: unknown) => parseInput(schema, value),
		/**
		 * Writes one diagnostic line to stderr.
		 * @param message - The line, without its newline.
		 */
		diagnostic: (message) => processCommandHost.writeStderr(`${message}\n`),
	};
}

/**
 * Reads the hold the run observed, validating it only when the output policy
 * will publish it; a policy of "none" carries the observation through untouched.
 * @param heldPolicy - How this output case or outcome treats a hold.
 * @returns The hold report, or null when the board is not held.
 */
function observedHold(heldPolicy: HeldPolicy): unknown {
	const observedHeld = processCommandHost.held();
	if (heldPolicy === "none" || observedHeld === null) {
		return observedHeld;
	}
	return HoldReportSchema.parse(observedHeld);
}

/**
 * Runs one command end to end: parse the argv the contract declares, hand the
 * handler its input and capabilities, then validate and present exactly what
 * the contract's output policy allows. Every result and artifact is validated
 * before anything reaches stdout.
 * @param contract - The command to run.
 * @param argv - The arguments after the command path.
 * @param signal - The abort signal the command runs under.
 */
export async function executeCommand(
	contract: AnyCommandContract,
	argv: readonly string[],
	signal: AbortSignal = new AbortController().signal,
): Promise<void> {
	const tokens = await commanderParser.parse(contract, argv);
	const input = parseInput(contract.input.ingress, tokens);
	const context = createCommandContext(signal);
	const execution = await contract.handler(input, context);
	const outcome = selectedOutcome(contract, execution.outcome);
	const outputCase = selectedCase(contract, input);
	const heldPolicy = outcome?.held ?? outputCase.held;
	const held = observedHold(heldPolicy);
	const publicResult = applyHeld(execution.result, held, heldPolicy);
	const validatedResult = contract.result.parse(publicResult);
	const artifact = outputCase.artifact
		? outputCase.artifact.parse(execution.pendingArtifact)
		: z.undefined().parse(execution.pendingArtifact);
	commitArtifact(outputCase, artifact);
	presentResult({
		outputCase,
		result: validatedResult,
		held,
		diagnostics: execution.diagnostics ?? [],
		...(outcome ? { outcome } : {}),
	});
	if (outcome) {
		processCommandHost.setExitCode(outcome.exit);
	}
}
