// How things move on a pane's surface, as a second entrypoint of the module:
// one picture of a board turning into the next (the hook the diagram draws
// through, the transition it drives), and the camera gliding between two views
// or easing under a hand, with the arithmetic under both. The stage itself
// needs none of this by name; it is here so that what the motion promises can
// be held to from outside the module's private folders.

export { usePictureTransition } from "@/ui/semantic-board-canvas/hooks/use-picture-transition";
export { glidePath } from "@/ui/semantic-board-canvas/lib/camera-glide";
export {
	STILL,
	easeMotion,
	flingMotion,
	stepMotion,
	throwOf,
	trailWith,
	wheelZoomFactor,
	zoomMotion,
	type Motion,
} from "@/ui/semantic-board-canvas/lib/camera-motion";
export {
	morphPath,
	parsePath,
	pathLength,
	serialise,
} from "@/ui/semantic-board-canvas/lib/path-morph";
export { enterPicture } from "@/ui/semantic-board-canvas/lib/picture-entrance";
export {
	TRANSITION_ATTRIBUTE,
	continuousPictures,
	stagePicture,
	transitionPicture,
	type PictureTransition,
} from "@/ui/semantic-board-canvas/lib/picture-transition";
