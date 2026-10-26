import { drive, type RecordingPageHandle } from "#runtime/clients/recording-page.ts";
import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule, claimArchitectureSubjects } from "@archboard/board/store-write";
import { TalkSchema, talkFrom } from "#shared/protocol/talk.ts";
import { recordingPageUrl } from "@archboard/walkthrough/recorder";
import { readTalk, writeTalk, askedTalkPlace } from "#runtime/store/talk-files.ts";
import { fixtureTalk, fixtureVoice } from "#tests/runtime/support/talk-fixture.ts";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

test("the existing talk store and page address preserve exact canonical playback and refuse revision drift", async () => {
	const home = mkdtempSync(join(tmpdir(), "archboard-canonical-talk-"));
	homes.push(home);
	const vault = join(home, ".archboard/vault");
	cpSync(resolve("examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Talk Author"],
		["config", "user.email", "talk@example.test"],
		["config", "commit.gpgsign", "false"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed model"],
	]) {
		const done = Bun.spawnSync(["git", "-C", home, ...args]);
		if (done.exitCode !== 0) throw new Error(done.stderr.toString());
	}
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.selectedState!.id };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "recording test",
		subjects: ["Shop"],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const edit = await editArchitectureModule(vault, {
		target,
		writer: "agent",
		claim: claim.claim.id,
		doing: "authoring a tour",
		operationId: "tour",
		expectedRevision: current.revision,
		changes: [
			{
				type: "add-walkthrough",
				walkthrough: {
					name: "Tour",
					target: { state: "current" },
					beats: [
						{
							title: "Read",
							narrative: "Read the model.",
							reading: {
								grammar: "architecture",
								selection: [],
								focus: [],
								filters: { relationships: [], groups: [] },
							},
						},
					],
				},
			},
		],
	});
	if (!edit.success) throw new Error(JSON.stringify(edit));
	const architecture = await readArchitectureModel(vault, undefined, undefined, {
		walkthrough: "Tour",
		checkpoint: edit.checkpoint.id,
		shared: true,
	});
	if (!architecture.success || !architecture.playback)
		throw new Error(JSON.stringify(architecture));
	const base = fixtureTalk();
	const talk = TalkSchema.parse({
		...base,
		document: null,
		architecture,
		board: {
			name: architecture.manifest.name,
			version: 0,
			variant: architecture.selectedState!.id,
			walkthrough: { id: architecture.playback.walkthrough.id, name: "Tour" },
			steps: 1,
		},
		events: [
			{ kind: "drawn", at: 0, version: 0, revision: architecture.revision.digest },
			{ kind: "step", at: 0, beat: 0 },
			{ kind: "end", at: base.audio.samples },
		],
	});
	let loaded: unknown;
	let began = false;
	const order: string[] = [];
	const page: RecordingPageHandle = {
		evaluate: async (expression) => {
			if (expression.startsWith("typeof")) return true;
			if (expression.includes(".load(")) {
				loaded = JSON.parse(expression.slice(expression.indexOf(".load(") + 6, -1));
				order.push("load");
				return undefined;
			}
			if (expression.includes(".start(")) {
				began = true;
				order.push("start");
				return undefined;
			}
			if (expression.includes(".talk("))
				return { samples: talk.audio.samples, baseLatencyMs: 0, events: talk.events };
			return {
				phase: began ? "finished" : "ready",
				walkthrough: talk.board.walkthrough.id,
				step: began ? 1 : null,
				of: 1,
				failure: null,
				durationMs: began ? 3000 : null,
			};
		},
		saveBlob: async () => 44,
	};
	const captured = await drive(page, {
		voice: join(home, "controlled.wav"),
		architecture,
		signal: new AbortController().signal,
		onProgress: () => undefined,
	});
	expect(loaded).toEqual(architecture);
	expect(order).toEqual(["load", "start"]);
	expect(captured.log.events).toEqual(talk.events);
	const directory = writeTalk({
		talk,
		voice: fixtureVoice(),
		place: askedTalkPlace(join(home, "talk")),
	});
	expect(readTalk(directory)).toEqual(talk);
	const rebuilt = talkFrom({
		...talk,
		recordedAt: new Date(talk.recordedAt),
		log: {
			samples: talk.audio.samples,
			baseLatencyMs: talk.audio.baseLatencyMs,
			events: talk.events,
		},
	});
	expect(rebuilt.success && rebuilt.data.architecture).toEqual(architecture);
	const url = new URL(
		recordingPageUrl({
			serverUrl: "http://localhost:3000",
			architecture,
			vault,
			variant: null,
			repository: null,
			language: "en",
			against: null,
			walkthrough: talk.board.walkthrough,
		}),
	);
	expect(url.searchParams.get("checkpointA")).toBe(edit.checkpoint.id);
	expect(url.searchParams.get("modelA")).toBe("Shop");
	expect(url.searchParams.get("recordVault")).toBe(vault);
	expect(
		TalkSchema.safeParse({
			...talk,
			events: [{ kind: "drawn", at: 0, version: 0, revision: "other" }, ...talk.events.slice(1)],
		}).success,
	).toBe(false);
	expect(
		TalkSchema.safeParse({ ...talk, architecture: { ...architecture, checkpoint: undefined } })
			.success,
	).toBe(false);
});
