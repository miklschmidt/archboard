// How the calls an anchor names run their callee, read through code facts
// alone, as the upgrade inventory seeds `sync` or `async` from it
// (TASK-663.09, call-timings.ts).

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCallTimings } from "#runtime/code-check/operations/call-timings.ts";
import { git, write } from "#tests/runtime/support/code-check/fixture.ts";

const scratch = mkdtempSync(join(tmpdir(), "archboard-call-timings-"));
const shop = join(scratch, "shop");

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

test("an anchor's calls resolve through the imported callee, and disagreeing calls are unknown", async () => {
	mkdirSync(shop);
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	write(shop, {
		"ledger.ts":
			"export async function post(): Promise<void> {}\nexport function total(): number { return 1; }\n",
		"shop.ts": [
			'import { post, total } from "./ledger";',
			"export async function checkout(): Promise<number> {",
			"  void post();",
			"  await post();",
			"  return total();",
			"}",
			"export function mixed(): void { total(); setTimeout(total, 0); }",
			"",
		].join("\n"),
	});
	const timing = await readCallTimings(shop, new AbortController().signal);
	expect(await timing({ path: "shop.ts", symbol: "post" })).toBe("awaited");
	expect(await timing({ path: "ledger.ts", symbol: "post" })).toBeUndefined();
	write(shop, {
		"other.ts": 'import { post, total } from "./ledger";\npost();\ntotal();\n',
	});
	const later = await readCallTimings(shop, new AbortController().signal);
	expect(await later({ path: "other.ts", symbol: "post" })).toBe("started");
	expect(await later({ path: "other.ts", symbol: "total" })).toBe("plain");
	expect(await later({ path: "shop.ts", symbol: "total" })).toBe("unknown");
});
