import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { keepTalk, readTalk, renderTalk } from "@archboard/walkthrough/recorder";
import { startOwnedServer } from "../support/owned-server.ts";
import { captureCanonicalWalkthrough } from "../support/canonical-walkthrough.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_RECORDING_CASE_MS } from "../support/timing.ts";
import { frameManifest, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const FRAMES = 33;

test.each(["canonical", "retained"] as const)(
	"%s replay uses only its captured talk and preserves frame output",
	async (mode) => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-canonical-replay-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const architecture =
			mode === "canonical"
				? (await captureCanonicalWalkthrough(join(root, "source"))).architecture
				: undefined;
		const directory = join(root, "talk");
		const samples = FRAMES * 1600;
		keepTalk({
			directory,
			recordedAt: new Date("2026-10-27T00:00:00Z"),
			language: "en",
			theme: "light",
			layout: "track",
			document: architecture === undefined ? ORIGINAL : null,
			architecture,
			policy: {
				policy: architecture?.policy ?? DEFAULT_SEMANTIC_POLICY,
				configurationValid: true,
				configurationFile: ".archboard/config.yaml",
				fingerprint: architecture?.revision.digest ?? "retained",
				diagnostics: [],
			},
			board: {
				name: architecture?.manifest.name ?? "Pipeline",
				version: architecture === undefined ? 1 : 0,
				variant: architecture?.selectedState?.id ?? "Current",
				walkthrough: {
					id: architecture === undefined ? "Tour" : "Shop#Tour",
					name: "Request tour",
				},
				steps: 2,
			},
			voice: new Int16Array(samples),
			log: {
				samples,
				baseLatencyMs: 0,
				events: [
					{
						kind: "drawn",
						at: 0,
						version: architecture === undefined ? 1 : 0,
						revision: architecture?.revision.digest,
					},
					{ kind: "step", at: 1600, beat: 0 },
					{ kind: "step", at: 8 * 1600, beat: 1 },
					{ kind: "end", at: samples },
				],
			},
		});
		rmSync(join(root, "source"), { recursive: true, force: true });
		const server = await startOwnedServer({
			serverPath: join(repoRoot, "apps/server/src/server.ts"),
			vault: vaultIn(join(root, "served")),
		});
		resources.defer(() => server.dispose());
		const ffmpeg = prepareFakeFfmpeg(root);
		const talk = readTalk(directory);
		const renders = [];
		for (const pages of mode === "canonical" ? [1, 2] : [1]) {
			const out = join(root, `pages-${pages}.mp4`);
			await renderTalk({
				serverUrl: server.base,
				talk,
				directory,
				container: "mp4",
				theme: "light",
				layout: "track",
				out,
				signal: new AbortController().signal,
				say: () => undefined,
				ffmpeg: { argv: [ffmpeg.executablePath], via: "ARCHBOARD_FFMPEG" },
				pages,
			});
			renders.push(frameManifest(out));
		}
		expect(renders[0]!.frames).toHaveLength(FRAMES);
		expect([renders[0]!.width, renders[0]!.height]).toEqual([1920, 1080]);
		if (mode === "canonical") expect(renders[1]!.frames).toEqual(renders[0]!.frames);
		expect(readTalk(directory).architecture).toEqual(architecture);
		if (mode === "retained") expect(readTalk(directory).document).toEqual(ORIGINAL);
	},
	TEST_RECORDING_CASE_MS,
);

/** An exact original recording from before canonical models, including its historical schema. */
const ORIGINAL = {
	schemaVersion: "2.0.0",
	kind: "semantic-board",
	id: "Pipeline",
	name: "Pipeline",
	level: "system",
	version: 1,
	current: "Current",
	createdAt: "2026-09-30T00:00:00.000Z",
	updatedAt: "2026-09-30T00:00:00.000Z",
	views: [],
	variants: [
		{
			id: "Current",
			name: "As it is",
			lifecycle: "current",
			content: {
				nodes: [
					{ id: "Cli", name: "CLI", kind: "app", order: 1000 },
					{ id: "Server", name: "Server", kind: "service", order: 2000 },
				],
				edges: [{ id: "Call", from: "Cli", to: "Server", kind: "http", order: 1000 }],
				walkthroughs: [
					{
						id: "Tour",
						name: "Request tour",
						beats: [
							{ id: "First", heading: "The shape", body: "Two parts and one call." },
							{
								id: "Second",
								heading: "The request",
								body: "The CLI calls the server.",
								subjects: ["Call"],
							},
						],
					},
				],
			},
		},
	],
};
