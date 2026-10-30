import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOARD_LOCK_MS } from "@archboard/timing";
import { readArchitectureModel, listArchitectureCheckpoints } from "@archboard/board/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/board/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

const now = Date.now;
afterEach(() => {
	Date.now = now;
	disposeFixtures();
});

test.each(["prepared", "installed"])(
	"an archive-only correction recovers after durable %s and retains one event",
	async (point) => {
		const { root, vault } = fixture();
		const parent = await proposal(vault, "Recorded alternative");
		const shelved = await editArchitectureModule(vault, {
			...(await request(vault, parent.target.state!)),
			proposal: { type: "shelve", reason: "Keep the alternative." },
			changes: [],
		});
		if (!shelved.success) throw new Error(JSON.stringify(shelved));
		const intent = {
			...(await request(vault, parent.target.state!)),
			correction: {
				previous: shelved.checkpoint.id,
				reason: "Correct its recorded routing.",
				revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
			},
			changes: [
				{
					type: "edit-module" as const,
					subject: "Shop#Gateway",
					set: { description: "Accurate routing." },
				},
			],
		};
		const file = join(root, "request.json");
		writeFileSync(file, JSON.stringify(intent));
		const child = Bun.spawn(
			[
				process.execPath,
				"--preload",
				fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
				fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
				vault,
				file,
			],
			{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: point }, stdout: "pipe", stderr: "pipe" },
		);
		const stdout = new Response(child.stdout).text(),
			stderr = new Response(child.stderr).text();
		expect(await child.exited, `${await stdout} ${await stderr}`).toBe(86);
		Date.now = () => now() + BOARD_LOCK_MS.lease;
		expect(readArchitectureModel(vault)).toMatchObject({
			success: false,
			code: "RECOVERY_REQUIRED",
		});
		const recovered = await recoverArchitectureModel(vault);
		expect(recovered).toMatchObject({
			success: true,
			operation: { success: true, cleanup: "complete" },
		});
		if (!recovered.success || recovered.operation === undefined)
			throw new Error(JSON.stringify(recovered));
		expect(await editArchitectureModule(vault, intent)).toEqual(recovered.operation);
		expect(
			(await selected(vault, parent.target.state!)).modules.find(
				(module) => module.id === "Shop#Gateway",
			)?.description,
		).toBe("Accurate routing.");
		const history = await listArchitectureCheckpoints(vault);
		if (!history.success) throw new Error(JSON.stringify(history));
		expect(
			history.checkpoints.filter((checkpoint) => checkpoint.correction !== undefined),
		).toHaveLength(1);
	},
	15_000,
);
