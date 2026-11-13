// An error report keeps Archboard's own frames, its class and a plain code, and nothing that can
// name the user's files or content: no message, and no frame outside Archboard.

import { expect, test } from "bun:test";
import { errorKind, ownFrames } from "#runtime/errors/rules/stack-frames.ts";

const ROOT = "/opt/archboard";

test("only Archboard's own frames are kept, relative to its root", () => {
	const stack = [
		"Error: cannot read /home/ada/payments/secret.ts",
		"    at readVault (/opt/archboard/packages/model/src/runtime/read.ts:10:5)",
		"    at async run (/opt/archboard/apps/cli/src/bin.ts:63:3)",
		"    at helper (/opt/archboard/node_modules/zod/index.js:1:1)",
		"    at userHook (/home/ada/payments/hook.ts:4:2)",
		"    at /opt/archboard/apps/cli/src/cli/routing/operations/run.ts:7:9",
		"    at Object.ada@example.com.run (/opt/archboard/apps/cli/src/bin.ts:10:2)",
	].join("\n");
	expect(ownFrames(stack, ROOT)).toEqual([
		{
			function: "readVault",
			filename: "packages/model/src/runtime/read.ts",
			lineno: 10,
			colno: 5,
		},
		{ function: "async run", filename: "apps/cli/src/bin.ts", lineno: 63, colno: 3 },
		{
			function: "",
			filename: "apps/cli/src/cli/routing/operations/run.ts",
			lineno: 7,
			colno: 9,
		},
		{ function: "", filename: "apps/cli/src/bin.ts", lineno: 10, colno: 2 },
	]);
});

test("the kind of an error is its class and a plain code, never its message", () => {
	const coded = Object.assign(new TypeError("no file /home/ada/x"), { code: "ENOENT" });
	expect(errorKind(coded)).toEqual({ type: "TypeError", code: "ENOENT" });
	const quoted = Object.assign(new Error("x"), { code: "see /home/ada/x" });
	expect(errorKind(quoted)).toEqual({ type: "Error", code: null });
	expect(errorKind("a string")).toEqual({ type: "NonError", code: null });
});
