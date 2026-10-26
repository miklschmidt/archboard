// What `check code`, `check` and `check all` ask the code check route for: the
// options that say what the code check reads, and the request that carries them
// to the Archboard server (ADR 0046).

import path from "node:path";
import { z } from "zod";
import { requestJson } from "@archboard/server-lifecycle/server-client";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@archboard/code-intel/code-check";

/** What the code check reads: `--variant`, `--every-draft`, `--plan` and `--exposed`. */
const CodeCheckInputSchema = z.object({
	variant: z.string().optional(),
	everyDraft: z.boolean().optional(),
	plan: z.array(z.string()).optional(),
	exposed: z.boolean().optional(),
});
type CodeCheckInput = z.output<typeof CodeCheckInputSchema>;

/** The code check's switches, by the input key that asks for each and the query flag it sends. */
const CODE_CHECK_FLAGS = [
	["everyDraft", "every-draft"],
	["exposed", "exposed"],
] as const;

/**
 * The query that asks the code check route for one reading.
 * @param reading What to read.
 * @param reading.variant The draft to read on every board that has one.
 * @param reading.everyDraft Whether to read every draft of every board.
 * @param reading.exposed Whether the answer keeps the exposed names of each judged container.
 * @param reading.plan The plan JSON files named, resolved against this directory,
 * because the server runs elsewhere.
 * @returns The query, with its `?`, or nothing.
 */
function codeCheckQuery(reading: CodeCheckInput): string {
	const asked = new URLSearchParams([
		...(reading.variant === undefined ? [] : [["variant", reading.variant]]),
		...CODE_CHECK_FLAGS.filter(([key]) => reading[key] === true).map(([, flag]) => [flag, "true"]),
		...(reading.plan ?? []).map((plan) => ["plan", path.resolve(plan)]),
	]);
	return asked.size === 0 ? "" : `?${asked}`;
}

/**
 * Run the code check on the Archboard server.
 * @param reading What to read.
 * @param signal Cancels the request, which cancels the check.
 * @returns Its answer.
 */
async function codeCheckOnServer(
	reading: CodeCheckInput,
	signal: AbortSignal,
): Promise<CodeCheckAnswer> {
	return CodeCheckAnswerSchema.parse(
		await requestJson<unknown>(`/api/vault/code-check${codeCheckQuery(reading)}`, { signal }),
	);
}

export { CodeCheckInputSchema, codeCheckOnServer, type CodeCheckInput };
