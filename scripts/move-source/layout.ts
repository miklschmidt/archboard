// Where a file goes in the behavior-first layout (ADR 0075), and how one reviewed set of moves
// maps any repository path, a file or a directory, to its new place.
import { posix } from "node:path";

/** The role folders of an area. A role folder is the last folder of a path. */
const ROLES = new Set([
	"api",
	"clients",
	"components",
	"constants",
	"hooks",
	"lifecycle",
	"middleware",
	"operations",
	"processes",
	"projections",
	"protocol",
	"routes",
	"rules",
	"schemas",
	"services",
	"sockets",
	"state",
	"store",
	"wiring",
	"workers",
]);

const AREAS = new Set(["cli", "runtime", "server", "shared", "ui"]);

/** A file below an area of a workspace. */
interface AreaPath {
	/** `packages/<name>` or `apps/<name>`. */
	workspace: string;
	/** `src` or `tests`. */
	folder: string;
	area: string;
	/** The folders between the area and the file. */
	folders: string[];
	name: string;
}

/** One move of a reviewed manifest. */
interface Move {
	from: string;
	to: string;
}

const AREA_PATH =
	/^((?:packages|apps)\/[^/]+)\/(src|tests)\/(cli|runtime|server|shared|ui)\/(.+)$/u;

/**
 * One group of a match, or nothing.
 * @param match The match.
 * @param index The group.
 * @returns The group's text, or "" when it matched nothing.
 */
function group(match: RegExpExecArray, index: number): string {
	return match[index] ?? "";
}

/**
 * The area path a repository path names.
 * @param file The repository path.
 * @returns Its parts, or undefined outside the areas of a workspace.
 */
function areaPathOf(file: string): AreaPath | undefined {
	const match = AREA_PATH.exec(file);
	if (match === null) return undefined;
	const segments = group(match, 4).split("/");
	return {
		workspace: group(match, 1),
		folder: group(match, 2),
		area: group(match, 3),
		folders: segments.slice(0, -1),
		name: segments.at(-1) ?? "",
	};
}

/**
 * Whether folders put a role first, with a behavior below it. `api` stays where it is.
 * @param folders The folders between an area and a file.
 * @returns Whether the default move changes them.
 */
function isRoleFirst(folders: readonly string[]): boolean {
	const [role = ""] = folders;
	return folders.length > 1 && ROLES.has(role) && role !== "api";
}

/**
 * The default move: `<area>/<role>/<b…>/<file>` becomes `<area>/<b…>/<role>/<file>`. The depth
 * stays the same. A flat `<area>/<role>/<file>`, a support file and `api/` stay where they are.
 * @param file The repository path.
 * @returns The new path, which is the old one when the default move leaves the file alone.
 */
function defaultMove(file: string): string {
	const place = areaPathOf(file);
	if (place === undefined || !isRoleFirst(place.folders)) return file;
	const [role = "", ...behaviors] = place.folders;
	return [place.workspace, place.folder, place.area, ...behaviors, role, place.name].join("/");
}

/**
 * Whether a path is a prefix of another at a folder boundary, or the same path.
 * @param prefix The shorter path.
 * @param file The longer path.
 * @returns Whether `file` is `prefix` or lies below it.
 */
function startsAt(prefix: string, file: string): boolean {
	return file === prefix || file.startsWith(`${prefix}/`);
}

/**
 * Apply the longest override whose key is a prefix of a path. Keys and values are repository
 * paths in the new layout. A key in a workspace's `src/` also applies to its mirror in `tests/`.
 * @param file The path after the default move.
 * @param overrides The overrides, old prefix to new prefix.
 * @returns The path after the override.
 */
function overridden(file: string, overrides: Readonly<Record<string, string>>): string {
	const candidates = Object.entries(overrides).flatMap(([key, value]) => [
		[key, value],
		[mirrored(key), mirrored(value)],
	]);
	const match = candidates
		.filter(([key = ""]) => startsAt(key, file))
		.toSorted(([a = ""], [b = ""]) => b.length - a.length)[0];
	return match === undefined ? file : `${match[1]}${file.slice((match[0] ?? "").length)}`;
}

/**
 * The `tests/` mirror of a path in a workspace's `src/`.
 * @param file A repository path.
 * @returns The mirror, or the path itself when it is not in a `src/`.
 */
function mirrored(file: string): string {
	return file.replace(/^((?:packages|apps)\/[^/]+)\/src\//u, "$1/tests/");
}

/**
 * What breaks the behavior-first rule at a new path, for the review of a manifest.
 * @param file The new path.
 * @returns The problem, or undefined when the path keeps the rule.
 */
function layoutProblem(file: string): string | undefined {
	const place = areaPathOf(file);
	const support = place?.folder === "tests" && place.folders[0] === "support";
	return place === undefined || support ? undefined : foldersProblem(place.folders);
}

/**
 * What breaks the behavior-first rule in the folders between an area and a file.
 * @param folders The folders.
 * @returns The problem, or undefined when they keep the rule.
 */
function foldersProblem(folders: readonly string[]): string | undefined {
	if (folders.some((folder) => AREAS.has(folder))) return "a folder below the area is an area name";
	const roles = folders.filter((folder) => ROLES.has(folder)).length;
	if (roles !== 1) return `${roles} role folders`;
	return ROLES.has(folders.at(-1) ?? "") ? undefined : "the role folder is not the last folder";
}

/** One reviewed set of moves, and how it maps a file or a directory. */
class MoveMap {
	readonly moves: ReadonlyMap<string, string>;
	readonly files: readonly string[];

	/**
	 * Hold a set of moves over the files Git tracks.
	 * @param moves The moves, old path to new path.
	 * @param files Every tracked file before the moves.
	 */
	constructor(moves: readonly Move[], files: readonly string[]) {
		this.moves = new Map(moves.map((move) => [move.from, move.to]));
		this.files = files;
	}

	/**
	 * Where a tracked file goes.
	 * @param file An old repository path.
	 * @returns Its new path, or the old one when it does not move.
	 */
	file(file: string): string {
		return this.moves.get(file) ?? file;
	}

	/**
	 * Where a directory goes: unchanged when its files stay below it, renamed when every file
	 * keeps its place below one new directory, and undefined when its files part.
	 * @param directory An old repository directory, with no trailing slash.
	 * @returns The new directory, or undefined for a directory whose files part.
	 */
	directory(directory: string): string | undefined {
		const below = this.files.filter((file) => file.startsWith(`${directory}/`));
		if (below.every((file) => startsAt(directory, this.file(file)))) return directory;
		const renamed = new Set(
			below.map((file) => {
				const to = this.file(file);
				const tail = file.slice(directory.length);
				return to.endsWith(tail) ? to.slice(0, -tail.length) : "";
			}),
		);
		const [only] = renamed;
		return renamed.size === 1 && only !== "" ? only : undefined;
	}

	/**
	 * Whether a path names a tracked directory before the moves.
	 * @param directory A repository path, with no trailing slash.
	 * @returns Whether a tracked file lies below it.
	 */
	isDirectory(directory: string): boolean {
		return this.files.some((file) => file.startsWith(`${directory}/`));
	}

	/**
	 * Where any tracked path goes: a file, a directory, or a path that names nothing tracked.
	 * @param target An old repository path, with no trailing slash.
	 * @returns The new path, or undefined for a directory whose files part.
	 */
	path(target: string): string | undefined {
		if (this.moves.has(target)) return this.file(target);
		return this.isDirectory(target) ? this.directory(target) : target;
	}
}

/**
 * Normalise a path joined from a directory and a relative path.
 * @param from The directory.
 * @param to The relative path.
 * @returns The repository path, or undefined when it leaves the repository.
 */
function joined(from: string, to: string): string | undefined {
	const target = posix.normalize(posix.join(from, to)).replace(/\/$/u, "");
	return target.startsWith("..") ? undefined : target === "." ? "" : target;
}

export {
	areaPathOf,
	defaultMove,
	joined,
	layoutProblem,
	mirrored,
	MoveMap,
	overridden,
	ROLES,
	startsAt,
	type AreaPath,
	type Move,
};
