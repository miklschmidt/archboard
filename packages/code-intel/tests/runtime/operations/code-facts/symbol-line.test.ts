import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import { symbolLine } from "#runtime/operations/code-facts/symbol-line.ts";

const LEDGER = `// The ledger.
export const rate = 3;

export class Ledger {
	post(): void {}
}

export function settle(): void {
	rate.toFixed();
}
`;

let root: string;
const signal = new AbortController().signal;

beforeAll(() => {
	root = mkdtempSync(join(tmpdir(), "archboard-symbol-line-"));
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src", "ledger.ts"), LEDGER);
	writeFileSync(join(root, "src", "ledger.rb"), "def settle\nend\n");
});

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

/**
 * Where a binding of the fixture's files resolves, as the opener resolved it.
 * @param file The bound path.
 * @param symbol The bound symbol, if any.
 * @param kind Whether the path is a file or a directory.
 * @returns The line, or undefined.
 */
function lineOf(file: string, symbol?: string, kind: "file" | "directory" = "file") {
	const binding: CodeBinding = { repo: "github.com/acme/payments", path: file };
	if (symbol !== undefined) binding.symbol = symbol;
	return symbolLine(
		binding,
		{
			ok: true,
			repository: binding.repo,
			root,
			target: join(root, file),
			path: file,
			kind,
		},
		signal,
	);
}

describe("the line of a bound symbol", () => {
	// How a symbol matches a definition (`post` finds `Ledger.post`) is the code-facts owner's.
	test("is where the file defines it, whether a function or a member of a class", async () => {
		expect(await lineOf("src/ledger.ts", "settle")).toBe(8);
		expect(await lineOf("src/ledger.ts", "Ledger.post")).toBe(5);
	});

	test("is nothing for a binding that names no symbol, a directory, or a symbol the file only uses", async () => {
		expect(await lineOf("src/ledger.ts")).toBeUndefined();
		expect(await lineOf("src", "settle", "directory")).toBeUndefined();
		// The file uses `toFixed` and does not define it: only a definition counts.
		expect(await lineOf("src/ledger.ts", "toFixed")).toBeUndefined();
	});

	test("is nothing for a file that code facts read as text, or that is gone", async () => {
		expect(await lineOf("src/ledger.rb", "settle")).toBeUndefined();
		expect(await lineOf("src/gone.ts", "settle")).toBeUndefined();
	});
});
