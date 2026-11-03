// Opening a file an agent's answer names (ADR 0018): it opens at the named line
// inside a checkout that the vault reads, and nothing opens outside one, not
// even through a link inside the checkout that leads out of it.

import { expect, test } from "bun:test";
import { readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CodeTargetOpenReplySchema } from "@archboard/code-opener/opening";
import { createOpenerFixture, jsonBody, type OpenerFixture } from "./support/opener-fixture.ts";

/**
 * Open a file as an answer names it.
 * @param fixture The fixture.
 * @param request The path and its line.
 * @returns The route's answer.
 */
function openNamed(fixture: OpenerFixture, request: { path: string; line?: number }) {
	return fixture.request("/api/code-targets/open", {
		method: "POST",
		body: jsonBody(request),
	});
}

test("a file in a checkout the vault reads opens at the line the answer names", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await createOpenerFixture();
	resources.defer(() => fixture.dispose());
	const invocation = fixture.invocation("immediate", ["--at={line}"]);
	resources.defer(() => invocation.releaseAndWait());
	const saved = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	expect(saved.status).toBe(200);

	const result = await openNamed(fixture, {
		path: join(fixture.checkout, "src/index.ts"),
		line: 24,
	});
	expect(result.status).toBe(200);
	expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
		success: true,
		repository: fixture.repository,
		path: "src/index.ts",
		kind: "file",
	});
	expect(await invocation.waitForCapture()).toMatchObject({
		target: join(realpathSync.native(fixture.checkout), "src/index.ts"),
		extra: ["--at=24"],
	});
});

test("a file outside every checkout the vault reads opens nothing", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await createOpenerFixture();
	resources.defer(() => fixture.dispose());
	const invocation = fixture.invocation("immediate");
	resources.defer(() => invocation.releaseAndWait());
	const saved = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	expect(saved.status).toBe(200);
	const outside = join(fixture.root, "outside.ts");
	writeFileSync(outside, "export {};\n");
	const leading = join(fixture.checkout, "src", "leads-out.ts");
	symlinkSync(outside, leading);

	for (const path of [outside, leading]) {
		const result = await openNamed(fixture, { path });
		expect(result.status).toBe(422);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: false,
			code: "TARGET_OUTSIDE_CHECKOUT",
		});
	}
	expect(readdirSync(invocation.captureDirectory)).toEqual([]);
});
