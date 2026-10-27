import type { JSX, ReactNode } from "react";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import { importedReadings } from "#ui/rules/architecture-model/imported-readings.ts";
import { ModelError } from "#ui/components/architecture-model/ModelFrame.tsx";

/**
 * Keep unavailable bookmark intent explicit in current and original readings.
 * @param props The selected model and its readable content.
 * @param props.model The coherent architecture with optional bookmark intent.
 * @param props.children The reading shown when its intent remains available.
 * @returns The reading or its exact unavailable diagnostics.
 */
function ModelBookmarkReading({
	model,
	children,
}: {
	model: Model;
	children: ReactNode;
}): JSX.Element {
	const diagnostics = importedReadings(model)?.bookmark?.diagnostics;
	if (diagnostics !== undefined && diagnostics.length > 0)
		return (
			<ModelError
				code="BOOKMARK_UNAVAILABLE"
				message="This bookmark cannot be drawn. Select another reading or update the bookmark."
				diagnostics={diagnostics}
			/>
		);
	return <>{children}</>;
}

export { ModelBookmarkReading };
