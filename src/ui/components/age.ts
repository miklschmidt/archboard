// How long ago something happened, in the fewest characters that still read:
// "now", "12s", "4m", "2h", "3d". The shell sets it in the mono face.

/**
 * The age of a stamp at a moment.
 * @param iso When it happened, as an ISO-8601 stamp.
 * @param now The moment, in milliseconds.
 * @returns The short age, or "" when the stamp does not parse.
 */
function shortAge(iso: string, now: number): string {
	const at = Date.parse(iso);
	if (Number.isNaN(at)) return "";
	const seconds = Math.max(0, Math.round((now - at) / 1000));
	if (seconds < 10) return "now";
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/**
 * A duration as a clock: "0:42", "12:05", "1:02:03".
 * @param milliseconds The duration.
 * @returns The clock.
 */
function clockDuration(milliseconds: number): string {
	const total = Math.max(0, Math.floor(milliseconds / 1000));
	const seconds = String(total % 60).padStart(2, "0");
	const minutes = Math.floor(total / 60) % 60;
	const hours = Math.floor(total / 3600);
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
		: `${minutes}:${seconds}`;
}

export { clockDuration, shortAge };
