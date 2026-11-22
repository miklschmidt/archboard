// The width of a module (TASK-651, TASK-659, ADR 0082): the names its callers
// learn, its exports that are not types, with a switchboard counted once for
// each operation it picks by a closed key its caller passes
// (`Definition.picks`), and its logic less what only picks. A key typed by a
// name another file declares is closed once that name is found and closes it
// (`Definition.closes`). Until then the switchboard counts as one name, and
// the width and logic with it counted are given beside, so that the verdict
// can be withheld where they would make the module shallow.

import { definitionSite } from "#runtime/code-facts/operations/definition-site.ts";
import type { Switchboard } from "#runtime/code-facts/operations/facts.ts";
import type { ExposedName } from "#runtime/code-facts/modules/operations/module-exposure.ts";
import { restSpelled } from "#runtime/code-facts/operations/switchboard-arms.ts";
import type { DepthReading } from "#runtime/module-depth/operations/depth-reading.ts";
import type { ModuleMeasure } from "#runtime/module-depth/operations/module-measure.ts";
import type { NameKind } from "#runtime/module-depth/operations/name-findings.ts";
import type { ModuleDepth, ModuleSwitchboard } from "#shared/protocol/code-check.ts";

/** A module's exports, by kind. */
type ExportCounts = ModuleDepth["exports"];

/** The kinds of name a caller calls, which a switchboard can be. */
const CALLED: ReadonlySet<NameKind> = new Set(["function", "method"]);

/**
 * The pick of a name, from its file: overloads share the name, so any of its
 * definitions there may hold it.
 * @param reading The module.
 * @param name The name.
 * @returns The pick, or undefined for a name that picks nothing.
 */
async function picksOf(reading: DepthReading, name: ExposedName): Promise<Switchboard | undefined> {
	const read = await reading.facts.read(reading.checkout, name.path);
	if (read === undefined || read.adapter === "text") return undefined;
	const { symbol } = name.definition;
	return read.definitions.find((each) => each.symbol === symbol && each.picks !== undefined)?.picks;
}

/**
 * The keys of a key that a type another file declares closes, found through the name's file.
 * @param reading The module.
 * @param name The name.
 * @param picks Its pick.
 * @returns The keys, or undefined where the pick names no such type or the type closes none.
 */
async function closedKeys(
	reading: DepthReading,
	name: ExposedName,
	picks: Switchboard,
): Promise<readonly string[] | undefined> {
	if (picks.type === undefined) return undefined;
	const site = await definitionSite(reading.facts, reading.checkout, name.path, picks.type);
	const at = picks.key.indexOf(".");
	return site?.definition.closes?.[at < 0 ? "" : picks.key.slice(at + 1)];
}

/**
 * Close a pick whose adapter deferred key resolution.
 * @param picks The pick.
 * @param keys The closed key set.
 * @returns Its reachable operations.
 */
function closeOperations(picks: Switchboard, keys: readonly string[]): Switchboard["operations"] {
	const exhaustive = picks.exhaustiveOperations;
	const named = picks.namedKeys ?? [];
	if (exhaustive !== undefined && keys.every((key) => named.includes(key))) return exhaustive;
	return restSpelled(picks.operations, keys, named);
}

/**
 * The widest operation set that closing the key could expose.
 * @param picks The deferred pick.
 * @returns The operations for the conservative verdict.
 */
function widestOperations(picks: Switchboard): Switchboard["operations"] {
	const exhaustive = picks.exhaustiveOperations ?? [];
	return exhaustive.length > picks.operations.length ? exhaustive : picks.operations;
}

/**
 * The switchboard a name is, with its key closed where a type another file declares closes it.
 * @param reading The module.
 * @param name The name.
 * @returns The switchboard as the answer lists it, and the facts about its body.
 */
async function switchboardOf(
	reading: DepthReading,
	name: ExposedName,
): Promise<{ readonly listed: ModuleSwitchboard; readonly picks: Switchboard } | undefined> {
	const picks = await picksOf(reading, name);
	if (picks === undefined) return undefined;
	const keys = await closedKeys(reading, name, picks);
	const operations = keys === undefined ? widestOperations(picks) : closeOperations(picks, keys);
	if (operations.length < 2) return undefined;
	const open = picks.type !== undefined && keys === undefined ? { open: picks.type } : {};
	return {
		listed: {
			name: name.name,
			path: name.path,
			key: picks.key,
			operations: operations.map((each) => ({ keys: [...each.keys], line: each.line })),
			...open,
		},
		picks,
	};
}

/**
 * The callable exports that pick operations, with one logic discount per body the module counted.
 * @param reading The module.
 * @param judged Each judged export with its kind.
 * @returns The switchboards and their logic discounts, in export order.
 */
async function switchboardsOf(
	reading: DepthReading,
	judged: readonly (readonly [ExposedName, NameKind])[],
): Promise<{ readonly listed: ModuleSwitchboard; readonly discount: number }[]> {
	const files = new Set(reading.files);
	const discounted = new Set<Switchboard>();
	const switchboards: { listed: ModuleSwitchboard; discount: number }[] = [];
	for (const [name, kind] of judged) {
		if (!CALLED.has(kind)) continue;
		// oxlint-disable-next-line no-await-in-loop -- one name at a time; the pass caches each file it reads
		const found = await switchboardOf(reading, name);
		if (found === undefined) continue;
		const { listed, picks } = found;
		// Export aliases add width, but the body contributes logic at most once.
		const discount = files.has(name.path) && !discounted.has(picks) ? picks.logic : 0;
		discounted.add(picks);
		switchboards.push({ listed, discount });
	}
	return switchboards;
}

/** The width of a module and its logic once its switchboards are counted. */
type Widths = Pick<ModuleMeasure, "width" | "logic" | "widened" | "unresolved"> & {
	readonly switchboards: readonly ModuleSwitchboard[];
};

/**
 * The width of a module, each switchboard as one name for each operation it
 * picks, and its logic less what only picks; and the same with every key no
 * type closes yet counted, where one waits.
 * @param reading The module.
 * @param judged Each judged export with its kind.
 * @param counts The exports by kind.
 * @param logic The logic counted.
 * @returns The widths.
 */
async function widthsOf(
	reading: DepthReading,
	judged: readonly (readonly [ExposedName, NameKind])[],
	counts: ExportCounts,
	logic: number,
): Promise<Widths> {
	let width = counts.functions + counts.classes + counts.methods + counts.values;
	let picking = 0;
	let open = { width: 0, logic: 0 };
	const switchboards = await switchboardsOf(reading, judged);
	const gaps: string[] = [];
	for (const { listed: found, discount } of switchboards) {
		const more = found.operations.length - 1;
		if (found.open === undefined) {
			width += more;
			picking += discount;
		} else {
			open = { width: open.width + more, logic: open.logic + discount };
			gaps.push(`${found.name}: ${found.open}`);
		}
	}
	const counted = logic - picking;
	return {
		width,
		logic: counted,
		switchboards: switchboards.map(({ listed }) => listed),
		widened: switchboards.flatMap(({ listed: each }) =>
			each.open === undefined
				? [{ name: each.name, operations: each.operations.map((operation) => operation.keys) }]
				: [],
		),
		...(gaps.length === 0
			? {}
			: { unresolved: { width: width + open.width, logic: counted - open.logic, gaps } }),
	};
}

export { widthsOf };
