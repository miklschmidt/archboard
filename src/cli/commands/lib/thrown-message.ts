/**
 * Reads the message of a thrown value without assuming it is an Error, so a
 * refusal can quote whatever a parser or planner threw.
 * @param error - The caught value.
 * @returns The error's message, or the value rendered as text.
 */
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export { errorMessage };
