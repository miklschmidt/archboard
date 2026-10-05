// The parts a surface uses to have the orb: the provider that makes the stage, a
// socket that is a home for the orb, and the host that draws the one orb into the
// stage's holder. The orb is drawn once, by one host; a socket is only a place it
// sits in.

import {
	useLayoutEffect,
	useRef,
	useState,
	type ComponentProps,
	type JSX,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { OrbStageContext, useOrbStage } from "@/ui/voice-orb/hooks/use-orb-stage";
import { VoiceOrb, type VoiceOrbProps } from "@/ui/voice-orb/components/VoiceOrb";
import { createOrbStage, type OrbHome } from "@/ui/voice-orb/lib/orb-stage";

/**
 * The stage the page's orb is drawn on, above every surface that has it.
 * @param props What it holds.
 * @param props.children The surfaces.
 * @returns The surfaces, with a stage.
 */
function OrbStageProvider(props: { readonly children: ReactNode }): JSX.Element {
	const [stage] = useState(createOrbStage);
	useLayoutEffect(() => stage.connect(), [stage]);
	return <OrbStageContext.Provider value={stage}>{props.children}</OrbStageContext.Provider>;
}

/** Inputs for a socket. */
interface OrbSlotProps extends ComponentProps<"span"> {
	/** The home this socket is the place of. */
	readonly home: OrbHome;
}

/**
 * An empty box that is one home's place for the orb. The orb sits in it at rest and
 * is centred in it. It takes the size and the place its surface gives it, which makes
 * it a box: it is a span so that it may sit in a button, as the dock's key is.
 * @param props The home, and what places the box.
 * @returns The socket.
 */
function OrbSlot(props: OrbSlotProps): JSX.Element {
	const { home, ...rest } = props;
	const stage = useOrbStage();
	const socket = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		const element = socket.current;
		return element === null ? undefined : stage.offer(home, element);
	}, [stage, home]);
	return <span {...rest} ref={socket} data-slot="voice-orb-socket" data-home={home} />;
}

/**
 * Draw the page's one orb, into the stage's holder, wherever the holder is.
 * @param props What the orb is told.
 * @returns The orb, drawn through a portal.
 */
function OrbHost(props: VoiceOrbProps): JSX.Element {
	const stage = useOrbStage();
	return createPortal(<VoiceOrb {...props} />, stage.holder);
}

export { OrbHost, OrbSlot, OrbStageProvider, type OrbSlotProps };
