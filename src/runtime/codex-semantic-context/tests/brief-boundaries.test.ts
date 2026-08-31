import { describe, expect, test } from "bun:test";

import {
	createSemanticContextPublisher,
	SEMANTIC_CONTEXT_LIMITS,
	type SemanticContextInput,
} from "../index.ts";

function utf8(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}

function hasLoneSurrogate(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const codeUnit = value.charCodeAt(index);
		if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (next < 0xdc00 || next > 0xdfff) return true;
			index++;
		} else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
			return true;
		}
	}
	return false;
}

function rawAtMost(value: string, maximum: number): string {
	let result = "";
	let bytes = 0;
	const encoder = new TextEncoder();
	while (bytes < maximum && value.length > 0) {
		let progressed = false;
		for (const character of value) {
			progressed = true;
			const characterBytes = encoder.encode(character).byteLength;
			if (bytes + characterBytes > maximum) return result;
			result += character;
			bytes += characterBytes;
		}
		if (!progressed) return result;
	}
	return result;
}

const jsonControls = String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index));
const jsonBoundaryValues = [
	'"',
	"\\",
	"\b",
	"\t",
	"\n",
	"\f",
	"\r",
	jsonControls,
	"\ud800",
	"\udc00",
	"\ud834\udf06",
	"𝄞界",
	'quote " slash \\ newline\n tab\t pair 𝄞 and lone \ud800',
];
const publicHostileUnit = jsonBoundaryValues.join("").replaceAll("\0", "");
const publicBoundaryValues = jsonBoundaryValues
	.map((value) => value.replaceAll("\0", ""))
	.filter((value) => value.length > 0);
const maximumFeedId = "\u0001".repeat((SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes - 2) / 6);

function createPublisher(feedId: string, context: SemanticContextInput) {
	return createSemanticContextPublisher({
		feed: { onChange: () => () => {} },
		feedId,
		fresh: { read: () => context },
		contextForChange: () => context,
		now: () => 1_700_000_000_000,
	});
}

function maximumContext(cursorFeedId: string, includeStaleReasons = true): SemanticContextInput {
	const identity = "i".repeat(SEMANTIC_CONTEXT_LIMITS.identityBytes) as never;
	const selectionId = rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.selectionIdBytes);
	const ambiguityReason = rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.ambiguityBytes);
	const staleReason = rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.ambiguityBytes);
	return {
		repository: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.repositoryBytes),
		child: { id: identity, epoch: identity },
		threadLink: {
			state: "inspect_only",
			reason: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.reasonBytes),
		},
		workhorse: { threadId: identity, turnId: identity },
		coordinator: { threadId: identity, realtimeSessionId: identity },
		board: {
			key: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.boardKeyBytes),
			note: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.noteBytes),
			version: Number.MAX_SAFE_INTEGER,
		},
		pane: {
			paneId: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.paneIdBytes),
			focused: true,
		},
		selection: Array.from({ length: SEMANTIC_CONTEXT_LIMITS.selectionEntries }, () => selectionId),
		claim: {
			holder: "agent",
			doing: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.doingBytes),
		},
		doing: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.doingBytes),
		cursor: { feedId: cursorFeedId, sequence: Number.MAX_SAFE_INTEGER },
		description: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.descriptionBytes),
		ambiguity: Array.from(
			{ length: SEMANTIC_CONTEXT_LIMITS.ambiguityEntries },
			() => ambiguityReason,
		),
		stale: includeStaleReasons,
		staleReasons: includeStaleReasons
			? Array.from({ length: SEMANTIC_CONTEXT_LIMITS.ambiguityEntries }, () => staleReason)
			: [],
	};
}

describe("semantic context JSON byte boundaries", () => {
	test("keeps every admitted hostile JSON boundary valid and bounded", () => {
		for (const value of publicBoundaryValues) {
			const context: SemanticContextInput = {
				repository: "repo",
				board: { key: "board", note: "board.md", version: 1 },
				pane: { paneId: "pane", focused: true },
				selection: [],
				doing: null,
				cursor: { feedId: "feed", sequence: 0 },
				description: value.repeat(8_192),
			};
			const publisher = createPublisher("feed", context);
			const first = publisher.publishPaneSelection(context);
			const second = publisher.publishPaneSelection(context);

			expect(JSON.parse(first.brief)).toBeTruthy();
			expect(first.bytes).toBe(utf8(first.brief));
			expect(first.bytes).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.briefBytes);
			expect(first.truncated).toBe(true);
			expect(first.brief).toBe(second.brief);
			expect(hasLoneSurrogate(first.brief)).toBe(false);
			publisher.dispose();
		}
	});

	test("retains the NUL-free authored string contract", () => {
		const context: SemanticContextInput = {
			repository: "repo",
			board: { key: "board", note: "board.md", version: 1 },
			pane: { paneId: "pane", focused: true },
			selection: [],
			doing: null,
			cursor: { feedId: "feed", sequence: 0 },
			description: "before\0after",
		};
		const publisher = createPublisher("feed", context);
		expect(() => publisher.publishPaneSelection(context)).toThrow(/NUL/);
	});

	test("fits all public mutable maxima into a deterministic valid brief", () => {
		const feedId = maximumFeedId;
		const context = maximumContext(feedId);
		const publisher = createPublisher(feedId, context);
		expect(utf8(JSON.stringify(feedId))).toBe(SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes);

		const first = publisher.publishPaneSelection(context);
		const second = publisher.publishPaneSelection(context);
		const parsed = JSON.parse(first.brief) as {
			feedId: string;
			cursor: { feedId: string; sequence: number };
			truncated: boolean;
		};

		expect(first.brief).toBe(second.brief);
		expect(first.bytes).toBe(utf8(first.brief));
		expect(first.bytes).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.briefBytes);
		expect(first.truncated).toBe(true);
		expect(parsed.feedId).toBe(feedId);
		expect(parsed.cursor.feedId).toBe(feedId);
		expect(parsed.cursor.sequence).toBe(Number.MAX_SAFE_INTEGER);
		expect(first.cursor?.feedId).toBe(feedId);
		expect(parsed.truncated).toBe(true);
		expect(first.brief).toContain("…");
		expect(hasLoneSurrogate(first.brief)).toBe(false);
		publisher.dispose();
	});

	test("rejects feed identities whose JSON tokens cannot be reserved twice", () => {
		const overBound = `${maximumFeedId}\u0001`;
		const context = maximumContext(overBound);
		expect(() => createPublisher(overBound, context)).toThrow(/JSON encoded/);
	});

	test("keeps exact current, prior, and restarted cursor identities under pressure", () => {
		const currentFeedId = maximumFeedId;
		const priorFeedId = "\u0002".repeat((SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes - 2) / 6);
		const restartFeedId = "\u0003".repeat((SEMANTIC_CONTEXT_LIMITS.feedIdJsonBytes - 2) / 6);

		const currentContext = maximumContext(currentFeedId, false);
		const currentPublisher = createPublisher(currentFeedId, currentContext);
		const current = currentPublisher.publishPaneSelection(currentContext);
		const currentBrief = JSON.parse(current.brief) as {
			feedId: string;
			cursor: { feedId: string; sequence: number };
		};
		expect(currentBrief.feedId).toBe(currentFeedId);
		expect(currentBrief.cursor.feedId).toBe(currentFeedId);
		expect(currentBrief.cursor.sequence).toBe(Number.MAX_SAFE_INTEGER);
		expect(current.cursor?.feedId).toBe(currentFeedId);
		expect(current.bytes).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.briefBytes);
		expect(current.staleness.state).toBe("current");
		currentPublisher.dispose();

		const priorContext = maximumContext(priorFeedId, false);
		const priorPublisher = createPublisher(currentFeedId, priorContext);
		const prior = priorPublisher.publishPaneSelection(priorContext);
		const priorBrief = JSON.parse(prior.brief) as {
			feedId: string;
			cursor: { feedId: string; sequence: number };
		};
		expect(priorBrief.feedId).toBe(currentFeedId);
		expect(priorBrief.cursor.feedId).toBe(priorFeedId);
		expect(prior.cursor?.feedId).toBe(priorFeedId);
		expect(prior.cursor?.sequence).toBe(Number.MAX_SAFE_INTEGER);
		expect(prior.bytes).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.briefBytes);
		expect(prior.staleness.state).toBe("stale");
		priorPublisher.dispose();

		const restartContext = maximumContext(restartFeedId, false);
		const restartPublisher = createPublisher(restartFeedId, restartContext);
		const restarted = restartPublisher.publishPaneSelection(restartContext);
		const restartBrief = JSON.parse(restarted.brief) as {
			feedId: string;
			cursor: { feedId: string; sequence: number };
		};
		expect(restartBrief.feedId).toBe(restartFeedId);
		expect(restartBrief.cursor.feedId).toBe(restartFeedId);
		expect(restartBrief.cursor.sequence).toBe(Number.MAX_SAFE_INTEGER);
		expect(restarted.cursor?.feedId).toBe(restartFeedId);
		expect(restarted.bytes).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.briefBytes);
		expect(restarted.staleness.state).toBe("current");
		restartPublisher.dispose();
	});
});
