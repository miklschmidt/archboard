// One question with a list of answers, for a person at a terminal. It writes to stderr, so that
// stdout stays the command's result.

import { isCancel, select } from "@clack/prompts";

/** One answer of a question. */
interface Choice {
	readonly value: string;
	readonly label: string;
	readonly hint?: string;
}

/**
 * Ask a person to pick one answer with the arrow keys.
 * @param message The question.
 * @param choices The answers, the first one selected.
 * @returns The value of the answer, or undefined when the person cancels.
 */
async function choose(
	message: string,
	choices: readonly [Choice, ...Choice[]],
): Promise<string | undefined> {
	const answer = await select({
		message,
		options: choices.map(({ value, label, hint }) =>
			hint === undefined ? { value, label } : { value, label, hint },
		),
		initialValue: choices[0].value,
		output: process.stderr,
	});
	return isCancel(answer) ? undefined : answer;
}

export { type Choice, choose };
