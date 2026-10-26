// What a pointer does on the diagram: press, drag, pick and open.
//
// A press that travels no further than a small tolerance is a click that picks
// what it landed on. One that travels further pans the diagram and picks
// nothing. When the drag is let go the camera stops where it is drawn, however
// fast the hand was moving: a picture that carries on alone moves the part the
// reader aimed at out from under them. A second finger on a touch screen turns
// the press into a pinch, which the picture follows at once.

import {
	useCallback,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent,
} from "react";

import type { SemanticAtlas } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { Gesture } from "#ui/components/semantic-board-canvas/CameraSurface.tsx";
import type { BoardCamera } from "#ui/hooks/semantic-board-canvas/use-board-camera.ts";
import { useTouchPinch } from "#ui/hooks/semantic-board-canvas/use-touch-pinch.ts";
import {
	capturePointer,
	hasTravelled,
	takePointerToPan,
	type Drag,
} from "#ui/clients/semantic-board-canvas/subjects/pointer-gesture.ts";
import { openableAt } from "#ui/clients/semantic-board-canvas/subjects/subject-tips.ts";
import { subjectAt } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** What the gestures act on. */
interface DiagramGestureInputs {
	/** The camera a drag moves. */
	readonly camera: BoardCamera;
	/** Where every subject of the picture ended up, which decides what a press landed on. */
	readonly atlas: SemanticAtlas;
	/**
	 * The person picked a subject out, or cleared the selection.
	 * @param id The semantic id, or null.
	 */
	readonly onSelect: (id: string | null, toggle?: boolean) => void;
	/**
	 * The pointer moved over the diagram with nothing pressed.
	 * @param event The move.
	 */
	readonly onHover: (event: PointerEvent<HTMLElement>) => void;
	/** A press began: whatever tip is open closes. */
	readonly dismissTip: () => void;
	/**
	 * Follow the drill-down of the card with this id, when it has one.
	 * @param id The card, or null.
	 */
	readonly openDown: (id: string | null) => void;
}

/** The handlers the viewport listens with. */
interface DiagramPointer {
	readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
	readonly onClick: (event: ReactMouseEvent<HTMLElement>) => void;
	readonly onDoubleClick: (event: ReactMouseEvent<HTMLElement>) => void;
}

/**
 * The pointer gestures of a drawn diagram.
 * @param inputs The camera and the picture's atlas, and what a pick and a hover do.
 * @returns Where a press stands, and the handlers for the viewport.
 */
function useDiagramGestures(inputs: DiagramGestureInputs): {
	readonly gesture: Gesture;
	readonly pointer: DiagramPointer;
} {
	const { camera, atlas, onSelect, onHover, dismissTip, openDown } = inputs;
	const [gesture, setGesture] = useState<Gesture>("idle");
	const drag = useRef<Drag | null>(null);
	const dragged = useRef(false);
	// What the last press landed on, carried from pointerup to the click that
	// follows it. A click is the only event that means "the person picked this",
	// and it is the one event whose target cannot be trusted to say what. The
	// box is null when no press is waiting to be spent, which is how a
	// synthesised click is told from a real one.
	const pressed = useRef<{ readonly subject: string | null } | null>(null);
	const pinch = useTouchPinch(camera);

	const onPointerDown = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			// A second finger makes the press a pinch, which moves the picture and picks nothing.
			if (pinch.down(event)) {
				drag.current = null;
				dragged.current = true;
				pressed.current = null;
				setGesture("dragging");
				return;
			}
			if (event.button !== 0) {
				return;
			}
			// What was pressed is decided here and nowhere else. By the time a click
			// arrives the diagram may have been panned, and the click may have been
			// retargeted by pointer capture; neither can change what was under the
			// pointer when the person pressed.
			drag.current = {
				pointerId: event.pointerId,
				fromX: event.clientX,
				fromY: event.clientY,
				x: event.clientX,
				y: event.clientY,
				pressed: subjectAt(event.target, atlas),
				captured: false,
			};
			dragged.current = false;
			// A press stops a zoom or an ease where it is, before anything else is decided.
			camera.stop();
			setGesture("pressed");
			dismissTip();
		},
		[atlas, camera, dismissTip, pinch],
	);

	// A press whose end this viewport never saw, so it is over: forgotten, and
	// whatever the press landed on with it, so the next click cannot inherit it.
	const abandon = useCallback((): void => {
		drag.current = null;
		dragged.current = false;
		pressed.current = null;
		setGesture("idle");
	}, []);

	// One move of a press: a pan once it has travelled, which takes the pointer.
	const panStep = useCallback(
		(started: Drag, event: PointerEvent<HTMLElement>): void => {
			const panned = dragged.current || hasTravelled(started, event.clientX, event.clientY);
			if (panned && !dragged.current) setGesture("dragging");
			dragged.current = panned;
			drag.current = {
				...started,
				x: event.clientX,
				y: event.clientY,
				captured: takePointerToPan(event, started, panned),
			};
			camera.panBy(event.clientX - started.x, event.clientY - started.y);
		},
		[camera],
	);

	const onPointerMove = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			if (pinch.move(event)) {
				return;
			}
			const started = drag.current;
			if (started === null) {
				onHover(event);
				return;
			}
			if (started.pointerId !== event.pointerId) {
				return;
			}
			// A move with no button held is not part of a press. The press ended where
			// this viewport could not see it: a resize handle took the pointer, or it
			// was let go outside the window. Left as it was, the diagram would follow
			// the pointer with nothing held.
			if (event.buttons === 0) {
				abandon();
				onHover(event);
				return;
			}
			panStep(started, event);
		},
		[abandon, onHover, panStep, pinch],
	);

	const onPointerUp = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			if (pinch.up(event)) {
				setGesture("idle");
				return;
			}
			const started = drag.current;
			if (started?.pointerId !== event.pointerId) {
				return;
			}
			pressed.current = { subject: started.pressed };
			drag.current = null;
			setGesture("idle");
			if (started.captured) {
				capturePointer(event.currentTarget, event.pointerId, false);
			}
		},
		[pinch],
	);

	// A gesture the browser took away never became a pick. Whatever the press
	// landed on is forgotten, so the next click cannot inherit it.
	const onPointerCancel = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			if (pinch.up(event)) {
				setGesture("idle");
				return;
			}
			if (drag.current?.pointerId !== event.pointerId) {
				return;
			}
			abandon();
		},
		[abandon, pinch],
	);

	// A drag that ends on a card is not a pick: the person was moving the
	// diagram and happened to let go over something.
	//
	// The pick is what the press landed on, not what the click reports. A click
	// is retargeted to whichever element holds the pointer, and it arrives after
	// a pan has already moved the diagram under the cursor, so its own target
	// answers a different question from the one being asked.
	const onClick = useCallback(
		(event: ReactMouseEvent<HTMLElement>): void => {
			const landed = pressed.current;
			pressed.current = null;
			if (dragged.current) {
				dragged.current = false;
				return;
			}
			// A click with no press behind it can only have been synthesised; there
			// its own target is the only thing there is to go on.
			onSelect(
				landed === null ? subjectAt(event.target, atlas) : landed.subject,
				event.ctrlKey || event.metaKey,
			);
		},
		[onSelect, atlas],
	);

	// A double-click on a card, or a container's header, opens the board one
	// level down, when it has one.
	const onDoubleClick = useCallback(
		(event: ReactMouseEvent<HTMLElement>): void => {
			openDown(openableAt(event.target, event.clientY));
		},
		[openDown],
	);

	return {
		gesture,
		pointer: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick, onDoubleClick },
	};
}

export { useDiagramGestures, type DiagramGestureInputs, type DiagramPointer };
