// The last reading of this browser. It lives in the page's storage, and so belongs to one
// browser and one server address: another checkout's server has its own, and nothing on the
// server or in the registry remembers what a page read.

const LAST_READING_KEY = "archboard.last-reading";

/**
 * The address of the last reading.
 * @returns Its search string, or null when this browser has none.
 */
function lastReading(): string | null {
	try {
		return window.localStorage.getItem(LAST_READING_KEY);
	} catch {
		return null;
	}
}

/**
 * Remember the address of a reading, when the browser lets us.
 * @param search Its search string.
 */
function rememberReading(search: string): void {
	try {
		window.localStorage.setItem(LAST_READING_KEY, search);
	} catch {
		// The next start in this browser asks again.
	}
}

export { lastReading, rememberReading };
