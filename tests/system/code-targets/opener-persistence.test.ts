import { describe, expect, test } from "bun:test";
import { relative } from "node:path";

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
		expect(relative(fixture.checkout, fixture.configFile).startsWith("..")).toBeTrue();
	});
});
