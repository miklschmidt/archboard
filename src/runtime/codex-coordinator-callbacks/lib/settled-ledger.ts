import type {
	CoordinatorCallback,
	CoordinatorCallbackDelivery,
} from "@/runtime/codex-coordinator-callbacks/lib/contract";

/** One voice generation, as callbacks correlate against it. */
type RealtimeGeneration = NonNullable<CoordinatorCallback["correlation"]["realtimeGeneration"]>;

/** What one voice generation heard, and how much of it the ledger can no longer show. */
interface GenerationHistory {
	readonly deliveries: readonly CoordinatorCallbackDelivery[];
	readonly omittedPrefixCount: number;
}

/**
 * The bounded record of what has already been delivered. It is what makes a repeated callback
 * answerable without delivering again, and it tells a voice generation how much of its own
 * history has aged out rather than pretending it saw everything.
 */
interface SettledLedger {
	/** Remember how one callback settled, evicting the oldest entries past the limit. */
	readonly record: (key: string, delivery: CoordinatorCallbackDelivery) => void;
	/** The delivery already recorded for one callback key, if any. */
	readonly get: (key: string) => CoordinatorCallbackDelivery | undefined;
	/** Every delivery still held, oldest first. */
	readonly list: () => readonly CoordinatorCallbackDelivery[];
	/** What one voice generation heard, and how much has been forgotten. */
	readonly historyFor: (generation: RealtimeGeneration) => GenerationHistory;
}

/**
 * A stable key for one voice generation, so deliveries and omissions can be counted per
 * generation without holding the generation object itself.
 * @param generation - The voice generation.
 * @returns The key.
 */
function realtimeGenerationKey(generation: RealtimeGeneration): string {
	return JSON.stringify([
		generation.childId,
		generation.epoch,
		generation.coordinatorThreadId,
		generation.wireSessionId,
		generation.browserSessionId,
		generation.browserCorrelationId,
	]);
}

/**
 * Whether a settled delivery belongs to one voice generation.
 * @param delivery - The settled delivery.
 * @param generationKey - The generation being asked about.
 * @returns True when the delivery's callback was correlated against that generation.
 */
function deliveryBelongsToGeneration(
	delivery: CoordinatorCallbackDelivery,
	generationKey: string,
): boolean {
	const captured = delivery.callback?.correlation.realtimeGeneration;
	return (
		captured !== null && captured !== undefined && realtimeGenerationKey(captured) === generationKey
	);
}

/**
 * Build the settled ledger for one callbacks module.
 * @param limit - How many settled deliveries to keep.
 * @returns The ledger.
 */
function createSettledLedger(limit: number): SettledLedger {
	const byKey = new Map<string, CoordinatorCallbackDelivery>();
	const order: string[] = [];
	const omittedPrefixes = new Map<string, number>();
	const omittedPrefixOrder: string[] = [];

	/**
	 * Count one more delivery omitted from the ledger for a voice generation.
	 * @param key - The generation's key.
	 */
	const countOmitted = (key: string): void => {
		if (!omittedPrefixes.has(key)) {
			omittedPrefixOrder.push(key);
		}
		omittedPrefixes.set(key, (omittedPrefixes.get(key) ?? 0) + 1);
	};

	/**
	 * Forget the omission counts of generations that have themselves aged out, so the counts never
	 * outgrow the ledger they describe.
	 */
	const trimOmitted = (): void => {
		while (omittedPrefixOrder.length > limit) {
			const expired = omittedPrefixOrder.shift();
			if (expired !== undefined) {
				omittedPrefixes.delete(expired);
			}
		}
	};

	/**
	 * Drop the oldest delivery, counting what the eviction cost the voice generation it belonged
	 * to so a later history read can say what it can no longer show.
	 */
	const evictOldest = (): void => {
		const expiredKey = order.shift();
		if (expiredKey === undefined) {
			return;
		}
		const generation = byKey.get(expiredKey)?.callback?.correlation.realtimeGeneration;
		byKey.delete(expiredKey);
		if (generation !== null && generation !== undefined) {
			countOmitted(realtimeGenerationKey(generation));
			trimOmitted();
		}
	};

	return Object.freeze({
		/**
		 * Remember how one callback settled.
		 * @param key - The callback's identity.
		 * @param delivery - How it settled.
		 */
		record: (key: string, delivery: CoordinatorCallbackDelivery): void => {
			byKey.set(key, delivery);
			order.push(key);
			while (order.length > limit) {
				evictOldest();
			}
		},
		/**
		 * The delivery recorded for one callback key.
		 * @param key - The callback's identity.
		 * @returns Its delivery, or undefined when it has not settled or has aged out.
		 */
		get: (key: string) => byKey.get(key),
		/**
		 * Every delivery still held, oldest first.
		 * @returns The frozen deliveries.
		 */
		list: () =>
			Object.freeze(
				order.flatMap((key) => {
					const delivery = byKey.get(key);
					return delivery === undefined ? [] : [delivery];
				}),
			),
		/**
		 * What one voice generation heard.
		 * @param generation - The generation being asked about.
		 * @returns Its deliveries and the count of earlier ones that have aged out.
		 */
		historyFor: (generation: RealtimeGeneration): GenerationHistory => {
			const generationKey = realtimeGenerationKey(generation);
			return Object.freeze({
				deliveries: Object.freeze(
					order.flatMap((key) => {
						const delivery = byKey.get(key);
						return delivery !== undefined && deliveryBelongsToGeneration(delivery, generationKey)
							? [delivery]
							: [];
					}),
				),
				omittedPrefixCount: omittedPrefixes.get(generationKey) ?? 0,
			});
		},
	});
}

export { createSettledLedger, type RealtimeGeneration, type SettledLedger };
