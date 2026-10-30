import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readLegacyInventory } from "@archboard/board/store-read";
import { migrateArchitectureModel, recoverArchitectureModel } from "@archboard/board/store-write";
import { BOARD_LOCK_MS } from "@archboard/timing";
import { installationFixture } from "#tests/runtime/operations/legacy-preview/install-fixture.ts";
const homes: string[] = [];
const now = Date.now;
afterEach(() => {
	Date.now = now;
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
test.each(["prepared", "migration-file", "archive", "cleanup"])(
	"migration recovers after %s through the existing journal",
	async (point) => {
		const value = await installationFixture();
		homes.push(value.home);
		const input = join(value.home, "request.json");
		writeFileSync(input, JSON.stringify(value.request));
		if (point === "archive") {
			const hook = join(value.home, ".git/hooks/reference-transaction");
			writeFileSync(
				hook,
				`#!/bin/sh\nif [ "$1" = committed ] && cat | grep -q 'refs/heads/archboard-history'; then kill -KILL "$(cat '${value.home}/pid')"; fi\n`,
			);
			chmodSync(hook, 0o755);
		}
		const child = Bun.spawn(
			[
				process.execPath,
				"--preload",
				join(import.meta.dir, "../model-edit/crash-preload.ts"),
				join(import.meta.dir, "installation-crash-runner.ts"),
				value.vault,
				input,
			],
			{ env: { ...process.env, ARCHBOARD_EDIT_CRASH: point }, stdout: "pipe", stderr: "pipe" },
		);
		writeFileSync(join(value.home, "pid"), String(child.pid));
		const status = await child.exited,
			output = await new Response(child.stdout).text(),
			errors = await new Response(child.stderr).text();
		if (point === "cleanup")
			expect(JSON.parse(output), errors).toMatchObject({ success: true, cleanup: "pending" });
		else {
			expect(status, output + errors).toBe(point === "archive" ? 137 : 86);
			Date.now = () => now() + BOARD_LOCK_MS.lease;
			expect(readArchitectureModel(value.vault)).toMatchObject({
				success: false,
				code: "RECOVERY_REQUIRED",
			});
		}
		if (point !== "cleanup")
			expect(readLegacyInventory(value.vault, "Shop")).toMatchObject({
				success: false,
				code: "RECOVERY_REQUIRED",
			});
		if (point === "migration-file") {
			const legacy = join(value.vault, "modules/Shop/System/Shop.module.json");
			expect(existsSync(legacy)).toBe(true);
			const original = readFileSync(legacy);
			writeFileSync(legacy, "foreign bytes");
			expect(await recoverArchitectureModel(value.vault)).toMatchObject({
				success: false,
				code: "RECOVERY_CONFLICT",
			});
			expect(readFileSync(legacy, "utf8")).toBe("foreign bytes");
			writeFileSync(legacy, original);
		}
		const recovered = await recoverArchitectureModel(value.vault);
		if (!recovered.success || recovered.operation === undefined)
			throw new Error(JSON.stringify(recovered));
		expect(await migrateArchitectureModel(value.vault, value.request)).toEqual(recovered.operation);
		expect(readArchitectureModel(value.vault)).toMatchObject({
			success: true,
			revision: recovered.operation.after,
		});
		expect(existsSync(join(value.vault, "Shop.semantic.json"))).toBe(false);
	},
	15000,
);
