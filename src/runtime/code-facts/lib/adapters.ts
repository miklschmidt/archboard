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
import { HEADERS, SOURCES } from "@/runtime/code-facts/lib/c-pairs";
import type {
	AdapterName,
	ImportResolver,
	ParseFacts,
	ReadParsed,
	ReadText,
} from "@/runtime/code-facts/lib/facts";
import { cFacts } from "@/runtime/code-facts/lib/c-adapter";
import { createCResolver } from "@/runtime/code-facts/lib/c-resolution";
import { composeFacts } from "@/runtime/code-facts/lib/compose-adapter";
import {
	COMPOSE_FILE_NAMES,
	createComposeResolver,
} from "@/runtime/code-facts/lib/compose-project";
import { createEnvFileResolver, envFileFacts } from "@/runtime/code-facts/lib/env-file";
import { readCSharp } from "@/runtime/code-facts/lib/csharp-adapter";
import { projectFacts } from "@/runtime/code-facts/lib/csharp-project";
import { createCSharpResolver } from "@/runtime/code-facts/lib/csharp-resolution";
import { createFlakeResolver, flakeLockFacts } from "@/runtime/code-facts/lib/flake-lock";
import { treeSitter } from "@/runtime/code-facts/lib/grammars";
import { helmValuesFacts, isHelmValues } from "@/runtime/code-facts/lib/helm-values";
import {
	createModuleResolver,
	type CheckoutFiles,
} from "@/runtime/code-facts/lib/module-resolution";
import { kubernetesFacts } from "@/runtime/code-facts/lib/kubernetes-adapter";
import {
	type ObjectiveCReadings,
	objectiveCReadings,
	wrappersIn,
} from "@/runtime/code-facts/lib/objc-adapter";
import { createKubernetesResolver } from "@/runtime/code-facts/lib/kubernetes-resolution";
import { flakeFacts } from "@/runtime/code-facts/lib/nix-adapter";
import { pythonFacts } from "@/runtime/code-facts/lib/python-adapter";
import { createPythonResolver } from "@/runtime/code-facts/lib/python-resolution";
import { terraformFacts } from "@/runtime/code-facts/lib/terraform-adapter";
import { createTerraformResolver } from "@/runtime/code-facts/lib/terraform-resolution";
import { swiftFacts } from "@/runtime/code-facts/lib/swift-adapter";
import { manifestFacts } from "@/runtime/code-facts/lib/swift-package";
import { createSwiftResolver } from "@/runtime/code-facts/lib/swift-resolution";
import { typeScriptFacts } from "@/runtime/code-facts/lib/typescript-adapter";

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
/** Only `flake.nix` is read: its outputs. Every other `.nix` file is read as text (TASK-367.21). */
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
	return (file) => {
		const reading = selectedReading(checkout, file);
		if (reading === undefined) return undefined;
		const extension = path.posix.extname(file);
		if (HEADERS.includes(extension)) {
			const stem = file.slice(0, -extension.length);
			const paired = SOURCES.map((extension) => `${stem}${extension}`).find((source) =>
				checkout.files.has(source),
			);
			const source = paired === undefined ? undefined : adapterOf(paired);
			const sourceText = paired === undefined ? undefined : read(paired);
			if (paired !== undefined && source !== undefined && sourceText !== undefined) {
				const dependencyHash = Bun.hash(`${paired}\0${sourceText}`);
				if (source.adapter.name !== "objc") return { ...source, dependencyHash };
				objectiveC ??= OBJECTIVE_C(wrappersIn(checkout, read));
				return { ...source, parse: objectiveC.header, dependencyHash };
			}
		}
		if (reading.parse !== HEADER && reading.parse !== OBJECTIVE_C_SOURCE) return reading;
		objectiveC ??= OBJECTIVE_C(wrappersIn(checkout, read));
		return {
			...reading,
			parse: reading.parse === HEADER ? objectiveC.unpairedHeader : objectiveC.source,
		};
	};
}

export { type AdapterReading, adapterOf, readingsIn };
