// The code pass judges the relationships between bound parts by the evidence
// that joins their code (ADR 0046, TASK-367.07), under the default vocabulary,
// whose relationship kinds name the evidence kinds they accept.
//
// The checkout `mall` holds a store whose Read and Write both use the shared
// `addressOf`, which uses `normalize` in the same file; a server that calls
// the store through its index; a sender that a listener and a mailer call;
// and a list that only names a type. Each relationship below says what the
// check should find about it.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "@/runtime/code-check/index";
import type { CodeCheckOutcome } from "@/runtime/code-check/index";
import { board, git, register, write } from "@/runtime/code-check/tests/fixture";

const caller = {
	ARCHBOARD_VAULT: process.env["ARCHBOARD_VAULT"],
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-relationships-"));
const mall = join(scratch, "mall");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_VAULT"] = vault;
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const MALL = "github.com/test/mall";
let check: typeof CheckModule;
let outcome: CodeCheckOutcome;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param name Its name.
 * @param binding Its path, and its symbol if any.
 * @param parent The part that holds it, if any.
 * @returns The node.
 */
function part(id: string, name: string, binding: Record<string, string>, parent?: string) {
	return {
		id,
		name,
		kind: "module",
		order: id.charCodeAt(1) * 10,
		binding: { repo: MALL, ...binding },
		...(parent === undefined ? {} : { parent }),
	};
}

/**
 * A relationship.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param anchor The file and symbol of its anchor, if any.
 * @returns The relationship.
 */
function edge(
	id: string,
	ends: readonly [string, string],
	kind: string,
	anchor?: [string, string],
) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		...(anchor === undefined ? {} : { anchor: { repo: MALL, path: anchor[0], symbol: anchor[1] } }),
	};
}

beforeAll(async () => {
	mkdirSync(mall, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, mall, "init", "-q", "-b", "main");
	git(scratch, mall, "remote", "add", "origin", `https://${MALL}.git`);
	write(mall, {
		"src/shared/address.ts": [
			"export interface Shelf { name: string }",
			"export function normalize(name: string): string { return name.trim(); }",
			"export function addressOf(name: string): string { return normalize(name); }",
			"",
		].join("\n"),
		"src/store/index.ts":
			'export { readShelf } from "./read";\nexport { writeShelf } from "./write";\n',
		"src/store/read.ts": [
			'import { addressOf, type Shelf } from "../shared/address";',
			"export function readShelf(shelf: Shelf): string { return addressOf(shelf.name); }",
			"",
		].join("\n"),
		"src/store/write.ts": [
			'import { addressOf } from "../shared/address";',
			'import type { Shelf } from "../shared/address";',
			'import { readShelf } from "./read";',
			'export function writeShelf(shelf: Shelf): string { return readShelf(shelf) + addressOf("w"); }',
			"",
		].join("\n"),
		"src/store/list.ts": [
			'import type { Shelf } from "../shared/address";',
			"export function list(shelf: Shelf): string { return shelf.name; }",
			"",
		].join("\n"),
		"src/server/routes.ts": [
			'import { readShelf, writeShelf } from "../store/index";',
			'import type { Shelf } from "../shared/address";',
			"export function route(shelf: Shelf): string { return readShelf(shelf) + writeShelf(shelf); }",
			"",
		].join("\n"),
		// Tests below the store exercise its code and are not its code at run time:
		// a test file beside the code, a Tests directory of a Swift package or a
		// .NET solution, and a test target as Xcode names one.
		"src/store/read.test.ts":
			'import { send } from "../notify/sender";\nexport function probe(): void { send(); }\n',
		"src/store/Tests/probe.ts":
			'import { send } from "../../notify/sender";\nexport function probe(): void { send(); }\n',
		"src/store/StoreTests/probe.ts":
			'import { send } from "../../notify/sender";\nexport function probe(): void { send(); }\n',
		"src/notify/sender.ts": "export function send(): void {}\n",
		"src/notify/listener.ts":
			'import { send } from "./sender";\nexport function listen(): void { send(); }\n',
		"src/notify/mailer.ts":
			'import { send } from "./sender";\nexport function mail(): void { send(); }\n',
	});
	git(scratch, mall, "add", "-A");
	git(scratch, mall, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [MALL]: mall });
	board(vault, "Mall", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pS", "Server", { path: "src/server" }),
					part("pT", "Store", { path: "src/store" }),
					part("pR", "Read", { path: "src/store/read.ts" }, "pT"),
					part("pW", "Write", { path: "src/store/write.ts" }, "pT"),
					part("pL", "List", { path: "src/store/list.ts" }, "pT"),
					part("pA", "Address", { path: "src/shared/address.ts", symbol: "addressOf" }),
					part("pZ", "Normalize", { path: "src/shared/address.ts", symbol: "normalize" }),
					part("pB", "Shelf type", { path: "src/shared/address.ts", symbol: "Shelf" }),
					part("pN", "Sender", { path: "src/notify/sender.ts" }),
					part("pI", "Listener", { path: "src/notify/listener.ts" }),
					part("pM", "Mailer", { path: "src/notify/mailer.ts" }),
				],
				edges: [
					// Drawn to the store, which holds the parts the server's code reaches.
					edge("e1", ["pS", "pT"], "call"),
					edge("e2", ["pW", "pR"], "call"),
					// Drawn from the sender, while the listener's code calls the sender.
					edge("e3", ["pN", "pI"], "event"),
					// A data relationship that only a type joins.
					edge("e4", ["pL", "pB"], "data"),
					// A dependency accepts the import that only a type gives.
					edge("e5", ["pW", "pB"], "dependency"),
					// A kind without the evidence key accepts every evidence kind.
					edge("e6", ["pR", "pB"], "other"),
					// Nothing in the code joins these.
					edge("e7", ["pS", "pI"], "call"),
					// The same direction as e3, anchored: the anchor decides, and it supports it.
					edge("e8", ["pN", "pM"], "event", ["src/notify/mailer.ts", "send"]),
					// An anchor whose only use is as a type, on a kind that accepts only a call.
					edge("e9", ["pS", "pB"], "call", ["src/server/routes.ts", "Shelf"]),
					// The store holds the list, so evidence never joins them.
					edge("e10", ["pT", "pL"], "call"),
				],
				flows: [
					{
						id: "f1",
						name: "Route",
						participants: ["pS", "pB"],
						steps: [
							// A step has no relationship kind, so its evidence kind is never judged.
							{
								id: "s1",
								from: "pS",
								to: "pB",
								label: "names the shelf",
								anchor: { repo: MALL, path: "src/server/routes.ts", symbol: "Shelf" },
							},
						],
					},
				],
			},
		},
	]);
	check = await import("@/runtime/code-check/index");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * The findings of one code about one subject.
 * @param code The finding's code.
 * @param id The subject's id.
 * @returns The finding, if any.
 */
function finding(code: string, id: string) {
	return outcome.findings.find((each) => each.code === code && each.subject?.id === id);
}

test("every finding of the relationship judgement, and nothing about a relationship the evidence supports", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"RELATIONSHIP_UNDRAWN pA warning",
			"RELATIONSHIP_UNDRAWN pZ information",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNSUPPORTED e4 information",
			"RELATIONSHIP_UNSUPPORTED e7 information",
			"ANCHOR_MISMATCH e9 warning",
		].toSorted(),
	);
});

test("the parts that use one shared part make one finding on it, one resolved piece for each, and a type-only use is not one of them", () => {
	const undrawn = finding("RELATIONSHIP_UNDRAWN", "pA");
	const pieces = undrawn?.evidence?.map((piece) => [
		piece.from,
		piece.to,
		piece.kind,
		piece.resolution,
	]);
	expect(pieces?.toSorted()).toEqual([
		["pR", "pA", "call", "resolved"],
		["pW", "pA", "call", "resolved"],
	]);
	expect(undrawn?.evidence?.[0]).toMatchObject({ repo: MALL, symbol: "addressOf" });
	// Server, List and Write name the Shelf type only as a type, which is never a dependency at run time.
	expect(finding("RELATIONSHIP_UNDRAWN", "pB")).toBeUndefined();
	// The store's tests call the sender, and a test is not the store's code at run time.
	expect(finding("RELATIONSHIP_UNDRAWN", "pN")).toBeUndefined();
});

test("a use of a name the same file defines is a candidate, so its finding is information", () => {
	expect(finding("RELATIONSHIP_UNDRAWN", "pZ")?.evidence).toEqual([
		{
			kind: "call",
			resolution: "candidate",
			from: "pA",
			to: "pZ",
			repo: MALL,
			path: "src/shared/address.ts",
			line: 3,
			symbol: "normalize",
		},
	]);
});

test("a relationship drawn one way while the code runs only the other way is backwards, with the evidence that runs back", () => {
	const turned = finding("RELATIONSHIP_BACKWARDS", "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.to, piece.kind])).toEqual([
		["pI", "pN", "call"],
	]);
	expect(turned?.path).toBe("variants.v1.content.edges.e3");
});

test("a relationship that no accepted evidence joins is unsupported, and names the evidence its kind does not accept", () => {
	expect(finding("RELATIONSHIP_UNSUPPORTED", "e4")?.evidence?.map((piece) => piece.kind)).toEqual([
		"import",
	]);
	expect(finding("RELATIONSHIP_UNSUPPORTED", "e7")?.evidence).toBeUndefined();
});

test("an anchor whose uses are of an evidence kind its relationship kind does not accept is a mismatch, and a step's anchor is never judged by kind", () => {
	expect(finding("ANCHOR_MISMATCH", "e9")?.evidence).toEqual([
		{
			kind: "import",
			resolution: "resolved",
			repo: MALL,
			path: "src/server/routes.ts",
			line: 3,
			symbol: "Shelf",
		},
	]);
	expect(finding("ANCHOR_MISMATCH", "s1")).toBeUndefined();
});

test("a relationship whose ends hold one another is listed as not judged", () => {
	const skip = outcome.skipped.find((each) => each.subject?.id === "e10");
	expect(skip?.reason).toBe("ends-overlap");
});
