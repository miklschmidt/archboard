interface FlagSpec {
	takesValue: boolean;
	repeatable?: boolean;
}

type FlagSpecs = Readonly<Record<string, FlagSpec>>;

type ChildDiscoveryOptions<Spec extends FlagSpecs> = {
	readonly [Name in keyof Spec]: Spec[Name]["takesValue"] extends true ? "value" : "flag";
};

/**
 * Derive first-positional route-discovery arity from the contract parser
 * grammar, so route discovery knows which leading flag swallows the token
 * that would otherwise name a child command.
 * @param spec - The parser grammar's flags, by name.
 * @returns The same names, each marked as taking a value or not.
 */
function childDiscoveryOptions<const Spec extends FlagSpecs>(
	spec: Spec,
): ChildDiscoveryOptions<Spec> {
	const options = Object.fromEntries(
		Object.entries(spec).map(([name, option]) => [name, option.takesValue ? "value" : "flag"]),
	);
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromEntries loses the keys entries produced; the mapped type keys off the same takesValue mapped over here
	return options as ChildDiscoveryOptions<Spec>;
}

export { type FlagSpec, type FlagSpecs, type ChildDiscoveryOptions, childDiscoveryOptions };
