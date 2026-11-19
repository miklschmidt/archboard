import { expect, test } from "bun:test";
import {
	readingIsStale,
	readingTrouble,
	UNANSWERED_READ_CODE,
} from "#ui/architecture-drawing/model-reader/reading/rules/reading-freshness.ts";

const HEALTHY = { data: {}, isError: false };
const LIVE = { connection: "live", failure: null } as const;

test("an event being applied and a stream that is opening say nothing about a healthy reading", () => {
	expect(readingIsStale(HEALTHY, true, LIVE)).toBe(false);
	expect(readingIsStale(HEALTHY, true, { ...LIVE, connection: "connecting" })).toBe(false);
});

test("a lost stream and a failed read leave a live reading unconfirmed", () => {
	expect(readingIsStale(HEALTHY, true, { ...LIVE, connection: "unavailable" })).toBe(true);
	expect(readingIsStale({ data: {}, isError: true }, true, LIVE)).toBe(true);
});

test("a retained reading does not follow the stream", () => {
	expect(readingIsStale(HEALTHY, false, { ...LIVE, connection: "unavailable" })).toBe(false);
});

test("losing the stream keeps a known refusal and explains an unanswered read", () => {
	const reading = { shown: true, lost: true, stale: true };
	const problem = { code: "MODEL_INVALID", message: "Invalid model." };
	expect(readingTrouble({ ...reading, problem })).toMatchObject({
		code: problem.code,
		retry: true,
	});
	expect(
		readingTrouble({ ...reading, problem: { ...problem, code: UNANSWERED_READ_CODE } }),
	).toMatchObject({ code: null, tone: "destructive", retry: false });
});
