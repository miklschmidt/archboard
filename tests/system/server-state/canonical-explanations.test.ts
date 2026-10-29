import { expect, test } from "bun:test";
import { cpSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { seedGit, deliveredCapture, changeDescription } from "./support/explanation-captures.ts";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import { readArchitectureModel } from "@archboard/board/store-read";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	prepareProductionFixture,
	openApplicationSocket,
	productionPane,
	productionRecords,
} from "./support/codex-production.ts";
import { productionServer } from "./support/production-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { waitFor } from "./support/http.ts";

test("local explanations share captured text, cancellation, and retry through the existing workhorse", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "fixtures/fake-codex-production.ts"),
	);
	cpSync("examples/web-shop", fixture.vault, { recursive: true });
	seedGit(fixture.root);
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true }),
	);
	const server = await startOwnedServer({
		...productionServer,
		vault: fixture.vault,
		env: {
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			XDG_STATE_HOME: join(fixture.root, "state"),
		},
	});
	resources.defer(() => server.dispose());
	const socket = await openApplicationSocket(server.base, "explain-client", {
		vault: fixture.vault,
		tabSession: "explain-tab",
	});
	resources.defer(() => socket.close());
	const announcements: unknown[] = [];
	socket.socket.on("message", (raw) => {
		const message = JSON.parse(raw.toString());
		if (message.type === "architecture_explanations_changed") announcements.push(message);
	});
	await fetch(`${server.base}/api/panes?vault=${encodeURIComponent(fixture.vault)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(productionPane("explain-client", "explain-pane", true, true)),
	});
	const model = readArchitectureModel(fixture.vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	const request = {
		actionId: "capture-1",
		action: "explain-selection" as const,
		model: model.manifest.id,
		expectedRevision: model.revision.digest,
		subjects: ["Shop/MKhTEYqf#VONp3yKV"],
		question: "Why does this part exist, and what would break without it?",
		reading: {
			scope: "Shop/MKhTEYqf#lwmpnaVU",
			focus: [],
			relationshipKinds: ["call"],
			groups: true,
			grammar: "architecture" as const,
		},
	};
	const { actionId: _actionId, action: _action, question: _question, ...reading } = request;
	const report = {
		clientId: "explain-client",
		paneId: "explain-pane",
		board: null,
		variant: null,
		view: null,
		selection: [],
		version: null,
		at: new Date().toISOString(),
		sequence: 1,
		architecture: { vault: fixture.vault, ...reading },
	};
	const reported = await fetch(
		`${server.base}/api/panes/semantic-context?vault=${encodeURIComponent(fixture.vault)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(report),
		},
	);
	expect(reported.status).toBe(200);
	const panes = await (await fetch(`${server.base}/api/panes`)).json();
	expect(panes.panes[0]).toMatchObject({
		tabSessionId: "explain-tab",
		architecture: report.architecture,
	});
	const invoke = async (path = "", body: unknown = {}) =>
		(
			await fetch(`${server.base}/api/architecture/explanations${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					vault: fixture.vault,
					tabSessionId: "explain-tab",
					...(body as object),
				}),
			})
		).json();
	const read = async (actionId = "capture-1") =>
		(
			await fetch(
				`${server.base}/api/architecture/explanations/${encodeURIComponent(actionId)}?${new URLSearchParams({ vault: fixture.vault, tabSessionId: "explain-tab" })}`,
			)
		).json();
	const latestAction = async () =>
		(
			await fetch(
				`${server.base}/api/architecture/explanations?${new URLSearchParams({ vault: fixture.vault, tabSessionId: "explain-tab" })}`,
			)
		).json();
	expect(await latestAction()).toMatchObject({ success: false, code: "ACTION_NOT_FOUND" });
	const [started, duplicate] = await Promise.all([
		invoke("", { request }),
		invoke("", { request }),
	]);
	expect(duplicate).toEqual(started);
	expect(started).toMatchObject({ success: true, action: { status: "running" } });
	await waitFor(() => announcements.length > 0, "the explanation change notice");
	expect(announcements).toContainEqual({ type: "architecture_explanations_changed" });
	const delivered = deliveredCapture(fixture.logPath);
	const expected = await readArchitectureModel(fixture.vault, undefined, undefined, {
		explain: request,
	});
	expect(Buffer.byteLength(JSON.stringify(expected))).toBeGreaterThan(16_384);
	expect(JSON.parse(readFileSync(delivered, "utf8"))).toEqual({
		vault: fixture.vault,
		...expected,
	});
	expect(statSync(delivered).mode & 0o777).toBe(0o600);
	expect(statSync(dirname(delivered)).mode & 0o777).toBe(0o700);
	expect(delivered.startsWith(fixture.root)).toBe(false);
	expect(await latestAction()).toMatchObject({
		success: true,
		action: {
			actionId: "capture-1",
			vault: fixture.vault,
			capture: { modelName: model.manifest.name },
		},
	});
	expect(
		productionRecords(fixture.logPath).filter(
			(record) => record.kind === "frame" && record.method === "thread/queue/add",
		),
	).toHaveLength(1);
	expect(started).toMatchObject({
		success: true,
		action: {
			actionId: "capture-1",
			attempt: 1,
			status: "running",
			capture: { request, revision: model.revision },
		},
	});
	expect(await invoke("", { request: { ...request, actionId: "capture-queued" } })).toMatchObject({
		success: true,
		action: { status: "queued" },
	});
	const queuedCapture = deliveredCapture(fixture.logPath);
	expect(existsSync(queuedCapture)).toBe(true);
	expect(await invoke("/capture-queued/cancel")).toMatchObject({
		success: true,
		action: { status: "cancelled", retryable: true },
	});
	expect(existsSync(dirname(queuedCapture))).toBe(false);
	expect(
		await invoke("", { request: { ...request, subjects: ["Shop/MKhTEYqf#lwmpnaVU"] } }),
	).toMatchObject({
		success: false,
		code: "ACTION_CHANGED",
	});
	const before = readFileSync(join(fixture.vault, "modules/Shop/MKhTEYqf/VONp3yKV.module.json"));
	writeFileSync(
		join(fixture.vault, "modules/Shop/MKhTEYqf/VONp3yKV.module.json"),
		`${before.toString()}\n`,
	);
	const navigated = await fetch(
		`${server.base}/api/panes/semantic-context?vault=${encodeURIComponent(fixture.vault)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				...report,
				sequence: 2,
				architecture: { ...report.architecture, subjects: ["Shop/MKhTEYqf#lwmpnaVU"] },
			}),
		},
	);
	expect(navigated.status).toBe(200);
	expect(JSON.parse(readFileSync(delivered, "utf8"))).toEqual({
		vault: fixture.vault,
		...expected,
	});
	expect(await invoke("/capture-1/cancel")).toMatchObject({ success: true });
	await waitFor(
		async () => (await read()).action?.status === "cancelled",
		"the confirmed cancellation",
	);
	expect(existsSync(dirname(delivered))).toBe(false);
	expect(await invoke("/capture-1/retry")).toMatchObject({
		success: true,
		action: { attempt: 2, status: "running", capture: { revision: model.revision } },
	});
	const retried = deliveredCapture(fixture.logPath);
	expect(retried).not.toBe(delivered);
	expect(JSON.parse(readFileSync(retried, "utf8"))).toEqual({ vault: fixture.vault, ...expected });
	expect(await latestAction()).toMatchObject({
		success: true,
		action: { actionId: "capture-1", attempt: 2, capture: { revision: model.revision } },
	});
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true, completeWorkhorseTurn: true }),
	);
	await waitFor(
		async () => (await read()).action?.status === "completed",
		"the captured explanation answer",
		{ timeoutMs: 2000 },
	).catch(async (error) => {
		throw new Error(
			`${error}\n${JSON.stringify(await read())}\n${readFileSync(fixture.logPath, "utf8").slice(-15000)}`,
		);
	});
	expect(await read()).toMatchObject({
		success: true,
		action: { text: "The gateway accepts shopping requests.", capture: { request } },
	});
	expect(existsSync(dirname(retried))).toBe(false);
	const cli = runServerCli({
		repoRoot: join(import.meta.dir, "../../.."),
		server,
		args: ["model", "explain"],
		input: JSON.stringify({ type: "latest", tabSessionId: "explain-tab" }),
	});
	expect(cli.status, cli.stderr).toBe(0);
	expect(JSON.parse(cli.stdout).action).toEqual((await read()).action);
	writeFileSync(fixture.controlPath, JSON.stringify({ completeWorkhorseTurn: false }));
	const latest = readArchitectureModel(fixture.vault);
	if (!latest.success) throw new Error(JSON.stringify(latest));
	expect(
		await invoke("", {
			request: { ...request, actionId: "empty-answer", expectedRevision: latest.revision.digest },
		}),
	).toMatchObject({ success: true, action: { status: "running" } });
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ completeWorkhorseTurn: true, explanationText: "" }),
	);
	await waitFor(
		async () => (await read("empty-answer")).action?.status === "failed",
		"the explicit empty-answer failure",
	);
	expect(await read("empty-answer")).toMatchObject({
		success: true,
		action: { retryable: true, text: "", error: expect.any(String) },
	});
	expect(readFileSync(join(fixture.vault, "modules/Shop/MKhTEYqf/VONp3yKV.module.json"))).toEqual(
		Buffer.from(`${before.toString()}\n`),
	);
	const failedCapture = deliveredCapture(fixture.logPath);
	expect(existsSync(dirname(failedCapture))).toBe(false);
	writeFileSync(fixture.controlPath, JSON.stringify({ rejectExplanationQueueAdd: true }));
	expect(
		await invoke("", {
			request: { ...request, actionId: "rejected", expectedRevision: latest.revision.digest },
		}),
	).toMatchObject({
		success: true,
		action: { status: "failed", retryable: true },
	});
	const rejectedCapture = deliveredCapture(fixture.logPath);
	expect(existsSync(dirname(rejectedCapture))).toBe(false);
	writeFileSync(fixture.controlPath, JSON.stringify({}));
	expect(await invoke("/rejected/retry")).toMatchObject({
		success: true,
		action: { attempt: 2, status: "running" },
	});
	const recoveredCapture = deliveredCapture(fixture.logPath);
	expect(recoveredCapture).not.toBe(rejectedCapture);
	expect(JSON.parse(readFileSync(recoveredCapture, "utf8")).explanation.request.actionId).toBe(
		"rejected",
	);
	writeFileSync(fixture.controlPath, JSON.stringify({ uncertainExplanationQueueAdd: true }));
	expect(
		await invoke("", {
			request: { ...request, actionId: "uncertain", expectedRevision: latest.revision.digest },
		}),
	).toMatchObject({
		success: true,
		action: { status: "failed", retryable: false },
	});
	const uncertainCapture = deliveredCapture(fixture.logPath);
	expect(existsSync(uncertainCapture)).toBe(true);
	expect(await invoke("/uncertain/retry")).toMatchObject({
		success: false,
		code: "RETRY_UNAVAILABLE",
	});
	await server.dispose();
	expect(existsSync(dirname(uncertainCapture))).toBe(false);
	expect(existsSync(dirname(recoveredCapture))).toBe(false);
});

test("a signed-out local agent retains an unavailable capture without starting a thread", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "fixtures/fake-codex-production.ts"),
	);
	cpSync("examples/canonical-model/.archboard/vault", fixture.vault, { recursive: true });
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ signedOut: true, ordinaryOnly: true, explanationQueue: true }),
	);
	const server = await startOwnedServer({
		...productionServer,
		vault: fixture.vault,
		env: {
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
		},
	});
	resources.defer(() => server.dispose());
	const socket = await openApplicationSocket(server.base, "unavailable-client", {
		vault: fixture.vault,
		tabSession: "unavailable-tab",
	});
	resources.defer(() => socket.close());
	await fetch(`${server.base}/api/panes?vault=${encodeURIComponent(fixture.vault)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(productionPane("unavailable-client", "unavailable-pane", true, true)),
	});
	expect(await socket.request("connect")).toMatchObject({ ok: true });
	const model = readArchitectureModel(fixture.vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	const response = await fetch(`${server.base}/api/architecture/explanations`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			vault: fixture.vault,
			tabSessionId: "unavailable-tab",
			request: {
				actionId: "unavailable-1",
				action: "trace-flow",
				model: model.manifest.id,
				expectedRevision: model.revision.digest,
				subjects: [],
				reading: { focus: [], relationshipKinds: [], groups: true, grammar: "architecture" },
			},
		}),
	});
	expect(await response.json()).toMatchObject({
		success: true,
		action: { status: "unavailable", attempt: 1, retryable: true, capture: { investigate: true } },
	});
	expect(
		productionRecords(fixture.logPath).filter(
			(record) => record.kind === "frame" && record.method === "thread/start",
		),
	).toHaveLength(0);
});

test("comparison and narrative deliveries retain exact readings after current and source changes", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = prepareProductionFixture(
		resources,
		join(import.meta.dir, "fixtures/fake-codex-production.ts"),
	);
	cpSync("examples/canonical-model/.archboard/vault", fixture.vault, { recursive: true });
	seedGit(fixture.root);
	const initial = readArchitectureModel(fixture.vault);
	if (!initial.success) throw new Error(JSON.stringify(initial));
	const retained = await retainArchitectureCheckpoint(fixture.vault, {
		target: "current",
		operationId: "capture-baseline",
		writer: "agent",
		doing: "Retain the captured target",
		expectedRevision: initial.revision.digest,
		dependencies: [],
	});
	if (!retained.success) throw new Error(JSON.stringify(retained));
	const moduleFile = join(fixture.vault, "gateway.module.json");
	changeDescription(moduleFile, "Changed current architecture.");
	const tourFile = join(fixture.vault, "tour.walkthrough.json");
	const tour = {
		schemaVersion: 1,
		id: "Shop#Tour",
		name: "Captured tour",
		target: { checkpoint: retained.checkpoint.id },
		beats: [
			{
				id: "Shop#Beat",
				title: "Original gateway",
				narrative: "Explain the retained gateway.",
				reading: {
					grammar: "architecture",
					selection: ["Shop#Gateway"],
					focus: [],
					filters: { relationships: [], groups: [] },
				},
			},
		],
	};
	writeFileSync(tourFile, JSON.stringify(tour));
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true }),
	);
	const server = await startOwnedServer({
		...productionServer,
		vault: fixture.vault,
		env: {
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			XDG_STATE_HOME: join(fixture.root, "state"),
		},
	});
	resources.defer(() => server.dispose());
	const socket = await openApplicationSocket(server.base, "exact-client", {
		vault: fixture.vault,
		tabSession: "exact-tab",
	});
	resources.defer(() => socket.close());
	await fetch(`${server.base}/api/panes?vault=${encodeURIComponent(fixture.vault)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(productionPane("exact-client", "exact-pane", true, true)),
	});
	const invoke = async (path: string, body: object = {}) =>
		(
			await fetch(`${server.base}/api/architecture/explanations${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ vault: fixture.vault, tabSessionId: "exact-tab", ...body }),
			})
		).json();
	const captures: { actionId: string; file: string; payload: string }[] = [];
	for (const selection of [
		{ checkpoint: retained.checkpoint.id, against: "current" },
		{ walkthrough: "Shop#Tour" },
	]) {
		const reading = await readArchitectureModel(fixture.vault, undefined, undefined, selection);
		if (!reading.success) throw new Error(JSON.stringify(reading));
		const actionId = selection.walkthrough === undefined ? "compared" : "narrated";
		const request = {
			actionId,
			action: "explain-selection" as const,
			model: reading.manifest.id,
			subjects: ["Shop#Gateway"],
			expectedRevision: reading.revision.digest,
			expectedComparisonRevision: reading.comparison?.revision.digest,
			expectedSourceRevision: reading.playback?.sourceRevision.digest,
			reading: { focus: [], relationshipKinds: [], groups: true, grammar: "architecture" as const },
		};
		const expected = await readArchitectureModel(fixture.vault, undefined, undefined, {
			...selection,
			explain: request,
		});
		if (!expected.success) throw new Error(JSON.stringify(expected));
		expect(await invoke("", { selection, request })).toMatchObject({
			success: true,
			action: { status: actionId === "compared" ? "running" : "queued" },
		});
		const file = deliveredCapture(fixture.logPath);
		const payload = readFileSync(file, "utf8");
		expect(JSON.parse(payload)).toEqual({ vault: fixture.vault, ...expected });
		captures.push({ actionId, file, payload });
	}
	changeDescription(moduleFile, "Later current architecture.");
	writeFileSync(tourFile, JSON.stringify({ ...tour, name: "Later narrative source" }));
	for (const capture of captures) {
		expect(readFileSync(capture.file, "utf8")).toBe(capture.payload);
		await invoke(`/${capture.actionId}/cancel`);
	}
	await waitFor(
		() => captures.every((capture) => !existsSync(capture.file)),
		"captured input cancellation",
	);
	for (const capture of captures) {
		expect(await invoke(`/${capture.actionId}/retry`)).toMatchObject({
			success: true,
			action: { attempt: 2 },
		});
		expect(readFileSync(deliveredCapture(fixture.logPath), "utf8")).toBe(capture.payload);
	}
});
