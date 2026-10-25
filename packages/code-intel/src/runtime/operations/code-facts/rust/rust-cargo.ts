// What a `Cargo.toml` declares (ADR 0046, TASK-540), read with Bun's TOML
// parser and never run: the package, its library and binary targets, the
// workspace it is the root of, and each dependency with the path a local one
// is at. A value of another shape than Cargo's is read as absent.
//
// The facts of a manifest are its package, a definition whose visibility is
// `package`, and each dependency on a local package, by a `path` or by
// `workspace = true`, as a `build-dependency` use of the dependency's name on
// the line that names it: a crate is built from the crates it depends on. The
// resolver leads that use to the crate (rust-resolution.ts). A dependency of
// the registry or of Git is outside the checkout, and is no use here.

import { z } from "zod";
import type { Definition, ParsedFacts, Reference } from "#runtime/operations/code-facts/facts.ts";

/** One dependency a manifest names. */
interface CargoDependency {
	/** The name the manifest gives it, which code uses where the package is renamed. */
	readonly key: string;
	/** The package it is, where the manifest renames it (`package = "..."`). */
	readonly package: string | undefined;
	/** Its directory, relative to the manifest's, for a local dependency. */
	readonly path: string | undefined;
	/** It is the workspace's dependency of the same key (`workspace = true`). */
	readonly workspace: boolean;
	/** The line that names it, 1-based. */
	readonly line: number;
}

/** What one manifest declares. */
interface CargoManifest {
	/** The package's name, where the manifest declares a package. */
	readonly name: string | undefined;
	/** The library's name and root file, relative to the manifest's directory, as written. */
	readonly lib: { readonly name: string | undefined; readonly path: string | undefined };
	/** The root file of each binary the manifest names, relative to its directory. */
	readonly bins: readonly string[];
	/** The build script, relative to the manifest's directory, or false where it has none. */
	readonly build: string | false | undefined;
	/** Where the manifest is a workspace's root: its members and excluded directories, as globs. */
	readonly workspace:
		| {
				readonly members: readonly string[];
				readonly exclude: readonly string[];
				/** The dependencies its members inherit with `workspace = true`. */
				readonly dependencies: readonly CargoDependency[];
		  }
		| undefined;
	/** Every dependency of every kind and every platform. */
	readonly dependencies: readonly CargoDependency[];
	/** The line of the `[package]` table, 1-based. */
	readonly line: number;
}

/** A dependency as a manifest writes it: a version, or a table. */
const DependencySchema = z
	.union([
		z.string().transform(() => ({})),
		z
			.object({
				package: z.string().optional().catch(undefined),
				path: z.string().optional().catch(undefined),
				workspace: z.boolean().optional().catch(undefined),
			})
			.loose(),
	])
	.catch({});

/** A table of dependencies, by key. */
const DependenciesSchema = z.record(z.string(), DependencySchema).catch({});

/** The dependency tables of a manifest, or of one platform of it. */
const TablesSchema = z
	.object({
		dependencies: DependenciesSchema.default({}),
		"dev-dependencies": DependenciesSchema.default({}),
		"build-dependencies": DependenciesSchema.default({}),
	})
	.loose()
	.catch({ dependencies: {}, "dev-dependencies": {}, "build-dependencies": {} });

/** The names of the tables that hold dependencies. */
const DEPENDENCY_TABLES = ["dependencies", "dev-dependencies", "build-dependencies"] as const;

/** A target as a manifest writes it. */
const TargetSchema = z
	.object({
		name: z.string().optional().catch(undefined),
		path: z.string().optional().catch(undefined),
	})
	.loose()
	.catch({});

/** The strings of a list, or none. */
const NamesSchema = z.array(z.string()).catch([]).default([]);

/** What a manifest declares, as the check reads it. */
const ManifestSchema = z
	.object({
		package: z
			.object({
				name: z.string().optional().catch(undefined),
				build: z
					.union([z.string(), z.literal(false)])
					.optional()
					.catch(undefined),
			})
			.loose()
			.optional()
			.catch(undefined),
		lib: TargetSchema.default({}),
		bin: z.array(TargetSchema).catch([]).default([]),
		workspace: z
			.object({
				members: NamesSchema,
				exclude: NamesSchema,
				dependencies: DependenciesSchema.default({}),
			})
			.loose()
			.optional()
			.catch(undefined),
		target: z.record(z.string(), TablesSchema).catch({}).default({}),
	})
	.loose();

/** The lines of the keys of each table, by the table's dotted name. */
type KeyLines = ReadonlyMap<string, ReadonlyMap<string, number>>;

/**
 * The header a line opens a table with, without quotes or spaces.
 * @param written The line.
 * @returns The header, or undefined for a line that opens none.
 */
function headerOf(written: string): string | undefined {
	const opened = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?/u.exec(written)?.[1];
	return opened?.replaceAll(/["'\s]/gu, "");
}

/**
 * Note the line a key of a table is written on, unless one is noted already.
 * @param lines The lines so far.
 * @param header The table.
 * @param key The key.
 * @param line The line.
 */
function note(
	lines: Map<string, Map<string, number>>,
	header: string,
	key: string,
	line: number,
): void {
	const keys = lines.get(header) ?? new Map<string, number>();
	if (!keys.has(key)) keys.set(key, line);
	lines.set(header, keys);
}

/**
 * The line each key of each table is written on: `key = ...` in a table, and
 * the header `[table.key]` of a key that is a table of its own. A table's own
 * header is its key `""`.
 * @param source The manifest's text.
 * @returns The lines.
 */
function keyLines(source: string): KeyLines {
	const lines = new Map<string, Map<string, number>>();
	let table = "";
	source.split("\n").forEach((written, index) => {
		const header = headerOf(written);
		if (header === undefined) {
			const key = /^\s*["']?([\w-]+)["']?\s*=/u.exec(written)?.[1];
			if (key !== undefined) note(lines, table, key, index + 1);
			return;
		}
		table = header;
		const dot = Math.max(header.lastIndexOf("."), 0);
		note(lines, header, "", index + 1);
		note(lines, header.slice(0, dot), header.slice(dot + 1), index + 1);
	});
	return lines;
}

/**
 * The dependencies of one table.
 * @param table The table, parsed.
 * @param lines The lines of its keys.
 * @returns Its dependencies.
 */
function dependenciesOf(
	table: z.infer<typeof DependenciesSchema>,
	lines: ReadonlyMap<string, number> = new Map(),
): CargoDependency[] {
	return Object.entries(table).map(([key, spec]) => {
		const fields: {
			package?: string | undefined;
			path?: string | undefined;
			workspace?: boolean | undefined;
		} = spec;
		return {
			key,
			package: fields.package,
			path: fields.path,
			workspace: fields.workspace === true,
			line: lines.get(key) ?? 1,
		};
	});
}

/**
 * The dependencies of every table of one place: the manifest's own, or one platform's.
 * @param tables The tables, parsed.
 * @param prefix What the tables' names are written after: `""`, or a platform's `target.<cfg>.`.
 * @param lines The lines of every key.
 * @returns The dependencies.
 */
function tablesOf(
	tables: z.infer<typeof TablesSchema>,
	prefix: string,
	lines: KeyLines,
): CargoDependency[] {
	return DEPENDENCY_TABLES.flatMap((name) =>
		dependenciesOf(tables[name], lines.get(`${prefix}${name}`)),
	);
}

/**
 * The workspace a manifest is the root of.
 * @param space Its `[workspace]` table, parsed.
 * @param lines The lines of every key.
 * @returns The workspace, or undefined for a manifest that declares none.
 */
function workspaceOf(
	space: z.infer<typeof ManifestSchema>["workspace"],
	lines: KeyLines,
): CargoManifest["workspace"] {
	if (space === undefined) return undefined;
	const dependencies = dependenciesOf(space.dependencies, lines.get("workspace.dependencies"));
	return { members: space.members, exclude: space.exclude, dependencies };
}

/**
 * What a manifest declares, parsed and read.
 * @param parsed The manifest.
 * @param lines The lines of its keys.
 * @returns What it declares.
 */
function declared(parsed: z.infer<typeof ManifestSchema>, lines: KeyLines): CargoManifest {
	const platforms = Object.entries(parsed.target).flatMap(([platform, tables]) =>
		tablesOf(tables, `target.${platform.replaceAll(/["'\s]/gu, "")}.`, lines),
	);
	return {
		name: parsed.package?.name,
		lib: { name: parsed.lib.name, path: parsed.lib.path },
		bins: parsed.bin.flatMap((bin) => bin.path ?? []),
		build: parsed.package?.build,
		workspace: workspaceOf(parsed.workspace, lines),
		dependencies: [...tablesOf(TablesSchema.parse(parsed), "", lines), ...platforms],
		line: lines.get("package")?.get("") ?? 1,
	};
}

/**
 * What a manifest declares.
 * @param source Its text.
 * @returns It, or undefined for a manifest that does not parse.
 */
function cargoManifest(source: string): CargoManifest | undefined {
	let raw: unknown;
	try {
		raw = Bun.TOML.parse(source);
	} catch {
		return undefined;
	}
	const parsed = ManifestSchema.safeParse(raw);
	return parsed.success ? declared(parsed.data, keyLines(source)) : undefined;
}

/**
 * The package a manifest declares, as a definition.
 * @param cargo What it declares.
 * @returns The definition, or none for a manifest of a workspace alone.
 */
function packageDefinition(cargo: CargoManifest): Definition[] {
	if (cargo.name === undefined) return [];
	const { line } = cargo;
	const shape = { kind: "value", visibility: "package", exposed: true } as const;
	return [{ symbol: cargo.name, ...shape, start: line, end: line }];
}

/**
 * The facts of a `Cargo.toml`: its package, and a build dependency on each
 * local package it depends on.
 * @param source The manifest's text.
 * @returns The facts, or undefined for a manifest that does not parse, which is read as text.
 */
function cargoFacts(source: string): ParsedFacts | undefined {
	const cargo = cargoManifest(source);
	if (cargo === undefined) return undefined;
	const references = cargo.dependencies
		.filter((each) => each.path !== undefined || each.workspace)
		.map((each): Reference => ({
			symbol: each.key,
			line: each.line,
			via: "code",
			kind: "build-dependency",
			typeOnly: false,
		}));
	return { definitions: packageDefinition(cargo), references, imports: [], unparsed: [] };
}

export { type CargoDependency, type CargoManifest, cargoFacts, cargoManifest };
