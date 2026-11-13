// Usage is off in CI, in tests, under DO_NOT_TRACK, under ARCHBOARD_TELEMETRY=0 and after
// `archboard telemetry off`, and the status names the strongest reason (ADR 0079).

import { expect, test } from "bun:test";
import { consentOf, type ConsentInputs } from "#runtime/consent/rules/consent.ts";

const base: ConsentInputs = { env: {}, ci: false, test: false, turnedOff: false };

test("usage is on with no reason to turn it off", () => {
	expect(consentOf(base)).toEqual({ on: true });
	expect(consentOf({ ...base, env: { DO_NOT_TRACK: "0", ARCHBOARD_TELEMETRY: "1" } })).toEqual({
		on: true,
	});
});

test("each reason turns usage off, and the strongest one is named", () => {
	expect(consentOf({ ...base, ci: true })).toEqual({ on: false, because: "ci" });
	expect(consentOf({ ...base, test: true })).toEqual({ on: false, because: "test" });
	expect(consentOf({ ...base, env: { DO_NOT_TRACK: "1" } })).toEqual({
		on: false,
		because: "do-not-track",
	});
	expect(consentOf({ ...base, env: { ARCHBOARD_TELEMETRY: "off" }, ci: true })).toEqual({
		on: false,
		because: "environment",
	});
	expect(consentOf({ ...base, turnedOff: true, ci: true })).toEqual({
		on: false,
		because: "turned-off",
	});
});

test("ARCHBOARD_TELEMETRY cannot turn usage on in CI", () => {
	expect(consentOf({ ...base, env: { ARCHBOARD_TELEMETRY: "1" }, ci: true }).on).toBe(false);
});
