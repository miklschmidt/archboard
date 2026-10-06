// Reading code facts, file by file, through a cache in the server's memory
// (ADR 0046).
//
// The cache keeps one entry for each file a pass parsed: the hash of the
// bytes it read, the adapter, and the facts those bytes gave. Each pass reads
// and hashes every file again; where hash and adapter match it takes the facts
// from the entry, and otherwise it parses and replaces the entry. So a pass
// always sees an edit, an uncommitted one too, and the cache never holds more
// than one entry for a file. Each pass drops the entries of files that no
// longer exist, so a deleted or renamed file leaves nothing behind. A file
// read as text is not kept: its facts are its bytes, which the pass reads
// anyway.
//
// What depends on other files, an import resolved through `tsconfig.json`, is
// resolved again on each pass from the cached facts. A pass reads a file only
// where its symbolic links lead to a file the caller lists for its checkout,
// and never Terraform state, variable files or `.terraform`. Parsing is
// synchronous, so parses run one at a time, also for files read together, and
// each one yields to the event loop before the next starts: the server's polls
// and sockets wait for one file at most.

import fs from "node:fs";
import path from "node:path";
import type { FileFacts, ParsedFacts, SyntaxFacts, Target } from "@/runtime/code-facts/lib/facts";
import { grammars, type GrammarName } from "@/runtime/code-facts/lib/grammars";
import {
	createModuleResolver,
	type CheckoutFiles,
	type ModuleResolver,
} from "@/runtime/code-facts/lib/module-resolution";
import { neverRead } from "@/runtime/code-facts/lib/never-read";
import { typeScriptFacts } from "@/runtime/code-facts/lib/typescript-adapter";

/** The grammar of each extension an adapter reads; every other file is read as text. */
const GRAMMAR_OF: Readonly<Record<string, GrammarName>> = {
	".ts": "typescript",
	".mts": "typescript",
	".cts": "typescript",
	".tsx": "tsx",
};

/** One cache entry: the hash of the bytes read, the grammar, and their facts. */
interface Entry {
	readonly hash: bigint | number;
	readonly grammar: GrammarName;
	readonly facts: ParsedFacts;
}

/** How one pass read its files. */
interface PassStats {
	/** Files read, each once. */
	read: number;
	/** Files a grammar parsed, because the cache had no entry for their bytes. */
	parsed: number;
	/** Files whose facts came from the cache. */
	cached: number;
}

/**
 * The checkout path a file's links lead to, if the pass may read it.
 * @param checkout The checkout and the files it may read.
 * @param relative The file, relative to the checkout.
 * @returns The real file's path, relative and absolute, or undefined.
 */
function listedTarget(
	checkout: CheckoutFiles,
	relative: string,
): { readonly relative: string; readonly absolute: string } | undefined {
	try {
		const absolute = fs.realpathSync.native(path.join(checkout.root, relative));
		const listed = path.relative(checkout.root, absolute).split(path.sep).join("/");
		return checkout.files.has(listed) && !neverRead(listed)
			? { relative: listed, absolute }
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Let the event loop run what waits, between two parses.
 * @returns A promise that settles on the next turn of the loop.
 */
function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => {
		setImmediate(resolve);
	});
}

/**
 * Where each reference and import of a file leads, for this pass.
 * @param parsed The cached facts.
 * @param file The file, relative to its checkout.
 * @param resolver The checkout's resolver.
 * @returns The facts.
 */
function resolved(parsed: ParsedFacts, file: string, resolver: ModuleResolver): SyntaxFacts {
	const imports = parsed.imports.map((found): SyntaxFacts["imports"][number] => {
		const to = resolver.resolve(file, found.specifier);
		return to === undefined ? found : { ...found, resolved: to };
	});
	const references = parsed.references.map(({ through, ...reference }) => {
		const to = through === undefined ? undefined : imports[through.import]?.resolved;
		const target: Target | undefined =
			to === undefined || through === undefined ? undefined : { path: to, symbol: through.symbol };
		return target === undefined ? reference : { ...reference, target };
	});
	return {
		adapter: "typescript",
		path: file,
		definitions: parsed.definitions,
		references,
		imports,
		unparsed: parsed.unparsed,
	};
}

/** One pass over code facts. */
interface FactsPass {
	/**
	 * The code facts of one file of a checkout.
	 * @param checkout The checkout and the files the pass may read in it.
	 * @param relative The file, relative to the checkout.
	 * @returns Its facts, or undefined when the pass may not read it.
	 */
	read(checkout: CheckoutFiles, relative: string): Promise<FileFacts | undefined>;
	/** How the pass read its files so far. */
	readonly stats: Readonly<PassStats>;
}

/** The cache, which lives as long as the server, and the passes that read through it. */
interface CodeFacts {
	/**
	 * Start a pass.
	 * @param signal Cancels the pass between two files.
	 * @returns The pass.
	 */
	pass(signal: AbortSignal): FactsPass;
}

/** Runs parses one at a time, each followed by a turn of the event loop. */
type Serial = <T>(work: () => Promise<T>) => Promise<T>;

/**
 * A queue that runs work one at a time and lets the event loop run between
 * two pieces of work. Files read together resolve their bytes together, and
 * without it their parses run back to back in one turn of the loop.
 * @returns The queue.
 */
function serialQueue(): Serial {
	let tail: Promise<void> = Promise.resolve();
	return (work) => {
		const run = tail.then(work);
		tail = run.then(yieldToEventLoop, yieldToEventLoop);
		return run;
	};
}

/**
 * Drop the entries of files that no longer exist.
 * @param cache The cache.
 */
function dropGone(cache: Map<string, Entry>): void {
	for (const absolute of cache.keys()) if (!fs.existsSync(absolute)) cache.delete(absolute);
}

/**
 * The cache and its passes.
 * @returns An empty cache.
 */
function createCodeFacts(): CodeFacts {
	const cache = new Map<string, Entry>();
	const serial = serialQueue();
	return {
		/**
		 * Start a pass.
		 * @param signal Cancels the pass between two files.
		 * @returns The pass.
		 */
		pass(signal) {
			dropGone(cache);
			return createPass({ cache, serial, signal });
		},
	};
}

/** What reading one file needs from its pass. */
interface PassContext {
	readonly cache: Map<string, Entry>;
	readonly serial: Serial;
	readonly signal: AbortSignal;
}

/**
 * The parsed facts of a file's bytes: from the cache when it holds them,
 * else parsed now, after every parse queued before it, replacing the file's
 * entry.
 * @param context The cache, its queue and the pass's signal.
 * @param absolute The real file.
 * @param bytes Its bytes.
 * @param grammar The grammar that reads it.
 * @param stats The pass's counts.
 * @returns The facts.
 */
async function parsedFacts(
	context: PassContext,
	absolute: string,
	bytes: Uint8Array,
	grammar: GrammarName,
	stats: PassStats,
): Promise<ParsedFacts> {
	const hash = Bun.hash(bytes);
	const entry = context.cache.get(absolute);
	if (entry?.hash === hash && entry.grammar === grammar) {
		stats.cached += 1;
		return entry.facts;
	}
	const facts = await context.serial(() => {
		context.signal.throwIfAborted();
		return parse(bytes, grammar);
	});
	context.cache.set(absolute, { hash, grammar, facts });
	stats.parsed += 1;
	return facts;
}

/**
 * Parse a file's bytes with a grammar and read its facts.
 * @param bytes The bytes.
 * @param grammar The grammar.
 * @returns The facts.
 * @throws {Error} When the grammar gives no tree, which only a cancelled parse does.
 */
async function parse(bytes: Uint8Array, grammar: GrammarName): Promise<ParsedFacts> {
	const loaded = (await grammars()).get(grammar);
	const tree = loaded?.parser.parse(new TextDecoder().decode(bytes)) ?? null;
	if (loaded === undefined || tree === null) throw new Error(`The ${grammar} grammar gave no tree`);
	try {
		return typeScriptFacts(tree, loaded);
	} finally {
		tree.delete();
	}
}

/**
 * One pass through the cache.
 * @param context The cache, its queue, and the signal that cancels the pass between two files.
 * @returns The pass.
 */
function createPass(context: PassContext): FactsPass {
	const { signal } = context;
	const stats: PassStats = { read: 0, parsed: 0, cached: 0 };
	const reads = new Map<string, Promise<FileFacts | undefined>>();
	const resolvers = new Map<string, ModuleResolver>();
	/**
	 * The resolver of a checkout, made once in a pass.
	 * @param checkout The checkout.
	 * @returns Its resolver.
	 */
	const resolverOf = (checkout: CheckoutFiles): ModuleResolver => {
		let resolver = resolvers.get(checkout.root);
		if (resolver === undefined) {
			resolver = createModuleResolver(checkout, (relative) => {
				const target = listedTarget(checkout, relative);
				return target === undefined ? undefined : fs.readFileSync(target.absolute, "utf8");
			});
			resolvers.set(checkout.root, resolver);
		}
		return resolver;
	};
	/**
	 * Read one file's facts.
	 * @param checkout The checkout.
	 * @param relative The file.
	 * @returns Its facts, or undefined when the pass may not read it.
	 */
	const readOnce = async (
		checkout: CheckoutFiles,
		relative: string,
	): Promise<FileFacts | undefined> => {
		signal.throwIfAborted();
		const target = listedTarget(checkout, relative);
		if (target === undefined) return undefined;
		const bytes = await Bun.file(target.absolute).bytes();
		stats.read += 1;
		const extension = path.posix.extname(target.relative);
		const grammar = GRAMMAR_OF[extension];
		if (grammar === undefined) {
			return { adapter: "text", path: target.relative, text: new TextDecoder().decode(bytes) };
		}
		const parsed = await parsedFacts(context, target.absolute, bytes, grammar, stats);
		return resolved(parsed, target.relative, resolverOf(checkout));
	};
	return {
		stats,
		/**
		 * The code facts of one file, read once in the pass.
		 * @param checkout The checkout.
		 * @param relative The file.
		 * @returns Its facts, or undefined.
		 */
		read(checkout, relative) {
			const key = `${checkout.root}\0${relative}`;
			let reading = reads.get(key);
			if (reading === undefined) {
				reading = readOnce(checkout, relative);
				reads.set(key, reading);
			}
			return reading;
		},
	};
}

export { type CodeFacts, type FactsPass, type PassStats, createCodeFacts };
