// When a code pass ran, as a reader says it: the time alone today, the day and
// the time before today. The findings of a subject and its exposed names both
// say it.

/**
 * When a pass ran, in words.
 * @param checkedAt When, as the server wrote it.
 * @returns The words.
 */
function whenChecked(checkedAt: string): string {
	const at = new Date(checkedAt);
	const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
	return at.toDateString() === new Date().toDateString()
		? time
		: `${at.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

export { whenChecked };
