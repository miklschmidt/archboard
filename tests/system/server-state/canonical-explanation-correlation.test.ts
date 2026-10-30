import { expect, test } from "bun:test";
import { cpSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { prepareProductionFixture, productionRecords } from "./support/codex-production.ts";
import {
	seedGit,
	deliveredCapture,
	startExplanationServer,
} from "./support/explanation-captures.ts";
import { waitFor } from "./support/http.ts";
import type { ExplanationNotification } from "./fixtures/fake-codex-explanation-queue.ts";
import type { CodexServerNotificationParamsByMethod } from "@archboard/codex-app-server/contract";

test("automatically consumed explanations correlate unloaded turns by client message identity", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "fixtures/fake-codex-production.ts"),
	);
	cpSync("examples/canonical-model/.archboard/vault", fixture.vault, { recursive: true });
	seedGit(fixture.root);
	const notifications: ExplanationNotification[] = [];
	let autoConsumeExplanationQueue = false;
	const control = () =>
		writeFileSync(
			fixture.controlPath,
			JSON.stringify({
				ordinaryOnly: true,
				explanationQueue: true,
				autoConsumeExplanationQueue,
				explanationNotifications: notifications,
			}),
		);
	control();
	const { invoke, read } = await startExplanationServer(resources, fixture, "automatic");
	const model = readArchitectureModel(fixture.vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	const request = {
		actionId: "blocker",
		action: "explain-selection" as const,
		model: model.manifest.id,
		expectedRevision: model.revision.digest,
		subjects: ["Shop#Gateway"],
		question: "What accepts shopping requests?",
		reading: { focus: [], relationshipKinds: [], groups: true, grammar: "architecture" as const },
	};
	expect(await invoke("", { request })).toMatchObject({
		success: true,
		action: { status: "running" },
	});
	const captures = new Map<string, string>();
	for (const actionId of ["unrelated", "capture-1"]) {
		expect(await invoke("", { request: { ...request, actionId } })).toMatchObject({
			success: true,
			action: { status: "queued" },
		});
		captures.set(actionId, deliveredCapture(fixture.logPath));
	}
	const capture = deliveredCapture(fixture.logPath);
	const admission = productionRecords(fixture.logPath).findLast(
		(record) => record.kind === "frame" && record.method === "thread/queue/add",
	)!;
	const threadId = String(admission.params!["threadId"]);
	const clientId = String(admission.params!["clientUserMessageId"]);
	expect(existsSync(capture)).toBe(true);
	autoConsumeExplanationQueue = true;
	control();
	await invoke("/blocker/cancel");
	await waitFor(
		async () => (await read("unrelated")).action?.status === "running",
		"automatic consumption of the preceding queued action",
		{ timeoutMs: 2000 },
	);
	// The same question and next turn belong to another admitted client message.
	expect(await read()).toMatchObject({ action: { status: "queued", text: "" } });
	expect(existsSync(capture)).toBe(true);
	const preceding = productionRecords(fixture.logPath).findLast(
		(record) => record.kind === "notification" && record.method === "item/started",
	)!.params as CodexServerNotificationParamsByMethod["item/started"];
	if (preceding.item.type !== "userMessage") throw new Error("Expected the queued user item.");
	expect(existsSync(captures.get("unrelated")!)).toBe(true);
	notifications.push(
		{
			method: "item/completed",
			params: {
				threadId,
				turnId: preceding.turnId,
				item: preceding.item,
				completedAtMs: Date.now(),
			},
		},
		{
			method: "item/started",
			params: {
				threadId: "thread-1",
				turnId: "foreign-turn",
				item: { ...preceding.item, clientId },
				startedAtMs: Date.now(),
			},
		},
	);
	control();
	await waitFor(
		() =>
			productionRecords(fixture.logPath).some(
				(record) =>
					record.kind === "notification" &&
					record.method === "item/started" &&
					record.params!["turnId"] === "foreign-turn",
			),
		"the unrelated thread item",
		{ timeoutMs: 2000 },
	);
	await invoke("/unrelated/cancel");
	await waitFor(
		async () => (await read()).action?.status === "running",
		"automatic captured turn correlation",
		{ timeoutMs: 2000 },
	);
	expect(await read("unrelated")).toMatchObject({
		action: { status: "cancelled", retryable: true },
	});
	expect(existsSync(dirname(captures.get("unrelated")!))).toBe(false);
	const records = productionRecords(fixture.logPath);
	const started = records.findLast(
		(record) =>
			record.kind === "notification" &&
			record.method === "item/started" &&
			(record.params!["item"] as { clientId: string }).clientId === clientId,
	)!;
	const turnId = String(started.params!["turnId"]);
	const item = started.params![
		"item"
	] as CodexServerNotificationParamsByMethod["item/started"]["item"];
	const lifecycle = records.findLast(
		(record) => record.kind === "notification" && record.method === "turn/started",
	)!.params!["turn"] as CodexServerNotificationParamsByMethod["turn/started"]["turn"];
	expect(lifecycle).toMatchObject({ id: turnId, items: [], itemsView: "notLoaded" });
	expect(
		records.filter((record) => record.kind === "frame" && record.method === "thread/queue/start"),
	).toHaveLength(1);
	expect(
		records.findLast((record) => record.kind === "frame" && record.method === "turn/interrupt")!
			.params!["turnId"],
	).toBe(preceding.turnId);
	expect(existsSync(capture)).toBe(true);
	const answer: Extract<typeof item, { type: "agentMessage" }> = {
		type: "agentMessage",
		id: "final-answer",
		text: "The gateway accepts shopping requests.",
		phase: "final_answer",
		memoryCitation: null,
		delivery: null,
		questions: null,
	};
	const foreignTurn = { ...lifecycle, id: "unrelated-turn", status: "completed" as const };
	notifications.push(
		{
			method: "item/completed",
			params: {
				threadId,
				turnId: "unrelated-turn",
				item: { ...answer, text: "Another turn's answer." },
				completedAtMs: Date.now(),
			},
		},
		{ method: "turn/completed", params: { threadId, turn: foreignTurn } },
		{
			method: "item/started",
			params: { threadId: "thread-1", turnId, item, startedAtMs: Date.now() },
		},
		{
			method: "item/completed",
			params: {
				threadId: "thread-1",
				turnId,
				item: { ...answer, text: "Another thread's answer." },
				completedAtMs: Date.now(),
			},
		},
		{ method: "item/completed", params: { threadId, turnId, item, completedAtMs: Date.now() } },
		{
			method: "item/completed",
			params: {
				threadId,
				turnId,
				item: { ...answer, phase: "commentary", text: "Working on the capture." },
				completedAtMs: Date.now(),
			},
		},
		{
			method: "item/completed",
			params: { threadId, turnId, item: answer, completedAtMs: Date.now() },
		},
	);
	control();
	await waitFor(
		async () => (await read()).action?.text === answer.text,
		"the correlated final item",
		{ timeoutMs: 2000 },
	);
	expect(await read()).toMatchObject({
		action: { status: "running", text: answer.text, retryable: false },
	});
	expect(existsSync(capture)).toBe(true);
	notifications.push({
		method: "turn/completed",
		params: {
			threadId,
			turn: { ...lifecycle, status: "completed", itemsView: "summary", items: [answer] },
		},
	});
	control();
	await waitFor(
		async () => (await read()).action?.status === "completed",
		"the captured completion",
		{ timeoutMs: 2000 },
	);
	expect(await read()).toMatchObject({
		action: { status: "completed", text: answer.text, retryable: false },
	});
	expect(existsSync(dirname(capture))).toBe(false);
});
