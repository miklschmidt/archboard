import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Model, projectModel } from "@archboard/model/content";
import type { Size } from "@archboard/renderer/shell-geometry";
import { modelDrawingQuery } from "#ui/clients/architecture-model/drawing.ts";
import type { PictureCamera } from "#ui/hooks/canvas/use-picture-camera.ts";
import { fittingReading, type FlowGrammar } from "#ui/rules/architecture-model/flow-fit.ts";
import { projectFlow } from "#ui/rules/architecture-model/flow-reading.ts";

/** What a flow is drawn from and where it opens. */
interface FlowReadingInputs {
	readonly model: Model;
	/** The structural projection of the reading, which a flow's projection is taken from. */
	readonly structure: ReturnType<typeof projectModel>;
	readonly camera: Pick<PictureCamera, "measure">;
	/**
	 * Open a flow in one of its readings.
	 * @param id The flow.
	 * @param grammar The reading.
	 */
	readonly showFlow: (id: string, grammar: FlowGrammar) => void;
}

/**
 * Open a flow in the reading that fits its pane best (ADR 0073). Both readings are drawn first and
 * stay in the cache, so the toggle between them switches at once. Of flows asked for one after
 * the other, only the last opens.
 * @param inputs The reading and how a flow opens.
 * @returns Open a flow in this pane, and choose the reading of a flow for a pane not laid out yet.
 */
function useFlowReadings(inputs: FlowReadingInputs) {
	const { model, structure, camera, showFlow } = inputs;
	const client = useQueryClient();
	const latest = useRef(0);
	const fitting = useCallback(
		async (id: string, room: Size | null): Promise<FlowGrammar> => {
			const flow = structure.depicted.flows.find((entry) => entry.id === id);
			if (flow === undefined) return "sequence";
			const projection = projectFlow(structure, flow);
			/**
			 * How large one reading draws the flow.
			 * @param grammar The reading.
			 * @returns Its size, or null when it could not be drawn.
			 */
			const size = (grammar: FlowGrammar): Promise<Size | null> =>
				client.fetchQuery(modelDrawingQuery(model, projection, grammar, undefined)).then(
					({ width, height }) => ({ width, height }),
					() => null,
				);
			const [sequence, flowchart] = await Promise.all([size("sequence"), size("flowchart")]);
			return fittingReading(room, { sequence, flowchart });
		},
		[client, model, structure],
	);
	const openFlow = useCallback(
		(id: string): void => {
			latest.current += 1;
			const asked = latest.current;
			/**
			 * Open the flow once both readings are drawn, unless another was asked for since.
			 * @returns Once the flow opened or was passed over.
			 */
			const open = async (): Promise<void> => {
				const grammar = await fitting(id, camera.measure());
				if (asked === latest.current) showFlow(id, grammar);
			};
			void open();
		},
		[fitting, camera, showFlow],
	);
	return { openFlow, fitting };
}

export { useFlowReadings };
