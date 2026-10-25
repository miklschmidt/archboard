// The names a module exposes and the files outside it that use each (ADR 0044,
// ADR 0046, TASK-539.01): the one rule that says which names a module exposes
// and which of them a file outside it uses.
//
// `EXPOSED_UNUSED` lists the names with no user, and the exposure reading that
// the server remembers lists every name with its users. Both take the names
// from `tallyNames`, so a name that one calls unused the other lists with no
// user, and `exposed - usedOutside` is the length of the finding's list.
//
// A reading quotes symbols, paths and lines and never other text of a file.

import {
	EXPOSED_NAME_LIMIT,
	EXPOSED_USER_LIMIT,
	type ContainerExposure,
} from "#shared/protocol/code-check.ts";
import { ownersAtLine, type Owners } from "#runtime/operations/code-check/evidence/ownership.ts";
import type {
	ModuleReading,
	OutsideUse,
} from "#runtime/operations/code-check/interfaces/module-reading.ts";
import type { ExposedName } from "#runtime/operations/code-facts/modules/module-exposure.ts";
import type { Definition } from "#runtime/operations/code-facts/facts.ts";

/** One name a module exposes, however many places declare it, and the uses that reach it. */
interface NameTally {
	readonly name: string;
	/** Where the name is declared, in the root files' order. */
	readonly declarations: readonly [ExposedName, ...ExposedName[]];
	/** Every use outside the module of any of its declarations, as code or as a type. */
	readonly uses: readonly OutsideUse[];
}

/** Where the exposure reading is kept: the board, variant and container it is about. */
type ExposureSite = Pick<ContainerExposure, "board" | "variant" | "container">;

/**
 * Whether a C++ definition is a member of another by its name, as
 * `shop::Store::open` is of `shop::Store`: a method is often defined in
 * another file than its class.
 * @param member The definition.
 * @param holder The other definition.
 * @returns True when it is.
 */
function memberOf(member: Definition, holder: Definition): boolean {
	return member.symbol.startsWith(`${holder.symbol}::`);
}

/**
 * Whether a use reaches an exposed definition or one inside it, such as a member.
 * @param name The exposed name.
 * @param use The use.
 * @returns True when it does.
 */
function reaches(name: ExposedName, use: OutsideUse): boolean {
	const { path, definition } = use.site;
	const inside =
		path === name.path &&
		name.definition.start <= definition.start &&
		definition.end <= name.definition.end;
	return inside || memberOf(definition, name.definition);
}

/**
 * Whether an exposed name is a declaration of its file, not a member of one,
 * as its language's rule says where its names say more than their dots: a C#
 * type is qualified by its namespace.
 * @param name The exposed name.
 * @param exposed Every name its module exposes.
 * @returns True for a top-level name.
 */
function topLevel(name: ExposedName, exposed: readonly ExposedName[]): boolean {
	if (name.member !== undefined) return !name.member;
	const member = exposed.some((holder) => memberOf(name.definition, holder.definition));
	return !name.definition.symbol.includes(".") && !member;
}

/**
 * The top-level names a module exposes, each once, with the uses outside the
 * module that reach it. A name declared in several places, a C# partial type or
 * an overload, is used where any declaration is.
 * @param module What the module exposes, and how the files outside it use it.
 * @returns One tally for each name, in the order of its first declaration.
 */
function tallyNames(module: ModuleReading): NameTally[] {
	const { exposure, uses } = module;
	const declared = new Map<string, readonly [ExposedName, ...ExposedName[]]>();
	for (const name of exposure.exposed) {
		if (!topLevel(name, exposure.exposed)) continue;
		const held = declared.get(name.name);
		declared.set(name.name, held === undefined ? [name] : [...held, name]);
	}
	return [...declared].map(([name, declarations]) => ({
		name,
		declarations,
		uses: uses.filter((use) => declarations.some((each) => reaches(each, use))),
	}));
}

/**
 * Each file that uses a name, at the first line of its use, by path.
 * @param uses The uses.
 * @returns One entry for each file.
 */
function firstUses(uses: readonly OutsideUse[]): { file: string; line: number }[] {
	const lines = new Map<string, number>();
	for (const { file, line } of uses) lines.set(file, Math.min(line, lines.get(file) ?? line));
	return [...lines]
		.map(([file, line]) => ({ file, line }))
		.toSorted((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0));
}

/**
 * What a module exposes, name by name, with the users of each (TASK-539.01).
 * The parts that hold a user are the parts that own its first line, by the
 * rule that owns evidence (ownership.ts), so a user is held by the same parts
 * as the findings put it in.
 * @param module What the module exposes, and how the files outside it use it.
 * @param owners The parts of the board that bind code in the module's checkout.
 * @param site The board, variant and container it is about.
 * @returns The reading, with the long lists cut to their limits and the exact counts beside them.
 */
function exposureOf(module: ModuleReading, owners: Owners, site: ExposureSite): ContainerExposure {
	const tally = tallyNames(module);
	const names = tally
		.map(({ name, declarations, uses }) => {
			const users = firstUses(uses);
			const [first] = declarations;
			return {
				name,
				path: first.path,
				line: first.definition.start,
				via: [...first.via],
				users: users.length,
				usedBy: users.slice(0, EXPOSED_USER_LIMIT).map(({ file, line }) => ({
					path: file,
					line,
					parts: [...new Set(ownersAtLine(owners, file, line).map((owner) => owner.node.id))],
				})),
			};
		})
		.toSorted(
			(left, right) =>
				right.users - left.users || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
		);
	return {
		...site,
		module: module.exposure.directory,
		rootFiles: [...module.exposure.rootFiles],
		exposed: tally.length,
		usedOutside: tally.filter(({ uses }) => uses.length > 0).length,
		names: names.slice(0, EXPOSED_NAME_LIMIT),
	};
}

export { type NameTally, exposureOf, reaches, tallyNames, topLevel };
