// A release server of another version than the installed one is warned about, not refused (ADR 0075).

import { expect, test } from "bun:test";
import { bothRelease, otherVersionWarning } from "#runtime/rules/release-version.ts";

const installed = { mode: "release", version: "0.5.0" } as const;
const address = "http://archboard.localhost:4242";

test("a release server of another version gets a warning that names archboard restart", () => {
	const warning = otherVersionWarning({ mode: "release", version: "0.4.0" }, installed, address);
	expect(warning).toContain("`archboard restart`");
});

test("a release server of the installed version, a checkout server and a server without a mode get none", () => {
	expect(otherVersionWarning({ mode: "release", version: "0.5.0" }, installed, address)).toBeNull();
	expect(
		otherVersionWarning({ mode: "checkout", version: "0.4.0" }, installed, address),
	).toBeNull();
	expect(otherVersionWarning({}, installed, address)).toBeNull();
});

test("a checkout command warns of no version, because the file times of its source say it", () => {
	expect(
		otherVersionWarning(
			{ mode: "release", version: "0.4.0" },
			{ mode: "checkout", version: "0.5.0" },
			address,
		),
	).toBeNull();
});

test("two releases are compared by version and never by where they are installed", () => {
	expect(bothRelease({ mode: "release" }, { mode: "release" })).toBe(true);
	expect(bothRelease({ mode: "checkout" }, { mode: "release" })).toBe(false);
	expect(bothRelease({ mode: "release" }, { mode: "checkout" })).toBe(false);
});
