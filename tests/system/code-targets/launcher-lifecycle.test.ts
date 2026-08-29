import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { planOpenerCommand } from "../../../src/server/code-opener/index.ts";
import { createOpenerFixture, jsonBody } from "./support/opener-fixture.ts";

const LAUNCHER_OWNER = join(import.meta.dir, "fixtures/launcher-owner.ts");

function linuxProcessGroup(pid: number): number {
	const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
	const afterName = stat
		.slice(stat.lastIndexOf(")") + 2)
		.trim()
		.split(/\s+/);
	const processGroup = Number(afterName[2]);
	if (!Number.isInteger(processGroup)) throw new Error(`Cannot parse process group from ${stat}`);
	return processGroup;
}

describe("shell-free launcher lifecycle", () => {
	test("activation responds before its detached fake opener exits", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("hold");
		resources.defer(() => invocation.releaseAndWait());
		expect(
			(
				await fixture.request("/api/settings/opener", {
					method: "PUT",
					body: jsonBody(invocation.selection),
				})
			).status,
		).toBe(200);

		const response = await fixture.request("/api/code-targets/open", {
			method: "POST",
			body: jsonBody({ board: "system/payments", element: "node" }),
		});
		expect(response.status).toBe(200);
		await invocation.waitForCapture();
		expect(readdirSync(invocation.exitDirectory)).toEqual([]);
		await invocation.releaseAndWait();
		expect(readdirSync(invocation.exitDirectory)).toHaveLength(1);
	});

	test("the launcher owner exits while the detached fake remains held", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = await createOpenerFixture();
		resources.defer(() => fixture.dispose());
		const invocation = fixture.invocation("hold");
		resources.defer(() => invocation.releaseAndWait());
		const plan = planOpenerCommand(invocation.selection, fixture.checkout, process.platform);
		if (!plan.ok) throw new Error(`${plan.code}: ${plan.error}`);

		const owner = Bun.spawn([process.execPath, LAUNCHER_OWNER, JSON.stringify(plan.command)], {
			stdout: "ignore",
			stderr: "pipe",
		});
		const stderr = new Response(owner.stderr).text();
		const exitCode = await owner.exited;
		expect(exitCode, await stderr).toBe(0);
		const capture = await invocation.waitForCapture();
		expect(readdirSync(invocation.exitDirectory)).toEqual([]);
		if (process.platform === "linux") {
			expect(existsSync(`/proc/${capture.pid}`)).toBeTrue();
			expect(linuxProcessGroup(capture.pid)).toBe(capture.pid);
		}

		await invocation.releaseAndWait();
		expect(readdirSync(invocation.exitDirectory)).toHaveLength(1);
		if (process.platform === "linux") expect(existsSync(`/proc/${capture.pid}`)).toBeFalse();
	});
});
