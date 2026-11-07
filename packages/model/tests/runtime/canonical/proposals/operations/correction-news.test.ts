import { afterEach, expect, test } from "bun:test";
import { watchArchitectureModel } from "@archboard/model/store-read";
import { editArchitectureModule } from "@archboard/model/store-write";
import { fixture, disposeFixtures, git } from "#tests/runtime/canonical/edit/operations/fixture.ts";
import {
	request,
	proposal,
	writeInProcess,
} from "#tests/runtime/canonical/proposals/operations/fixture.ts";
import type { ArchitectureEvent } from "@archboard/model/contract";

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
	let receive: ((event: ArchitectureEvent) => void) | undefined;
	const changed = new Promise<ArchitectureEvent>((resolve) => {
		receive = resolve;
	});
	const stop = watchArchitectureModel(vault, (event) => {
		if (event.type === "architecture_changed" && event.state === parent.target.state)
			receive?.(event);
	});
	try {
		const { exitCode, output } = await writeInProcess(root, vault, intent);
		expect(exitCode, output).toBe(0);
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
