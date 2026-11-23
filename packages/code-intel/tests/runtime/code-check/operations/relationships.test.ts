// The code pass judges the relationships between bound parts by the evidence
// that joins their code (ADR 0046, TASK-367.07), under the default vocabulary,
// whose relationship kinds name the evidence kinds they accept.
//
// The checkout `mall` holds a store whose Read and Write both use the shared
// `addressOf`, which uses `normalize` in the same file; a server that calls
// the store through its index; a sender that a listener and a mailer call;
// a list that only names a type; limits that a checker uses only as values
// and a guard constructs; and a courier that awaits the sender's post and
// calls its send plainly. Each relationship below says what the check should
// find about it.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as CheckModule from "#tests/runtime/support/code-check/pass.ts";
import type { CodeCheckOutcome } from "#runtime/code-check/operations/check.ts";
import { document, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-relationships-"));
const mall = join(scratch, "mall");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const MALL = "github.com/test/mall";
let check: typeof CheckModule;
/** No server for any language, so the judgement reads the evidence code facts give alone. */
const NO_SERVER = () => ({ status: "missing", detail: "turned off" }) as const;
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
			'export function addressOf(name: string): string { return [name].map(normalize).join(""); }',
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
		"src/notify/sender.ts":
			"export function send(): void {}\nexport async function post(): Promise<void> {}\n",
		"src/notify/courier.ts": [
			'import { post, send } from "./sender";',
			"export async function deliver(): Promise<void> { await post(); }",
			"export function ring(): void { send(); }",
			"",
		].join("\n"),
		"src/notify/listener.ts":
			'import { send } from "./sender";\nexport function listen(): void { send(); }\n',
		"src/notify/mailer.ts":
			'import { send } from "./sender";\nexport function mail(): void { send(); }\n',
		// Loads the sender's file at run time, which is a call to the whole file.
		"src/notify/digest.ts":
			'export async function digest(): Promise<void> { await import("./sender"); }\n',
		"src/shared/limits.ts": "export const LIMIT = 3;\nexport class ShelfError extends Error {}\n",
		// Passed functions may run later; constant reads and class tests do not.
		"src/notify/checker.ts": [
			'import { addressOf } from "../shared/address";',
			'import { LIMIT, ShelfError } from "../shared/limits";',
			'import { send } from "./sender";',
			"export function check(error: unknown, names: string[]): boolean {",
			"\tqueueMicrotask(send);",
			"\tconsume(LIMIT);",
			"\treturn error instanceof ShelfError || names.map(addressOf).length > LIMIT;",
			"}",
			"",
		].join("\n"),
		// Constructs the limits' error, which runs its code.
		"src/notify/guard.ts":
			'import { ShelfError } from "../shared/limits";\nexport function guard(): void { throw new ShelfError(); }\n',
		// Calls the sender, which the flow draws as a step.
		"src/notify/relay.ts":
			'import { send } from "./sender";\nexport function relay(): void { send(); }\n',
	});
	git(scratch, mall, "add", "-A");
	git(scratch, mall, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [MALL]: mall });
	document(vault, "Mall", [
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
					part("pD", "Digest", { path: "src/notify/digest.ts" }),
					part("pY", "Relay", { path: "src/notify/relay.ts" }),
					part("pV", "Limits", { path: "src/shared/limits.ts" }),
					part("pC", "Checker", { path: "src/notify/checker.ts" }),
					part("pG", "Guard", { path: "src/notify/guard.ts" }),
					part("pK", "Courier", { path: "src/notify/courier.ts" }),
				],
				edges: [
					// Drawn to one part of the store, and the server's code reaches Write too.
					// This relationship stands for that call, so it finds only information.
					edge("e1", ["pS", "pR"], "sync"),
					edge("e2", ["pW", "pR"], "sync"),
					// Drawn from the sender, while the listener's code calls the sender.
					edge("e3", ["pN", "pI"], "event"),
					// A storage relationship that only a type joins.
					edge("e4", ["pL", "pB"], "storage"),
					// A dependency accepts the import that only a type gives.
					edge("e5", ["pW", "pB"], "dependency"),
					// A kind without the evidence key accepts every evidence kind.
					edge("e6", ["pR", "pB"], "other"),
					// Nothing in the code joins these.
					edge("e7", ["pS", "pI"], "sync"),
					// The same direction as e3, anchored: the anchor decides, and it supports it.
					edge("e8", ["pN", "pM"], "event", ["src/notify/mailer.ts", "send"]),
					// An anchor whose only use is as a type, on a kind that accepts only a call.
					edge("e9", ["pS", "pB"], "sync", ["src/server/routes.ts", "Shelf"]),
					// The store holds the list, so evidence never joins them.
					edge("e10", ["pT", "pL"], "sync"),
					// Anchored on a name the checker passes on as a value, which is call evidence, to
					// queueMicrotask, which starts it.
					edge("e11", ["pC", "pN"], "async", ["src/notify/checker.ts", "send"]),
					// Dependencies whose code runs the target: anchored on the mailer's call, and with
					// no anchor where the listener calls the sender.
					edge("e12", ["pM", "pN"], "dependency", ["src/notify/mailer.ts", "send"]),
					edge("e13", ["pI", "pN"], "dependency"),
					// A dependency anchored on a name the list uses only as a type.
					edge("e14", ["pL", "pB"], "dependency", ["src/store/list.ts", "Shelf"]),
					// The courier awaits the post and calls send plainly, against the kinds drawn.
					edge("e15", ["pK", "pN"], "sync", ["src/notify/courier.ts", "post"]),
					edge("e16", ["pK", "pN"], "async", ["src/notify/courier.ts", "send"]),
					// The mailer's plain call of send, drawn sync.
					edge("e17", ["pM", "pN"], "sync", ["src/notify/mailer.ts", "send"]),
				],
				flows: [
					{
						id: "f1",
						name: "Route",
						participants: ["pS", "pB", "pY", "pN"],
						steps: [
							// A step has no relationship kind, so its evidence kind is never judged.
							{
								id: "s1",
								from: "pS",
								to: "pB",
								label: "names the shelf",
								anchor: { repo: MALL, path: "src/server/routes.ts", symbol: "Shelf" },
							},
							// A step draws the relay's call to the sender.
							{ id: "s2", from: "pY", to: "pN", label: "relays" },
						],
					},
				],
			},
		},
	]);
	check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readStatesToCheck(vault, undefined);
	if (!read.ok) throw new Error("no documents");
	// No language server, so the judgement reads the evidence code facts give alone.
	outcome = await check.checkCode(vault, read.states, new AbortController().signal, [], NO_SERVER);
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
	// The store is a container too, whose interface interfaces.test.ts owns.
	const interfaceCodes = new Set(["ENTRY_POINT_UNEXPOSED", "CALLER_UNDRAWN", "EXPOSED_UNUSED"]);
	const judged = outcome.findings.filter((each) => !interfaceCodes.has(each.code));
	const found = judged.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			// Each small bound module hides fewer than four pieces of logic behind each name (TASK-659).
			"MODULE_SHALLOW pS warning",
			"MODULE_SHALLOW pT warning",
			"RELATIONSHIP_UNDRAWN pA warning",
			"RELATIONSHIP_UNDRAWN pZ information",
			"RELATIONSHIP_UNDRAWN pN warning",
			"RELATIONSHIP_UNDRAWN pV warning",
			"RELATIONSHIP_UNDRAWN pW information",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_UNSUPPORTED e4 information",
			"RELATIONSHIP_UNSUPPORTED e7 information",
			"ANCHOR_MISMATCH e9 warning",
			"CALL_TIMING_MISMATCH e15 information",
			"CALL_TIMING_MISMATCH e16 information",
			"DEPENDENCY_CALLED e12 information",
			"DEPENDENCY_CALLED e13 information",
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
		["pC", "pA", "call", "resolved"],
		["pR", "pA", "call", "resolved"],
		["pW", "pA", "call", "resolved"],
	]);
	expect(undrawn?.evidence?.[0]).toMatchObject({ repo: MALL, symbol: "addressOf" });
	// Server, List and Write name the Shelf type only as a type, which is never a dependency at run time.
	expect(finding("RELATIONSHIP_UNDRAWN", "pB")).toBeUndefined();
	// Only the digest reaches the sender undrawn, by an import() that loads its whole file.
	// The store's tests call it, and a test is not the store's code at run time. The relay
	// calls it, and a step draws that.
	const sender = finding("RELATIONSHIP_UNDRAWN", "pN")?.evidence;
	expect(sender?.map((piece) => [piece.from, piece.kind, piece.symbol])).toEqual([
		["pD", "call", "./sender"],
	]);
});

test("a passed function makes a relationship undrawn, a passed constant and a class test do not, and each remains call evidence for anchors", () => {
	// The checker reads and passes a constant: only the guard's construction reaches the limits undrawn.
	const limits = finding("RELATIONSHIP_UNDRAWN", "pV")?.evidence;
	expect(limits?.map((piece) => [piece.from, piece.kind, piece.symbol])).toEqual([
		["pG", "call", "ShelfError"],
	]);
	expect(
		finding("RELATIONSHIP_UNDRAWN", "pA")?.evidence?.some((piece) => piece.from === "pC"),
	).toBe(true);
	expect(outcome.findings.filter((each) => each.subject?.id === "e11")).toEqual([]);
});

test("with no language server, a use of a name the same file defines is a candidate, so its finding is information, and the missing server is said once", () => {
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
	const missing = outcome.skipped.filter((each) => each.reason === "language-server-missing");
	expect(missing).toEqual([
		{
			reason: "language-server-missing",
			repo: MALL,
			detail: expect.stringContaining("typescript"),
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

test("a dependency whose anchor or evidence runs its target is information naming both ends and the call, and a type-only one is not", () => {
	const anchored = finding("DEPENDENCY_CALLED", "e12");
	expect(anchored?.message).toStartWith(
		'The relationship "Mailer -> Sender" is a dependency, and its start runs "send" of its end',
	);
	expect(anchored?.evidence?.map((piece) => [piece.kind, piece.path, piece.symbol])).toEqual([
		["call", "src/notify/mailer.ts", "send"],
	]);
	const unanchored = finding("DEPENDENCY_CALLED", "e13");
	expect(unanchored?.message).toContain('"Listener -> Sender"');
	expect(unanchored?.evidence?.map((piece) => [piece.from, piece.to, piece.kind])).toEqual([
		["pI", "pN", "call"],
	]);
	expect(outcome.findings.filter((each) => ["e5", "e14"].includes(each.subject?.id ?? ""))).toEqual(
		[],
	);
});

test("a sync relationship whose anchored call is awaited, and an async one whose call is plain, are information naming the call's timing", () => {
	const awaited = finding("CALL_TIMING_MISMATCH", "e15");
	expect(awaited?.severity).toBe("information");
	expect(awaited?.message).toStartWith(
		'The relationship "Courier -> Sender" is sync, and its anchor\'s call of "post" in src/notify/courier.ts is awaited',
	);
	expect(awaited?.evidence?.map((piece) => [piece.line, piece.symbol, piece.timing])).toEqual([
		[2, "post", "awaited"],
	]);
	const plain = finding("CALL_TIMING_MISMATCH", "e16");
	expect(plain?.message).toContain('is async, and its anchor\'s call of "send"');
	expect(plain?.evidence?.map((piece) => piece.timing)).toEqual(["plain"]);
	expect(
		outcome.findings.filter((each) => ["e11", "e17"].includes(each.subject?.id ?? "")),
	).toEqual([]);
});

test("a relationship whose ends hold one another is listed as not judged", () => {
	const skip = outcome.skipped.find((each) => each.subject?.id === "e10");
	expect(skip?.reason).toBe("ends-overlap");
});
