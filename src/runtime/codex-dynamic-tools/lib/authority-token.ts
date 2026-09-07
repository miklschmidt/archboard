import { randomUUID } from "node:crypto";

/** The only opaque authority value that may enter a dynamic effect. */
declare const dynamicAuthorityBrand: unique symbol;
type DynamicAuthorityToken = string & {
	readonly [dynamicAuthorityBrand]: "dynamic-authority";
};

interface DynamicAuthorityTokenIssuer {
	readonly issue: () => DynamicAuthorityToken;
	readonly owns: (token: DynamicAuthorityToken) => boolean;
	readonly retire: (token: DynamicAuthorityToken) => void;
	readonly retireAll: () => void;
}

/**
 * Process-local opaque authority; only the owning production adapter can
 * validate it. The issuer is the single site that mints the brand.
 * @returns An issuer that tracks which tokens are still live.
 */
function createDynamicAuthorityTokenIssuer(): DynamicAuthorityTokenIssuer {
	const live = new Set<string>();
	/**
	 * Mint one fresh token and record it as live.
	 * @returns The new branded token.
	 */
	const issue = (): DynamicAuthorityToken => {
		const token = `dynamic-authority:${randomUUID()}`;
		live.add(token);
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this issuer is the brand's only minting site; the string was just recorded as live
		return token as DynamicAuthorityToken;
	};
	/**
	 * Whether a token was issued here and not yet retired.
	 * @param token Token to check.
	 * @returns Whether the token is live.
	 */
	const owns = (token: DynamicAuthorityToken): boolean => live.has(token);
	/**
	 * Forget one token so it can no longer authorize an effect.
	 * @param token Token to retire.
	 */
	const retire = (token: DynamicAuthorityToken): void => {
		live.delete(token);
	};
	/** Forget every live token, for example on dispose. */
	const retireAll = (): void => {
		live.clear();
	};
	return Object.freeze({ issue, owns, retire, retireAll });
}

export {
	type DynamicAuthorityToken,
	type DynamicAuthorityTokenIssuer,
	createDynamicAuthorityTokenIssuer,
};
