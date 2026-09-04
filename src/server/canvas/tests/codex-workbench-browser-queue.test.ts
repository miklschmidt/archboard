import { expect, test } from "bun:test";

import type { IdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import { createIdentityAuthorities } from "../../../shared/codex-workbench-identity/index.js";
import type { SessionQueuedSubmission } from "../../../runtime/codex-session/index.js";
import { CODEX_QUEUE_REREAD_FLOOR_MS } from "../../../shared/timing/timing.js";
import { projectionHarness } from "./support/codex-workbench-projection-harness.js";

/** A live workhorse holding one thread, as the ready adapter paths need. */
function readyWorkhorse(
	authorities: IdentityAuthorities,
	threadId: ReturnType<IdentityAuthorities["identity"]["decoder"]["adoptThreadId"]>,
) {
	return {
		kind: "codex_workhorse" as const,
		state: "ready" as const,
		paneId: "pane-readiness",
		childId: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		threadId,
		operationId: null,
		outcome: null,
		start: null,
		binding: null,
		cleanup: null,
		reason: null,
	};
}

/** One authoritative submission, as the workhorse queue owner answers with it. */
function submission(
	authorities: IdentityAuthorities,
	id: string,
	clientUserMessageId: string,
): SessionQueuedSubmission {
	return {
		id: authorities.identity.decoder.adoptQueuedSubmissionId(id),
		input: [{ type: "text", text: `prompt for `, text_elements: [] }],
		clientUserMessageId,
	} as unknown as SessionQueuedSubmission;
}

test("a snapshot refresh re-reads the authoritative queue and replaces a stale cache", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("readiness-thread");
	const operationId = authorities.operation.issuer.mintOperationId();
	let reads = 0;
	const harness = projectionHarness({
		workhorse: {
			snapshot: () => ({
				kind: "codex_workhorse",
				state: "ready",
				paneId: "pane-readiness",
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
				threadId,
				operationId: null,
				outcome: null,
				start: null,
				binding: null,
				cleanup: null,
				reason: null,
			}),
		},
		queue: {
			list: async () => {
				reads += 1;
				return {
					operation: "list" as const,
					queue: [submission(authorities, "drained-away", operationId)],
				};
			},
		},
	});
	// The cache the browser would otherwise be shown: a submission the workhorse
	// has already drained, left behind by the pane's last command.
	harness.state.queue = {
		kind: "codex_queue",
		submissions: [
			{
				id: authorities.identity.decoder.adoptQueuedSubmissionId("stale-entry"),
				input: [{ type: "text", text: "stale prompt", text_elements: [] }],
				operationId: null,
			},
		],
	};
	harness.state.queueThreadId = harness.threadId;

	expect(harness.options.projection.refresh).toBeTypeOf("function");
	await harness.options.projection.refresh?.(harness.context);

	expect(reads).toBe(1);
	const submissions = harness.options.projection.read(harness.context).queue.submissions;
	expect(submissions?.map((entry) => entry.id)).toEqual([
		authorities.identity.decoder.adoptQueuedSubmissionId("drained-away"),
	]);
});

test("a failed re-read presents the queue as unavailable rather than an unproven list", async () => {
	const authorities = createIdentityAuthorities();
	const harness = projectionHarness({
		workhorse: {
			snapshot: () => ({
				kind: "codex_workhorse",
				state: "ready",
				paneId: "pane-readiness",
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
				threadId: authorities.identity.decoder.adoptThreadId("readiness-thread"),
				operationId: null,
				outcome: null,
				start: null,
				binding: null,
				cleanup: null,
				reason: null,
			}),
		},
		queue: {
			list: async () => {
				throw new Error("the authoritative queue read failed");
			},
		},
	});
	harness.state.queue = {
		kind: "codex_queue",
		submissions: [
			{
				id: authorities.identity.decoder.adoptQueuedSubmissionId("unproven"),
				input: [{ type: "text", text: "unproven prompt", text_elements: [] }],
				operationId: null,
			},
		],
	};
	harness.state.queueThreadId = harness.threadId;

	await harness.options.projection.refresh?.(harness.context);

	expect(harness.options.projection.read(harness.context).queue.submissions).toBeNull();
});

test("a submission's coordinator operation is recovered from its client user message identity", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("readiness-thread");
	const foreign = createIdentityAuthorities();
	let ours: ReturnType<IdentityAuthorities["operation"]["issuer"]["mintOperationId"]> | "" = "";
	const harness = projectionHarness({
		workhorse: {
			snapshot: () => ({
				kind: "codex_workhorse",
				state: "ready",
				paneId: "pane-readiness",
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
				threadId,
				operationId: null,
				outcome: null,
				start: null,
				binding: null,
				cleanup: null,
				reason: null,
			}),
		},
		queue: {
			list: async () => ({
				operation: "list" as const,
				queue: [
					// Queued by this Archboard pane: the add carried the serialized
					// OperationId as its client user message identity.
					submission(authorities, "ours", ours),
					// Queued by another client: an identity this authority never issued.
					submission(authorities, "theirs", "codex-client-message-1"),
					// Queued by a prior child epoch, whose operations are void.
					submission(
						authorities,
						"prior",
						foreign.operation.decoder.serializeOperationId(
							foreign.operation.issuer.mintOperationId(),
						),
					),
				],
			}),
		},
	});
	const minted = harness.operations.issuer.mintOperationId();
	// An OperationId is its own wire string, so serializing is what the queue port
	// does before it becomes a submission's client user message identity.
	expect(harness.operations.decoder.serializeOperationId(minted)).toBe(minted);
	ours = minted;
	harness.state.queueThreadId = harness.threadId;

	await harness.options.projection.refresh?.(harness.context);

	const submissions = harness.options.projection.read(harness.context).queue.submissions ?? [];
	const adopt = authorities.identity.decoder.adoptQueuedSubmissionId;
	expect(submissions.map((entry) => [entry.id, entry.operationId])).toEqual([
		[adopt("ours"), ours],
		[adopt("theirs"), null],
		[adopt("prior"), null],
	]);
});

test("concurrent snapshot re-reads share one read, and a looping client is floored", async () => {
	const authorities = createIdentityAuthorities();
	const threadId = authorities.identity.decoder.adoptThreadId("readiness-thread");
	let reads = 0;
	const pending: (() => void)[] = [];
	const release = (): void => {
		for (const resolve of pending.splice(0)) resolve();
	};
	let clock = 10_000;
	const harness = projectionHarness({
		now: () => clock,
		workhorse: { snapshot: () => readyWorkhorse(authorities, threadId) },
		queue: {
			list: async () => {
				reads += 1;
				await new Promise<void>((resolve) => pending.push(resolve));
				return { operation: "list" as const, queue: [] };
			},
		},
	});
	harness.state.queueThreadId = harness.threadId;

	// Three requests arrive while the first paginated read is still open.
	const concurrent = [
		harness.options.projection.refresh?.(harness.context),
		harness.options.projection.refresh?.(harness.context),
		harness.options.projection.refresh?.(harness.context),
	];
	expect(reads).toBe(1);
	release();
	await Promise.all(concurrent);
	expect(reads).toBe(1);

	// A fourth inside the floor is served from the read that just finished.
	await harness.options.projection.refresh?.(harness.context);
	expect(reads).toBe(1);

	// Past the floor, the host reads again.
	clock += CODEX_QUEUE_REREAD_FLOOR_MS;
	const past = harness.options.projection.refresh?.(harness.context);
	expect(reads).toBe(2);
	release();
	await past;
});
