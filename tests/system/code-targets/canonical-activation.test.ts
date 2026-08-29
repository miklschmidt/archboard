import { describe, expect, test } from "bun:test";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { makeIdentity, renderBoardNote } from "../../../src/runtime/engine/board.ts";
import { boards, getOrCreateBoard } from "../../../src/runtime/engine/board-store.ts";
import { CodeTargetOpenReplySchema } from "../../../src/shared/code-target/index.ts";
import { createOpenerFixture, jsonBody } from "./support/opener-fixture.ts";

describe("canonical public activation owner", () => {
	test("re-reads the real note binding without changing note bytes or mtime", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture({ defaultDependencies: true });
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		const identity = makeIdentity({ board: "system/payments" });
		const { key, board } = getOrCreateBoard(identity);
		resources.defer(() => {
			boards.delete(key);
		});
		const note = join(fixture.root, "system-payments.excalidraw.md");
		board.file = note;
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
		const beforeBytes = readFileSync(note);
		const beforeMtime = statSync(note, { bigint: true }).mtimeNs;

		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody(invocation.selection),
				})
			).status,
		).toBe(200);
		const result = await fixture.request("/api/code-targets/open", {
			method: "POST",
			body: jsonBody({ board: key, element: "node" }),
		});
		expect(result.status).toBe(200);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: true,
			repository: fixture.repository,
			path: "src/index.ts",
		});
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "src/index.ts"),
		});
		expect(readFileSync(note)).toEqual(beforeBytes);
		expect(statSync(note, { bigint: true }).mtimeNs).toBe(beforeMtime);
	});
});
