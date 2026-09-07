import { z } from "zod";
import type {
	CommandOutcomeDeclaration,
	HeldPolicy,
	OutcomePresentationStep,
	OutputCase,
	PendingArtifact,
} from "@/cli/command-contract/contract";
import { processCommandHost } from "@/cli/command-contract/lib/host";

/** What a presentation step is given: the validated result and its surroundings. */
interface Presentation {
	outputCase: OutputCase;
	result: unknown;
	held: unknown;
	diagnostics: readonly string[];
	outcome?: CommandOutcomeDeclaration;
}

const heldNoteSchema = z.object({ message: z.string() });
const heldBoardSchema = z.object({ board: z.string() });
const resultObjectSchema = z.record(z.string(), z.unknown());

/**
 * Reads the note a hold carries, if it carries one.
 * @param held - The observed hold, of whatever shape.
 * @returns The note, or null when the hold has none.
 */
function heldMessage(held: unknown): string | null {
	const note = heldNoteSchema.safeParse(held);
	return note.success ? note.data.message : null;
}

/**
 * Adds the hold to an object result when the output policy publishes it there.
 * A non-object result is never reshaped: the policy's field has nowhere to go.
 * @param result - The handler's result.
 * @param held - The observed hold.
 * @param policy - How this output case or outcome treats a hold.
 * @returns The result the contract's result schema will validate.
 */
function applyHeld(result: unknown, held: unknown, policy: HeldPolicy): unknown {
	if (policy !== "object-field-and-stderr-note" || !held) {
		return result;
	}
	const object = resultObjectSchema.safeParse(result);
	if (!object.success || Array.isArray(result)) {
		return result;
	}
	return { ...object.data, held };
}

/**
 * Writes the validated public result to stdout in the case's own mode.
 * @param outputCase - The selected output case.
 * @param result - The validated result.
 */
function emitPublicResult(outputCase: OutputCase, result: unknown): void {
	if (outputCase.mode === "json" || outputCase.mode === "file-receipt") {
		processCommandHost.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
	} else {
		const content = z.union([z.string(), z.instanceof(Uint8Array)]).parse(result);
		processCommandHost.writeStdout(typeof content === "string" ? `${content}\n` : content);
	}
}

/**
 * Writes one diagnostic line to stderr.
 * @param message - The line, without its newline.
 */
function emitDiagnostic(message: string): void {
	processCommandHost.writeStderr(`${message}\n`);
}

/**
 * Tells the person what a held board means for what happens next: the canvas
 * keeps their changes and the note gets none of them until the hold is resolved.
 * @param held - The observed hold.
 */
function emitContinuation(held: unknown): void {
	const holding = heldBoardSchema.safeParse(held);
	if (!holding.success) {
		return;
	}
	emitDiagnostic(
		`"${holding.data.board}" has stopped saving. Changes from here are held on the canvas ` +
			"and reach no note until one of those three is run.",
	);
}

/**
 * Writes a file-receipt case's artifact, which the output policy validated.
 * @param outputCase - The selected output case.
 * @param artifact - The validated artifact, if the handler produced one.
 * @throws {Error} When a file output produced no artifact to commit.
 */
function commitArtifact(outputCase: OutputCase, artifact: PendingArtifact | undefined): void {
	if (outputCase.mode !== "file-receipt") {
		return;
	}
	if (!artifact) {
		throw new Error("File output did not provide a pending artifact");
	}
	processCommandHost.writeArtifact(artifact);
}

/** One writer per declared presentation step; the order comes from the contract. */
const STEP_EMITTERS: Readonly<Record<OutcomePresentationStep, (input: Presentation) => void>> = {
	/**
	 * Writes the handler's deferred diagnostics.
	 * @param input - The presentation.
	 */
	diagnostics: (input) => {
		for (const diagnostic of input.diagnostics) {
			emitDiagnostic(diagnostic);
		}
	},
	/**
	 * Writes the public result.
	 * @param input - The presentation.
	 */
	result: (input) => {
		emitPublicResult(input.outputCase, input.result);
	},
	/**
	 * Writes the hold's own note, when it has one.
	 * @param input - The presentation.
	 */
	"held-note": (input) => {
		const message = heldMessage(input.held);
		if (message) {
			emitDiagnostic(message);
		}
	},
	/**
	 * Writes what a hold means for what happens next.
	 * @param input - The presentation.
	 */
	continuation: (input) => {
		emitContinuation(input.held);
	},
};

/**
 * Writes everything one command run publishes, in the order the outcome or
 * output case declares. A case that declares no order writes its result and,
 * unless it ignores holds, the hold note after it.
 * @param input - The validated result with its hold, diagnostics and selected case.
 */
function presentResult(input: Presentation): void {
	const steps: readonly OutcomePresentationStep[] =
		input.outcome?.presentation ??
		input.outputCase.presentation ??
		(input.outputCase.held === "none" ? ["result"] : ["result", "held-note"]);
	for (const step of steps) {
		STEP_EMITTERS[step](input);
	}
}

export { applyHeld, commitArtifact, presentResult };
