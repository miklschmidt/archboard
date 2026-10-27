import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initializeArchitectureModel,
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
} from "@archboard/board/store-write";
import { readArchitectureModel } from "@archboard/board/store-read";
import { semanticChangeFeed } from "#server/services/panes/change-feed.ts";
const homes: string[] = [];
afterEach(() => {
	semanticChangeFeed.dispose();
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
test("the existing agent feed attributes durable canonical edits without legacy board announcements", async () => {
	const home = mkdtempSync(join(tmpdir(), "archboard-news-"));
	homes.push(home);
	for (const args of [
		["init", "-q"],
		["config", "user.name", "News Author"],
		["config", "user.email", "news@example.test"],
		["config", "commit.gpgsign", "false"],
	]) {
		const ran = Bun.spawnSync(["git", "-C", home, ...args]);
		if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
	}
	const vault = join(home, ".archboard/vault");
	mkdirSync(vault, { recursive: true });
	const initialized = await initializeArchitectureModel(vault, {
		name: "Shop",
		operationId: "init",
		writer: "installer",
		doing: "Initialize model",
	});
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	const model = readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	const target = { model: model.manifest.id, state: null };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "thread-42",
		reason: "Plan the initial state",
		subjects: [model.manifest.id],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const events: Parameters<Parameters<typeof semanticChangeFeed.onChange>[0]>[0][] = [];
	semanticChangeFeed.follow(vault);
	semanticChangeFeed.onChange((event) => events.push(event));
	const edited = await editArchitectureModule(vault, {
		target,
		writer: "thread-42",
		doing: "Plan the initial state",
		claim: claim.claim.id,
		expectedRevision: model.revision,
		operationId: "initial",
		proposal: { type: "create", name: "Initial" },
		changes: [],
	});
	expect(edited).toMatchObject({ success: true });
	expect(events).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				vault,
				board: `model:${model.manifest.id}`,
				by: "thread-42",
				origin: "agent",
			}),
		]),
	);
	expect(events.every((event) => event.cursor > 0)).toBe(true);
	await releaseArchitectureClaim(vault, { claim: claim.claim.id, writer: "thread-42" });
});
