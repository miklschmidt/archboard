/**
 * Render the retained timestamp in the reader's locale.
 * @param value The shared ISO timestamp.
 * @returns A date and time, including the year.
 */
function checkpointTime(value: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
		new Date(value),
	);
}

export { checkpointTime };
