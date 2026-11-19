// Opening a file an agent's answer names (ADR 0018): it opens at the named line
// inside a checkout that the vault reads, and nothing opens outside one, not
// even through a link inside the checkout that leads out of it. A code export of the
// About page names its file in its repository instead, and opens at the line that defines
// it now, or at the line the code check read (TASK-646.08).

import { expect, test } from "bun:test";
import { readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CodeTargetOpenReplySchema } from "#shared/schemas/code-target-open.ts";
import {
	createOpenerFixture,
	jsonBody,
	type OpenerFixture,
} from "#tests/server/support/opener-fixture.ts";

/**
 * Open a file as an answer names it.
 * @param fixture The fixture.
 * @param request The path and its line.
 * @returns The route's answer.
 */
function openNamed(
	fixture: OpenerFixture,
	request: { path: string; line?: number; repo?: string; symbol?: string },
) {
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

test("a file of a repository the vault reads opens where its export is defined now", async () => {
	await using resources = new AsyncDisposableStack();
	const fixture = await createOpenerFixture();
	resources.defer(() => fixture.dispose());
	writeFileSync(
		join(fixture.checkout, "src/ledger.ts"),
		"// The ledger.\n\nexport function settle(): void {}\n",
	);
	const target = join(realpathSync.native(fixture.checkout), "src/ledger.ts");
	for (const [symbol, opened] of [
		["settle", "--at=3"],
		["moved", "--at=1"],
	] as const) {
		const invocation = fixture.invocation("immediate", ["--at={line}"]);
		resources.defer(() => invocation.releaseAndWait());
		const saved = await fixture.request("/api/settings/opener", {
			method: "PUT",
			body: jsonBody(invocation.selection),
		});
		expect(saved.status).toBe(200);
		const result = await openNamed(fixture, {
			repo: fixture.repository,
			path: "src/ledger.ts",
			symbol,
			line: 1,
		});
		expect(result.status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({ target, extra: [opened] });
	}
});

test("a file of a repository the vault does not read, or one that leaves its checkout, opens nothing", async () => {
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
	writeFileSync(join(fixture.root, "outside.ts"), "export {};\n");

	for (const [repo, path] of [
		["github.com/acme/elsewhere", "src/index.ts"],
		[fixture.repository, "../outside.ts"],
	] as const) {
		const result = await openNamed(fixture, { repo, path, line: 1 });
		expect(result.status).toBe(422);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: false,
			code: "TARGET_OUTSIDE_CHECKOUT",
		});
	}
	expect(readdirSync(invocation.captureDirectory)).toEqual([]);
});
