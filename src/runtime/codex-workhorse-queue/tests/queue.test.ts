import { describe, expect, test } from "bun:test";

import { WORKHORSE_QUEUE_OPERATIONS } from "../index.js";
import {
	CodexSessionMutationError,
	binding,
	deferred,
	fixture,
	flush,
	rejected,
	requestParams,
	submission,
} from "./support.js";

describe("Codex workhorse queue contract", () => {
	test("exposes exactly the six authored operations and no revision field", () => {
		const fixtureValue = fixture();
		expect(WORKHORSE_QUEUE_OPERATIONS).toEqual([
			"list",
			"add",
			"update",
			"delete",
			"reorder",
			"start",
		]);
		expect(Object.keys(fixtureValue.queue)).toEqual([
			"list",
			"add",
			"update",
			"delete",
			"reorder",
			"start",
		]);
		expect(Object.keys(fixtureValue.queue)).not.toContain("revision");
	});

	test("uses the exact list body and exhausts a paginated authoritative queue", async () => {
		const fixtureValue = fixture();
		const first = submission(fixtureValue.identity, "queue-one", "one");
		const second = submission(fixtureValue.identity, "queue-two", "two");
		fixtureValue.session.pageMap = new Map([
			[null, { data: [first], nextCursor: "cursor-one" }],
			["cursor-one", { data: [second], nextCursor: null }],
		]);

		const result = await fixtureValue.queue.list();

		expect(result).toEqual({ operation: "list", queue: [first, second] });
		expect(fixtureValue.session.requests).toEqual([
			{
				method: "thread/queue/list",
				params: {
					threadId: binding(fixtureValue.identity).workhorseThreadId,
					cursor: null,
					limit: 100,
				},
			},
			{
				method: "thread/queue/list",
				params: {
					threadId: binding(fixtureValue.identity).workhorseThreadId,
					cursor: "cursor-one",
					limit: 100,
				},
			},
		]);
	});

	test("rejects a repeated authoritative cursor without issuing another page request", async () => {
		const fixtureValue = fixture();
		fixtureValue.session.pageMap = new Map([
			[null, { data: [], nextCursor: "loop" }],
			["loop", { data: [], nextCursor: "loop" }],
		]);

		expect(await rejected(fixtureValue.queue.list())).toMatchObject({ code: "repeated_cursor" });
		expect(fixtureValue.session.requests).toHaveLength(2);
	});

	test("rejects duplicate submission identities across authoritative pages", async () => {
		const fixtureValue = fixture();
		const item = submission(fixtureValue.identity, "queue-one", "one");
		fixtureValue.session.pageMap = new Map([
			[null, { data: [item], nextCursor: "page-two" }],
			["page-two", { data: [item], nextCursor: null }],
		]);

		expect(await rejected(fixtureValue.queue.list())).toMatchObject({ code: "invalid_result" });
	});

	test("maps UI edit to update and cancel to delete at the RPC boundary", async () => {
		const fixtureValue = fixture();
		fixtureValue.session.state = [submission(fixtureValue.identity, "queue-one", "one")];
		const item = fixtureValue.session.state[0];
		if (item === undefined) throw new Error("fixture did not contain the queue item");

		await fixtureValue.queue.update({
			operationId: "edit-operation",
			submissionId: item.id,
			prompt: "edited",
		});
		await fixtureValue.queue.delete({ operationId: "cancel-operation", submissionId: item.id });

		expect(
			fixtureValue.session.requests.filter(({ method }) => method !== "thread/queue/list"),
		).toEqual([
			{
				method: "thread/queue/update",
				params: {
					threadId: binding(fixtureValue.identity).workhorseThreadId,
					queuedSubmissionId: item.id,
					input: [{ type: "text", text: "edited", text_elements: [] }],
				},
			},
			{
				method: "thread/queue/delete",
				params: {
					threadId: binding(fixtureValue.identity).workhorseThreadId,
					queuedSubmissionId: item.id,
				},
			},
		]);
	});

	test("sends literal add, update, delete, reorder, and start bodies", async () => {
		const addFixture = fixture();
		const addedId = addFixture.identity.decoder.adoptQueuedSubmissionId("queue-added");
		addFixture.session.addIds = [addedId];
		await addFixture.queue.add({ operationId: "add-operation", prompt: "add prompt" });
		expect(requestParams(addFixture, "thread/queue/add")).toEqual({
			threadId: binding(addFixture.identity).workhorseThreadId,
			input: [{ type: "text", text: "add prompt", text_elements: [] }],
			clientUserMessageId: "client-add-operation",
		});

		const updateFixture = fixture();
		const updateItem = submission(updateFixture.identity, "queue-update", "before");
		updateFixture.session.state = [updateItem];
		await updateFixture.queue.update({
			operationId: "update-operation",
			submissionId: updateItem.id,
			prompt: "after",
		});
		expect(requestParams(updateFixture, "thread/queue/update")).toEqual({
			threadId: binding(updateFixture.identity).workhorseThreadId,
			queuedSubmissionId: updateItem.id,
			input: [{ type: "text", text: "after", text_elements: [] }],
		});

		const deleteFixture = fixture();
		const deleteItem = submission(deleteFixture.identity, "queue-delete", "delete me");
		deleteFixture.session.state = [deleteItem];
		await deleteFixture.queue.delete({
			operationId: "delete-operation",
			submissionId: deleteItem.id,
		});
		expect(requestParams(deleteFixture, "thread/queue/delete")).toEqual({
			threadId: binding(deleteFixture.identity).workhorseThreadId,
			queuedSubmissionId: deleteItem.id,
		});

		const reorderFixture = fixture();
		const reorderFirst = submission(reorderFixture.identity, "queue-first", "first");
		const reorderSecond = submission(reorderFixture.identity, "queue-second", "second");
		reorderFixture.session.state = [reorderFirst, reorderSecond];
		await reorderFixture.queue.reorder({
			operationId: "reorder-operation",
			orderedSubmissionIds: [reorderSecond.id, reorderFirst.id],
		});
		expect(requestParams(reorderFixture, "thread/queue/reorder")).toEqual({
			threadId: binding(reorderFixture.identity).workhorseThreadId,
			queuedSubmissionIds: [reorderSecond.id, reorderFirst.id],
		});

		const startFixture = fixture();
		const startItem = submission(startFixture.identity, "queue-start", "start me");
		startFixture.session.state = [startItem];
		await startFixture.queue.start({
			operationId: "start-operation",
			submissionId: startItem.id,
		});
		expect(requestParams(startFixture, "thread/queue/start")).toEqual({
			threadId: binding(startFixture.identity).workhorseThreadId,
			queuedSubmissionId: startItem.id,
		});
	});

	test("reconciles each delivered mutation from the authoritative queue result", async () => {
		const fixtureValue = fixture();
		const first = submission(fixtureValue.identity, "queue-first", "first");
		fixtureValue.session.state = [first];
		const result = await fixtureValue.queue.add({ operationId: "add-operation", prompt: "second" });

		expect(result).toMatchObject({
			operation: "add",
			operationId: "add-operation",
			outcome: "delivered",
		});
		expect(result.queue.map(({ id }) => id)).toEqual([first.id, fixtureValue.session.nextAddId]);
		expect(
			fixtureValue.session.requests.filter(({ method }) => method === "thread/queue/list"),
		).toHaveLength(2);
	});

	test("requires a complete reorder and a currently listed mutation target", async () => {
		const fixtureValue = fixture();
		const first = submission(fixtureValue.identity, "queue-first", "first");
		const second = submission(fixtureValue.identity, "queue-second", "second");
		fixtureValue.session.state = [first, second];
		const missing = fixtureValue.identity.decoder.adoptQueuedSubmissionId("queue-missing");

		expect(
			await rejected(
				fixtureValue.queue.reorder({
					operationId: "bad-reorder",
					orderedSubmissionIds: [first.id],
				}),
			),
		).toMatchObject({ code: "invalid_input" });
		expect(
			await rejected(
				fixtureValue.queue.update({
					operationId: "bad-update",
					submissionId: missing,
					prompt: "no",
				}),
			),
		).toMatchObject({ code: "invalid_input" });
		expect(
			fixtureValue.session.requests.filter(({ method }) => method !== "thread/queue/list"),
		).toEqual([]);

		const emptyFixture = fixture();
		expect(
			await rejected(
				emptyFixture.queue.reorder({
					operationId: "empty-reorder",
					orderedSubmissionIds: [],
				}),
			),
		).toMatchObject({ code: "invalid_input" });
		expect(
			emptyFixture.session.requests.filter(({ method }) => method !== "thread/queue/list"),
		).toEqual([]);
	});

	test("serializes two mutations for one exact coordinator before reading the second baseline", async () => {
		const fixtureValue = fixture();
		const firstId = fixtureValue.identity.decoder.adoptQueuedSubmissionId("queue-first");
		const secondId = fixtureValue.identity.decoder.adoptQueuedSubmissionId("queue-second");
		fixtureValue.session.addIds = [firstId, secondId];
		const gate = deferred();
		const firstAddStarted = deferred();
		let firstAdd = true;
		fixtureValue.session.beforeMutation = async (method) => {
			if (method !== "add" || !firstAdd) return;
			firstAdd = false;
			firstAddStarted.resolve();
			await gate.promise;
		};

		const first = fixtureValue.queue.add({ operationId: "first-operation", prompt: "first" });
		await firstAddStarted.promise;
		const second = fixtureValue.queue.add({ operationId: "second-operation", prompt: "second" });
		await flush();
		expect(
			fixtureValue.session.requests.filter(({ method }) => method === "thread/queue/add"),
		).toHaveLength(1);

		gate.resolve();
		const results = await Promise.all([first, second]);
		expect(results.map(({ outcome }) => outcome)).toEqual(["delivered", "delivered"]);
		expect(
			fixtureValue.session.requests.filter(({ method }) => method === "thread/queue/add"),
		).toHaveLength(2);
		expect(
			fixtureValue.session.requests.filter(({ method }) => method === "thread/queue/list"),
		).toHaveLength(4);
	});

	test("returns outcome_unknown and a fresh list when server activity is not attributable", async () => {
		const fixtureValue = fixture();
		const existing = submission(fixtureValue.identity, "queue-existing", "existing");
		const external = submission(fixtureValue.identity, "queue-external", "external");
		const added = fixtureValue.identity.decoder.adoptQueuedSubmissionId("queue-added");
		fixtureValue.session.state = [existing];
		fixtureValue.session.addIds = [added];
		fixtureValue.session.beforeMutation = (method) => {
			if (method !== "add") return;
			fixtureValue.session.state = [...fixtureValue.session.state, external];
			fixtureValue.session.beforeMutation = null;
		};

		const result = await fixtureValue.queue.add({
			operationId: "activity-operation",
			prompt: "added",
		});

		expect(result.outcome).toBe("outcome_unknown");
		expect(result.queue.map(({ id }) => id)).toEqual([existing.id, external.id, added]);
		expect(
			fixtureValue.session.requests.filter(({ method }) => method === "thread/queue/add"),
		).toHaveLength(1);
	});

	test("returns a fresh list for a lost mutation and never retries it", async () => {
		const fixtureValue = fixture();
		const added = submission(fixtureValue.identity, "queue-lost", "lost", "client-lost");
		fixtureValue.session.nextAddError = new CodexSessionMutationError(
			"thread/queue/add",
			"outcome_unknown",
			"the response was lost",
		);
		fixtureValue.session.state = [added];

		const result = await fixtureValue.queue.add({ operationId: "lost-operation", prompt: "lost" });

		expect(result).toMatchObject({
			operation: "add",
			operationId: "lost-operation",
			outcome: "outcome_unknown",
			queue: [added],
		});
		expect(
			fixtureValue.session.requests.filter(({ method }) => method === "thread/queue/add"),
		).toHaveLength(1);
	});

	test("preserves a known not-delivered outcome while reconciling the current queue", async () => {
		const fixtureValue = fixture();
		const existing = submission(fixtureValue.identity, "queue-existing", "existing");
		fixtureValue.session.state = [existing];
		fixtureValue.session.nextAddError = new CodexSessionMutationError(
			"thread/queue/add",
			"not_delivered",
			"the request was rejected before delivery",
		);

		const result = await fixtureValue.queue.add({
			operationId: "rejected-operation",
			prompt: "rejected",
		});

		expect(result).toMatchObject({ outcome: "not_delivered", queue: [existing] });
	});

	test("requires a current binding and rejects a binding that changes during an RPC", async () => {
		const fixtureValue = fixture();
		fixtureValue.setBinding(null);
		expect(await rejected(fixtureValue.queue.list())).toMatchObject({ code: "not_ready" });
		expect(fixtureValue.session.requests).toEqual([]);

		const liveFixture = fixture();
		liveFixture.session.beforeMutation = (method) => {
			if (method === "add") liveFixture.setBinding(binding(liveFixture.identity, "replacement"));
		};
		expect(
			await rejected(
				liveFixture.queue.add({ operationId: "stale-link-operation", prompt: "stale" }),
			),
		).toMatchObject({ code: "stale_link", outcome: "outcome_unknown" });
		expect(
			liveFixture.session.requests.filter(({ method }) => method === "thread/queue/add"),
		).toHaveLength(1);
	});

	test("rejects an operation identity and epoch that are no longer current before RPC", async () => {
		const fixtureValue = fixture();
		expect(
			await rejected(
				fixtureValue.queue.add({ operationId: "stale-operation", prompt: "not sent" }),
			),
		).toMatchObject({ code: "invalid_input" });
		expect(fixtureValue.session.requests).toEqual([]);

		const staleEpochFixture = fixture();
		const current = binding(staleEpochFixture.identity);
		staleEpochFixture.setBinding({
			...current,
			epoch: staleEpochFixture.identity.issuer.mintChildEpoch(),
		});
		expect(await rejected(staleEpochFixture.queue.list())).toMatchObject({ code: "stale_link" });
		expect(staleEpochFixture.session.requests).toEqual([]);
	});

	test("rejects invalid prompts before reading or mutating the queue", async () => {
		const fixtureValue = fixture();
		expect(
			await rejected(fixtureValue.queue.add({ operationId: "invalid-add", prompt: "" })),
		).toMatchObject({
			code: "invalid_input",
		});
		expect(
			await rejected(
				fixtureValue.queue.update({
					operationId: "invalid-update",
					submissionId: fixtureValue.identity.decoder.adoptQueuedSubmissionId("queue-one"),
					prompt: "",
				}),
			),
		).toMatchObject({ code: "invalid_input" });
		expect(fixtureValue.session.requests).toEqual([]);
	});
});
