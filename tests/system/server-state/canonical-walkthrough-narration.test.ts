import { expect, test } from "bun:test";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { readArchitectureModel } from "@archboard/board/store-read";

import { join } from "node:path";
import { canonicalNarration } from "./support/canonical-narration.ts";
import { waitFor } from "./support/http.ts";

test("canonical recording resolves a newer narrative source against its exact older target", async () => {
	await using resources = new AsyncDisposableStack();
	const voice = await canonicalNarration(resources);
	expect(voice.model.walkthroughs).toHaveLength(0);
	expect(voice.model.playback!.sourceRevision.digest).not.toBe(voice.model.revision.digest);
	expect(await voice.start()).toMatchObject({ ok: true, value: { outcome: "delivered" } });
	expect(voice.presentationRequests).toEqual([]);
	expect(voice.spoken()).toEqual([]);
	await voice.report(voice.beat(0, false));
	expect(voice.spoken()).toEqual([]);
	await voice.report(voice.beat(0));
	await waitFor(() => voice.spoken().length === 1, "the canonical first beat to reach voice");
	expect(voice.spoken()[0]).toContain("The gateway accepts the request.");
	expect(voice.spoken()[0]).toContain("Gateway");
	const walk = structuredClone(voice.model.playback!.walkthrough);
	for (const beat of walk.beats) beat.narrative = "Foreign replacement narration.";
	writeFileSync(join(voice.fixture.vault, walk.file), JSON.stringify({ ...walk, file: undefined }));
	const workerFile = join(voice.fixture.vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(workerFile, "utf8"));
	writeFileSync(workerFile, JSON.stringify({ ...worker, name: "Foreign worker" }));
	await voice.report(voice.beat(2));
	await voice.report(voice.beat(99));
	await voice.report(voice.beat(1, false));
	expect(voice.spoken()).toHaveLength(1);
	await voice.report(voice.beat(1));
	await waitFor(() => voice.spoken().length === 2, "the pinned worker beat to reach voice");
	expect(voice.spoken()[1]).toContain("The worker handles the request.");
	expect(voice.spoken()[1]).not.toContain("Foreign");
	await voice.report(null);
});

test("canonical live narration requests and acknowledges its first beat without a legacy board key", async () => {
	await using resources = new AsyncDisposableStack();
	const voice = await canonicalNarration(resources);
	const requested = Promise.withResolvers<Record<string, unknown>>();
	voice.socket.socket.on("message", (raw) => {
		const message = JSON.parse(String(raw));
		if (message.type === "pane_present") requested.resolve(message);
	});
	expect(await voice.start(false)).toMatchObject({ value: { outcome: "delivered" } });
	const message = await requested.promise;
	expect(message).toMatchObject({
		type: "pane_present",
		walkthrough: voice.model.playback!.walkthrough.id,
		beat: 0,
	});
	expect(message).not.toHaveProperty("board");
	expect(voice.spoken()).toEqual([]);
	await voice.report(voice.beat(0, false, String(message["request"])));
	expect(voice.spoken()).toEqual([]);
	await voice.report(voice.beat(0, true, String(message["request"])));
	await waitFor(() => voice.spoken().length === 1, "the requested canonical beat to arrive");
	expect(voice.spoken()[0]).toContain("The gateway accepts the request.");
	await voice.report(null);
	await waitFor(() => voice.spoken().length === 2, "leaving to end live narration");
});

test("changed canonical source and target guards refuse voice without a provider start", async () => {
	await using resources = new AsyncDisposableStack();
	const voice = await canonicalNarration(resources);
	await voice.report(null, { ...voice.architecture, expectedSourceRevision: "0".repeat(64) });
	expect(await voice.start()).toMatchObject({ value: { outcome: "not_delivered" } });
	expect(voice.frames("thread/realtime/start")).toEqual([]);
	await voice.report(null, { ...voice.architecture, expectedRevision: "0".repeat(64) });
	expect(await voice.start()).toMatchObject({ value: { outcome: "not_delivered" } });
	expect(voice.frames("thread/realtime/start")).toEqual([]);
	// The target remains valid while the source narrative changes.
	const walk = voice.model.playback!.walkthrough;
	writeFileSync(
		join(voice.fixture.vault, walk.file),
		JSON.stringify({ ...walk, file: undefined, name: "Changed narrative" }),
	);
	await voice.report(null);
	expect(await voice.start()).toMatchObject({ value: { outcome: "not_delivered" } });
	expect(voice.frames("thread/realtime/start")).toEqual([]);
});

test("unavailable canonical source and target history never substitute mutable current inputs", async () => {
	await using resources = new AsyncDisposableStack();
	const voice = await canonicalNarration(resources);
	await voice.report(null, {
		...voice.architecture,
		selection: { walkthrough: voice.model.playback!.walkthrough.id, checkpoint: "0".repeat(40) },
	});
	expect(await voice.start()).toMatchObject({ value: { outcome: "not_delivered" } });
	expect(voice.frames("thread/realtime/start")).toEqual([]);
	rmSync(join(voice.fixture.root, ".git"), { recursive: true, force: true });
	await voice.report(null);
	expect(await voice.start()).toMatchObject({ value: { outcome: "not_delivered" } });
	expect(voice.frames("thread/realtime/start")).toEqual([]);
});

test("an exact narrative source retains its server-owned checkpoint selection", async () => {
	await using resources = new AsyncDisposableStack();
	const voice = await canonicalNarration(resources);
	const walk = voice.model.playback!.walkthrough;
	const exact = await readArchitectureModel(voice.fixture.vault, undefined, undefined, {
		walkthrough: walk.id,
		checkpoint: voice.sourceCheckpoint,
		shared: true,
	});
	if (!exact.success || exact.playback === undefined) throw new Error(JSON.stringify(exact));
	await voice.report(null, {
		...voice.architecture,
		expectedRevision: exact.revision.digest,
		expectedSourceRevision: exact.playback.sourceRevision.digest,
		selection: exact.playback.source,
	});
	expect(await voice.start()).toMatchObject({ value: { outcome: "delivered" } });
});

test("a proposal narrative source retains its server-owned state selection", async () => {
	await using resources = new AsyncDisposableStack();
	const voice = await canonicalNarration(resources, true);
	expect(voice.architecture.selection?.state).not.toBe("Current");
	expect(await voice.start()).toMatchObject({ value: { outcome: "delivered" } });
	await voice.report(voice.beat(0));
	await waitFor(() => voice.spoken().length === 1, "the proposed narrative source to reach voice");
	expect(voice.spoken()[0]).toContain("The proposed gateway accepts the request.");
});

test("replacing live narration with recording discards the old first-beat acknowledgement", async () => {
	await using resources = new AsyncDisposableStack();
	const voice = await canonicalNarration(resources);
	const requested = Promise.withResolvers<Record<string, unknown>>();
	voice.socket.socket.on("message", (raw) => {
		const message = JSON.parse(String(raw));
		if (message.type === "pane_present") requested.resolve(message);
	});
	expect(await voice.start(false)).toMatchObject({ value: { outcome: "delivered" } });
	const old = await requested.promise;
	expect(await voice.start()).toMatchObject({ value: { outcome: "delivered" } });
	await voice.report(voice.beat(0, true, String(old["request"])));
	await voice.report(voice.beat(1));
	await waitFor(() => voice.spoken().length >= 1, "the recording page's own beat to reach voice");
	expect(voice.spoken()).toHaveLength(1);
	expect(voice.spoken()[0]).toContain("The worker handles the request.");
});
