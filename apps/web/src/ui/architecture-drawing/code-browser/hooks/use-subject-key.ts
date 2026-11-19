import { useCallback, useLayoutEffect, useRef } from "react";

/** What a key of the code view does with its subject. */
interface SubjectKeyActions {
	/** Show the subject in the picture and select it. */
	readonly onShow: (subject: string) => void;
	/** Light a subject in the picture, or null for none. */
	readonly onPoint: (subject: string | null) => void;
}

/**
 * The handlers of a key that stands for one subject: a press shows it in the picture, and the
 * pointer or the keys resting on it light it there.
 * @param subject The subject.
 * @param actions What the code view does with subjects.
 * @returns The handlers, to spread on the key.
 */
function useSubjectKey(subject: string, actions: SubjectKeyActions) {
	const { onShow, onPoint } = actions;
	const attention = useRef({ hovered: false, focused: false });
	const onClick = useCallback((): void => onShow(subject), [onShow, subject]);
	const onPointerEnter = useCallback((): void => {
		attention.current.hovered = true;
		onPoint(subject);
	}, [onPoint, subject]);
	const onPointerLeave = useCallback((): void => {
		attention.current.hovered = false;
		if (!attention.current.focused) onPoint(null);
	}, [onPoint]);
	const onFocus = useCallback((): void => {
		attention.current.focused = true;
		onPoint(subject);
	}, [onPoint, subject]);
	const onBlur = useCallback((): void => {
		attention.current.focused = false;
		if (!attention.current.hovered) onPoint(null);
	}, [onPoint]);
	useLayoutEffect(() => {
		const key = attention.current;
		return () => {
			if (key.focused || key.hovered) onPoint(null);
		};
	}, [onPoint]);
	return { onClick, onPointerEnter, onPointerLeave, onFocus, onBlur };
}

export { useSubjectKey, type SubjectKeyActions };
