import { z } from "zod";
import type { HeldPolicy, OutputCase, PendingArtifact } from "../contract.js";
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

export function emitResult(
	outputCase: OutputCase,
	result: unknown,
	artifact: PendingArtifact | undefined,
	held: unknown,
): void {
	if (outputCase.mode === "file-receipt") {
		if (!artifact) throw new Error("File output did not provide a pending artifact");
		processCommandHost.writeArtifact(artifact);
	}

	if (outputCase.mode === "json" || outputCase.mode === "file-receipt") {
		processCommandHost.writeStdout(JSON.stringify(result, null, 2) + "\n");
	} else {
		const content = z.union([z.string(), z.instanceof(Uint8Array)]).parse(result);
		processCommandHost.writeStdout(typeof content === "string" ? content + "\n" : content);
	}

	if (outputCase.held !== "none") {
		const message = heldMessage(held);
		if (message) processCommandHost.writeStderr(message + "\n");
	}
}
