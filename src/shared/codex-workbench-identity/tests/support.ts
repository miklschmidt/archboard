import { createIdentityAuthorities } from "../index.ts";
import type { IdentityAuthorities } from "../index.ts";

function formatUuid(raw: string): string {
	return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

/**
 * Keeps entropy control inside the identity test owner while exercising the
 * production factory and its real crypto.randomUUID() call site.
 */
export function withOperationNonceSequence<T>(
	nonces: readonly [string, ...string[]],
	action: (authorities: IdentityAuthorities, attempts: () => number) => T,
): T {
	const sequence = ["0".repeat(32), "1".repeat(32), ...nonces];
	let index = 0;
	const original = crypto.randomUUID.bind(crypto);
	Object.defineProperty(crypto, "randomUUID", {
		configurable: true,
		writable: true,
		value: () => {
			const raw = sequence[Math.min(index++, sequence.length - 1)]!;
			return formatUuid(raw);
		},
	});
	try {
		return action(createIdentityAuthorities(), () => index - 2);
	} finally {
		crypto.randomUUID = original;
	}
}
