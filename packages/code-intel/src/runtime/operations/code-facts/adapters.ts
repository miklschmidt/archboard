// The table of adapters (ADR 0046): for each language or file format an
// adapter reads, the files it reads, how it reads each one from its text to
// its facts, and the resolver of its imports. A file no entry names is read as
// text (text-reading.ts).
//
// An adapter reads a file through a tree-sitter grammar and its query file
// (`treeSitter`, grammars.ts), or with a parser Bun has: compose files and
// Kubernetes manifests are YAML (`Bun.YAML.parse`) and `flake.lock` is JSON.
// An entry names a file by its extension (`.py`) or by its whole name
// (`flake.lock`), and a whole name wins over an extension. No two entries
// read the same file. Where other formats share an extension, the adapter
// answers no facts for a file of another format, and it is read as text.
//
// A new language or format adds its own files (its facts and its import
// resolver, and a query file for a grammar), its name to `AdapterName`
// (facts.ts) and one entry here. Nothing else changes: the reader, the cache,
// the definition search and the code check read every adapter's facts the
// same way.

import path from "node:path";
import { HEADERS, SOURCES } from "#runtime/operations/code-facts/c/c-pairs.ts";
import type {
	AdapterName,
	ImportResolver,
	ParseFacts,
	ReadParsed,
	ReadText,
} from "#runtime/operations/code-facts/facts.ts";
import { cFacts } from "#runtime/operations/code-facts/c/c-adapter.ts";
import { createCResolver } from "#runtime/operations/code-facts/c/c-resolution.ts";
import { composeFacts } from "#runtime/operations/code-facts/compose/compose-adapter.ts";
import {
	COMPOSE_FILE_NAMES,
	createComposeResolver,
} from "#runtime/operations/code-facts/compose/compose-project.ts";
import { createEnvFileResolver, envFileFacts } from "#runtime/operations/code-facts/env-file.ts";
import { readCSharp } from "#runtime/operations/code-facts/csharp/csharp-adapter.ts";
import { projectFacts } from "#runtime/operations/code-facts/csharp/csharp-project.ts";
import { createCSharpResolver } from "#runtime/operations/code-facts/csharp/csharp-resolution.ts";
import {
	createFlakeResolver,
	flakeLockFacts,
} from "#runtime/operations/code-facts/nix/flake-lock.ts";
import { treeSitter } from "#runtime/services/code-facts/grammars.ts";
import {
	helmValuesFacts,
	isHelmValues,
} from "#runtime/operations/code-facts/kubernetes/helm-values.ts";
import {
	createModuleResolver,
	type CheckoutFiles,
} from "#runtime/operations/code-facts/modules/module-resolution.ts";
import { kubernetesFacts } from "#runtime/operations/code-facts/kubernetes/kubernetes-adapter.ts";
import {
	type ObjectiveCReadings,
	objectiveCReadings,
	wrappersIn,
} from "#runtime/operations/code-facts/objc/objc-adapter.ts";
import { createKubernetesResolver } from "#runtime/operations/code-facts/kubernetes/kubernetes-resolution.ts";
import { flakeFacts } from "#runtime/operations/code-facts/nix/nix-adapter.ts";
import { pythonFacts } from "#runtime/operations/code-facts/python/python-adapter.ts";
import { rustFacts } from "#runtime/operations/code-facts/rust/rust-adapter.ts";
import { cargoFacts } from "#runtime/operations/code-facts/rust/rust-cargo.ts";
import { createRustResolver } from "#runtime/operations/code-facts/rust/rust-resolution.ts";
import { createPythonResolver } from "#runtime/operations/code-facts/python/python-resolution.ts";
import { terraformFacts } from "#runtime/operations/code-facts/terraform/terraform-adapter.ts";
import { createTerraformResolver } from "#runtime/operations/code-facts/terraform/terraform-resolution.ts";
import { swiftFacts } from "#runtime/operations/code-facts/swift/swift-adapter.ts";
import { manifestFacts } from "#runtime/operations/code-facts/swift/swift-package.ts";
import { createSwiftResolver } from "#runtime/operations/code-facts/swift/swift-resolution.ts";
import { typeScriptFacts } from "#runtime/operations/code-facts/typescript/typescript-adapter.ts";

/** What one adapter reads, and how. */
interface Adapter {
	/** What the facts of a file it reads say read them. */
	readonly name: AdapterName;
	/** Each extension (`.ts`) or whole file name (`flake.lock`) it reads, and how it reads it. */
	readonly reads: Readonly<Record<string, ParseFacts>>;
	/**
	 * The resolver of one checkout's imports, made once in a pass. It reads
	 * other files as text, or their facts, such as the files of a C# project.
	 */
	readonly resolver: (
		checkout: CheckoutFiles,
		read: ReadText,
		parsed: ReadParsed,
	) => ImportResolver;
}

/**
 * The resolver of TypeScript imports, which resolves an import by its specifier.
 * @param checkout The checkout's files.
 * @param read Reads a file of the checkout as text.
 * @returns The resolver.
 */
function typeScriptResolver(checkout: CheckoutFiles, read: ReadText): ImportResolver {
	const modules = createModuleResolver(checkout, read);
	return {
		/**
		 * Where one import leads, by its specifier.
		 * @param from The importing file.
		 * @param found The import.
		 * @returns The import, with its file where it names one.
		 */
		resolve(from, found) {
			const resolved = modules.resolve(from, found.specifier);
			return resolved === undefined ? found : { ...found, resolved };
		},
	};
}

const TYPESCRIPT = treeSitter(
	"tree-sitter-typescript/tree-sitter-typescript.wasm",
	"typescript.scm",
	typeScriptFacts,
);
const TSX = treeSitter(
	"tree-sitter-typescript/tree-sitter-tsx.wasm",
	"typescript.scm",
	typeScriptFacts,
);
const PYTHON = treeSitter("tree-sitter-python/tree-sitter-python.wasm", "python.scm", pythonFacts);
/** The `terraform` dialect of the HCL grammar, which Terraform's and OpenTofu's templates follow (TASK-367.17). */
const TERRAFORM = treeSitter(
	"@tree-sitter-grammars/tree-sitter-hcl/tree-sitter-terraform.wasm",
	"terraform.scm",
	terraformFacts,
);
/** A flake reading follows local Nix imports; independent `.nix` files remain text (TASK-436.06). */
const FLAKE = treeSitter("@lumis-sh/wasm-nix/tree-sitter-nix.wasm", "nix.scm", flakeFacts);
const C = treeSitter("tree-sitter-c/tree-sitter-c.wasm", "c.scm", cFacts);
/** An unpaired C-family header defaults to C++ (TASK-367.09). */
const CPP = treeSitter("tree-sitter-cpp/tree-sitter-cpp.wasm", "c.scm", cFacts);
/**
 * An unpaired `.h` uses its text to choose Objective-C or C++; a paired
 * header uses its source's language (TASK-436.07). An `.m` is Objective-C.
 * Their reading also depends on the SDK macros the checkout's headers wrap.
 */
const OBJECTIVE_C = objectiveCReadings(CPP);
const { unpairedHeader: HEADER, source: OBJECTIVE_C_SOURCE } = OBJECTIVE_C(new Map());

/** A `Package.swift` is Swift, and its targets are read beside its code (TASK-367.12). */
const SWIFT = treeSitter("@lumis-sh/wasm-swift/tree-sitter-swift.wasm", "swift.scm", swiftFacts);
const SWIFT_MANIFEST = treeSitter(
	"@lumis-sh/wasm-swift/tree-sitter-swift.wasm",
	"swift.scm",
	manifestFacts,
);

/** Rust through tree-sitter-rust; a `Cargo.toml` beside it with Bun's TOML parser (TASK-540). */
const RUST = treeSitter("tree-sitter-rust/tree-sitter-rust.wasm", "rust.scm", rustFacts);

/** Every adapter, one entry each. */
const ADAPTERS: readonly Adapter[] = [
	{
		name: "typescript",
		reads: { ".ts": TYPESCRIPT, ".mts": TYPESCRIPT, ".cts": TYPESCRIPT, ".tsx": TSX },
		resolver: typeScriptResolver,
	},
	{
		name: "python",
		reads: { ".py": PYTHON, ".pyi": PYTHON },
		resolver: createPythonResolver,
	},
	{
		name: "swift",
		reads: { ".swift": SWIFT, "Package.swift": SWIFT_MANIFEST },
		resolver: createSwiftResolver,
	},
	{
		name: "rust",
		reads: { ".rs": RUST, "Cargo.toml": cargoFacts },
		resolver: createRustResolver,
	},
	{
		name: "terraform",
		reads: { ".tf": TERRAFORM, ".tofu": TERRAFORM },
		resolver: createTerraformResolver,
	},
	{ name: "c", reads: { ".c": C }, resolver: createCResolver },
	{
		name: "cpp",
		reads: {
			".cc": CPP,
			".cpp": CPP,
			".cxx": CPP,
			".h": HEADER,
			".hh": CPP,
			".hpp": CPP,
			".hxx": CPP,
		},
		resolver: createCResolver,
	},
	// An Objective-C++ file (`.mm`) has no grammar and is read as text (ADR 0046).
	{ name: "objc", reads: { ".m": OBJECTIVE_C_SOURCE }, resolver: createCResolver },
	{
		name: "csharp",
		reads: { ".cs": readCSharp, ".csproj": projectFacts },
		resolver: createCSharpResolver,
	},
	{
		name: "compose",
		reads: Object.fromEntries(COMPOSE_FILE_NAMES.map((name) => [name, composeFacts])),
		resolver: createComposeResolver,
	},
	{ name: "env", reads: { ".env": envFileFacts }, resolver: createEnvFileResolver },
	{
		// A `.yaml` file that holds no Kubernetes object is read as text (TASK-367.19).
		name: "kubernetes",
		reads: { ".yaml": kubernetesFacts, ".yml": kubernetesFacts },
		resolver: createKubernetesResolver,
	},
	{
		name: "nix",
		reads: { "flake.nix": FLAKE, "flake.lock": flakeLockFacts },
		resolver: createFlakeResolver,
	},
	{
		name: "helm",
		reads: { "values.yaml": helmValuesFacts },
		resolver: createKubernetesResolver,
	},
];

/** The adapter that reads a file, and how it reads it. */
interface AdapterReading {
	readonly adapter: Adapter;
	readonly parse: ParseFacts;
	/** The paired source's path and content, which also refresh a header's facts. */
	readonly dependencyHash?: bigint | number;
}

/**
 * Each extension and file name an adapter reads, and how.
 * @returns The readings, by extension or file name.
 * @throws {Error} When two entries read the same extension or file name.
 */
function readings(): ReadonlyMap<string, AdapterReading> {
	const byName = new Map<string, AdapterReading>();
	for (const adapter of ADAPTERS) {
		for (const [name, parse] of Object.entries(adapter.reads)) {
			const other = byName.get(name)?.adapter.name;
			if (other !== undefined)
				throw new Error(`The ${other} and ${adapter.name} adapters both read ${name}`);
			byName.set(name, { adapter, parse });
		}
	}
	return byName;
}

const BY_NAME = readings();

/**
 * The adapter that reads a file: by its whole name, else by its extension.
 * @param file The file.
 * @returns The adapter and how it reads the file, or undefined for a file read as text.
 */
function adapterOf(file: string): AdapterReading | undefined {
	return BY_NAME.get(path.posix.basename(file)) ?? BY_NAME.get(path.posix.extname(file));
}

/**
 * Select a format using the files that identify it in this checkout.
 * @param checkout The checkout's files.
 * @param file The file to read.
 * @returns Its adapter; a values.yaml outside a chart keeps the ordinary YAML reading.
 */
function selectedReading(checkout: CheckoutFiles, file: string): AdapterReading | undefined {
	const selected = adapterOf(file);
	return selected?.adapter.name === "helm" && !isHelmValues(checkout, file)
		? BY_NAME.get(path.posix.extname(file))
		: selected;
}

/**
 * The supported source beside a header, including its content fingerprint.
 * @param file The header.
 * @param checkout The checkout's files.
 * @param read Reads a listed file's text.
 * @returns The source's reading, or nothing without a readable pair.
 */
function headerSource(
	file: string,
	checkout: CheckoutFiles,
	read: ReadText,
): AdapterReading | undefined {
	const extension = path.posix.extname(file);
	if (!HEADERS.includes(extension)) return undefined;
	const stem = file.slice(0, -extension.length);
	const paired = SOURCES.map((suffix) => `${stem}${suffix}`).find((source) =>
		checkout.files.has(source),
	);
	if (paired === undefined) return undefined;
	const source = adapterOf(paired);
	const text = read(paired);
	return source === undefined || text === undefined
		? undefined
		: { ...source, dependencyHash: Bun.hash(`${paired}\0${text}`) };
}

/**
 * The Objective-C parse for a source, a paired header or an unpaired header.
 * @param reading The selected reading.
 * @param paired Whether a source selected the header's language.
 * @param objectiveC The checkout's Objective-C readings.
 * @returns The parse for that role.
 */
function objectiveCParse(
	reading: AdapterReading,
	paired: boolean,
	objectiveC: ObjectiveCReadings,
): ParseFacts {
	if (paired) return objectiveC.header;
	return reading.parse === HEADER ? objectiveC.unpairedHeader : objectiveC.source;
}

/**
 * A checkout-scoped flake reading, cached only within one facts pass. Each
 * next pass reads imported sources again, including uncommitted edits.
 * @param flakes This pass's flake readings.
 * @param file The flake source.
 * @param checkout Its checkout.
 * @param read The checkout read boundary.
 * @returns Its parser and source-aware static reading.
 */
function flakeReading(
	flakes: Map<string, ParseFacts>,
	file: string,
	checkout: CheckoutFiles,
	read: ReadText,
): ParseFacts {
	let parse = flakes.get(file);
	if (parse === undefined) {
		parse = treeSitter("@lumis-sh/wasm-nix/tree-sitter-nix.wasm", "nix.scm", (tree, grammar) =>
			flakeFacts(tree, grammar, { root: checkout.root, file, read }),
		);
		flakes.set(file, parse);
	}
	return parse;
}

/**
 * Whether a reading needs the checkout's Objective-C macro context.
 * @param parse Its parser.
 * @returns True for either Objective-C source or shared headers.
 */
function objectiveCFile(parse: ParseFacts): boolean {
	return parse === HEADER || parse === OBJECTIVE_C_SOURCE;
}

/**
 * How the files of one checkout are read, made once in a pass: as
 * `adapterOf` says, but a header uses its same-directory source's language,
 * and an Objective-C file blanks the SDK macros the checkout's headers wrap.
 * @param checkout The checkout.
 * @param read Reads a file of the checkout as text.
 * @returns The reading of each file of the checkout.
 */
function readingsIn(
	checkout: CheckoutFiles,
	read: ReadText,
): (file: string) => AdapterReading | undefined {
	let objectiveC: ObjectiveCReadings | undefined;
	const flakes = new Map<string, ParseFacts>();
	return (file) => {
		const source = headerSource(file, checkout, read);
		const reading = source ?? selectedReading(checkout, file);
		if (reading === undefined) return undefined;
		if (reading.parse === FLAKE)
			return { ...reading, parse: flakeReading(flakes, file, checkout, read) };
		if (!objectiveCFile(reading.parse)) return reading;
		objectiveC ??= OBJECTIVE_C(wrappersIn(checkout, read));
		return {
			...reading,
			parse: objectiveCParse(reading, source !== undefined, objectiveC),
		};
	};
}

export { type AdapterReading, adapterOf, readingsIn };
