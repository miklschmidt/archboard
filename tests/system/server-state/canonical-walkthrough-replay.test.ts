import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { keepTalk, readTalk, renderTalk } from "@archboard/walkthrough/recorder";
import { startOwnedServer } from "../support/owned-server.ts";
import { captureCanonicalWalkthrough } from "../support/canonical-walkthrough.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_RECORDING_CASE_MS } from "../support/timing.ts";
import { frameManifest, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const FRAMES = 33;

test(
	"canonical replay uses only its captured talk and preserves frames across page counts",
	async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-canonical-replay-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const { architecture } = await captureCanonicalWalkthrough(join(root, "source"));
		const directory = join(root, "talk");
		const samples = FRAMES * 1600;
		keepTalk({
			directory,
			recordedAt: new Date("2026-10-27T00:00:00Z"),
			language: "en",
			theme: "light",
			layout: "track",
			document: null,
			architecture,
			policy: {
				policy: architecture.policy,
				configurationValid: true,
				configurationFile: ".archboard/config.yaml",
				fingerprint: architecture.revision.digest,
				diagnostics: [],
			},
			board: {
				name: architecture.manifest.name,
				version: 0,
				variant: architecture.selectedState!.id,
				walkthrough: { id: "Shop#Tour", name: "Request tour" },
				steps: 2,
			},
			voice: new Int16Array(samples),
			log: {
				samples,
				baseLatencyMs: 0,
				events: [
					{ kind: "drawn", at: 0, version: 0, revision: architecture.revision.digest },
					{ kind: "step", at: 1600, beat: 0 },
					{ kind: "step", at: 8 * 1600, beat: 1 },
					{ kind: "end", at: samples },
				],
			},
		});
		rmSync(join(root, "source"), { recursive: true });
		const server = await startOwnedServer({
			serverPath: join(repoRoot, "apps/server/src/server.ts"),
			vault: vaultIn(join(root, "served")),
		});
		resources.defer(() => server.dispose());
		const ffmpeg = prepareFakeFfmpeg(root);
		const talk = readTalk(directory);
		const renders = [];
		for (const pages of [1, 2]) {
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
		expect(renders[1]!.frames).toEqual(renders[0]!.frames);
		expect(readTalk(directory).architecture).toEqual(architecture);
	},
	TEST_RECORDING_CASE_MS,
);
