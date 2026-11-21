// Which exposed names belong to an exported class of a module, wherever they
// are defined: a C++ or Objective-C method in the pair of its class's header,
// a Swift method in an extension, a Go method or a Rust `impl` in another file
// of the package or crate. A public method counts on its own, a member that
// belongs to the class counts as a top-level name, and a type that holds data
// with no public method is a type (TASK-646.04, TASK-646.11, TASK-651). A
// contract's methods count once, for the contract, and the members that
// implement one count for no type (TASK-651).

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

/**
 * The own names of the methods a holder declares among the exposed names.
 * @param holder The holder's symbol.
 * @param exposed Every name the module exposes.
 * @returns Them.
 */
function methodNames(holder: string, exposed: readonly ExposedName[]): Set<string> {
	return new Set(
		exposed.flatMap(({ definition }) => {
			if (definition.kind !== "function" || definition.calledByLanguage === true) return [];
			return ownName(definition.symbol, holder) ?? [];
		}),
	);
}

/** What a type does to implement a contract its module exports. */
interface Contract {
	/** Its last name, as a type's declaration names it. */
	readonly name: string;
	/** Whether a type implements it by having its methods, not by naming it. */
	readonly structural: boolean;
	/** The own names of its methods. */
	readonly methods: ReadonlySet<string>;
}

/**
 * The members that implement a contract, which a caller learns from the
 * contract, so they count for it and not for their type: each member of a
 * Rust `impl Trait for Type`, whichever trait, and each method whose name an
 * exported contract of the module requires of a type that implements it. A
 * type implements a `declared` contract where its declaration names it, as a
 * Swift type or extension and a C# type do, and a `structural` one, a Go
 * interface, by having a method of each of its names. A contract's own
 * methods implement nothing, though it extends another.
 * @param exposed Every name the module exposes.
 * @param contracts The module's exported contracts.
 * @returns The members.
 */
function implementations(
	exposed: readonly ExposedName[],
	contracts: readonly ExposedName[],
): ReadonlySet<ExposedName> {
	const required = contracts
		.map(({ definition }): Contract => ({
			name: definition.symbol.slice(definition.symbol.lastIndexOf(".") + 1),
			structural: definition.contract === "structural",
			methods: methodNames(definition.symbol, exposed),
		}))
		.filter((contract) => contract.methods.size > 0);
	const methods = new Map<string, ReadonlySet<string>>();
	/**
	 * The own names of a type's methods, read once.
	 * @param holder The type's symbol.
	 * @returns Them.
	 */
	const methodsOf = (holder: string): ReadonlySet<string> => {
		const own = methods.get(holder) ?? methodNames(holder, exposed);
		methods.set(holder, own);
		return own;
	};
	return new Set(
		exposed.filter(
			(member) =>
				member.definition.implementation === true ||
				(member.definition.kind === "function" &&
					!heldBy(member, contracts) &&
					implementsOne(member, required, methodsOf)),
		),
	);
}

/**
 * Whether a method implements a contract its module exports: its type names
 * one that requires it, or has a method of each name of a structural one
 * that does.
 * @param member The method.
 * @param required The module's contracts.
 * @param methodsOf The own names of a type's methods.
 * @returns True when it does.
 */
function implementsOne(
	member: ExposedName,
	required: readonly Contract[],
	methodsOf: (holder: string) => ReadonlySet<string>,
): boolean {
	const { symbol, conforms = [] } = member.definition;
	const holder = symbol.slice(0, Math.max(symbol.lastIndexOf("."), 0));
	const own = ownName(symbol, holder) ?? "";
	return required.some(
		(contract) =>
			contract.methods.has(own) &&
			(contract.structural
				? [...contract.methods].every((name) => methodsOf(holder).has(name))
				: conforms.includes(contract.name)),
	);
}

export { dataOnly, heldBy, implementations, methodOf, staticMember };
