// The one spelling of a time in the shell: the clock part of an ISO stamp,
// set in the mono face by whoever renders it.

/**
 * The `HH:MM:SS` part of an ISO-8601 stamp.
 * @param iso A stamp such as `2026-09-05T09:14:31.000Z`.
 * @returns The clock time, or the stamp itself when it is not ISO-shaped.
 */
function clockTime(iso: string): string {
	const match = /T(\d{2}:\d{2}:\d{2})/u.exec(iso);
	return match?.[1] ?? iso;
}

export { clockTime };
