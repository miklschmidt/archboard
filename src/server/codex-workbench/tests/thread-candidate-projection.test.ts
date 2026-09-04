import { expect, test } from "bun:test";

import {
	BROWSER_THREAD_CANDIDATE_LIMIT,
	createCodexBrowserModel,
} from "../../../shared/codex-browser-model/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import { projectCodexBrowserState, type BrowserProjectionInput } from "../index.js";

/** The smallest owner state a snapshot can be projected from. */
function baseInput(authorities: IdentityAuthorities): BrowserProjectionInput {
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "signed_out" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "unbound",
			childId: null,
			epoch: null,
			threadId: null,
			source: null,
			status: "notLoaded",
			loaded: false,
			canAcceptDirectInput: false,
			reason: null,
		},
		threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
		timeline: null,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: [],
		semantic: { kind: "codex_semantic", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "unbound",
			threadId: null,
			configured: null,
			effective: null,
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: false,
			generation: null,
			coordinatorState: "unbound",
			transcript: [],
		},
		lease: null,
		operation: null,
	} satisfies BrowserProjectionInput & { readonly identity?: typeof authorities };
}

test("projects the host thread inventory into the browser vocabulary and bounds it", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const decoder = authorities.identity.decoder;
	const input = baseInput(authorities);
	const candidate = (index: number, source: string) => ({
		selectionId: `selection-${index}`,
		threadId: decoder.adoptThreadId(`candidate-thread-${index}`),
		state: index === 0 ? ("executable" as const) : ("inspect_only" as const),
		reason: index === 0 ? null : ("prior_epoch" as const),
		source,
		status: "idle" as const,
		loaded: true,
		canAcceptDirectInput: index === 0 ? true : null,
	});
	// Every flattened source the classifier emits maps onto one presentation.
	const sources = ["appServer", "cli", "vscode", "exec", "custom", "subAgent", "unknown"];
	const projected = projectCodexBrowserState(model, decoder, {
		...input,
		threadCandidates: {
			kind: "codex_thread_candidates",
			state: "listed",
			candidates: sources.map((source, index) => candidate(index, source)) as never,
		},
	});
	if (projected.tag !== "projected") throw new Error(projected.message);
	const inventory = projected.snapshot.threadCandidates;
	expect(inventory.state).toBe("listed");
	expect(
		inventory.state === "listed" && inventory.records.map((row) => row.sourcePresentation),
	).toEqual(["standard", "standard", "standard", "standard", "custom", "subagent", "unknown"]);
	expect(inventory.state === "listed" && inventory.records[0]).toMatchObject({
		kind: "thread_candidate",
		state: "executable",
		reason: null,
		canAcceptDirectInput: true,
	});
	expect(inventory.state === "listed" && inventory.records[1]?.reason).toBe("prior_epoch");
	expect(inventory.truncated).toBeFalse();

	const overflowing = projectCodexBrowserState(model, decoder, {
		...input,
		threadCandidates: {
			kind: "codex_thread_candidates",
			state: "listed",
			candidates: Array.from({ length: BROWSER_THREAD_CANDIDATE_LIMIT + 5 }, (_row, index) =>
				candidate(index, "appServer"),
			) as never,
		},
	});
	if (overflowing.tag !== "projected") throw new Error(overflowing.message);
	const bounded = overflowing.snapshot.threadCandidates;
	expect(bounded.state === "listed" && bounded.records).toHaveLength(
		BROWSER_THREAD_CANDIDATE_LIMIT,
	);
	expect(bounded.truncated).toBeTrue();

	const unavailable = projectCodexBrowserState(model, decoder, {
		...input,
		threadCandidates: {
			kind: "codex_thread_candidates",
			state: "unavailable",
			reason: "the persisted list could not be exhausted",
		},
	});
	if (unavailable.tag !== "projected") throw new Error(unavailable.message);
	expect(unavailable.snapshot.threadCandidates).toMatchObject({
		state: "unavailable",
		records: [],
		reason: "the persisted list could not be exhausted",
	});
});
