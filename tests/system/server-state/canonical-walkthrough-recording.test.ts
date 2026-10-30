import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { freshTalkPlace, recordWalkthrough, readTalk } from "@archboard/walkthrough/recorder";
import { captureCanonicalWalkthrough } from "../support/canonical-walkthrough.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { TEST_RECORDING_CASE_MS, TEST_RECORDING_CLI_MS } from "../support/timing.ts";
import { declareTestWallClockBudget } from "../repository-policy/support/test-wall-clock.ts";
import { prepareProductionFixture, productionRecords } from "./support/codex-production.ts";
import { productionServer } from "./support/production-server.ts";
import { prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";

const CASE = "canonical recording keeps a narrative whose retained target predates its source";

test(
	CASE,
	async () => {
		declareTestWallClockBudget({
			test: CASE,
			reason:
				"The existing recording owner paces two spoken beats on real time, then renders every frame from the saved talk.",
			outerBoundMs: TEST_RECORDING_CASE_MS,
			task: "TASK-549.14",
			evidence:
				"The legacy walkthrough-recording owner uses this same two-pass runtime; canonical replay already passes its complete frame comparisons.",
		});
		await using resources = new AsyncDisposableStack();
		const fixture = prepareProductionFixture(
			resources,
			join(import.meta.dir, "fixtures/fake-codex-production.ts"),
		);
		const { architecture } = await captureCanonicalWalkthrough(fixture.root, true);
		expect(architecture.playback!.sourceRevision.digest).not.toBe(architecture.revision.digest);
		writeFileSync(fixture.controlPath, JSON.stringify({ narrates: true }));
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
		const ffmpeg = prepareFakeFfmpeg(fixture.root);
		const directory = join(fixture.root, "kept-talk");
		const previousEncoder = process.env["ARCHBOARD_FFMPEG"];
		process.env["ARCHBOARD_FFMPEG"] = ffmpeg.executablePath;
		resources.defer(() => {
			if (previousEncoder === undefined) delete process.env["ARCHBOARD_FFMPEG"];
			else process.env["ARCHBOARD_FFMPEG"] = previousEncoder;
		});
		const result = await recordWalkthrough({
			architecture,
			vault: fixture.vault,
			serverUrl: server.base,
			policy: {
				policy: architecture.policy,
				configurationValid: true,
				configurationFile: ".archboard/config.yaml",
				fingerprint: architecture.revision.digest,
				diagnostics: [],
			},
			variant: architecture.selectedState!.id,
			against: null,
			repository: null,
			walkthrough: { id: "Shop#Tour", name: "Request tour" },
			language: "en",
			container: "mp4",
			theme: "light",
			layout: "track",
			out: join(fixture.root, "tour.mp4"),
			talk: freshTalkPlace(directory, architecture.manifest.name, new Date()),
			signal: AbortSignal.timeout(TEST_RECORDING_CLI_MS),
			onProgress: () => undefined,
			say: () => undefined,
		});
		expect(result.steps).toBe(2);
		const talk = readTalk(directory);
		expect(talk.architecture?.playback?.sourceRevision.digest).toBe(
			architecture.playback!.sourceRevision.digest,
		);
		expect(talk.architecture?.revision.digest).toBe(architecture.revision.digest);
		expect(talk.events.flatMap((event) => (event.kind === "step" ? [event.beat] : []))).toEqual([
			0, 1,
		]);
		expect([
			...new Set(talk.events.flatMap((event) => (event.kind === "drawn" ? [event.revision] : []))),
		]).toEqual([architecture.revision.digest]);
		const speech = productionRecords(fixture.logPath).filter(
			(entry) => entry.kind === "frame" && entry.method === "thread/realtime/appendSpeech",
		);
		expect(
			speech.map((entry) =>
				["The services", "The handler"].find((title) =>
					String(entry.params?.["text"]).includes(title),
				),
			),
		).toEqual(["The services", "The handler"]);
	},
	TEST_RECORDING_CASE_MS,
);
