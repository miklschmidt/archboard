import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import { keepTalk, readTalk, renderTalk } from "@archboard/walkthrough/recorder";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { TEST_RECORDING_CASE_MS } from "../support/timing.ts";
import { frameManifest, prepareFakeFfmpeg } from "./support/fake-ffmpeg.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const FRAMES = 33;

/** Keep one public captured reading before its source repository disappears. */
async function captured(root: string) {
	const source = join(root, "source");
	const vault = vaultIn(source);
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	writeFileSync(
		join(vault, "tour.walkthrough.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Tour",
			name: "Request tour",
			target: { state: "current" },
			beats: [
				{
					id: "Shop#Outside",
					title: "The services",
					narrative: "The gateway accepts requests.",
					reading: { grammar: "architecture", selection: ["Shop#Gateway"] },
				},
				{
					id: "Shop#Inside",
					title: "The handler",
					narrative: "The handler dispatches the request.",
					reading: { grammar: "architecture", scope: "Shop#Gateway", selection: ["Shop#Handler"] },
				},
			],
		}),
	);
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Replay fixture"],
		["config", "user.email", "replay@example.test"],
		["config", "commit.gpgsign", "false"],
		["remote", "add", "origin", "https://github.com/acme/shop.git"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed replay source"],
	]) {
		const result = Bun.spawnSync(["git", "-C", source, ...args], {
			env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
		});
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(current.error);
	const retained = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId: "replay-capture",
		writer: "fixture",
		doing: "Retain the recorded narrative",
		expectedRevision: current.revision.digest,
		dependencies: [],
	});
	if (!retained.success) throw new Error(retained.error);
	const model = await readArchitectureModel(vault, undefined, undefined, {
		checkpoint: retained.checkpoint.id,
		walkthrough: "Shop#Tour",
		shared: true,
	});
	if (!model.success || model.playback === undefined) throw new Error(JSON.stringify(model));
	return model;
}

test(
	"canonical replay uses only its captured talk and preserves frames across page counts",
	async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-canonical-replay-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const architecture = await captured(root);
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
