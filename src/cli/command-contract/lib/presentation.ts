import { z } from "zod";
import type {
	CommandOutcomeDeclaration,
	HeldPolicy,
	OutcomePresentationStep,
	OutputCase,
	PendingArtifact,
} from "../contract.js";
import { processCommandHost } from "./host.js";

const heldMessage = (held: unknown): string | null => {
	if (!held || typeof held !== "object") return null;
	const message = (held as { message?: unknown }).message;
	return typeof message === "string" ? message : null;
};

export function applyHeld(result: unknown, held: unknown, policy: HeldPolicy): unknown {
	if (policy !== "object-field-and-stderr-note" || !held) return result;
	if (!result || typeof result !== "object" || Array.isArray(result)) return result;
	return { ...(result as Record<string, unknown>), held };
}

function emitPublicResult(outputCase: OutputCase, result: unknown): void {
	if (outputCase.mode === "json" || outputCase.mode === "file-receipt") {
		processCommandHost.writeStdout(JSON.stringify(result, null, 2) + "\n");
	} else {
		const content = z.union([z.string(), z.instanceof(Uint8Array)]).parse(result);
		processCommandHost.writeStdout(typeof content === "string" ? content + "\n" : content);
	}
}

const emitDiagnostic = (message: string): void => processCommandHost.writeStderr(message + "\n");

function emitContinuation(held: unknown): void {
	if (!held || typeof held !== "object") return;
	const board = (held as { board?: unknown }).board;
	if (typeof board !== "string") return;
	emitDiagnostic(
		`"${board}" has stopped saving. Changes from here are held on the canvas ` +
			"and reach no note until one of those three is run.",
	);
}

export function commitArtifact(
	outputCase: OutputCase,
	artifact: PendingArtifact | undefined,
): void {
	if (outputCase.mode !== "file-receipt") return;
	if (!artifact) throw new Error("File output did not provide a pending artifact");
	processCommandHost.writeArtifact(artifact);
}

export function presentResult(input: {
	outputCase: OutputCase;
	result: unknown;
	held: unknown;
	diagnostics: readonly string[];
	outcome?: CommandOutcomeDeclaration;
}): void {
	const steps: readonly OutcomePresentationStep[] = input.outcome?.presentation ?? [
		"result",
		"held-note",
	];
	for (const step of steps) {
		switch (step) {
			case "diagnostics":
				for (const diagnostic of input.diagnostics) emitDiagnostic(diagnostic);
				break;
			case "result":
				emitPublicResult(input.outputCase, input.result);
				break;
			case "held-note": {
				const message = heldMessage(input.held);
				if (message) emitDiagnostic(message);
				break;
			}
			case "continuation":
				emitContinuation(input.held);
				break;
		}
	}
}
