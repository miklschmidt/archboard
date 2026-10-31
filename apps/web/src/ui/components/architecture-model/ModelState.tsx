import { useContext, type JSX, type ReactNode } from "react";
import { Button, cn } from "@archboard/ui-kit/components";
import { ModelDraftContext } from "#ui/state/architecture-model/draft.ts";

/** Inputs for a state. */
interface ModelStateProps {
	readonly slot: string;
	/** Lay the state over a surface that stays mounted under it. */
	readonly cover?: boolean;
	readonly children: ReactNode;
}

/**
 * What a pane shows while it has no picture to show: what stands here, and the one way on.
 * @param props The state's slot and parts.
 * @returns The state, in the middle of the ground.
 */
function ModelState(props: ModelStateProps): JSX.Element {
	return (
		<section
			data-slot={props.slot}
			className={cn(
				"bg-background flex min-h-0 items-center justify-center p-10",
				props.cover === true ? "absolute inset-0 z-10" : "flex-1",
			)}
		>
			<div className="w-[46ch] max-w-full space-y-3">{props.children}</div>
		</section>
	);
}

/**
 * What the state is about.
 * @param props The words.
 * @param props.children The name.
 * @returns The title.
 */
function ModelStateTitle(props: { readonly children: ReactNode }): JSX.Element {
	return <h2 className="font-display text-name break-words uppercase">{props.children}</h2>;
}

/**
 * How it stands.
 * @param props The words.
 * @param props.children The statement.
 * @returns The line.
 */
function ModelStateLine(props: { readonly children: ReactNode }): JSX.Element {
	return <p className="text-control text-muted-foreground font-normal">{props.children}</p>;
}

/**
 * The one way on: it fills the composer, and the reader sends it.
 * @param props The label and the words.
 * @param props.label What the button says.
 * @param props.draft What the composer receives.
 * @returns The action.
 */
function ModelStateAsk(props: { readonly label: string; readonly draft: string }): JSX.Element {
	const fill = useContext(ModelDraftContext);
	return (
		<Button size="sm" data-slot="model-state-ask" onClick={() => fill?.(props.draft)}>
			{props.label}
		</Button>
	);
}

ModelState.Title = ModelStateTitle;
ModelState.Line = ModelStateLine;
ModelState.Ask = ModelStateAsk;

export { ModelState };
