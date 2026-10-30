// What this catches: a Bun host that starts layout workers past JavaScriptCore's
// eight fast WebAssembly memories, as one fewer than the cores did (23 on a
// 24-core machine). A worker past them copies its whole memory on every grow
// and solves about 20% slower (TASK-548.05).
import { expect, test } from "bun:test";
import { bunWorkerCeiling } from "#runtime/services/bun-host.ts";

test("the Bun host runs at most six layout workers, and one fewer than the cores below that", () => {
	expect(bunWorkerCeiling(24)).toBe(6);
	expect(bunWorkerCeiling(4)).toBe(3);
	expect(bunWorkerCeiling(1)).toBe(1);
});
