// Reading code facts, file by file, through a cache in the server's memory
// (ADR 0046).
//
// The cache keeps one entry for each file a pass parsed: the hash of the
// bytes it read, the adapter's reading, and the facts those bytes gave. Each
// pass reads and hashes every file again; where hash and reading match it
// takes the facts from the entry, and otherwise it parses and replaces the
// entry. A reading is the adapter's, except that an Objective-C file is read
// with the SDK macros its checkout's headers wrap (objc-adapter.ts), and a
// change to them is a new reading. A header also hashes its paired source,
// whose language selects its grammar (TASK-436.07). So a pass always sees an edit, an
// uncommitted one too, and the cache never holds more than one entry for a
// file. Each pass drops the entries of files that no
// longer exist, so a deleted or renamed file leaves nothing behind. A file
// read as text is not kept: its facts are its bytes, which the pass reads
// anyway. A file whose adapter finds it of another format, such as a `.yaml`
// file that holds no Kubernetes object, is read as text, and its entry keeps
// that answer.
//
// Which adapter reads a file is the adapter table's (adapters.ts). What
// depends on other files, an import resolved through `tsconfig.json` or a
// Python project's roots, is resolved again on each pass from the cached
// facts, by the adapter's own resolver. So is what a file's module says of
// it where no import names it, such as a name another file of a C# project
// declares: the resolver reads the facts of those files through the cache. A pass reads a file only
// where its symbolic links lead to a file the caller lists for its checkout,
// and never Terraform state, variable files or `.terraform`. Parsing is
// synchronous, so parses run one at a time, also for files read together, and
// each one yields to the event loop before the next starts: the server's polls
// and sockets wait for one file at most.

import fs from "node:fs";
import path from "node:path";
import { type AdapterReading, readingsIn } from "@/runtime/code-facts/lib/adapters";
import type {
	FileFacts,
	ImportResolver,
	ParsedFacts,
	ParseFacts,
	ResolvedImport,
	SyntaxFacts,
	Target,
} from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import { neverRead } from "@/runtime/code-facts/lib/never-read";
import type { TerraformPlan } from "@/runtime/code-facts/lib/terraform-plan";

/** One cache entry: the hash of the bytes read, how its adapter read them, and their facts. */
interface Entry {
	readonly hash: bigint | number;
	readonly parse: ParseFacts;
	readonly dependencyHash: bigint | number | undefined;
	/** None where the adapter found the file of another format, which is read as text. */
	readonly facts: ParsedFacts | undefined;
}

/** How one pass read its files. */
interface PassStats {
	/** Files read, each once. */
	read: number;
	/** Files an adapter parsed, because the cache had no entry for their bytes. */
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
 * A file's text, if the pass may read it.
 * @param checkout The checkout and the files it may read.
 * @param relative The file, relative to the checkout.
 * @returns The text, or undefined.
 */
function readListed(checkout: CheckoutFiles, relative: string): string | undefined {
	const target = listedTarget(checkout, relative);
	return target === undefined ? undefined : fs.readFileSync(target.absolute, "utf8");
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
 * Where a reference leads through a resolved import: the imported file, and
 * the name there with the rest of the reference's spelling (`*` for the
 * whole module).
 * @param symbol The reference's spelling.
 * @param local The import's local name the spelling starts with.
 * @param found The resolved import.
 * @returns The target, or undefined when the import leads to no file.
 */
function targetOf(
	symbol: string,
	local: string,
	found: ResolvedImport | undefined,
): Target | undefined {
	const name = found?.names.find((each) => each.local === local);
	if (found?.resolved === undefined || name === undefined) return undefined;
	return { path: found.resolved, symbol: nameThere(symbol, local, name.imported) };
}

/**
 * A reference's name in the file an import leads to: the imported name with
 * the rest of the spelling, or the rest alone when the import is the whole
 * module, and `*` when nothing remains.
 * @param symbol The reference's spelling.
 * @param local The import's local name the spelling starts with.
 * @param imported What the import names in the file.
 * @returns The name there.
 */
function nameThere(symbol: string, local: string, imported: string): string {
	const rest = symbol === local ? [] : symbol.slice(local.length + 1).split(".");
	const names = imported === "*" ? rest : [imported, ...rest];
	return names.join(".") || "*";
}

/**
 * Where each reference and import of a file leads, for this pass: through an
 * import, else where the file's module says.
 * @param parsed The cached facts.
 * @param file The file, relative to its checkout.
 * @param adapter The adapter that read it.
 * @param resolver The checkout's resolver of the adapter's imports.
 * @returns The facts.
 */
async function resolved(
	parsed: ParsedFacts,
	file: string,
	adapter: SyntaxFacts["adapter"],
	resolver: ImportResolver,
): Promise<SyntaxFacts> {
	const imports = parsed.imports.map((found) => resolver.resolve(file, found));
	const moduleReading = await resolver.inModule?.(file, parsed);
	const references = parsed.references.map(({ through, ...reference }, index) => {
		const target =
			through === undefined
				? moduleReading?.targets[index]
				: targetOf(reference.symbol, through.local, imports[through.import]);
		return target === undefined ? reference : { ...reference, target };
	});
	return {
		adapter,
		path: file,
		definitions: moduleReading?.definitions ?? parsed.definitions,
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
	/** The Terraform or OpenTofu plans an agent named for the pass (`--plan`). */
	readonly plans: readonly TerraformPlan[];
}

/** The cache, which lives as long as the server, and the passes that read through it. */
interface CodeFacts {
	/**
	 * Start a pass.
	 * @param signal Cancels the pass between two files.
	 * @param plans The Terraform or OpenTofu plans an agent named, if any.
	 * @returns The pass.
	 */
	pass(signal: AbortSignal, plans?: readonly TerraformPlan[]): FactsPass;
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
		 * @param plans The plans an agent named.
		 * @returns The pass.
		 */
		pass(signal, plans = []) {
			dropGone(cache);
			return createPass({ cache, serial, signal, plans });
		},
	};
}

/** What reading one file needs from its pass. */
interface PassContext {
	readonly cache: Map<string, Entry>;
	readonly serial: Serial;
	readonly signal: AbortSignal;
	readonly plans: readonly TerraformPlan[];
}

/**
 * The parsed facts of a file's bytes: from the cache when it holds them,
 * else parsed now, after every parse queued before it, replacing the file's
 * entry.
 * @param context The cache, its queue and the pass's signal.
 * @param absolute The real file.
 * @param bytes Its bytes.
 * @param reading The adapter and how it reads the file.
 * @param stats The pass's counts.
 * @returns The facts, or undefined for a file of a format the adapter does not read.
 */
async function parsedFacts(
	context: PassContext,
	absolute: string,
	bytes: Uint8Array,
	reading: AdapterReading,
	stats: PassStats,
): Promise<ParsedFacts | undefined> {
	const hash = Bun.hash(bytes);
	const entry = context.cache.get(absolute);
	if (
		entry?.hash === hash &&
		entry.parse === reading.parse &&
		entry.dependencyHash === reading.dependencyHash
	) {
		stats.cached += 1;
		return entry.facts;
	}
	const facts = await context.serial(() => {
		context.signal.throwIfAborted();
		return Promise.resolve(reading.parse(new TextDecoder().decode(bytes)));
	});
	context.cache.set(absolute, {
		hash,
		parse: reading.parse,
		dependencyHash: reading.dependencyHash,
		facts,
	});
	stats.parsed += 1;
	return facts;
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
	const resolvers = new Map<string, ImportResolver>();
	const parses = new Map<string, Promise<ParsedFacts | undefined>>();
	const readings = new Map<string, (file: string) => AdapterReading | undefined>();
	/**
	 * How a file of a checkout is read, by readings made once in the pass for the checkout.
	 * @param checkout The checkout.
	 * @param relative The file.
	 * @returns The adapter and how it reads the file, or undefined for a file read as text.
	 */
	const readingOf = (checkout: CheckoutFiles, relative: string): AdapterReading | undefined => {
		let of = readings.get(checkout.root);
		if (of === undefined) {
			of = readingsIn(checkout, (file) => readListed(checkout, file));
			readings.set(checkout.root, of);
		}
		return of(relative);
	};
	/**
	 * The facts an adapter gives a file's bytes, read and parsed once in the
	 * pass, whether the pass reads the file or a resolver reads it first.
	 * @param target The real file.
	 * @param target.absolute Its absolute path.
	 * @param reading The adapter and how it reads the file.
	 * @returns The facts, or undefined for a file of a format the adapter does not read.
	 */
	const parsedOnce = (
		target: { readonly absolute: string },
		reading: AdapterReading,
	): Promise<ParsedFacts | undefined> => {
		let parsing = parses.get(target.absolute);
		if (parsing === undefined) {
			parsing = Bun.file(target.absolute)
				.bytes()
				.then((bytes) => parsedFacts(context, target.absolute, bytes, reading, stats));
			parses.set(target.absolute, parsing);
		}
		return parsing;
	};
	/**
	 * The facts an adapter gives a file before its imports are resolved, for
	 * a resolver that reads what the files around a file declare.
	 * @param checkout The checkout.
	 * @param relative The file.
	 * @returns Its facts, or undefined for a file the pass may not read or reads as text.
	 */
	const parsedOf = async (
		checkout: CheckoutFiles,
		relative: string,
	): Promise<ParsedFacts | undefined> => {
		signal.throwIfAborted();
		const target = listedTarget(checkout, relative);
		const reading = target === undefined ? undefined : readingOf(checkout, target.relative);
		return target === undefined || reading === undefined ? undefined : parsedOnce(target, reading);
	};
	/**
	 * The resolver of one adapter's imports in a checkout, made once in a pass.
	 * @param checkout The checkout.
	 * @param reading The adapter.
	 * @returns Its resolver.
	 */
	const resolverOf = (checkout: CheckoutFiles, reading: AdapterReading): ImportResolver => {
		const key = `${checkout.root}\0${reading.adapter.name}`;
		let resolver = resolvers.get(key);
		if (resolver === undefined) {
			resolver = reading.adapter.resolver(
				checkout,
				(relative) => readListed(checkout, relative),
				(relative) => parsedOf(checkout, relative),
			);
			resolvers.set(key, resolver);
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
		stats.read += 1;
		const reading = readingOf(checkout, target.relative);
		const parsed = reading === undefined ? undefined : await parsedOnce(target, reading);
		if (reading === undefined || parsed === undefined) {
			const bytes = await Bun.file(target.absolute).bytes();
			return { adapter: "text", path: target.relative, text: new TextDecoder().decode(bytes) };
		}
		const resolver = resolverOf(checkout, reading);
		return resolved(parsed, target.relative, reading.adapter.name, resolver);
	};
	return {
		stats,
		plans: context.plans,
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

export { type CodeFacts, type FactsPass, type PassStats, createCodeFacts, readListed };
