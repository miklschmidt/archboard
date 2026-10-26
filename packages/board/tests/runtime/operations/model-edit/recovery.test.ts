import { afterEach, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readArchitectureModel, listArchitectureCheckpoints } from "@archboard/board/store-read";
import { editArchitectureModule, recoverArchitectureModel } from "@archboard/board/store-write";
import { LOCK_LEASE_MS } from "@archboard/timing";
import {
	fixture,
	git,
	intent,
	readBytes,
	disposeFixtures,
} from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);
async function interrupted(point: string) {
	const value = fixture();
	const input = await intent(value.vault, `interrupt-${point}`);
	const request = join(value.root, "request.json");
	writeFileSync(request, JSON.stringify(input));
	if (point === "archive") {
		const hook = join(value.root, ".git/hooks/reference-transaction");
		writeFileSync(
			hook,
			`#!/bin/sh\nif [ "$1" = committed ] && /bin/cat | /bin/grep -q 'refs/heads/archboard-history'; then kill -KILL "$(cat '${value.root}/pid')"; fi\n`,
		);
		chmodSync(hook, 0o755);
	}
	const child = Bun.spawn(
		[
			process.execPath,
			"--preload",
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-preload.ts")),
			fileURLToPath(import.meta.resolve("#tests/runtime/operations/model-edit/crash-runner.ts")),
			value.vault,
			request,
		],
		{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: point }, stdout: "pipe", stderr: "pipe" },
	);
	writeFileSync(join(value.root, "pid"), String(child.pid));
	const status = await child.exited;
	const output = await new Response(child.stdout).text();
	const errors = await new Response(child.stderr).text();
	if (point === "cleanup")
		expect(JSON.parse(output), errors).toMatchObject({
			success: true,
			applied: true,
			cleanup: "pending",
		});
	else expect(status, `${point}: ${output} ${errors}`).toBe(point === "archive" ? 137 : 86);
	// A killed owner retains the existing short lease. Recovery uses the public boundary after it expires.
	if (point !== "cleanup") await Bun.sleep(LOCK_LEASE_MS);
	return { ...value, input };
}

test.each(["prepared", "installing", "file", "installed", "archive", "completed", "cleanup"])(
	"interruption after %s recovers one durable result without mixed reads or duplicate checkpoints",
	async (point) => {
		const { vault, input } = await interrupted(point);
		expect(readArchitectureModel(vault), point).toMatchObject(
			["completed", "cleanup"].includes(point)
				? { success: true }
				: { success: false, code: "RECOVERY_REQUIRED" },
		);
		const recovered = await recoverArchitectureModel(vault);
		expect(recovered, point).toMatchObject({
			success: true,
			operation: { applied: true, cleanup: "complete" },
		});
		if (!recovered.success || recovered.operation === undefined)
			throw new Error(JSON.stringify(recovered));
		expect(await editArchitectureModule(vault, input), point).toEqual(recovered.operation);
		expect(readArchitectureModel(vault), point).toMatchObject({
			success: true,
			revision: recovered.operation.after,
		});
		expect(await listArchitectureCheckpoints(vault), point).toMatchObject({
			success: true,
			checkpoints: [{ id: recovered.operation.checkpoint.id }],
		});
	},
);

test("recovery preserves foreign bytes and refuses a changed branch before replay", async () => {
	const { root, vault, input } = await interrupted("file");
	const applied = readBytes(vault);
	writeFileSync(join(vault, "gateway.module.json"), "foreign incomplete bytes\n");
	expect(await recoverArchitectureModel(vault)).toMatchObject({
		success: false,
		code: "RECOVERY_CONFLICT",
	});
	expect(readBytes(vault).toString()).toBe("foreign incomplete bytes\n");
	writeFileSync(join(vault, "gateway.module.json"), applied);
	git(root, "switch", "--quiet", "-c", "other");
	expect(await recoverArchitectureModel(vault)).toMatchObject({
		success: false,
		code: "RECOVERY_CONTEXT_CHANGED",
	});
	expect(readBytes(vault)).toEqual(applied);
	git(root, "switch", "--quiet", "main");
	expect(
		await editArchitectureModule(vault, { ...input, description: "Different intent" }),
	).toMatchObject({ success: false, code: "OPERATION_REUSED" });
	expect(await recoverArchitectureModel(vault)).toMatchObject({
		success: true,
		operation: { applied: true },
	});
});
