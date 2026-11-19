// Which exposed names belong to an exported class of a module, wherever they
// are defined: a C++ or Objective-C method in the pair of its class's header,
// a Swift method in an extension, a Go method or a Rust `impl` in another file
// of the package or crate. A public method counts on its own, a member that
// belongs to the class counts as a top-level name, and a type that holds data
// with no public method is a type (TASK-646.04, TASK-646.11, TASK-651).

import type { ExposedName } from "#runtime/code-facts/modules/operations/module-exposure.ts";

/**
 * A member's own name within a holder: `post` of `Ledger.post`, and in the C
 * family, whose names `::` qualifies, `save` of `shop::Store::save` and the
 * selector `post:by:` of `Ledger::post:by:`.
 * @param symbol The member's symbol.
 * @param holder The holder's symbol.
 * @returns The own name, or undefined when the symbol is no member of the holder's own.
 */
function ownName(symbol: string, holder: string): string | undefined {
	if (!symbol.startsWith(holder)) return undefined;
	const own = /^(?:\.|::)(.+)$/u.exec(symbol.slice(holder.length))?.[1];
	return own === undefined || /\.|::./u.test(own) ? undefined : own;
}

/**
 * Whether a member belongs to an exported class. It may be in another file
 * than its class: a C++ or Objective-C method in the pair of its class's
 * header, a Swift method in an extension.
 * @param member The member.
 * @param classes The module's exported classes.
 * @returns True when it does.
 */
function heldBy(member: ExposedName, classes: readonly ExposedName[]): boolean {
	const { symbol } = member.definition;
	return classes.some((each) => ownName(symbol, each.definition.symbol) !== undefined);
}

/**
 * Whether a member is a public method of an exported class, which callers
 * call on an instance.
 * @param member The member.
 * @param classes The module's exported classes.
 * @returns True when it is.
 */
function methodOf(member: ExposedName, classes: readonly ExposedName[]): boolean {
	const { definition } = member;
	return (
		definition.kind === "function" &&
		definition.calledByLanguage !== true &&
		definition.static !== true &&
		heldBy(member, classes)
	);
}

/**
 * Whether an exported type that holds data has no public method in its
 * module, wherever a method is defined, so callers learn it as a type.
 * @param name The type.
 * @param exposed Every name its module exposes.
 * @returns True when it holds data alone.
 */
function dataOnly(name: ExposedName, exposed: readonly ExposedName[]): boolean {
	if (name.definition.data !== true) return false;
	return !exposed.some(
		({ definition }) =>
			definition.kind === "function" &&
			definition.calledByLanguage !== true &&
			ownName(definition.symbol, name.definition.symbol) !== undefined,
	);
}

/**
 * Whether a member of an exported class belongs to the class, not to an
 * instance, as a C# `static` member does: callers read it through the
 * class's name, as they read a top-level name, so it counts as one.
 * @param member The member.
 * @param classes The module's exported classes.
 * @returns True when it does.
 */
function staticMember(member: ExposedName, classes: readonly ExposedName[]): boolean {
	const { definition } = member;
	const counted = definition.static === true && definition.calledByLanguage !== true;
	return counted && heldBy(member, classes);
}

export { dataOnly, methodOf, staticMember };
