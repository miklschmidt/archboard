import { afterAll, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CodeTargetOpenReplySchema } from "@archboard/code-opener/opening";
import { boundBoard } from "./support/bound-board.ts";
import {
	createOpenerFixture,
	jsonBody,
	type Invocation,
	type OpenerFixture,
} from "./support/opener-fixture.ts";

// The vault the real binding lookup reads, handed to the opener fixture.
const ownerVault = mkdtempSync(join(tmpdir(), "archboard-code-target-owner-"));

afterAll(() => {
	rmSync(ownerVault, { recursive: true, force: true });
});

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
		if (relative === "src/inside-file.ts") {
			symlinkSync("index.ts", join(fixture.checkout, relative));
		}
		if (relative === "src/inside-directory") {
			symlinkSync("directory", join(fixture.checkout, relative));
		}
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
		if (relative === "src/outside-file.ts") {
			symlinkSync(join(outside, "secret.ts"), join(fixture.checkout, relative));
		}
		if (relative === "src/outside-directory") {
			symlinkSync(outside, join(fixture.checkout, relative));
		}
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

	test("offers the exact canonical GitHub fallback when local activation is unavailable", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		fixture.writeBinding({
			repo: fixture.repository,
			path: "src/a b.ts",
			branch: "feature/links",
		});
		Bun.spawnSync(["git", "remote", "set-url", "origin", "https://github.com/other/repo.git"], {
			cwd: fixture.checkout,
		});
		const result = await activate(fixture);
		expect(result.status).toBe(409);
		expect(CodeTargetOpenReplySchema.parse(result.body)).toMatchObject({
			success: false,
			code: "CHECKOUT_IDENTITY_CHANGED",
			actions: [
				{
					kind: "github",
					label: "Open on GitHub",
					href: "https://github.com/acme/payments/tree/feature%2Flinks/src/a%20b.ts",
				},
			],
		});
	});

	test("re-reads a real note binding without changing note bytes or mtime", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture({ vault: ownerVault, defaultDependencies: true });
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		const board = await boundBoard(ownerVault, fixture.repository, "src/index.ts");
		const { key, file: note } = board;
		const beforeBytes = readFileSync(note);
		const beforeMtime = statSync(note, { bigint: true }).mtimeNs;
		await saveSelection(fixture, invocation);

		const result = await activate(fixture, { board: key, element: board.node });
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

	test("a binding pinned to another ref than the checkout's never opens the checkout as that ref", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		await saveSelection(fixture, invocation);
		for (const args of [
			["checkout", "-q", "-b", "work"],
			["commit", "-q", "--allow-empty", "-m", "first"],
		]) {
			Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
				cwd: fixture.checkout,
			});
		}

		// On GitHub: the bound branch is offered there, and nothing opens locally.
		fixture.writeBinding({ repo: fixture.repository, path: "src/index.ts", branch: "release/2.1" });
		const elsewhere = await activate(fixture);
		expect(elsewhere.status).toBe(409);
		expect(CodeTargetOpenReplySchema.parse(elsewhere.body)).toMatchObject({
			success: false,
			code: "CHECKOUT_ON_OTHER_REF",
			actions: [
				{
					kind: "github",
					href: "https://github.com/acme/payments/tree/release%2F2.1/src/index.ts",
				},
			],
		});
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);

		// On the bound branch: the checkout's own version, as before.
		fixture.writeBinding({ repo: fixture.repository, path: "src/index.ts", branch: "work" });
		const here = await activate(fixture);
		expect(here.status).toBe(200);
		expect(CodeTargetOpenReplySchema.parse(here.body)).not.toHaveProperty("otherRef");

		// Not on GitHub: there is nowhere else, so the checkout's version opens and says so.
		const hosted = "git.example.com/acme/payments";
		Bun.spawnSync(["git", "remote", "set-url", "origin", `https://${hosted}.git`], {
			cwd: fixture.checkout,
		});
		writeFileSync(
			join(fixture.root, "state", "repos.json"),
			JSON.stringify([
				{ repo: hosted, root: fixture.checkout, source: "declared", addedAt: "2026-01-01" },
			]),
		);
		fixture.writeBinding({ repo: hosted, path: "src/index.ts", branch: "release/2.1" });
		const local = await activate(fixture);
		expect(local.status).toBe(200);
		expect(CodeTargetOpenReplySchema.parse(local.body)).toMatchObject({
			success: true,
			otherRef: { named: "release/2.1", checkedOut: "work" },
		});
		expect(await invocation.waitForCaptures(2)).toHaveLength(2);
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
			actions: [
				{ kind: "settings", label: "Opener settings" },
				{
					kind: "github",
					label: "Open on GitHub",
					href: "https://github.com/acme/payments/tree/HEAD/src/index.ts",
				},
			],
		});
	});

	test("returns a typed real spawn error without changing note or state", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture({ vault: ownerVault, defaultDependencies: true });
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("immediate");
		resources.defer(() => invocation.releaseAndWait());
		const board = await boundBoard(ownerVault, fixture.repository, "src/index.ts");
		const { key, file: note } = board;
		const brokenExecutable = join(fixture.root, "broken-opener");
		writeFileSync(brokenExecutable, `#!${join(fixture.root, "missing-interpreter")}\n`);
		chmodSync(brokenExecutable, 0o755);
		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody({
						version: 1,
						kind: "custom",
						executable: brokenExecutable,
						argv: ["{path}"],
					}),
				})
			).status,
		).toBe(200);
		const noteBytes = readFileSync(note);
		const noteMtime = statSync(note, { bigint: true }).mtimeNs;
		const stateBytes = readFileSync(fixture.configFile);
		const stateMtime = statSync(fixture.configFile, { bigint: true }).mtimeNs;

		const result = await activate(fixture, { board: key, element: board.node });
		expect(result.status).toBe(500);
		const reply = CodeTargetOpenReplySchema.parse(result.body);
		expect(reply).toMatchObject({
			success: false,
			code: "OPENER_SPAWN_FAILED",
			actions: [
				{ kind: "settings", label: "Opener settings" },
				{
					kind: "github",
					label: "Open on GitHub",
					href: "https://github.com/acme/payments/tree/HEAD/src/index.ts",
				},
			],
		});
		if (reply.success) {
			throw new Error("Expected spawn failure.");
		}
		expect(reply.error).toContain(brokenExecutable);
		expect(readdirSync(invocation.captureDirectory)).toEqual([]);
		expect(readFileSync(note)).toEqual(noteBytes);
		expect(statSync(note, { bigint: true }).mtimeNs).toBe(noteMtime);
		expect(readFileSync(fixture.configFile)).toEqual(stateBytes);
		expect(statSync(fixture.configFile, { bigint: true }).mtimeNs).toBe(stateMtime);
	});
});
