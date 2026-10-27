import { expect, test } from "bun:test";
import { cpSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
	cpSync("examples/canonical-model/.archboard/vault", fixture.vault, { recursive: true });
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
	}).catch((error) => {
		throw new Error(`${error}\n${readFileSync(fixture.logPath, "utf8")}`, { cause: error });
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
		action: "explain-selection",
		model: model.manifest.id,
		expectedRevision: model.revision.digest,
		subjects: ["Shop#Gateway"],
		reading: { focus: [], relationshipKinds: ["call"], groups: true, grammar: "architecture" },
	};
	const { actionId: _actionId, action: _action, ...reading } = request;
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
	expect(announcements).toContainEqual({ type: "architecture_explanations_changed" });
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
	expect(await invoke("", { request })).toEqual(started);
	expect(await invoke("", { request: { ...request, actionId: "capture-queued" } })).toMatchObject({
		success: true,
		action: { status: "queued" },
	});
	expect(await invoke("/capture-queued/cancel")).toMatchObject({
		success: true,
		action: { status: "cancelled", retryable: true },
	});
	expect(await invoke("", { request: { ...request, subjects: ["Shop#Worker"] } })).toMatchObject({
		success: false,
		code: "ACTION_CHANGED",
	});
	const before = readFileSync(join(fixture.vault, "gateway.module.json"));
	writeFileSync(join(fixture.vault, "gateway.module.json"), `${before.toString()}\n`);
	expect(await invoke("/capture-1/cancel")).toMatchObject({ success: true });
	await waitFor(
		async () => (await read()).action?.status === "cancelled",
		"the confirmed cancellation",
	);
	expect(await invoke("/capture-1/retry")).toMatchObject({
		success: true,
		action: { attempt: 2, status: "running", capture: { revision: model.revision } },
	});
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
	expect(readFileSync(join(fixture.vault, "gateway.module.json"))).toEqual(
		Buffer.from(`${before.toString()}\n`),
	);
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
