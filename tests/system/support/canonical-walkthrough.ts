import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import { vaultIn } from "./test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");

/** Capture a narrative through public retention, optionally against an older target. */
async function captureCanonicalWalkthrough(source: string, olderTarget = false) {
	const vault = vaultIn(source);
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
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
	const target = olderTarget ? await retainCurrent(vault, "before-narrative") : undefined;
	writeFileSync(
		join(vault, "tour.walkthrough.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: "Shop#Tour",
			name: "Request tour",
			target: target === undefined ? { state: "current" } : { checkpoint: target.checkpoint.id },
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
	const retained = await retainCurrent(vault, "narrative-capture");
	const model = await readArchitectureModel(vault, undefined, undefined, {
		...(olderTarget ? {} : { checkpoint: retained.checkpoint.id }),
		walkthrough: "Shop#Tour",
		shared: true,
	});
	if (!model.success || model.playback === undefined) throw new Error(JSON.stringify(model));
	return { vault, architecture: model };
}

/** Retain exactly the current public revision under one fixture operation identity. */
async function retainCurrent(vault: string, operationId: string) {
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(current.error);
	const retained = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId,
		writer: "fixture",
		doing: "Retain the recorded narrative",
		expectedRevision: current.revision.digest,
		dependencies: [],
	});
	if (!retained.success) throw new Error(retained.error);
	return retained;
}

export { captureCanonicalWalkthrough };
