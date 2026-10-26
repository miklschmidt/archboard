import {
	identities,
	waitOwnerFor,
	waitProbe,
} from "#tests/server/support/generation/terminal-fixture.ts";
import { createCodexWaitGraph } from "@archboard/codex-realtime-voice/runtime";
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readlinkSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkoutPort, SOURCE_CHECKOUT } from "@archboard/workspace/source-checkout";
import { findVault } from "@archboard/workspace/vault";
import { withProductionState } from "#tests/server/support/generation/production-state.ts";
import { createServerVoiceAgentOptions } from "#server/services/owner/production.ts";

function installation() {
	const root = mkdtempSync(join(tmpdir(), "archboard-production-storage-"));
	return withProductionState(root, () => ({
		root,
		value: createServerVoiceAgentOptions({
			sourceRoot: "/repo",
			host: { resolveCheckout: (named: string) => named },
		} as never),
	}));
}

describe("production Codex storage", () => {
	test("the servers on a machine share one Codex home, and each port owns its own state", async () => {
		const { root, value } = installation();
		try {
			const workbench =
				process.platform === "darwin"
					? join(root, "Library", "Application Support", "archboard", "codex-workbench")
					: process.platform === "win32"
						? join(root, "Archboard", "codex-workbench")
						: join(root, "archboard", "codex-workbench");
			const owner = join(
				workbench,
				"canvases",
				process.env["PORT"] || String(checkoutPort(SOURCE_CHECKOUT)),
			);
			expect({
				rootDirectory: value.storage.directory,
				ownerDirectory: value.storage.ownerDirectory,
			}).toEqual({ rootDirectory: workbench, ownerDirectory: owner });
			expect(statSync(owner).mode & 0o777).toBe(0o700);
			// The coordinator works in a directory of its own, in no checkout, and reads the server's
			// archboard skill from there (ADR 0050).
			const coordinator = join(owner, "coordinator");
			expect(existsSync(coordinator)).toBe(true);
			expect(readlinkSync(join(coordinator, ".agents", "skills", "archboard"))).toBe(
				join("/repo", "skills", "archboard"),
			);
			expect(existsSync(join(coordinator, ".archboard"))).toBe(false);
			// So a command the coordinator runs without -C finds no vault and is refused, rather than
			// read the boards of a checkout it does not work in.
			expect(await findVault({ directory: null, cwd: coordinator })).toMatchObject({
				ok: false,
				code: "VAULT_NOT_FOUND",
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

test("child-exit settlement aborts the domain's live dynamic waits", async () => {
	const h = identities();
	const { owner, counters } = waitProbe(h, createCodexWaitGraph());
	const waitOwner = waitOwnerFor(h, "thread-target");
	try {
		await Promise.resolve(owner.port.registerWaitOwner({ owner: waitOwner }));
		const waiting = owner.port
			.waitForTargets({
				owner: waitOwner,
				cursor: null,
				timeoutMs: 60_000,
				previousSequence: 0,
			})
			.then(
				() => "resolved",
				(error: unknown) => error,
			);
		await owner.childExit(waitOwner.child, waitOwner.epoch);
		expect(
			await Promise.race([
				waiting,
				(async () => {
					for (let turn = 0; turn < 10; turn++) await Promise.resolve();
					return "still pending";
				})(),
			]),
		).toMatchObject({ code: "child_disconnected" });
		expect(counters.aborts).toBe(1);
	} finally {
		await owner.shutdown();
	}
});
