// The Nix adapter for `flake.lock` (ADR 0046, TASK-367.21): each input of the
// flake is a build dependency of it. The lock is JSON, so Bun parses it, and
// no grammar is needed; a small scan of its keys finds the line of each
// input.
//
// An input is an entry of the root node's `inputs`: a reference
// `inputs.<name>` of kind `build-dependency` at the line that names it, and an
// import of its own whose specifier is the source the lock pins, such as
// `github:NixOS/nixpkgs/nixos-unstable`, `path:./tools` or `follows:a/b`. The
// inputs of an input are its own dependencies, not the flake's, and are not
// read. An input reaches code the check reads only where it is a relative path
// inside the checkout: the resolver leads it to that flake's `flake.nix`. Any
// other input reaches code outside the checkout, and no part of the board.
// A lock that does not parse holds no facts; the names written in it are kept.

import path from "node:path";
import type { ImportResolver, ParsedFacts } from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";

/** One token of JSON that the scan of keys reads, and its line. */
interface Token {
	readonly text: string;
	readonly line: number;
}

/** A string, a bracket, a colon, or a line break. */
const TOKEN = /"(?:[^"\\\n]|\\.)*"|[{}[\]:]|\n/gu;

/** A whole word, as the names of a lock that does not parse are kept. */
const WORD = /[\p{L}\p{N}_-]+/gu;

/**
 * The tokens of a JSON text that say where its keys are, each with its line.
 * @param text The text.
 * @returns The strings, brackets and colons.
 */
function tokensOf(text: string): Token[] {
	const tokens: Token[] = [];
	let line = 1;
	for (const [match] of text.matchAll(TOKEN)) {
		if (match === "\n") line += 1;
		else tokens.push({ text: match, line });
	}
	return tokens;
}

/** How many keys deep the scan names a key: an input of the root node is `nodes`, the root, `inputs`, its name. */
const INPUT_DEPTH = 4;

/** Where a scan of keys is: the keys of the containers it is in, and the last key. */
interface Scan {
	readonly lines: Map<string, number>;
	readonly keys: string[];
	key: string;
}

/**
 * The line of each key of a JSON text down to the depth of an input, by its
 * path of keys from the root.
 * @param text The text, which parses as JSON.
 * @returns Each key's line, by its path joined with NUL.
 */
function keyLines(text: string): ReadonlyMap<string, number> {
	const scan: Scan = { lines: new Map(), keys: [], key: "" };
	const tokens = tokensOf(text);
	for (const [index, token] of tokens.entries()) {
		step(scan, token, tokens[index + 1]?.text === ":" && scan.keys.length <= INPUT_DEPTH);
	}
	return scan.lines;
}

/**
 * Read one token: a bracket enters or leaves a container, and a string before
 * a colon is a key.
 * @param scan The scan.
 * @param token The token.
 * @param key Whether it is a key the scan names: a string a colon follows, no deeper than an input.
 */
function step(scan: Scan, token: Token, key: boolean): void {
	if (token.text === "{" || token.text === "[") {
		scan.keys.push(scan.key);
		scan.key = "";
	} else if (token.text === "}" || token.text === "]") {
		scan.keys.pop();
	} else if (key) {
		scan.key = String(JSON.parse(token.text));
		scan.lines.set([...scan.keys.slice(1), scan.key].join("\0"), token.line);
	}
}

/** What the lock says of one node: where it came from. */
interface LockNode {
	readonly inputs?: Readonly<Record<string, string | readonly string[]>>;
	readonly original?: Original;
}

/** The parts of a lock the adapter reads. */
interface Lock {
	readonly root?: string;
	readonly nodes?: Readonly<Record<string, LockNode>>;
}

/** The fields of a lock node's `original`. */
type Original = Readonly<Record<string, unknown>>;

/**
 * One string field of a lock node's `original`.
 * @param original The `original`.
 * @param name The field.
 * @returns Its value, if it is a string.
 */
function stringField(original: Original, name: string): string | undefined {
	const value = original[name];
	return typeof value === "string" ? value : undefined;
}

/**
 * The source a lock node came from, spelled as a flake reference.
 * @param original The node's `original`.
 * @returns The reference, such as `github:NixOS/nixpkgs/nixos-unstable` or `path:./tools`.
 */
function referenceOf(original: Original = {}): string {
	const dir = stringField(original, "dir");
	const type = stringField(original, "type") ?? "unknown";
	return `${type}:${whereOf(original)}${dir === undefined ? "" : `?dir=${dir}`}`;
}

/**
 * Where a lock node's source is: its owner, repository and ref on a forge,
 * else its URL, path or registry name.
 * @param original The node's `original`.
 * @returns The place.
 */
function whereOf(original: Original): string {
	if (stringField(original, "owner") === undefined) {
		const place = ["url", "path", "id"].map((name) => stringField(original, name));
		return place.find((each) => each !== undefined) ?? "";
	}
	return ["owner", "repo", "ref"].flatMap((name) => stringField(original, name) ?? []).join("/");
}

/**
 * The facts of a lock that does not parse: the names written in it, so that a
 * symbol found only there is skipped, never reported missing.
 * @param text The text.
 * @returns The facts.
 */
function unparsedLock(text: string): ParsedFacts {
	const end = text.split("\n").length;
	const names = [...new Set(text.match(WORD) ?? [])];
	return { definitions: [], references: [], imports: [], unparsed: [{ start: 1, end, names }] };
}

/**
 * The lock, or undefined when it is not a JSON object.
 * @param text The text.
 * @returns The lock.
 */
function parsedLock(text: string): Lock | undefined {
	try {
		const lock: unknown = JSON.parse(text);
		return typeof lock === "object" && lock !== null ? lock : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The code facts of one `flake.lock`: each input of its root node, a build
 * dependency through an import of its own.
 * @param text The lock's text.
 * @returns The facts.
 */
function flakeLockFacts(text: string): ParsedFacts {
	const lock = parsedLock(text);
	if (lock === undefined) return unparsedLock(text);
	const root = lock.root ?? "root";
	const nodes = lock.nodes ?? {};
	const lines = keyLines(text);
	const inputs = Object.entries(nodes[root]?.inputs ?? {});
	const facts = inputs.map(([name, target], index) => {
		const symbol = `inputs.${name}`;
		const line = lines.get(["nodes", root, "inputs", name].join("\0")) ?? 1;
		const specifier =
			typeof target === "string"
				? referenceOf(nodes[target]?.original)
				: `follows:${target.join("/")}`;
		const imported = { imported: "*", local: symbol, typeOnly: false };
		return {
			found: { specifier, line, names: [imported], typeOnly: false, reexport: false },
			reference: {
				symbol,
				line,
				via: "code" as const,
				kind: "build-dependency" as const,
				typeOnly: false,
				through: { import: index, local: symbol },
			},
		};
	});
	return {
		definitions: [],
		references: facts.map((each) => each.reference),
		imports: facts.map((each) => each.found),
		unparsed: [],
	};
}

/**
 * The resolver of a checkout's lock inputs: an input that is a relative path
 * inside the checkout leads to that flake's `flake.nix`; every other input
 * reaches code outside the checkout.
 * @param checkout The checkout's files.
 * @returns The resolver.
 */
function createFlakeResolver(checkout: CheckoutFiles): ImportResolver {
	return {
		/**
		 * Where one input leads.
		 * @param from The lock, relative to the checkout.
		 * @param found The input's import.
		 * @returns The import, resolved to a flake of the checkout where it is one.
		 */
		resolve(from, found) {
			const local = /^path:(?<where>\.{1,2}(?:\/[^?]*)?)$/u.exec(found.specifier)?.groups?.[
				"where"
			];
			if (local === undefined) return found;
			const directory = path.posix.join(path.posix.dirname(from), local);
			const flake = path.posix.join(directory, "flake.nix");
			return directory.startsWith("..") || !checkout.files.has(flake)
				? found
				: { ...found, resolved: flake };
		},
	};
}

export { createFlakeResolver, flakeLockFacts };
