// What "Ask the agent" sends for a design question (TASK-537): the deletion
// test of the codebase-design skill, asked of one part. Imagine the part
// deleted and its callers calling what it calls: if only a line is lost, it
// passed the call on; if complexity reappears in every caller, it earned its
// keep (ADR 0044). The agent reads and answers. It changes nothing, because
// the person asked a question, not for a change.

import { archboardIn } from "#ui/rules/agent-requests/archboard-command.ts";

/** Where the part is: the vault, the board and the variant on screen. */
interface QuestionPlace {
	/** The server's origin. */
	readonly serverUrl: string;
	readonly vault: string;
	readonly board: string;
	/** The variant's id. */
	readonly variant: string;
}

/** A subject the question names, by its id and its name. */
interface Named {
	readonly id: string;
	readonly name: string;
}

/**
 * The deletion question about one entry point that passes one call on.
 * @param place Where the part is.
 * @param container The container whose entry point it is.
 * @param part The entry point.
 * @returns The message for the agent.
 */
function deletionQuestion(place: QuestionPlace, container: Named, part: Named): string {
	return [
		`Use ${archboardIn(place.serverUrl, place.vault)} for every archboard command.`,
		`On the board "${place.board}", variant ${place.variant}, the part "${part.name}" (id ${part.id}) is an entry point of "${container.name}" (id ${container.id}) that only passes one call on.`,
		`Apply the deletion test: suppose "${part.name}" were deleted and its callers called what it calls. What would its callers lose, and what would they have to know that they do not know now?`,
		"Read the part's code and the board before you answer. Change nothing: edit no code and no board.",
	].join(" ");
}

export { deletionQuestion, type QuestionPlace };
