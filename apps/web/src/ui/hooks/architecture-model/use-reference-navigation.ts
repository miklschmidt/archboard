import { useCallback, useEffect, useRef, useState } from "react";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import type { useModelNavigation } from "#ui/hooks/architecture-model/use-model-navigation.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { ArchitectureReadError } from "#ui/clients/architecture-model/queries.ts";

type Reference = NonNullable<Model["resolvedReferences"]>[number];
type Navigation = ReturnType<typeof useModelNavigation>;
const LOCATION_FIELDS = ["vault", "model", "subject", "state", "checkpoint", "preview"] as const;

/**
 * A reference opens only its captured destination and cancels when its source leaves the inspector.
 * @param paneId The pane that owns this deliberate navigation.
 * @param navigation The selected source reading and its shared reader action.
 * @returns One pending action and its explicit failure, without storing architecture content.
 */
function useReferenceNavigation(paneId: string, navigation: Navigation) {
	const active = useRef<AbortController | null>(null);
	const [pending, setPending] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const { openReference } = useModelLocation(paneId);
	useEffect(
		() => () => {
			active.current?.abort();
			active.current = null;
		},
		[],
	);
	const { follow: read } = navigation;
	const follow = useCallback(
		async (reference: Reference): Promise<void> => {
			active.current?.abort();
			const controller = new AbortController();
			active.current = controller;
			setPending(reference.index);
			setError(null);
			try {
				const reading = await referencedReading(read, reference, controller.signal);
				if (reading !== undefined) openReference(reference.reference.repo, reading);
			} catch (failure) {
				if (!controller.signal.aborted) setError(referenceError(failure));
			} finally {
				if (active.current === controller) {
					active.current = null;
					setPending(null);
				}
			}
		},
		[read, openReference],
	);
	return { follow, pending, error };
}

/**
 * Mutable reference indices cannot silently select a different destination during the request.
 * @param read The source's shared architecture read.
 * @param reference The resolved entry the person activated.
 * @param signal Cancels an obsolete activation.
 * @returns The matching foreign reading, or nothing after cancellation.
 */
async function referencedReading(
	read: Navigation["follow"],
	reference: Reference,
	signal: AbortSignal,
) {
	const reading = await read(reference.index, signal);
	if (signal.aborted) return undefined;
	if (!sameDestination(reading.location, reference.address))
		throw new Error(
			"The reference changed while opening it. Refresh the architecture and select it again.",
		);
	return reading;
}

/**
 * Compare every part of the explicit resolved address.
 * @param actual The destination the runtime returned.
 * @param expected The destination the person selected.
 * @returns Whether both name the same repository checkout and exact state and subject.
 */
function sameDestination(actual: Model["location"], expected: Model["location"]): boolean {
	if (actual === undefined || expected === undefined) return false;
	return LOCATION_FIELDS.every((field) => actual[field] === expected[field]);
}

/**
 * Keep transport and domain refusals visible beside their source reference.
 * @param failure The refused navigation.
 * @returns A readable failure with a recovery action.
 */
function referenceError(failure: unknown): string {
	if (failure instanceof ArchitectureReadError)
		return failure.failure.diagnostics
			.map((entry) => `${entry.message} ${entry.recovery}`)
			.join("\n");
	return failure instanceof Error
		? failure.message
		: "The referenced architecture is unavailable. Refresh and retry.";
}

export { useReferenceNavigation };
