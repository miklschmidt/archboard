import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test.each(["entry", "resume", "layout"])(
	"a core trap at %s rejects pending renders and prevents every later entry",
	async (phase) => {
		// Each case needs its own instance and global constructor. A poisoned
		// module deliberately cannot be reset within the host that loaded it.
		const child = Bun.spawn(
			[
				process.execPath,
				fileURLToPath(new URL("../support/core-panic-probe.ts", import.meta.url)),
				phase,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		try {
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
			const result = JSON.parse(stdout);
			expect(result.trapped).toBe(true);
			expect(result.entriesAfterTrap).toBe(0);
			expect(result.uncaught).toEqual([]);
			expect(result.failures).toEqual(
				Array.from({ length: 3 }, () => ({
					name: "CorePanicError",
					code: "CORE_PANIC",
				})),
			);
			if (phase === "resume") expect(result.solves).toBeGreaterThan(0);
		} finally {
			child.kill();
			await child.exited;
		}
	},
);
