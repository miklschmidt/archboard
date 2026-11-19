// One whole file of a registered checkout, and the modules of a reading that own it, for the
// code view of the code browser (ADR 0080).
//
// The text goes through the guards every quote keeps (`quoted-file.ts`). A file the guards refuse
// is not an error here: the answer says so as its source, because the modules that own the file
// are still useful. The owners and the definitions come from the server's one code check, by its
// own rule, and the owners never depend on whether the text was quoted. A request that names no
// model reads no model and no part: the answer has the text alone, with no definitions or owners.

import type { z } from "zod";
import type { CodeFileSchema } from "@archboard/code-intel/code-check";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import { codeCheck } from "#server/wiring/server-owners.ts";
import { quoteFile, type Quoted } from "#server/http/handlers/code-files/operations/quoted-file.ts";

type CodeFile = z.infer<typeof CodeFileSchema>;
type CodeFileDefinition = Extract<CodeFile["source"], { status: "quoted" }>["definitions"][number];

/** What to read. */
interface CodeFileRequest {
	readonly vault: string;
	readonly repo: string;
	readonly path: string;
	/** The canonical model, which names the owners; without it the answer has none. */
	readonly model?: string | undefined;
	readonly state?: string | undefined;
	readonly checkpoint?: string | undefined;
	readonly ref?: string | undefined;
	/** Ends the reading when the request is abandoned. */
	readonly signal: AbortSignal;
}

/** The file, or why the route has no answer. */
type CodeFileOutcome =
	| { readonly kind: "answer"; readonly answer: CodeFile }
	| { readonly kind: "repository-unavailable"; readonly error: string }
	| {
			readonly kind: "model-refused";
			readonly refusal: Extract<ArchitectureModelRead, { success: false }>;
	  };

/**
 * The source of the answer.
 * @param quoted What the guards let through, or why not.
 * @param definitions The definitions of the quoted text.
 * @returns The quoted text, or the refusal.
 */
function sourceOf(quoted: Quoted, definitions: readonly CodeFileDefinition[]): CodeFile["source"] {
	if (quoted.ok) return { status: "quoted", text: quoted.text, definitions: [...definitions] };
	const code = quoted.code === "SOURCE_UNAVAILABLE" ? "SOURCE_UNAVAILABLE" : "SOURCE_REFUSED";
	return { status: "refused", code, error: quoted.error };
}

/**
 * Read one file, and its owners where a model is named.
 * @param request The file and the reading of the model that names its owners.
 * @returns The answer, or the refusal of the repository or of the model read.
 */
async function readCodeFile(request: CodeFileRequest): Promise<CodeFileOutcome> {
	const { vault, repo, path, signal } = request;
	const quoted = await quoteFile(vault, { repo, path }, signal);
	if (!quoted.ok && quoted.code === "REPOSITORY_UNAVAILABLE") {
		return { kind: "repository-unavailable", error: quoted.error };
	}
	if (request.model === undefined) {
		return { kind: "answer", answer: { repo, path, source: sourceOf(quoted, []) } };
	}
	const reading = await codeCheck.fileOwners({
		...request,
		text: quoted.ok ? quoted.text : undefined,
	});
	if (!reading.success) return { kind: "model-refused", refusal: reading };
	const source = sourceOf(quoted, reading.definitions);
	return { kind: "answer", answer: { repo, path, source, owners: reading.owners } };
}

export { readCodeFile };
