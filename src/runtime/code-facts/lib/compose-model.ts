// What one compose file declares (ADR 0046, TASK-367.20), read with
// `Bun.YAML.parse` and placed on its lines by compose-lines.ts: one layer for
// each YAML document, as compose merges the documents of one file in order.
//
// A layer defines its services, networks and volumes, and holds, for each
// service, the entries that join it to another declaration: `depends_on`,
// `links`, `volumes_from`, `network_mode: service:<name>`, the networks it
// joins, the named volumes it mounts, the environment values it sets and the
// env files it reads. An environment value names another service where its
// host is one: `postgres://app@db:5432/app`, `kafka:9092`, or a bare word
// under a name that says it is a host (`REDIS_HOST: redis`). A host with a
// dot (`smtp.example.com`) names a machine outside the project, and is never
// read as a service, though compose allows a dot in a name. A value is read
// only for that host: no entry and no fact keeps the rest of a value, because
// a compose file can hold a password in plain text. As compose does, every
// value is interpolated before anything reads it: an interpolation takes the
// default the file writes (`${API_HOST:-api}`) and is otherwise empty, because
// the variables it reads (the shell's and the project's `.env`) are never read.
// A service that builds its image runs the code of the directory it builds
// (`runs` on its definition), which TASK-367.23 joins with what it sets.

import { runsOf } from "@/runtime/code-facts/lib/compose-build";
import type { Definition, Unparsed } from "@/runtime/code-facts/lib/facts";
import { yamlLines, type YamlLines, type YamlPath } from "@/runtime/code-facts/lib/compose-lines";

/** One entry of a service that joins it to another declaration or names its environment. */
interface ComposeEntry {
	/** The service whose block holds it. */
	readonly service: string;
	readonly line: number;
	/**
	 * What a later file's entry of the same service replaces, where compose
	 * replaces rather than adds: `environment API_URL`, `volumes /data`,
	 * `network_mode`.
	 */
	readonly replaces?: string;
	/** The addresses it names: `services.db`, `volumes.data`, `networks.front`. */
	readonly targets: readonly string[];
	/** The name of the environment value it sets. */
	readonly environment?: string;
	/** The env file it reads, relative to the compose file, as written. */
	readonly envFile?: string;
	/** The named volume it mounts, and whether only to read it. */
	readonly mount?: { readonly volume: string; readonly readOnly: boolean };
}

/** One document of a compose file. */
interface ComposeLayer {
	readonly definitions: readonly Definition[];
	readonly entries: readonly ComposeEntry[];
	/** The other names that reach a service: its `container_name`, `hostname` and network aliases. */
	readonly aliases: ReadonlyMap<string, string>;
}

/** What one compose file declares, or the whole file as a part that did not parse. */
type ComposeFile =
	| { readonly status: "parsed"; readonly layers: readonly ComposeLayer[] }
	| { readonly status: "unparsed"; readonly unparsed: Unparsed };

/** The top-level keys whose entries are definitions. */
const DECLARATIONS = ["services", "networks", "volumes"] as const;
/** A variable's name that says its bare value is a host. */
const HOST_NAME = /(?:HOST|HOSTS|HOSTNAME|SERVER|SERVERS|ADDR|ADDRESS)$/iu;
/**
 * An address in one item of an environment value: a scheme, a user, a host
 * as compose names a service, without a dot, and a port. `localhost`, a
 * number and a YAML boolean word (`REV_SERVER=true`) are never a service.
 */
const ADDRESS =
	/^(?<scheme>[^/]*:\/\/)?(?<user>[^@/]*@)?\[?(?!(?:localhost|true|false|yes|no|on|off|\d+)(?![\w-]))(?<host>[A-Za-z0-9][\w-]*)\]?(?::(?<port>\d+))?(?:[/?#]|$)/u;
/** The source of a short mount that names a volume, not a path on the host: `data`. */
const VOLUME_NAME = /^[A-Za-z0-9][\w.-]*$/u;

/** Lines of one document, as a service's entries ask for them. */
type At = (...path: YamlPath) => number;

/**
 * Whether a value is a mapping.
 * @param value The value.
 * @returns True for a plain object.
 */
function isMapping(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The keys and values of a mapping, or the indexes and items of a sequence.
 * @param value The value.
 * @returns Its entries; none for a scalar.
 */
function entriesOf(value: unknown): [string | number, unknown][] {
	if (Array.isArray(value)) return value.map((item: unknown, index) => [index, item]);
	return isMapping(value) ? Object.entries(value) : [];
}

/**
 * A value with every interpolation replaced by the default the file writes,
 * or by nothing.
 * @param value The value.
 * @returns It as the check reads it.
 */
function interpolated(value: string): string {
	return value
		.replaceAll("$$", "\u0000")
		.replace(
			/\$\{[A-Za-z_]\w*(?::?-([^}]*))?[^}]*\}/gu,
			(_match: string, fallback: string | undefined) => fallback ?? "",
		)
		.replace(/\$[A-Za-z_]\w*/gu, "");
}

/**
 * A document with every value interpolated, as compose interpolates it
 * before it merges: `depends_on: [${DB:-db}]` depends on `db`. Keys stay as
 * written.
 * @param value The document, or a value in it.
 * @returns It as the check reads it.
 */
function interpolatedValues(value: unknown): unknown {
	if (typeof value === "string") return interpolated(value);
	if (Array.isArray(value)) return value.map(interpolatedValues);
	if (!isMapping(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, each]) => [key, interpolatedValues(each)]),
	);
}

/**
 * The host one item of an environment value names, where it names one: after
 * a scheme, after a user, or before a port, or the whole bare word under a
 * name that says it is a host.
 * @param name The variable's name.
 * @param item One item of its value.
 * @returns The host, or undefined.
 */
function hostOf(name: string, item: string): string | undefined {
	const { host, ...signs } = ADDRESS.exec(item)?.groups ?? {};
	const named = Object.values(signs).some(Boolean) || HOST_NAME.test(name);
	return named ? host : undefined;
}

/**
 * The hosts an environment value names.
 * @param name The variable's name.
 * @param value Its value.
 * @returns Each host once.
 */
function hostsOf(name: string, value: unknown): string[] {
	if (typeof value !== "string") return [];
	const items = value.split(/[\s,;]+/u);
	return [...new Set(items.flatMap((item) => hostOf(name, item) ?? []))];
}

/**
 * One `NAME=value` item of an environment list: its name and its value, or
 * no value for a bare `NAME`, which passes the shell's value on.
 * @param item The item.
 * @returns The name and the value.
 */
function assignment(item: string): [string, string | undefined] {
	const equals = item.indexOf("=");
	return equals === -1 ? [item, undefined] : [item.slice(0, equals), item.slice(equals + 1)];
}

/**
 * The entries of `environment`, as a mapping or as `NAME=value` items.
 * @param service The service.
 * @param value The `environment` value.
 * @param at The lines of the document.
 * @returns One entry per variable.
 */
function environmentEntries(service: string, value: unknown, at: At): ComposeEntry[] {
	return entriesOf(value).map(([key, item]) => {
		const [name, set] = typeof key === "number" ? assignment(String(item)) : [key, item];
		const targets = hostsOf(name, set).map((host) => `services.${host}`);
		const line = at("services", service, "environment", key);
		return { service, line, replaces: `environment ${name}`, targets, environment: name };
	});
}

/**
 * The entries of a list or mapping of names: `depends_on`, `links`,
 * `volumes_from` and `networks`.
 * @param service The service.
 * @param field The field.
 * @param value Its value.
 * @param at The lines of the document.
 * @returns One entry per name.
 */
function namedEntries(service: string, field: string, value: unknown, at: At): ComposeEntry[] {
	const kind = field === "networks" ? "networks" : "services";
	return entriesOf(value).flatMap(([key, item]) => {
		const written = typeof key === "number" ? item : key;
		if (typeof written !== "string" || /^$|^container:/u.test(written)) return [];
		const name = written.split(":")[0] ?? written;
		return [{ service, line: at("services", service, field, key), targets: [`${kind}.${name}`] }];
	});
}

/** A mount of a service: where it mounts, and the named volume and whether only to read it, if it mounts one. */
interface Mount {
	readonly target: string;
	readonly named?: { readonly volume: string; readonly readOnly: boolean };
}

/**
 * A mount in the long syntax, which names a volume with `type: volume`.
 * @param item The mount.
 * @returns The mount, or undefined when it names no target.
 */
function longMount(item: Record<string, unknown>): Mount | undefined {
	const { type, source, target } = item;
	if (typeof target !== "string") return undefined;
	if (type !== "volume" || typeof source !== "string") return { target };
	return { target, named: { volume: source, readOnly: item["read_only"] === true } };
}

/**
 * A mount in the short syntax: `data:/var/lib/data:ro` mounts a named volume,
 * `./data:/data` a path on the host, and `/data` alone an anonymous volume.
 * A source that starts with `.`, `/`, `~` or `$` is a path on the host.
 * @param item The mount.
 * @returns The mount.
 */
function shortMount(item: string): Mount {
	const [source = "", target, mode = ""] = item.split(":");
	if (target === undefined) return { target: source };
	if (!VOLUME_NAME.test(source)) return { target };
	return { target, named: { volume: source, readOnly: mode.split(",").includes("ro") } };
}

/**
 * The entries of `volumes`: each mount, which a later file's mount at the
 * same target replaces, and the named volume it mounts.
 * @param service The service.
 * @param value The `volumes` value.
 * @param at The lines of the document.
 * @returns One entry per mount.
 */
function mountEntries(service: string, value: unknown, at: At): ComposeEntry[] {
	return entriesOf(value).flatMap(([index, item]): ComposeEntry[] => {
		const mount = isMapping(item) ? longMount(item) : shortMount(String(item));
		if (mount === undefined) return [];
		const line = at("services", service, "volumes", index);
		const replaces = `volumes ${mount.target}`;
		const { named } = mount;
		if (named === undefined) return [{ service, line, replaces, targets: [] }];
		return [{ service, line, replaces, targets: [`volumes.${named.volume}`], mount: named }];
	});
}

/**
 * The entries of `env_file`: a path, a list of paths, or a list of `path:` items.
 * @param service The service.
 * @param value The `env_file` value.
 * @param at The lines of the document.
 * @returns One entry per env file.
 */
function envFileEntries(service: string, value: unknown, at: At): ComposeEntry[] {
	const items: [YamlPath, unknown][] = Array.isArray(value)
		? value.map((item: unknown, index) => [["env_file", index], item])
		: [[["env_file"], value]];
	return items.flatMap(([path, item]) => {
		const envFile = isMapping(item) ? item["path"] : item;
		if (typeof envFile !== "string") return [];
		return [{ service, line: at("services", service, ...path), targets: [], envFile }];
	});
}

/**
 * The entry of `network_mode`, which a later file's mode replaces:
 * `service:<name>` runs a service in another's network.
 * @param service The service.
 * @param value The `network_mode` value.
 * @param at The lines of the document.
 * @returns The entry, naming the service the mode names, if any.
 */
function networkModeEntries(service: string, value: unknown, at: At): ComposeEntry[] {
	if (typeof value !== "string") return [];
	const line = at("services", service, "network_mode");
	const targets = value.startsWith("service:") ? [`services.${value.slice(8)}`] : [];
	return [{ service, line, replaces: "network_mode", targets }];
}

/**
 * Every entry of one service.
 * @param service The service's name.
 * @param body Its mapping.
 * @param at The lines of the document.
 * @returns Its entries, in the order of its fields.
 */
function serviceEntries(service: string, body: Record<string, unknown>, at: At): ComposeEntry[] {
	return [
		...namedEntries(service, "depends_on", body["depends_on"], at),
		...namedEntries(service, "links", body["links"], at),
		...namedEntries(service, "volumes_from", body["volumes_from"], at),
		...networkModeEntries(service, body["network_mode"], at),
		...namedEntries(service, "networks", body["networks"], at),
		...mountEntries(service, body["volumes"], at),
		...environmentEntries(service, body["environment"], at),
		...envFileEntries(service, body["env_file"], at),
	];
}

/**
 * The other names that reach one service.
 * @param service The service's name.
 * @param body Its mapping.
 * @returns Each alias.
 */
function aliasesOf(service: string, body: Record<string, unknown>): string[] {
	const own = [body["container_name"], body["hostname"]];
	const network = entriesOf(body["networks"]).flatMap(([, item]) =>
		isMapping(item) ? entriesOf(item["aliases"]).map(([, alias]) => alias) : [],
	);
	return [...own, ...network].filter(
		(alias): alias is string => typeof alias === "string" && alias !== service,
	);
}

/**
 * Whether a service, network or volume is reachable outside its project: a
 * service that publishes `ports`, and an `external` network or volume.
 * @param kind The top-level key.
 * @param body The declaration.
 * @returns The visibility word, and whether it is exposed.
 */
function visibilityOf(kind: string, body: unknown): Pick<Definition, "visibility" | "exposed"> {
	const declared = isMapping(body) ? body : {};
	if (kind === "services") {
		const ports = entriesOf(declared["ports"]).length > 0;
		return { visibility: ports ? "published" : "internal", exposed: ports };
	}
	const external = declared["external"] === true || isMapping(declared["external"]);
	return { visibility: external ? "external" : "internal", exposed: external };
}

/**
 * The directory whose code a declaration runs: a service's build (compose-build.ts).
 * @param kind The top-level key.
 * @param body The declaration.
 * @returns `runs` for a service that builds here, else nothing.
 */
function runsOfDeclaration(kind: string, body: unknown): Pick<Definition, "runs"> {
	const runs = kind === "services" && isMapping(body) ? runsOf(body, interpolated) : undefined;
	return runs === undefined ? {} : { runs };
}

/**
 * The definitions of one document: each service, network and volume.
 * @param top The document.
 * @param lines The file's lines.
 * @param document The document's index.
 * @returns The definitions.
 */
function definitionsOf(
	top: Record<string, unknown>,
	lines: YamlLines,
	document: number,
): Definition[] {
	return DECLARATIONS.flatMap((kind) =>
		entriesOf(top[kind]).flatMap(([name, body]) => {
			const span = lines.spanOf(document, [kind, name]);
			const start = span?.start ?? 1;
			const end = span?.own === true ? span.end : start;
			const definition = { symbol: `${kind}.${name}`, start, end, ...visibilityOf(kind, body) };
			return [{ ...definition, ...runsOfDeclaration(kind, body) }];
		}),
	);
}

/**
 * One document as a layer.
 * @param value The document as Bun parses it.
 * @param lines The file's lines.
 * @param document The document's index.
 * @returns The layer.
 */
function layerOf(value: unknown, lines: YamlLines, document: number): ComposeLayer {
	const interpolatedTop = interpolatedValues(value);
	const top = isMapping(interpolatedTop) ? interpolatedTop : {};
	/**
	 * The line of a path in this document, or of the nearest key that holds it.
	 * @param path The path.
	 * @returns The line.
	 */
	const at: At = (...path) => lines.spanOf(document, path)?.start ?? 1;
	const services = entriesOf(top["services"]).flatMap(([name, body]) =>
		isMapping(body) ? [[String(name), body] as const] : [],
	);
	return {
		definitions: definitionsOf(top, lines, document),
		entries: services.flatMap(([name, body]) => serviceEntries(name, body, at)),
		aliases: new Map(
			services.flatMap(([name, body]) => aliasesOf(name, body).map((alias) => [alias, name])),
		),
	};
}

/**
 * What one compose file declares, one layer per document.
 * @param text The file's text.
 * @returns Its layers, or the whole file as a part that did not parse, with
 * the names of its keys and never a value.
 */
function composeFile(text: string): ComposeFile {
	const lines = yamlLines(text);
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(text);
	} catch {
		const end = text.split(/\r?\n/u).length;
		return { status: "unparsed", unparsed: { start: 1, end, names: lines.names } };
	}
	const documents = lines.documents > 1 && Array.isArray(parsed) ? parsed : [parsed];
	return {
		status: "parsed",
		layers: documents.map((value: unknown, index) => layerOf(value, lines, index)),
	};
}

export { type ComposeEntry, type ComposeFile, type ComposeLayer, composeFile };
