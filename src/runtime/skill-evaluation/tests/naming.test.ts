// How a check finds the subject it names when the author wrote another
// spelling of the same name: the words decide, one qualifying word is
// forgiven, an exact name beats a qualified one, and a name two subjects
// answer to equally well is no answer at all rather than a guess.

import { describe, expect, test } from "bun:test";
import {
	matchName,
	namedSubject,
	namesMatch,
	plausibleSubjects,
} from "@/runtime/skill-evaluation/index";

/** A plain name is its own subject. */
const itself = (name: string): string => name;

/**
 * What a lookup among plain names concluded.
 * @param names The names to look through.
 * @param asked The name a check used.
 * @returns The match.
 */
function lookup(names: readonly string[], asked: string) {
	return matchName(names, itself, asked);
}

describe("the name a person would call a subject", () => {
	test("case, separators, spacing and camel case are one name", () => {
		expect(lookup(["Request Context"], "request context")).toMatchObject({
			kind: "loose",
			subject: "Request Context",
		});
		expect(lookup(["run_simple"], "runSimple")).toMatchObject({ kind: "loose" });
		expect(lookup(["Default JSON provider"], "DefaultJSONProvider")).toMatchObject({
			kind: "loose",
			subject: "Default JSON provider",
		});
	});

	test("a qualifying word the author added still names the subject the check asked for", () => {
		expect(lookup(["Werkzeug run_simple"], "run_simple")).toMatchObject({
			kind: "loose",
			subject: "Werkzeug run_simple",
		});
	});

	test("a subject whose name says less than the check asked for is a different subject", () => {
		expect(lookup(["App context", "Request context"], "App context stack")).toEqual({
			kind: "none",
		});
		expect(plausibleSubjects(["App context"], itself, "App context stack")).toEqual([]);
	});

	test("an exact name answers over a qualified one, and says it was exact", () => {
		expect(lookup(["Werkzeug run_simple", "run_simple"], "run_simple")).toEqual({
			kind: "exact",
			subject: "run_simple",
			name: "run_simple",
		});
	});

	test("a name that says something else does not match", () => {
		expect(lookup(["Dispatch request", "Session interface"], "Dispatch response")).toEqual({
			kind: "none",
		});
		expect(namedSubject(["Session interface"], itself, "Dispatch")).toBeUndefined();
		expect(namesMatch("Session interface", "Dispatch")).toBe(false);
	});

	test("two subjects answering equally well make the name ambiguous, and no subject", () => {
		const providers = ["Default JSON provider", "Cached JSON provider", "Dispatch"];
		expect(lookup(providers, "JSON provider")).toEqual({
			kind: "ambiguous",
			names: ["Default JSON provider", "Cached JSON provider"],
		});
		expect(namedSubject(providers, itself, "JSON provider")).toBeUndefined();
	});

	test("everything that could answer is what a check requiring absence must not find", () => {
		const providers = ["Default JSON provider", "Cached JSON provider", "Dispatch"];
		expect(plausibleSubjects(providers, itself, "JSON provider")).toEqual([
			"Default JSON provider",
			"Cached JSON provider",
		]);
		expect(plausibleSubjects(providers, itself, "dispatch")).toEqual(["Dispatch"]);
		expect(plausibleSubjects(providers, itself, "Session interface")).toEqual([]);
		expect(plausibleSubjects(providers, itself, "")).toEqual([]);
	});
});
