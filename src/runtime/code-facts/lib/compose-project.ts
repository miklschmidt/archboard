// A compose project, as compose finds and merges its files (ADR 0046,
// TASK-367.20).
//
// In a directory, compose reads the first of `compose.yaml`, `compose.yml`,
// `docker-compose.yml` and `docker-compose.yaml`, then merges the first of
// `compose.override.yml`, `compose.override.yaml`,
// `docker-compose.override.yml` and `docker-compose.override.yaml` over it,
// and the documents of one file in their order. Those eight names are the
// compose files the adapter reads. A file named for `-f` on a command line,
// such as `compose.prod.yaml`, merges only with what the command names, which
// no file records, so the check does not read it as compose. A compose file
// that compose would not pick, such as `docker-compose.yml` beside
// `compose.yaml`, is a project of its own.
//
// The merge decides which entries hold. A later file's environment value of
// the same name, volume mount at the same target or `network_mode` replaces
// an earlier one, so the earlier entry's reference stays unresolved and gives
// no evidence. `depends_on`, `links`, `volumes_from` and `networks` add up.
// A reference resolves to the first file of the project that defines its
// address, and a name that is a service's `container_name`, `hostname` or
// network alias resolves to that service. The resolver reads each env file a
// service names, if Git lists it, for its names only.

import path from "node:path";
import { envNames } from "@/runtime/code-facts/lib/compose-adapter";
import {
	composeFile,
	type ComposeEntry,
	type ComposeLayer,
} from "@/runtime/code-facts/lib/compose-model";
import type {
	Import,
	ImportResolver,
	ReadText,
	ResolvedImport,
} from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";

/** The files compose reads in a directory, in its order of preference. */
const COMPOSE_FILES = ["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"];
/** The override files compose merges over them, in its order of preference. */
const OVERRIDE_FILES = [
	"compose.override.yml",
	"compose.override.yaml",
	"docker-compose.override.yml",
	"docker-compose.override.yaml",
];
/** Every name of a compose file the adapter reads. */
const COMPOSE_FILE_NAMES = [...COMPOSE_FILES, ...OVERRIDE_FILES];

/**
 * Whether the adapter reads a file as compose.
 * @param file A path.
 * @returns True when its name is one of the eight compose file names.
 */
function isComposeFile(file: string): boolean {
	return COMPOSE_FILE_NAMES.includes(path.posix.basename(file));
}

/** One layer of a project: a document of one of its files, in merge order. */
interface Layered {
	readonly path: string;
	readonly order: number;
	readonly layer: ComposeLayer;
}

/**
 * The files of the compose project a file belongs to, in merge order.
 * @param checkout The checkout's files.
 * @param file A compose file, relative to the checkout.
 * @returns The project's files, the file among them.
 */
function projectFiles(checkout: CheckoutFiles, file: string): string[] {
	const directory = path.posix.dirname(file);
	const project = [COMPOSE_FILES, OVERRIDE_FILES].flatMap((names) => {
		const found = names
			.map((name) => path.posix.join(directory, name))
			.find((each) => checkout.files.has(each));
		return found === undefined ? [] : [found];
	});
	return project.includes(file) ? project : [file];
}

/**
 * Whether a later layer of the project replaces an entry.
 * @param layers The project's layers.
 * @param entry The entry.
 * @param order The order of its layer.
 * @returns True when a later entry of the same service replaces it.
 */
function replaced(layers: readonly Layered[], entry: ComposeEntry, order: number): boolean {
	if (entry.replaces === undefined) return false;
	return layers.some(
		(later) =>
			later.order > order &&
			later.layer.entries.some(
				(each) => each.service === entry.service && each.replaces === entry.replaces,
			),
	);
}

/**
 * Whether a service mounts a named volume once the project is merged.
 * @param layers The project's layers.
 * @param service The service.
 * @param volume The volume.
 * @returns True when a mount of it holds.
 */
function mounts(layers: readonly Layered[], service: string, volume: string): boolean {
	return layers.some(({ layer, order }) =>
		layer.entries.some(
			(entry) =>
				entry.service === service &&
				entry.mount?.volume === volume &&
				!replaced(layers, entry, order),
		),
	);
}

/**
 * Whether the merged project keeps the entry an import of a file stands for.
 * @param layers The project's layers.
 * @param from The file.
 * @param found The import: its line, and the address it names.
 * @returns True when the entry holds after the merge.
 */
function holds(layers: readonly Layered[], from: string, found: Import): boolean {
	return layers.some(({ path: file, layer, order }) =>
		layer.entries.some((entry) => {
			if (file !== from || entry.line !== found.line || replaced(layers, entry, order)) {
				return false;
			}
			if (entry.targets.includes(found.specifier)) return true;
			const shared = found.specifier.replace(/^services\./u, "");
			return entry.mount !== undefined && mounts(layers, shared, entry.mount.volume);
		}),
	);
}

/**
 * The address a name reaches in the project: the declaration of that name,
 * else the service whose `container_name`, `hostname` or network alias it is.
 * @param layers The project's layers.
 * @param address The address as the file names it.
 * @returns The address of the declaration.
 */
function canonical(layers: readonly Layered[], address: string): string {
	const declared = layers.some(({ layer }) =>
		layer.definitions.some((each) => each.symbol === address),
	);
	if (declared || !address.startsWith("services.")) return address;
	const alias = address.slice("services.".length);
	const service = layers
		.findLast(({ layer }) => layer.aliases.has(alias))
		?.layer.aliases.get(alias);
	return service === undefined ? address : `services.${service}`;
}

/**
 * The declaration a name reaches in the project, and the first file that defines it.
 * @param layers The project's layers.
 * @param address The address as the file names it.
 * @returns The declaration's address and file, or undefined when the project declares none.
 */
function declarationOf(
	layers: readonly Layered[],
	address: string,
): { readonly symbol: string; readonly path: string } | undefined {
	const symbol = canonical(layers, address);
	const file = layers.find(({ layer }) =>
		layer.definitions.some((each) => each.symbol === symbol),
	)?.path;
	return file === undefined ? undefined : { symbol, path: file };
}

/**
 * The resolver of one checkout's compose files for one pass. It reads each
 * file of a project once.
 * @param checkout The checkout's files.
 * @param read Reads a file the pass may read.
 * @returns The resolver.
 */
function createComposeResolver(checkout: CheckoutFiles, read: ReadText): ImportResolver {
	const files = new Map<string, readonly ComposeLayer[]>();
	/**
	 * The layers of one file, read once.
	 * @param file The file.
	 * @returns Its layers; none when it cannot be read or parsed.
	 */
	const layersOf = (file: string): readonly ComposeLayer[] => {
		let layers = files.get(file);
		if (layers === undefined) {
			const text = read(file);
			const parsed = text === undefined ? undefined : composeFile(text);
			layers = parsed?.status === "parsed" ? parsed.layers : [];
			files.set(file, layers);
		}
		return layers;
	};
	/**
	 * The layers of the project a file belongs to, in merge order.
	 * @param file The file.
	 * @returns The layers.
	 */
	const projectOf = (file: string): Layered[] =>
		projectFiles(checkout, file)
			.flatMap((each) => layersOf(each).map((layer) => ({ path: each, layer })))
			.map((each, order) => ({ ...each, order }));
	return {
		/**
		 * Where one import of a compose file leads.
		 * @param from The compose file.
		 * @param found The import.
		 * @returns It resolved, where the merge keeps it and the project defines what it names.
		 */
		resolve(from, found) {
			if (found.reexport) return envFileImport(checkout, read, from, found);
			const layers = projectOf(from);
			const declaration = holds(layers, from, found)
				? declarationOf(layers, found.specifier)
				: undefined;
			if (declaration === undefined) return found;
			const names = [{ imported: declaration.symbol, local: found.specifier, typeOnly: false }];
			return { ...found, resolved: declaration.path, names };
		},
	};
}

/**
 * An env file a service reads, resolved with the names it sets and never a
 * value. A file Git does not list, such as an ignored `.env`, is not read.
 * @param checkout The checkout's files.
 * @param read Reads a file the pass may read.
 * @param from The compose file.
 * @param found The import of the env file.
 * @returns It resolved, with one name per name the file sets.
 */
function envFileImport(
	checkout: CheckoutFiles,
	read: ReadText,
	from: string,
	found: Import,
): ResolvedImport {
	const file = path.posix.normalize(path.posix.join(path.posix.dirname(from), found.specifier));
	const text = checkout.files.has(file) ? read(file) : undefined;
	if (text === undefined) return found;
	const set = [...new Set(envNames(text).map((each) => each.name))];
	const names = set.map((name) => ({ imported: name, local: name, typeOnly: false }));
	return { ...found, resolved: file, names };
}

export { COMPOSE_FILE_NAMES, createComposeResolver, isComposeFile, projectFiles };
