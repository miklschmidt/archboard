import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
} from "@archboard/board/store-write";

import { join } from "node:path";
import { canonicalNarration } from "./support/canonical-narration.ts";
import { waitFor } from "./support/http.ts";
import { TEST_CASE_TIMEOUT_MS } from "../support/timing.ts";

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

describe("live narration", () => {
	let resources: AsyncDisposableStack;
	let voice: Awaited<ReturnType<typeof canonicalNarration>>;
	beforeAll(async () => {
		resources = new AsyncDisposableStack();
		try {
			voice = await canonicalNarration(resources);
		} catch (error) {
			await resources.disposeAsync();
			throw error;
		}
	}, TEST_CASE_TIMEOUT_MS);
	afterAll(async () => resources.disposeAsync(), TEST_CASE_TIMEOUT_MS);
	// Retained fixture preparation has its own hook deadline. This callback owns
	// the live socket delivery, pinned narration, and external-change assertions.
	test("canonical live narration keeps captured beats while live edits update quiet context", async () => {
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
		const appends = () => voice.frames("thread/realtime/appendText").length + voice.spoken().length;
		const before = appends();
		const walk = structuredClone(voice.model.playback!.walkthrough);
		for (const beat of walk.beats) beat.narrative = "Foreign replacement narration.";
		writeFileSync(
			join(voice.fixture.vault, walk.file),
			JSON.stringify({ ...walk, file: undefined }),
		);
		await waitFor(() => appends() > before, "the external edit to reach voice context");
		expect(voice.spoken()).toHaveLength(1);
		const external = voice.frames("thread/realtime/appendText").at(-1)?.params?.["text"];
		expect(external).toContain(voice.model.manifest.name);
		expect(external).not.toMatch(/\bagent\b/u);
		const current = readArchitectureModel(voice.fixture.vault);
		if (!current.success) throw new Error(JSON.stringify(current));
		const target = { model: current.manifest.id, state: current.selectedState!.id };
		const writer = "outside-narration-writer";
		const doing = "Name the live worker after the capture";
		const claim = await claimArchitectureSubjects(voice.fixture.vault, {
			target,
			writer,
			reason: doing,
			subjects: ["Shop#Worker"],
		});
		if (!claim.success) throw new Error(JSON.stringify(claim));
		try {
			const edited = await editArchitectureModule(voice.fixture.vault, {
				target,
				writer,
				doing,
				operationId: "rename-during-captured-narration",
				claim: claim.claim.id,
				expectedRevision: current.revision,
				changes: [{ type: "edit-module", subject: "Shop#Worker", set: { name: "Live worker" } }],
			});
			expect(edited).toMatchObject({ success: true });
		} finally {
			await releaseArchitectureClaim(voice.fixture.vault, { claim: claim.claim.id, writer });
		}
		await waitFor(
			() =>
				voice
					.frames("thread/realtime/appendText")
					.some((frame) => String(frame.params?.["text"]).includes(doing)),
			"the durable writer's doing line to reach quiet voice context",
		);
		expect(voice.spoken()).toHaveLength(1);
		await voice.report(voice.beat(1));
		await waitFor(() => voice.spoken().length === 2, "the next captured beat to reach live voice");
		expect(voice.spoken()[1]).toContain("The worker handles the request.");
		expect(voice.spoken()[1]).not.toContain("Foreign");
		expect(voice.spoken()[1]).not.toContain("Live worker");
		await voice.report(null);
		await waitFor(() => voice.spoken().length === 3, "leaving to end live narration");
		const browsing = readArchitectureModel(voice.fixture.vault);
		if (!browsing.success) throw new Error(JSON.stringify(browsing));
		await voice.report(null, {
			vault: voice.fixture.vault,
			model: browsing.manifest.id,
			expectedRevision: browsing.revision.digest,
			selection: {},
			subjects: [],
			reading: voice.architecture.reading,
		});
		const quietBefore = voice.frames("thread/realtime/appendText").length;
		const workerFile = join(voice.fixture.vault, "worker.module.json");
		const worker = JSON.parse(readFileSync(workerFile, "utf8"));
		writeFileSync(workerFile, JSON.stringify({ ...worker, name: "Outside worker" }));
		await waitFor(
			() => voice.frames("thread/realtime/appendText").length > quietBefore,
			"ordinary browsing to hear external changes after a durable writer",
		);
		expect(voice.spoken()).toHaveLength(3);
		const ordinary = voice.frames("thread/realtime/appendText").at(-1)?.params?.["text"];
		expect(ordinary).toContain(voice.model.manifest.name);
		expect(ordinary).not.toMatch(/\bagent\b/u);
		expect(ordinary).not.toContain(doing);
	});
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
