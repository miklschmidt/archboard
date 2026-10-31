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

/**
 * Render a day of the source history in the reader's locale.
 * @param value The shared ISO timestamp.
 * @returns The day, including the year.
 */
function historyDay(value: string): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export { checkpointTime, historyDay };
