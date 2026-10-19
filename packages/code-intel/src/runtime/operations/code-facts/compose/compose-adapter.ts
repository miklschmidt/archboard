// The compose adapter (ADR 0046, TASK-367.20): the code facts of one compose
// file, from its text.
//
// A compose file defines each service, network and volume, addressed as the
// binding symbol spells it: `services.checkout`, `networks.front`,
// `volumes.data`. A definition spans its block; a service that publishes
// `ports` is `published` and exposed, and a network or volume declared
// `external` is `external` and exposed.
//
// Every entry that joins a service to another declaration is a reference of
// kind `configured-path` at the entry's line: `depends_on`, `links`,
// `volumes_from`, `network_mode: service:<name>`, the networks it joins, the
// named volumes it mounts, and an environment value whose host is a service
// (compose-model.ts). A named volume that two services mount is a shared
// volume: a mount that writes reaches every other service that mounts it in
// the same file, and a read-only mount reaches only the volume, because data
// runs from the writer to the reader. Each such reference reaches its address
// through an import of its own, whose specifier is the address: the resolver
// of the project (compose-project.ts) resolves it to the file that defines
// the address once compose's merge keeps the entry, and to the service an
// alias names. A reference whose import stays unresolved gives no evidence.
//
// The name of each environment value a service sets is a reference by
// `environment`, at the line that sets it, beside the service reference its
// value gives: TASK-367.23 joins it with the code that reads the name. Each
// env file a service reads is an import that passes names on: the resolver
// fills its names from the env file (env-file.ts), and never its values.

import {
	composeFile,
	type ComposeEntry,
	type ComposeLayer,
} from "#runtime/operations/code-facts/compose/compose-model.ts";
import type { Import, ParsedFacts } from "#runtime/operations/code-facts/facts.ts";

/** A reference, with the import it reaches its address through. */
type ParsedReference = ParsedFacts["references"][number];

/** The facts of a file that holds no compose declaration. */
const EMPTY: ParsedFacts = { definitions: [], references: [], imports: [], unparsed: [] };

/** The references and imports of a compose file, as they are gathered. */
interface Gathered {
	readonly references: ParsedReference[];
	readonly imports: Import[];
}

/**
 * Add a reference to an address, through an import of its own.
 * @param gathered What the file gave so far.
 * @param symbol The address.
 * @param line The entry's line.
 */
function addAddress(gathered: Gathered, symbol: string, line: number): void {
	const names = [{ imported: symbol, local: symbol, typeOnly: false }];
	gathered.imports.push({ specifier: symbol, line, names, typeOnly: false, reexport: false });
	gathered.references.push({
		symbol,
		line,
		via: "code",
		kind: "configured-path",
		typeOnly: false,
		through: { import: gathered.imports.length - 1, local: symbol },
	});
}

/**
 * The other services of a file that mount a named volume.
 * @param layers The file's layers.
 * @param volume The volume.
 * @param service The service that mounts it.
 * @returns Each other service once.
 */
function sharing(layers: readonly ComposeLayer[], volume: string, service: string): string[] {
	const mounting = layers.flatMap((layer) =>
		layer.entries.flatMap((entry) => (entry.mount?.volume === volume ? [entry.service] : [])),
	);
	return [...new Set(mounting)].filter((other) => other !== service);
}

/**
 * The services a mount that writes a named volume reaches: every other
 * service that mounts it. A read-only mount reaches none.
 * @param entry The entry.
 * @param layers The file's layers.
 * @returns Their addresses.
 */
function sharedWith(entry: ComposeEntry, layers: readonly ComposeLayer[]): string[] {
	const { mount } = entry;
	if (mount === undefined || mount.readOnly) return [];
	return sharing(layers, mount.volume, entry.service).map((other) => `services.${other}`);
}

/**
 * Add what one entry gives.
 * @param gathered What the file gave so far.
 * @param entry The entry.
 * @param layers The file's layers.
 */
function addEntry(gathered: Gathered, entry: ComposeEntry, layers: readonly ComposeLayer[]): void {
	const { line } = entry;
	if (entry.environment !== undefined) {
		const symbol = entry.environment;
		gathered.references.push({ symbol, line, via: "environment", typeOnly: false });
	}
	for (const target of [...entry.targets, ...sharedWith(entry, layers)]) {
		addAddress(gathered, target, line);
	}
	if (entry.envFile !== undefined) {
		const found = { specifier: entry.envFile, line, names: [], typeOnly: false };
		gathered.imports.push({ ...found, reexport: true });
	}
}

/**
 * The facts of a compose file.
 * @param text The file's text.
 * @returns Its facts; a file that is not YAML is one part that did not parse.
 */
function composeFacts(text: string): ParsedFacts {
	const file = composeFile(text);
	if (file.status === "unparsed") return { ...EMPTY, unparsed: [file.unparsed] };
	const gathered: Gathered = { references: [], imports: [] };
	for (const entry of file.layers.flatMap((layer) => layer.entries)) {
		addEntry(gathered, entry, file.layers);
	}
	return {
		definitions: file.layers.flatMap((layer) => layer.definitions),
		references: gathered.references.toSorted((left, right) => left.line - right.line),
		imports: gathered.imports,
		unparsed: [],
	};
}

export { composeFacts };
