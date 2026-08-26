export interface FlagSpec {
	takesValue: boolean;
	repeatable?: boolean;
}

export type FlagSpecs = Readonly<Record<string, FlagSpec>>;

export type ChildDiscoveryOptions<Spec extends FlagSpecs> = {
	readonly [Name in keyof Spec]: Spec[Name]["takesValue"] extends true ? "value" : "flag";
};

/** Derive first-positional route-discovery arity from the contract parser grammar. */
export function childDiscoveryOptions<const Spec extends FlagSpecs>(
	spec: Spec,
): ChildDiscoveryOptions<Spec> {
	return Object.fromEntries(
		Object.entries(spec).map(([name, option]) => [name, option.takesValue ? "value" : "flag"]),
	) as ChildDiscoveryOptions<Spec>;
}
