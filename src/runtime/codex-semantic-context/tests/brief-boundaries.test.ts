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

function createPublisher(feedId: string, context: SemanticContextInput) {
	return createSemanticContextPublisher({
		feed: { onChange: () => () => {} },
		feedId,
		fresh: { read: () => context },
		contextForChange: () => context,
		now: () => 1_700_000_000_000,
	});
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
		const identity = "i".repeat(SEMANTIC_CONTEXT_LIMITS.identityBytes) as never;
		const feedId = rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.cursorBytes);
		const selectionId = rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.selectionIdBytes);
		const ambiguityReason = rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.ambiguityBytes);
		const staleReason = rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.ambiguityBytes);
		const context: SemanticContextInput = {
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
			selection: Array.from(
				{ length: SEMANTIC_CONTEXT_LIMITS.selectionEntries },
				() => selectionId,
			),
			claim: {
				holder: "agent",
				doing: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.doingBytes),
			},
			doing: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.doingBytes),
			cursor: { feedId, sequence: Number.MAX_SAFE_INTEGER },
			description: rawAtMost(publicHostileUnit, SEMANTIC_CONTEXT_LIMITS.descriptionBytes),
			ambiguity: Array.from(
				{ length: SEMANTIC_CONTEXT_LIMITS.ambiguityEntries },
				() => ambiguityReason,
			),
			stale: true,
			staleReasons: Array.from(
				{ length: SEMANTIC_CONTEXT_LIMITS.ambiguityEntries },
				() => staleReason,
			),
		};
		const publisher = createPublisher(feedId, context);

		const first = publisher.publishPaneSelection(context);
		const second = publisher.publishPaneSelection(context);
		const parsed = JSON.parse(first.brief) as { truncated: boolean };

		expect(first.brief).toBe(second.brief);
		expect(first.bytes).toBe(utf8(first.brief));
		expect(first.bytes).toBeLessThanOrEqual(SEMANTIC_CONTEXT_LIMITS.briefBytes);
		expect(first.truncated).toBe(true);
		expect(parsed.truncated).toBe(true);
		expect(first.brief).toContain("…");
		expect(hasLoneSurrogate(first.brief)).toBe(false);
		publisher.dispose();
	});
});
