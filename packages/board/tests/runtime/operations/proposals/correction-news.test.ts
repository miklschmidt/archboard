import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { watchArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule } from "@archboard/board/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import { request, proposal } from "#tests/runtime/operations/proposals/fixture.ts";
import type { ArchitectureEvent } from "@archboard/board/model";

afterEach(disposeFixtures);

test("another process announces an archive-only correction for its addressed logical state", async () => {
	const { root, vault } = fixture();
	const parent = await proposal(vault, "Recorded alternative");
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "shelve", reason: "Retain the alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const intent = {
		...(await request(vault, parent.target.state!)),
		correction: {
			previous: shelved.checkpoint.id,
			reason: "Correct the recorded description.",
			revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
		},
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Accurate historical routing." },
			},
		],
	};
	const file = join(root, "request.json");
	writeFileSync(file, JSON.stringify(intent));
	let receive: ((event: ArchitectureEvent) => void) | undefined;
	const changed = new Promise<ArchitectureEvent>((resolve) => {
		receive = resolve;
	});
	const stop = watchArchitectureModel(vault, (event) => {
		if (event.type === "architecture_changed" && event.state === parent.target.state)
			receive?.(event);
	});
	try {
		const child = Bun.spawn(
			[
				process.execPath,
				fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
				vault,
				file,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const stdout = new Response(child.stdout).text(),
			stderr = new Response(child.stderr).text();
		expect(await child.exited, `${await stdout} ${await stderr}`).toBe(0);
		expect(await changed).toMatchObject({
			type: "architecture_changed",
			vault,
			state: parent.target.state,
			reason: "completed",
		});
	} finally {
		stop();
	}
}, 20_000);
