import { useEffect, useMemo, type JSX } from "react";
import type { Model } from "@archboard/board/content";
import { originalReadingAddress } from "#ui/rules/architecture-model/imported-readings.ts";
import { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { ModelError } from "#ui/components/architecture-model/ModelFrame.tsx";

/**
 * Normalize an installed old address to the exact original reading it resolved.
 * @param props The resolved architecture and addressed pane.
 * @param props.model The successful original read.
 * @param props.paneId The pane that requested the alias.
 * @returns Progress while the router adopts the exact returned destination.
 */
function ModelOriginalDestination({
	model,
	paneId,
}: {
	model: Model;
	paneId: string;
}): JSX.Element {
	const { openOriginal } = useModelLocation(paneId);
	const address = useMemo(() => originalReadingAddress(model), [model]);
	useEffect(() => {
		if (address !== null) openOriginal(address);
	}, [address, openOriginal]);
	if (address === null)
		return (
			<ModelError
				code="ORIGINAL_UNAVAILABLE"
				message="The original address returned no exact state and checkpoint. Refresh the model and choose the address again."
			/>
		);
	return <output className="text-body p-10">Opening original architecture…</output>;
}

export { ModelOriginalDestination };
