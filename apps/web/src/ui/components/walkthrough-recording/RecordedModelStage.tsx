import type { ComponentProps, JSX } from "react";
import { ModelWalkthrough } from "#ui/components/architecture-model/ModelWalkthrough.tsx";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

type Props = Omit<
	ComponentProps<typeof ModelWalkthrough>,
	"model" | "onLeave" | "onReading" | "narration"
> & { model: Model | null };

/**
 * Draw only the payload that the recording driver supplied.
 * @param props The capture and the recorder's requested position.
 * @returns A loading state or the immutable captured presentation.
 */
function RecordedModelStage(props: Props): JSX.Element {
	if (props.model === null)
		return <output className="text-body p-8">Loading the recording capture…</output>;
	return (
		<ModelWalkthrough
			{...props}
			model={props.model}
			driven={props.driven ?? null}
			onLeave={keepRecording}
		/>
	);
}

/** The recording owner decides when the presentation ends. */
function keepRecording(): void {}

export { RecordedModelStage };
