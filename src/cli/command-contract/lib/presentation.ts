import { z } from "zod";
import type {
	CommandOutcomeDeclaration,
	OutcomePresentationStep,
	OutputCase,
	PendingArtifact,
} from "@/cli/command-contract/contract";
import { processCommandHost } from "@/cli/command-contract/lib/host";

/** What a presentation step is given: the validated result and its surroundings. */
interface Presentation {
	outputCase: OutputCase;
	result: unknown;
	diagnostics: readonly string[];
	outcome?: CommandOutcomeDeclaration;
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
};

/**
 * Writes everything one command run publishes, in the order the outcome or
 * output case declares. A case that declares no order writes its result.
 * @param input - The validated result with its diagnostics and selected case.
 */
function presentResult(input: Presentation): void {
	const steps: readonly OutcomePresentationStep[] = input.outcome?.presentation ??
		input.outputCase.presentation ?? ["result"];
	for (const step of steps) {
		STEP_EMITTERS[step](input);
	}
}

export { commitArtifact, presentResult };
