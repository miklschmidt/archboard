// The upgrade inventory seeds a former call from how its anchored call runs in
// the vault's own checkout (TASK-663.08).

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anchorTimings } from "#server/http/handlers/reads/operations/anchor-timings.ts";

const root = mkdtempSync(join(tmpdir(), "archboard-anchor-timings-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * Run Git in the checkout.
 * @param args Its arguments.
 */
function git(...args: string[]): void {
	const result = Bun.spawnSync(["git", "-C", root, ...args]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

test("an anchored call reads as awaited or plain in the vault's own checkout, and an anchor elsewhere as unknown to the code", async () => {
	const vault = join(root, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	mkdirSync(join(root, "src"));
	writeFileSync(
		join(root, "src", "gateway.ts"),
		[
			"async function dispatch(): Promise<void> {}",
			"function total(values: number[]): number { return values.length; }",
			"export async function handle(): Promise<number> {",
			"\tawait dispatch();",
			"\treturn total([1]);",
			"}",
			"",
		].join("\n"),
	);
	git("init", "--quiet", "--initial-branch=main");
	git("remote", "add", "origin", "https://github.com/acme/shop.git");
	git("add", ".");
	const read = await anchorTimings(vault, new AbortController().signal);
	const timing = (repo: string, symbol: string) =>
		read({
			id: "Shop#Dispatch",
			from: { id: "Shop#Handler", name: "Handler" },
			to: { id: "Shop#Worker", name: "Worker" },
			oldKind: "call",
			anchor: { repo, path: "src/gateway.ts", symbol },
		});
	expect(await timing("github.com/acme/shop", "dispatch")).toBe("awaited");
	expect(await timing("github.com/acme/shop", "total")).toBe("plain");
	expect(await timing("github.com/acme/elsewhere", "dispatch")).toBeUndefined();
});
