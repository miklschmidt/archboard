// Where one pane's camera is, kept outside React, and whether it is at rest.
//
// A pan or a zoom moves the camera on every frame, and nothing the pane draws
// around the picture depends on it: only what subscribes, the surface it moves,
// is drawn again (TASK-385.02).
//
// The store also says when the camera is at rest (TASK-405). A hand that moves
// the camera sets it moving, and whoever drives the hand's moves says when it has
// come to rest. What is drawn by how far away the camera is reads where the camera
// last came to rest, so it changes once when a move is over and not in the middle
// of it. A flight can hold the rest where it is until the pane has taken over from
// it (TASK-406).

import { IDENTITY_CAMERA, type Camera } from "@/ui/semantic-board-canvas/lib/camera";

/** Where the pane is looking, how its last move goes there, and whether it is at rest. */
interface CameraView {
	/** Where the pane is looking. */
	readonly camera: Camera;
	/** Whether the last move was one that must land at once, rather than be eased. */
	readonly instant: boolean;
	/**
	 * Whether a hand is moving the camera: a drag, a wheel, a pinch or a key moved
	 * it, and it has not come to rest since. A fit, a glide and the camera
	 * following its picture are not a hand's, and do not set it moving.
	 */
	readonly moving: boolean;
	/**
	 * Where the camera came to rest last. What is drawn by how far away the
	 * camera is reads this, so it changes once a move is over.
	 */
	readonly rest: Camera;
}

/** One move of the camera, as its store is told it. */
interface Move {
	readonly camera: Camera;
	readonly instant: boolean;
	/** Whether a hand made it, which sets the camera moving until it comes to rest. */
	readonly hand?: boolean;
}

/** Where a camera is, whether it is at rest, and who hears it move. */
interface CameraStore {
	/**
	 * Where the camera is.
	 * @returns The camera, how its last move goes, and where it last came to rest.
	 */
	readonly read: () => CameraView;
	/**
	 * Move the camera, and tell whoever listens.
	 * @param next Where it is now, and whether a hand moved it there.
	 */
	readonly write: (next: Move) => void;
	/** The hand has left the camera alone: it is at rest where it is. */
	readonly settle: () => void;
	/**
	 * Keep the rest where it is until the hold is let go, however the camera moves meanwhile.
	 * @returns Let the hold go. The rest then follows the camera, unless a hand still moves it.
	 */
	readonly hold: () => () => void;
	/**
	 * Hear every move.
	 * @param listener Called after each move.
	 * @returns How to stop hearing them.
	 */
	readonly subscribe: (listener: () => void) => () => void;
}

/**
 * A camera's store, at the identity camera and at rest.
 * @returns The store.
 */
function createCameraStore(): CameraStore {
	let view: CameraView = {
		camera: IDENTITY_CAMERA,
		instant: false,
		moving: false,
		rest: IDENTITY_CAMERA,
	};
	let holds = 0;
	const listeners = new Set<() => void>();
	/**
	 * Take a new view, with the rest following the camera when nothing keeps it, and tell whoever listens.
	 * @param next The view, before its rest is decided.
	 */
	const publish = (next: CameraView): void => {
		view = next.moving || holds > 0 ? next : { ...next, rest: next.camera };
		for (const listener of listeners) listener();
	};
	return {
		/**
		 * Where the camera is.
		 * @returns The camera, how its last move goes, and where it last came to rest.
		 */
		read: () => view,
		/**
		 * Move the camera, and tell whoever listens.
		 * @param next Where it is now, and whether a hand moved it there.
		 */
		write: (next) => {
			publish({
				camera: next.camera,
				instant: next.instant,
				moving: view.moving || next.hand === true,
				rest: view.rest,
			});
		},
		/** The camera is at rest where it is. */
		settle: () => {
			publish({ ...view, moving: false });
		},
		/**
		 * Keep the rest where it is.
		 * @returns Let it go.
		 */
		hold: () => {
			holds += 1;
			let held = true;
			return (): void => {
				if (!held) return;
				held = false;
				holds -= 1;
				publish(view);
			};
		},
		/**
		 * Hear every move.
		 * @param listener Called after each move.
		 * @returns How to stop hearing them.
		 */
		subscribe: (listener) => {
			listeners.add(listener);
			return (): void => {
				listeners.delete(listener);
			};
		},
	};
}

export { createCameraStore, type CameraStore, type CameraView, type Move };
