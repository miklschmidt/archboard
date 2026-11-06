import type { TokenParameter } from "#cli/contract/protocol/contract.ts";

/**
 * The hidden collection a staged command receives everything after its name
 * in. It is parsed by the stage, never advertised: what a person may write is
 * declared as the command's own `staged` parameters, which help shows.
 * @param name - What the collection is called in the contract.
 * @returns The positional that collects the tokens.
 */
function stagedTokens(name: string): TokenParameter {
	return {
		kind: "positional",
		key: "tokens",
		name,
		repeatable: true,
		route: "staged-tokens",
		hidden: true,
		description: "Everything after the command name, validated after its prerequisites",
	};
}

export { stagedTokens };
