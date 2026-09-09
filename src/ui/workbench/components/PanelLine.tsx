// One state line inside a side panel: a small tone dot and the words. Ordinary
// unavailability and empty states read muted with a grey dot; only a real
// failure gets the destructive dot, and its words stay in the foreground colour
// so the panel never turns red for a state a person cannot act on.

import { cn } from "cn";
import type { JSX, ReactNode } from "react";

/** The tone of a panel line. */
type PanelLineTone = "muted" | "live" | "failure";

/** Inputs for one panel line. */
interface PanelLineProps {
	tone: PanelLineTone;
	children: ReactNode;
	/** Announce changes to assistive technology. */
	live?: boolean;
	className?: string;
}

const DOT_CLASS: Record<PanelLineTone, string> = {
	muted: "bg-muted-foreground/60",
	live: "bg-status",
	failure: "bg-destructive",
};

const TEXT_CLASS: Record<PanelLineTone, string> = {
	muted: "text-muted-foreground",
	live: "text-status-foreground",
	failure: "text-foreground",
};

/**
 * A panel line.
 * @param props The tone and the words.
 * @returns A paragraph with its dot.
 */
function PanelLine(props: PanelLineProps): JSX.Element {
	return (
		<p
			aria-live={props.live === true ? "polite" : undefined}
			className={`text-body flex items-start gap-2 ${TEXT_CLASS[props.tone]} ${props.className ?? ""}`}
		>
			<span
				aria-hidden="true"
				className={cn("mt-[5px] size-1.5 shrink-0 rounded-full", DOT_CLASS[props.tone])}
			/>
			<span className="min-w-0 break-words">{props.children}</span>
		</p>
	);
}

export { PanelLine, type PanelLineProps, type PanelLineTone };
