// What a check says it is doing, on every write it makes.
//
// An agent must say what it is doing on every board write and the canvas
// refuses one that does not (TASK-095). A check is an agent: it drives the same
// routes the CLI and direct clients drive, so it has to say something too, and a check
// that had to remember at 55 call sites would be a check that forgot at one.
//
// So each harness passes this what it is up to, once, and its own `api` helper
// hands it every write. That the requirement is real is proved in
// `check-doing.mjs`, which asks without saying anything and expects a refusal —
// here it would only be in the way of what each check is actually about.

/**
 * Attach `doing` to anything that is not a read.
 *
 * @param {string} url    the path, with or without a query
 * @param {string} method the HTTP method
 * @param {string} what   one line, present tense, as an agent would write it
 */
export function withDoing(url, method, what) {
	const verb = (method ?? "GET").toUpperCase();
	if (verb === "GET" || verb === "HEAD") return url;
	if (/[?&]doing=/.test(url)) return url;
	return `${url}${url.includes("?") ? "&" : "?"}doing=${encodeURIComponent(what)}`;
}
