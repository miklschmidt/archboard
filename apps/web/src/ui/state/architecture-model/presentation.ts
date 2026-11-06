import { createContext } from "react";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import type { PictureCamera } from "#ui/architecture-drawing/canvas/picture/camera/hooks/use-picture-camera.ts";
import type { WalkthroughNarration } from "#ui/architecture-drawing/canvas/picture/rules/narration.ts";

/** Where a surface of a pane stood when it went out of sight. */
interface LeftCamera {
	readonly model: string;
	readonly camera: ReturnType<PictureCamera["view"]>["camera"];
}

/** Holds a camera for the next surface of the pane that comes into sight. */
interface CameraHandover {
	readonly give: (left: LeftCamera) => void;
	readonly take: () => LeftCamera | null;
}

/**
 * One pane's place to leave a camera.
 * @returns An empty handover.
 */
function cameraHandover(): CameraHandover {
	let held: LeftCamera | null = null;
	return {
		/**
		 * Leave a camera.
		 * @param left Where the surface stood.
		 */
		give: (left) => {
			held = left;
		},
		/**
		 * Take the camera left, once.
		 * @returns The camera, or null.
		 */
		take: () => {
			const left = held;
			held = null;
			return left;
		},
	};
}

/** Ordinary pane presentation, independent of asynchronous architecture reads. */
const ModelPaneContext = createContext<{
	selection: ModelSelection;
	handover: CameraHandover;
	/** Where the reading puts what it says in the pane's header. */
	head: HTMLElement | null;
	attachHead: (element: HTMLElement | null) => void;
} | null>(null);

/** The captured presentation owns its start action and whether it replaces ordinary reading. */
const ModelWalkthroughContext = createContext<{
	/** Present a walkthrough, from its first step or from another one, counted from zero. */
	select: (id: string, beat?: number) => void;
	/** End the presentation, which does nothing while none runs. */
	leave: () => void;
	active: boolean;
	/** The walkthrough on screen, or null. */
	current: string | null;
	/** Narrating a walkthrough aloud, when the shell can. */
	narration?: WalkthroughNarration | undefined;
} | null>(null);

export { ModelPaneContext, ModelWalkthroughContext, cameraHandover, type CameraHandover };
