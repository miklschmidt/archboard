import { RiSearchLine } from "@remixicon/react";
import {
	useCallback,
	useMemo,
	useRef,
	type JSX,
	type KeyboardEvent,
	type PointerEvent,
} from "react";

import { Command, Dialog, IconButton, usesCommandKey } from "@archboard/ui-kit/components";
import { useFindShortcut } from "#ui/hooks/shell/use-find-shortcut.ts";
import { findInModel, type FindHit, type FindKind } from "#ui/rules/architecture-model/search.ts";

/** What a hit is called, for a hit that is not a module. */
const KIND_WORDS: Readonly<Record<FindKind, string | null>> = {
	module: null,
	flow: "Flow",
	walkthrough: "Walkthrough",
	bookmark: "Bookmark",
	address: "Former address",
};

/** Inputs for Find. */
interface ModelFindProps {
	/** The complete selected architecture, including hidden descendants. */
	readonly model: Parameters<typeof findInModel>[0];
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly query: string;
	readonly onQuery: (query: string) => void;
	/**
	 * The person chose a hit.
	 * @param hit What they chose.
	 * @param beside Whether it opens in the other pane.
	 */
	readonly onChoose: (hit: FindHit, beside: boolean) => void;
}

/**
 * One thing found: its name, and where it is or what it is.
 * @param props The hit and what choosing it does.
 * @param props.hit The hit.
 * @param props.onChoose Choose it.
 * @returns The result.
 */
function Result(props: {
	readonly hit: FindHit;
	readonly onChoose: (hit: FindHit) => void;
}): JSX.Element {
	const { hit, onChoose } = props;
	const choose = useCallback((): void => onChoose(hit), [onChoose, hit]);
	const detail = [KIND_WORDS[hit.kind], hit.detail].filter(Boolean).join(" · ");
	return (
		<Command.Item
			value={`${hit.kind}:${hit.id}`}
			data-find-kind={hit.kind}
			data-find-id={hit.id}
			onSelect={choose}
		>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="text-control truncate" title={hit.name}>
					{hit.name}
				</span>
				{detail !== "" && (
					<span className="text-body text-muted-foreground truncate" title={detail}>
						{detail}
					</span>
				)}
			</span>
		</Command.Item>
	);
}

/**
 * The palette that finds anything a reading can open, and the button that brings it up.
 * @param props The architecture and what a choice does.
 * @returns The button and the palette.
 */
function ModelFind(props: ModelFindProps): JSX.Element {
	const { model, open, onOpenChange, query, onQuery, onChoose } = props;
	const bringUp = useCallback((): void => onOpenChange(true), [onOpenChange]);
	useFindShortcut(bringUp);
	// cmdk says only what was chosen, and Alt opens a choice in the other pane.
	const beside = useRef(false);
	// A choice waits for the palette to go, because the palette holds the keys until it has gone.
	const chosen = useRef<{ readonly hit: FindHit; readonly beside: boolean } | null>(null);
	const noteKeys = useCallback((event: KeyboardEvent | PointerEvent): void => {
		beside.current = event.altKey;
	}, []);
	const results = useMemo(() => findInModel(model, query), [model, query]);
	const change = useCallback(
		(next: boolean): void => {
			if (!next) onQuery("");
			onOpenChange(next);
		},
		[onQuery, onOpenChange],
	);
	const choose = useCallback(
		(hit: FindHit): void => {
			chosen.current = { hit, beside: beside.current };
			change(false);
		},
		[change],
	);
	const settle = useCallback(
		(stillOpen: boolean): void => {
			const choice = chosen.current;
			if (stillOpen || choice === null) return;
			chosen.current = null;
			onChoose(choice.hit, choice.beside);
		},
		[onChoose],
	);
	const returnsFocus = useCallback((): boolean => chosen.current === null, []);
	return (
		<>
			<IconButton
				label="Find"
				slot="model-find-open"
				shortcut={usesCommandKey() ? "⌘K" : "Ctrl K"}
				onClick={bringUp}
			>
				<RiSearchLine />
			</IconButton>
			<Dialog open={open} onOpenChange={change} onOpenChangeComplete={settle}>
				<Dialog.Content
					showCloseButton={false}
					finalFocus={returnsFocus}
					className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0"
				>
					<Dialog.Header className="sr-only">
						<Dialog.Title>Find in this architecture</Dialog.Title>
						<Dialog.Description>
							Find a module, a flow, a walkthrough, a bookmark or a former address.
						</Dialog.Description>
					</Dialog.Header>
					<Command
						data-slot="model-find"
						label="Found in this architecture"
						shouldFilter={false}
						onKeyDownCapture={noteKeys}
						onPointerDownCapture={noteKeys}
					>
						<Command.Input
							value={query}
							onValueChange={onQuery}
							placeholder="Find"
							aria-label="Find in this architecture"
						/>
						{query.trim().length > 0 && (
							<Command.List>
								<Command.Empty>Nothing matches.</Command.Empty>
								{results.map((hit) => (
									<Result key={`${hit.kind}:${hit.id}`} hit={hit} onChoose={choose} />
								))}
							</Command.List>
						)}
					</Command>
				</Dialog.Content>
			</Dialog>
		</>
	);
}

export { ModelFind };
