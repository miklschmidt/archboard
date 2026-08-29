import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { makeIdentity, renderBoardNote } from "../../../src/runtime/engine/board.ts";
import {
	createOpenerFixture,
	jsonBody,
	type Invocation,
	type OpenerFixture,
} from "./support/opener-fixture.ts";

async function save(fixture: OpenerFixture, invocation: Invocation): Promise<void> {
	const result = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	expect(result.status).toBe(200);
}

async function activate(caller: ReturnType<OpenerFixture["caller"]>): Promise<void> {
	const result = await caller("/api/code-targets/open", {
		method: "POST",
		body: jsonBody({ board: "system/payments", element: "node" }),
	});
	expect(result.status).toBe(200);
}

describe("machine-wide opener persistence", () => {
	test("applies the latest save to independent callers and survives a restarted base", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const vault = join(fixture.root, "vault");
		mkdirSync(vault);
		const note = join(vault, "payments.excalidraw.md");
		const identity = makeIdentity({ board: "payments" });
		writeFileSync(
			note,
			renderBoardNote(
				{
					type: "excalidraw",
					version: 2,
					elements: [
						{
							id: "node",
							type: "rectangle",
							x: 0,
							y: 0,
							width: 100,
							height: 60,
							customData: {
								archboard: {
									binding: { repo: fixture.repository, path: "src/index.ts" },
								},
							},
						},
					],
					appState: {},
					files: {},
				},
				null,
				identity,
			),
		);
		const noteBytes = readFileSync(note);
		const noteMtime = statSync(note, { bigint: true }).mtimeNs;

		const selectionA = fixture.invocation("immediate", ["selection-A"]);
		resources.defer(() => selectionA.releaseAndWait());
		await save(fixture, selectionA);
		await activate(fixture.caller());
		expect(await selectionA.waitForCapture()).toMatchObject({ extra: ["selection-A"] });

		const selectionB = fixture.invocation("immediate", ["selection-B"]);
		resources.defer(() => selectionB.releaseAndWait());
		await save(fixture, selectionB);
		const callerOne = fixture.caller();
		const callerTwo = fixture.caller();
		await activate(callerOne);
		await activate(callerTwo);
		expect(await selectionB.waitForCaptures(2)).toEqual([
			expect.objectContaining({ extra: ["selection-B"] }),
			expect.objectContaining({ extra: ["selection-B"] }),
		]);

		await fixture.restart();
		const restartedCaller = fixture.caller();
		await activate(restartedCaller);
		expect(await selectionB.waitForCaptures(3)).toHaveLength(3);
		expect(relative(vault, fixture.configFile).startsWith("..")).toBeTrue();
		expect(readFileSync(note)).toEqual(noteBytes);
		expect(statSync(note, { bigint: true }).mtimeNs).toBe(noteMtime);
		const noteText = noteBytes.toString("utf8");
		for (const forbidden of [
			"opener",
			"executable",
			"argv",
			fixture.root,
			"/api/code-targets/open",
		]) {
			expect(noteText).not.toContain(forbidden);
		}
	});
});
