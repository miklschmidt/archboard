import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	exportArchitectureModel,
	importArchitectureModel,
	recoverArchitectureModel,
} from "@archboard/board/store-write";
import { BOARD_LOCK_MS } from "@archboard/timing";
import { fixture, git } from "#tests/runtime/operations/model-edit/fixture.ts";
import {
	destination,
	empty,
	cleanPortableFixtures,
} from "#tests/runtime/operations/history/portable-fixture.ts";
const now = Date.now;
afterEach(() => {
	Date.now = now;
	cleanPortableFixtures();
});
test("an interrupted portable installation blocks readers and preserves foreign bytes and checkout context", async () => {
	const source = fixture();
	const exported = await exportArchitectureModel(source.vault);
	if (!exported.success) throw new Error(JSON.stringify(exported));
	const target = destination();
	const request = {
		bundle: exported.bundle,
		expectedRevision: empty,
		operationId: "interrupted-import",
		writer: "agent",
		doing: "restoring portable architecture",
	};
	const file = join(target.root, "import.json");
	writeFileSync(file, JSON.stringify(request));
	const child = Bun.spawn(
		[
			process.execPath,
			"--preload",
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
			fileURLToPath(
				import.meta.resolve("#tests/runtime/operations/history/portable-crash-runner.ts"),
			),
			target.vault,
			file,
		],
		{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: "file" }, stdout: "pipe", stderr: "pipe" },
	);
	expect(await child.exited, await new Response(child.stderr).text()).toBe(86);
	Date.now = () => now() + BOARD_LOCK_MS.lease;
	expect(readArchitectureModel(target.vault)).toMatchObject({
		success: false,
		code: "RECOVERY_REQUIRED",
		recovery: { operationId: request.operationId },
	});
	const gateway = join(target.vault, "gateway.module.json");
	const installed = readFileSync(gateway);
	writeFileSync(gateway, "foreign bytes");
	expect(await recoverArchitectureModel(target.vault)).toMatchObject({
		success: false,
		code: "RECOVERY_CONFLICT",
		applied: "unknown",
	});
	expect(readFileSync(gateway, "utf8")).toBe("foreign bytes");
	writeFileSync(gateway, installed);
	git(target.root, "symbolic-ref", "HEAD", "refs/heads/changed");
	expect(await recoverArchitectureModel(target.vault)).toMatchObject({
		success: false,
		code: "RECOVERY_CONTEXT_CHANGED",
	});
	git(target.root, "symbolic-ref", "HEAD", "refs/heads/main");
	const recovered = await recoverArchitectureModel(target.vault);
	if (!recovered.success || recovered.operation === undefined)
		throw new Error(JSON.stringify(recovered));
	expect(recovered.operation).toMatchObject({
		success: true,
		applied: true,
		cleanup: "complete",
		subjects: expect.arrayContaining(["Shop#Gateway", "Shop#Worker", "Shop#Dispatch"]),
	});
	expect(await importArchitectureModel(target.vault, request)).toEqual(recovered.operation);
	expect(readArchitectureModel(target.vault)).toMatchObject({
		success: true,
		revision: exported.bundle.revision,
	});
	expect(git(target.root, "rev-list", "--count", "refs/heads/archboard-history")).toBe("1");
}, 15000);
