import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CodeTargetOpenReplySchema } from "../../../src/shared/code-target/index.ts";
import {
	createOpenerFixture,
	jsonBody,
	type Invocation,
	type OpenerFixture,
} from "./support/opener-fixture.ts";

async function saveSelection(fixture: OpenerFixture, invocation: Invocation): Promise<void> {
	const saved = await fixture.request("/api/settings/opener", {
		method: "PUT",
		body: jsonBody(invocation.selection),
	});
	expect(saved.status).toBe(200);
}

async function activate(
	fixture: OpenerFixture,
	body: unknown = { board: "system/payments", element: "node" },
) {
	return fixture.request("/api/code-targets/open", { method: "POST", body: jsonBody(body) });
}

describe("public code-target activation contract", () => {
	test.each([
		["src/index.ts", "file"],
		["src/directory", "directory"],
		["src/inside-file.ts", "file"],
		["src/inside-directory", "directory"],
	] as const)("opens canonical in-root target %s", async (relative, kind) => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		if (relative === "src/inside-file.ts")
			symlinkSync("index.ts", join(fixture.checkout, relative));
		if (relative === "src/inside-directory")
			symlinkSync("directory", join(fixture.checkout, relative));
		fixture.writeBinding({ repo: fixture.repository, path: relative });
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		await saveSelection(fixture, invocation);

		const result = await activate(fixture);
		expect(result.status).toBe(200);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: true,
			repository: fixture.repository,
			path: relative,
			kind,
		});
		const capture = await invocation.waitForCapture();
		expect(capture.target).toBe(
			relative.includes("inside-")
				? join(
						fixture.checkout,
						relative === "src/inside-file.ts" ? "src/index.ts" : "src/directory",
					)
				: join(fixture.checkout, relative),
		);
	});

	test.each([
		["../outside/secret.ts", "TARGET_OUTSIDE_CHECKOUT"],
		["src/outside-file.ts", "TARGET_OUTSIDE_CHECKOUT"],
		["src/outside-directory", "TARGET_OUTSIDE_CHECKOUT"],
		["src/missing.ts", "TARGET_UNAVAILABLE"],
	] as const)("refuses %s without spawning", async (relative, code) => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const outside = join(fixture.root, "outside");
		mkdirSync(outside, { recursive: true });
		writeFileSync(join(outside, "secret.ts"), "secret\n");
		if (relative === "src/outside-file.ts")
			symlinkSync(join(outside, "secret.ts"), join(fixture.checkout, relative));
		if (relative === "src/outside-directory")
			symlinkSync(outside, join(fixture.checkout, relative));
		fixture.writeBinding({ repo: fixture.repository, path: relative });
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		await saveSelection(fixture, invocation);

		const result = await activate(fixture);
		expect(result.status).toBe(422);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({ success: false, code });
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
	});

	test("re-reads the canonical binding instead of a presentation copy", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		await saveSelection(fixture, invocation);
		fixture.writeBinding({ repo: fixture.repository, path: "src/directory" });

		const result = await activate(fixture);
		expect(result.status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({
			target: join(fixture.checkout, "src/directory"),
		});
	});

	test("refuses changed checkout identity before spawn", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		await saveSelection(fixture, invocation);
		Bun.spawnSync(["git", "remote", "set-url", "origin", "https://github.com/other/repo.git"], {
			cwd: fixture.checkout,
		});

		const result = await activate(fixture);
		expect(result.status).toBe(409);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: false,
			code: "CHECKOUT_IDENTITY_CHANGED",
		});
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
	});

	test.each([
		["other/board", "node", "BOARD_NOT_FOUND", 404],
		["system/payments", "missing", "ELEMENT_NOT_FOUND", 404],
	] as const)("refuses missing canonical identity %s/%s", async (board, element, code, status) => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const result = await activate(fixture, { board, element });
		expect(result.status).toBe(status);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({ success: false, code });
	});

	test("refuses a missing canonical binding", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		fixture.writeBinding(null);
		const result = await activate(fixture);
		expect(result.status).toBe(422);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: false,
			code: "BINDING_UNAVAILABLE",
		});
	});

	test("GET and browser-supplied path fields open nothing", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		await saveSelection(fixture, invocation);

		const get = await fixture.request("/api/code-targets/open?board=system/payments&element=node");
		expect(get.status).toBe(404);
		const bodyPath = await activate(fixture, {
			board: "system/payments",
			element: "node",
			path: "/tmp/attacker",
		});
		expect(bodyPath.status).toBe(400);
		const queryPath = await fixture.request("/api/code-targets/open?path=/tmp/attacker", {
			method: "POST",
			body: jsonBody({ board: "system/payments", element: "node" }),
		});
		expect(queryPath.status).toBe(400);
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
	});

	test("passes shell metacharacters as literal argv and creates no sentinel", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const sentinel = join(fixture.root, "shell-ran");
		const literal = `; touch ${sentinel}`;
		const invocation = fixture.invocation("immediate", [literal]);
		resources.defer(() => invocation.releaseAndWait());
		await saveSelection(fixture, invocation);

		expect((await activate(fixture)).status).toBe(200);
		expect(await invocation.waitForCapture()).toMatchObject({ extra: [literal] });
		expect(existsSync(sentinel)).toBeFalse();
	});

	test("returns an actionable failure for a missing executable", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const missing = {
			version: 1,
			kind: "custom",
			executable: join(fixture.root, "missing-opener"),
			argv: ["{path}"],
		} as const;
		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody(missing),
				})
			).status,
		).toBe(200);
		const result = await activate(fixture);
		expect(result.status).toBe(422);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: false,
			code: "OPENER_UNAVAILABLE",
			actions: [{ kind: "settings", label: "Opener settings" }],
		});
	});
});
