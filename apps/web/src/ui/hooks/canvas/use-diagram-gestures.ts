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
	useEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type HTMLAttributes,
	type PointerEvent,
} from "react";

import type { DiagramBox } from "@archboard/model/render-reply";
import type { SemanticAtlas } from "#ui/clients/canvas/reads/drawings.ts";
import type { Gesture } from "#ui/components/canvas/CameraSurface.tsx";
import type { PictureCamera } from "#ui/hooks/canvas/use-picture-camera.ts";
import { useTouchPinch } from "#ui/hooks/canvas/use-touch-pinch.ts";
import { typingIn } from "#ui/shell/hooks/use-find-shortcut.ts";
import {
	capturePointer,
	hasTravelled,
	takePointerToDrag,
	type Drag,
} from "#ui/clients/canvas/subjects/pointer-gesture.ts";
import { pickedTarget } from "#ui/clients/canvas/picture/picture-pick.ts";
import { openableAt, tipTargetAt } from "#ui/clients/canvas/subjects/subject-tips.ts";
import { controlAt, subjectAt } from "#ui/clients/canvas/subjects/subjects.ts";

/** What the gestures act on. */
interface DiagramGestureInputs {
	/** The camera a drag moves. */
	readonly camera: PictureCamera;
	/** Where every subject of the picture ended up, which decides what a press landed on. */
	readonly atlas: SemanticAtlas;
	/**
	 * The person picked a subject out, or cleared the selection.
	 * @param id The semantic id, or null.
	 * @param toggle Whether the pick extends the selection.
	 * @param repeated Whether this click follows another, as the second of a double click does.
	 * @param control Whether the click landed on the control that the subject wears.
	 */
	readonly onSelect: (
		id: string | null,
		toggle?: boolean,
		repeated?: boolean,
		control?: boolean,
	) => void;
	/** Select visible subjects in a viewport rectangle; absent retains legacy panning. */
	readonly onSelectArea?: ((area: DiagramBox, toggle: boolean) => void) | undefined;
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
	readonly rectangle: DiagramBox | null;
	readonly keyboard: Pick<HTMLAttributes<HTMLElement>, "onKeyDown">;
	readonly gesture: Gesture;
	readonly pointer: DiagramPointer;
	/** The class of the cursor the canvas shows. */
	readonly cursor: string;
} {
	const { camera, atlas, onSelect, onSelectArea, onHover, dismissTip, openDown } = inputs;
	const [gesture, setGesture] = useState<Gesture>("idle");
	const drag = useRef<CanvasDrag | null>(null);
	const space = useSpacePan(onSelectArea !== undefined);
	// Whether the press under way holds the picture, and whether the pointer rests on a part.
	const [grabbed, setGrabbed] = useState(false);
	const [over, setOver] = useState(false);
	const [rectangle, setRectangle] = useState<DiagramBox | null>(null);
	const dragged = useRef(false);
	// What the last press landed on, carried from pointerup to the click that
	// follows it. A click is the only event that means "the person picked this",
	// and it is the one event whose target cannot be trusted to say what. The
	// box is null when no press is waiting to be spent, which is how a
	// synthesised click is told from a real one.
	const pressed = useRef<{ readonly subject: string | null; readonly control: boolean } | null>(
		null,
	);
	const pinch = useTouchPinch(camera);

	const onPointerDown = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			// A second finger makes the press a pinch, which moves the picture and picks nothing.
			if (pinch.down(event)) {
				drag.current = null;
				setRectangle(null);
				dragged.current = true;
				pressed.current = null;
				setGrabbed(true);
				setGesture("dragging");
				return;
			}
			if (!acceptsButton(event.button, onSelectArea !== undefined)) {
				return;
			}
			if (onSelectArea !== undefined) event.currentTarget.focus({ preventScroll: true });
			const subject = subjectAt(pickedTarget(event), atlas);
			const action = dragAction(event.button, subject, onSelectArea !== undefined, space);
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
				pressed: subject,
				control: controlAt(pickedTarget(event)),
				action,
				space,
				toggle: event.ctrlKey || event.metaKey,
				captured: false,
			};
			dragged.current = false;
			setGrabbed(action === "pan" && grabsAtOnce(event.button, subject, space));
			// A press stops a zoom or an ease where it is, before anything else is decided.
			camera.stop();
			setGesture("pressed");
			dismissTip();
		},
		[atlas, camera, dismissTip, pinch, onSelectArea, space],
	);

	// A press whose end this viewport never saw, so it is over: forgotten, and
	// whatever the press landed on with it, so the next click cannot inherit it.
	const abandon = useCallback((): void => {
		drag.current = null;
		dragged.current = false;
		pressed.current = null;
		setRectangle(null);
		setGesture("idle");
	}, []);

	// One move of a press: a pan once it has travelled, which takes the pointer.
	const panStep = useCallback(
		(started: CanvasDrag, event: PointerEvent<HTMLElement>): void => {
			const panned = dragged.current || hasTravelled(started, event.clientX, event.clientY);
			if (panned && !dragged.current) {
				setGrabbed(true);
				setGesture("dragging");
			}
			dragged.current = panned;
			drag.current = {
				...started,
				x: event.clientX,
				y: event.clientY,
				captured: takePointerToDrag(event, started, panned),
			};
			camera.panBy(event.clientX - started.x, event.clientY - started.y);
		},
		[camera],
	);

	const selectStep = useCallback((started: CanvasDrag, event: PointerEvent<HTMLElement>): void => {
		if (!dragged.current && !hasTravelled(started, event.clientX, event.clientY)) return;
		dragged.current = true;
		setGesture("dragging");
		drag.current = {
			...started,
			x: event.clientX,
			y: event.clientY,
			captured: takePointerToDrag(event, started, true),
		};
		setRectangle(selectionBox(started, event));
	}, []);
	const finishSelection = useCallback(
		(started: CanvasDrag, event: PointerEvent<HTMLElement>): void => {
			if (started.action === "select" && dragged.current)
				onSelectArea?.(selectionBox(started, event), started.toggle);
			setRectangle(null);
		},
		[onSelectArea],
	);

	const hover = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			setOver(takesClick(pickedTarget(event), event.clientY));
			onHover(event);
		},
		[onHover],
	);

	const onPointerMove = useCallback(
		(event: PointerEvent<HTMLElement>): void => {
			if (pinch.move(event)) {
				return;
			}
			const started = drag.current;
			if (started === null) {
				hover(event);
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
				hover(event);
				return;
			}
			if (started.action === "select") selectStep(started, event);
			else panStep(started, event);
		},
		[abandon, hover, panStep, pinch, selectStep],
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
			finishSelection(started, event);
			pressed.current = { subject: started.pressed, control: started.control };
			// The hand moves the picture, so a press with Space picks nothing, even one that stayed put.
			if (started.space) dragged.current = true;
			drag.current = null;
			setGesture("idle");
			if (started.captured) {
				capturePointer(event.currentTarget, event.pointerId, false);
			}
		},
		[pinch, finishSelection],
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
				landed === null ? subjectAt(pickedTarget(event), atlas) : landed.subject,
				event.ctrlKey || event.metaKey,
				event.detail > 1,
				landed === null ? controlAt(pickedTarget(event)) : landed.control,
			);
		},
		[onSelect, atlas],
	);

	// A double-click on a card, or a container's header, opens the model one
	// level down, when it has one.
	const onDoubleClick = useCallback(
		(event: ReactMouseEvent<HTMLElement>): void => {
			if (space || controlAt(pickedTarget(event))) return;
			openDown(openableAt(pickedTarget(event), event.clientY));
		},
		[openDown, space],
	);

	const onKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLElement>): void => {
			if (onSelectArea === undefined || event.code !== "Space") return;
			event.preventDefault();
		},
		[onSelectArea],
	);

	return {
		rectangle,
		keyboard: { onKeyDown },
		gesture,
		cursor: cursorClass({
			held: gesture !== "idle" && grabbed,
			space,
			over,
			selectable: onSelectArea !== undefined,
		}),
		pointer: {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel,
			onClick,
			onDoubleClick,
		},
	};
}

/**
 * Track Space before the pointer gives the canvas keyboard focus.
 * @param enabled Whether this canvas supports primary rectangle selection.
 * @returns The held modifier without changing keyboard actions outside the canvas.
 */
function useSpacePan(enabled: boolean): boolean {
	const [held, setHeld] = useState(false);
	useEffect(() => {
		if (!enabled) return undefined;
		/**
		 * Remember the physical modifier independently of the focused control. A space
		 * typed into a field is a word gap, not a hand.
		 * @param event The keyboard transition.
		 */
		function press(event: KeyboardEvent): void {
			if (event.code === "Space" && !typingIn(event)) setHeld(true);
		}
		/**
		 * Let go of the modifier wherever the key comes up.
		 * @param event The keyboard transition.
		 */
		function lift(event: KeyboardEvent): void {
			if (event.code === "Space") setHeld(false);
		}
		/** Clear a modifier when the browser loses keyboard ownership. */
		function clear(): void {
			setHeld(false);
		}
		window.addEventListener("keydown", press);
		window.addEventListener("keyup", lift);
		window.addEventListener("blur", clear);
		return (): void => {
			window.removeEventListener("keydown", press);
			window.removeEventListener("keyup", lift);
			window.removeEventListener("blur", clear);
		};
	}, [enabled]);
	return held;
}

/**
 * Whether a click on a place picks something: a part with a tip, or a control.
 * A frame's floor has neither, so it stays part of the canvas.
 * @param target What the pointer is over.
 * @param clientY Where the pointer is, down the screen.
 * @returns True when a click does something there.
 */
function takesClick(target: EventTarget | null, clientY: number): boolean {
	return controlAt(target) || tipTargetAt(target, clientY) !== null;
}

/**
 * Whether a pan press holds the picture at once. A plain press on a part can still be a click.
 * @param button The pressed button.
 * @param subject The subject under the press.
 * @param space Whether the reader holds Space.
 * @returns True when nothing but a pan can come of the press.
 */
function grabsAtOnce(button: number, subject: string | null, space: boolean): boolean {
	return button !== 0 || subject === null || space;
}

/**
 * The cursor of a canvas: a hand when a press moves the picture, closed while it
 * holds the picture, and a pointer over what takes a click.
 * @param state What the reader is doing.
 * @param state.held Whether a press holds the picture.
 * @param state.space Whether the reader holds Space.
 * @param state.over Whether the pointer rests on what takes a click.
 * @param state.selectable Whether a drag on empty canvas selects instead of moving the picture.
 * @returns The cursor's class.
 */
function cursorClass(state: {
	readonly held: boolean;
	readonly space: boolean;
	readonly over: boolean;
	readonly selectable: boolean;
}): string {
	if (state.held) return "cursor-grabbing";
	if (state.space) return "cursor-grab";
	if (state.over) return "cursor-pointer";
	return state.selectable ? "cursor-default" : "cursor-grab";
}

/** One pressed pointer with its fixed selection or panning intent. */
interface CanvasDrag extends Drag {
	readonly action: "pan" | "select";
	/** Whether the reader held Space when they pressed. */
	readonly space: boolean;
	readonly toggle: boolean;
	/** Whether the press landed on the control that a subject wears. */
	readonly control: boolean;
}

/**
 * Keep legacy primary panning while canonical readers also accept the middle button.
 * @param button The pressed button.
 * @param selectable Whether canonical selection is enabled.
 * @returns Whether this gesture owner accepts the press.
 */
function acceptsButton(button: number, selectable: boolean): boolean {
	return button === 0 || (button === 1 && selectable);
}

/**
 * Primary dragging selects only from empty canonical canvas.
 * @param button The pressed pointer button.
 * @param subject The subject under the original press.
 * @param selectable Whether the caller supports rectangle selection.
 * @param space Whether the reader holds Space.
 * @returns The fixed action for this pointer gesture.
 */
function dragAction(
	button: number,
	subject: string | null,
	selectable: boolean,
	space: boolean,
): CanvasDrag["action"] {
	return button === 0 && subject === null && selectable && !space ? "select" : "pan";
}

/**
 * Bound a selection rectangle to the visible viewport in CSS pixels.
 * @param started Where the press began.
 * @param event The current pointer position and its viewport.
 * @returns The rectangle shown over the scene.
 */
function selectionBox(started: Drag, event: PointerEvent<HTMLElement>): DiagramBox {
	const room = event.currentTarget.getBoundingClientRect();
	const x1 = Math.max(0, Math.min(room.width, started.fromX - room.left));
	const y1 = Math.max(0, Math.min(room.height, started.fromY - room.top));
	const x2 = Math.max(0, Math.min(room.width, event.clientX - room.left));
	const y2 = Math.max(0, Math.min(room.height, event.clientY - room.top));
	return {
		x: Math.min(x1, x2),
		y: Math.min(y1, y2),
		width: Math.abs(x2 - x1),
		height: Math.abs(y2 - y1),
	};
}

export { useDiagramGestures };
