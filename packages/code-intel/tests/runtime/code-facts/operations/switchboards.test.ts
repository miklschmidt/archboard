// The switchboards the TypeScript and Rust adapters name (TASK-659, ADR 0082):
// a callable that picks its operation by a closed key its caller passes, with
// one operation for each arm that runs different work. The cases are the
// shapes the depth gate was settled on: literal overloads, a boolean option, a
// request property that tells its kind, a closed table beside a shared default
// path, an enum `match` with payloads, and what is no switchboard: a keyed
// getter, an open key, a shape test, and a key that picks how one operation runs.

import { afterAll, expect, test } from "bun:test";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

const checkout = fixtureCheckout({
	"src/picks.ts": [
		'export function change(vault: string, intent: "claim", input: X): Promise<A>;',
		'export function change(vault: string, intent: "release", input: X): Promise<B>;',
		'export function change(vault: string, intent: "takeBack", input: X): Promise<B>;',
		'export async function change(vault: string, intent: "claim" | "release" | "takeBack", input: unknown) {',
		'\tif (intent === "claim") return claimSubjects(vault, requireRequest("claim", input));',
		'\tif (intent === "release") {',
		'\t\tconst request = requireRequest("releaseClaim", input);',
		"\t\treturn endClaim(vault, request.claim, request.writer);",
		"\t}",
		'\treturn endClaim(vault, requireRequest("takeBackClaim", input).claim);',
		"}",
		"export async function findVault(search: S, options: { readonly register?: boolean } = {}) {",
		"\treturn options.register === true ? findAndRegisterVault(search) : locateVault(search);",
		"}",
		"export function durationMs(name: Name): number {",
		"\tconst value = DURATIONS.get(name);",
		"\tif (value === undefined) throw new Error(name);",
		"\treturn value;",
		"}",
		'export function openKey(kind: string) { if (kind === "a") return one(); return two(); }',
		'export function shaped(request: Request) { if ("bundle" in request) return install(request); return build(request); }',
		'export function imported(kind: Remote) { switch (kind) { case "a": return one(); default: return two(); } }',
		"const CHECKED = {",
		"\tlegacyBoard: (raw: unknown) => { const parsed = parseLegacyBoard(raw); return parsed.ok ? { success: true } : { success: false }; },",
		"\tlegacyBoardFile: (raw: unknown) => decodeLegacyBoard(String(raw)),",
		'\tvariantContent: (raw: unknown) => { const shape = Content.safeParse(raw); if (!shape.success) return shape; return check(shape.data, "content"); },',
		"};",
		"export function parseDocument(kind: DocumentKind, raw: unknown) {",
		"\tif (isChecked(kind)) return CHECKED[kind](raw);",
		"\tconst schema = SCHEMAS[kind];",
		"\treturn schema.safeParse(raw);",
		"}",
		"type DocumentKind = SchemaKind | keyof Checked;",
		'export function history(vault: string, input: { readonly analysis: "locality" } & R): A;',
		'export function history(vault: string, input: { readonly analysis: "footprint" } & R): A;',
		'export function history(vault: string, input: { readonly analysis: "refs" } & R): A;',
		"export function history(vault: string, input: HistoryRequest) {",
		'\tif (input.analysis === "locality") { const { analysis: _a, ...request } = input; return locality(vault, request); }',
		'\tif (input.analysis === "footprint") { const { analysis: _a, ...request } = input; return footprint(vault, request); }',
		"\tconst { analysis: _a, ...request } = input;",
		"\treturn refs(vault, request);",
		"}",
		'export type Kind = "a" | "b";',
		'export function request(input: Req) { if (input.kind === "x") return one(); return two(); }',
		'export function inlineRequest(input: { kind: "x"; a: 1 } | { kind: "y" }) { if (input.kind === "x") return one(); return two(); }',
		'export type Req = { kind: "x"; a: 1 } | { kind: "y" };',
		"",
	].join("\n"),
	"Cargo.toml": '[package]\nname = "stage"\nversion = "0.1.0"\n',
	"src/lib.rs": [
		"pub struct Stage { leaving: Option<u8> }",
		"impl Stage {",
		"    pub fn arrive(&mut self, painting: Painting, arrival: Arrival) {",
		"        match arrival {",
		"            Arrival::Cut => self.show(painting),",
		"            Arrival::Carried { shift, ms } => self.carry(painting, shift, ms),",
		"            Arrival::Entered { ms, at } => { let now = self.clock.at(at); self.enter(painting, ms, now); }",
		"            Arrival::Into { ms, at } => { let now = self.clock.at(at); self.dive(painting, ms, now); }",
		"        }",
		"    }",
		"    pub fn depart(&mut self, departure: Departure) {",
		"        match departure {",
		"            Departure::Leaving { ms, at } => { let now = self.clock.at(at); self.leave(ms, now); }",
		"            Departure::Stayed => self.leaving = None,",
		"            Departure::Cleared => self.clear(),",
		"            Departure::OutOfCard => self.end_dive(),",
		"        }",
		"    }",
		"    pub fn apply(&mut self, part: Part) {",
		"        match part { Part::Card => { self.leaving = None; card(); }, _ => frame() }",
		"    }",
		"    pub fn draw(&mut self, on: Surface, now: f64) -> Motion {",
		"        let now = self.clock.at(now);",
		"        match on {",
		"            Surface::Direct(canvas) => self.frame(canvas, now),",
		"            Surface::Strips(canvas) => { let mut parts = std::mem::take(&mut self.parts); let motion = self.frame(&mut parts.over(canvas), now); self.parts = parts; motion }",
		"        }",
		"    }",
		"}",
		"pub fn measure(node: N, part: Part) -> M {",
		"    match part { Part::Card => card(node), Part::Container => one_line(node, 2), Part::FlowFrame => flow_frame(node) }",
		"}",
		"pub fn tab(node: N, container: bool) -> M { if container { one_line(node, 2) } else { card(node) } }",
		"pub fn returned(part: Part) -> M { return match part { Part::Card => card(), _ => frame() }; }",
		"pub fn bound(part: Part) -> M { let x = match part { Part::Card => 1, _ => 2 }; let result = match part { Part::Card => card(x), _ => frame(x) }; result }",
		"pub fn early(node: N, container: bool) -> M {",
		"    if container {",
		"        return one_line(node, 2);",
		"    }",
		"    card(node)",
		"}",
		"pub fn save(part: Part) { match part { Part::Card => cards::save(), _ => frames::save() } }",
		'pub fn named(s: &str) -> u8 { match s { "a" => a(), _ => b() } }',
		"",
	].join("\n"),
	"src/aliases.ts": [
		'type Kind = "a" | "b";',
		"type Alias = Kind;",
		"type AliasAgain = Alias;",
		'export function aliased(kind: AliasAgain) { if (kind === "a") return one(); return two(); }',
		"",
	].join("\n"),
});
const facts = createCodeFacts();

test("a Rust arm that writes state retains the logic of its call", async () => {
	const read = await facts.pass(new AbortController().signal).read(checkout, "src/lib.rs");
	if (read === undefined || read.adapter === "text") throw new Error("Rust source was not read");
	expect(read.definitions.find((each) => each.symbol === "Stage.apply")?.picks?.logic).toBe(3);
});

afterAll(() => {
	checkout.remove();
});

/**
 * Each definition of a file that picks, by its symbol: its key, the type that closes it where
 * module depth must find it, and the keys of each operation.
 * @param file The file.
 * @returns The switchboards.
 */
async function switchboards(file: string): Promise<Record<string, unknown>> {
	const read = await facts.pass(new AbortController().signal).read(checkout, file);
	if (read === undefined || read.adapter === "text") throw new Error(`${file} was not read`);
	const picks = read.definitions.filter(
		(each): each is Definition & Required<Pick<Definition, "picks">> => each.picks !== undefined,
	);
	return Object.fromEntries(
		picks.map(({ symbol, picks: { key, type, operations } }) => [
			symbol,
			{ key, ...(type === undefined ? {} : { type }), keys: operations.map((each) => each.keys) },
		]),
	);
}

test("a TypeScript callable picks one operation for each arm that runs different work, by a key literal overloads, a boolean option or a request's kind closes", async () => {
	expect(await switchboards("src/picks.ts")).toEqual({
		change: { key: "intent", keys: [["claim"], ["release"], ["takeBack"]] },
		findVault: { key: "options.register", keys: [["true"], ["false"]] },
		request: { key: "input.kind", keys: [["x"], ["y"]] },
		inlineRequest: { key: "input.kind", keys: [["x"], ["y"]] },
		history: { key: "input.analysis", keys: [["locality"], ["footprint"], ["refs"]] },
		// The table closes its handlers, and the arm that parses with the shared schema path plus a check is the default.
		parseDocument: {
			key: "kind",
			keys: [["legacyBoard"], ["legacyBoardFile"], ["variantContent", "*"]],
		},
		// A key another file types is closed only once module depth finds that type.
		imported: { key: "kind", type: "Remote", keys: [["a"], ["*"]] },
	});
});

test("a TypeScript type alias closes its literals, and a union of object types each literal property every member fixes", async () => {
	const read = await facts.pass(new AbortController().signal).read(checkout, "src/picks.ts");
	const closes = Object.fromEntries(
		(read?.adapter === "text" ? [] : (read?.definitions ?? [])).flatMap((each) =>
			each.closes === undefined ? [] : [[each.symbol, each.closes]],
		),
	);
	expect(closes).toEqual({ Kind: { "": ["a", "b"] }, Req: { kind: ["x", "y"] } });
});

test("a Rust function picks one operation for each enum variant or boolean whose arm runs different work, and a key that picks how one operation runs is no switchboard", async () => {
	expect(await switchboards("src/lib.rs")).toEqual({
		"Stage.arrive": { key: "arrival", keys: [["Cut"], ["Carried"], ["Entered"], ["Into"]] },
		// Stayed only writes state, which is an operation of its own.
		"Stage.depart": {
			key: "departure",
			keys: [["Leaving"], ["Stayed"], ["Cleared"], ["OutOfCard"]],
		},
		"Stage.apply": { key: "part", keys: [["Card"], ["*"]] },
		measure: { key: "part", keys: [["Card"], ["Container"], ["FlowFrame"]] },
		save: { key: "part", keys: [["Card"], ["*"]] },
		tab: { key: "container", keys: [["true"], ["false"]] },
		// A branch that returns leaves the rest of the body to the other key.
		early: { key: "container", keys: [["true"], ["false"]] },
		returned: { key: "part", keys: [["Card"], ["*"]] },
		bound: { key: "part", keys: [["Card"], ["*"]] },
	});
});

test("a TypeScript switchboard follows local aliases to its closed key type", async () => {
	expect(await switchboards("src/aliases.ts")).toEqual({
		aliased: { key: "kind", keys: [["a"], ["b"]] },
	});
});
