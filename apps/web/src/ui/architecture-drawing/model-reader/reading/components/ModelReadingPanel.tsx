// The right panel of a reading, as the reading fills it: what is selected, or else what is open,
// and what touches it, over the legend and the foot. While About is open, the outline of About
// stands in place of the subject.

import { useCallback, useMemo, type JSX, type ReactNode } from "react";
import type { activateCodeTarget } from "@archboard/code-opener/code-target";
import { scopeHead } from "#ui/architecture-drawing/model-reader/reading/components/ModelAbout.tsx";
import {
	ModelCodeDetails,
	ModelCodeWarnings,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx";
import { ModelFlowHead } from "#ui/architecture-drawing/model-reader/reading/components/ModelFlowHead.tsx";
import { ModelInterfaceLine } from "#ui/architecture-drawing/model-reader/reading/components/ModelInterfaceLine.tsx";
import { ModelLegend } from "#ui/architecture-drawing/model-reader/reading/components/ModelLegend.tsx";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import { ModelPanelContext } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanelContext.tsx";
import { ModelPanelExpanded } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanelExpanded.tsx";
import {
	ModelPanelActions,
	ModelPanelScope,
	ModelPanelSubject,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelPanelSubject.tsx";
import {
	ReadingExplain,
	SelectionControls,
	type SelectionActions,
} from "#ui/architecture-drawing/model-reader/reading/components/ModelReadingControls.tsx";
import { ModelStateStanding } from "#ui/architecture-drawing/model-reader/reading/components/ModelStateDetails.tsx";
import { useHistoryOnSelection } from "#ui/architecture-drawing/model-reader/reading/hooks/use-history-on-selection.ts";
import { useModelCodeFindings } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { useShowSubject } from "#ui/architecture-drawing/model-reader/reading/hooks/use-show-subject.ts";
import { useSceneAppearances } from "#ui/architecture-drawing/model-reader/reading/hooks/use-scene-appearances.ts";
import {
	kindLookOf,
	type KindLook,
} from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { flowCollections } from "#ui/architecture-drawing/model-reader/rules/flow-reading.ts";
import { claimsOn } from "#ui/architecture-drawing/model-reader/rules/claimed-subjects.ts";
import { selectedSubject } from "#ui/architecture-drawing/model-reader/rules/selected-subject.ts";

/** What a flow reading filters: nothing, because it keeps its whole exchange. */
const NO_FILTERS = {};

/** No agent claims what the panel explains. */
const NO_CLAIMS: readonly string[] = [];

/**
 * What the marks of the picture on screen mean.
 * @param props The reader and how kinds look.
 * @param props.reader The reader.
 * @param props.look How the vault's kinds look.
 * @returns The legend.
 */
function ReadingLegend(props: { readonly reader: Reader; readonly look: KindLook }): JSX.Element {
	const { accepted, location, selection } = props.reader;
	const { shown, scene } = accepted;
	const picture = scene?.picture.legend ?? null;
	return (
		<ModelLegend
			model={shown.model}
			projection={shown.projection}
			picture={picture}
			look={props.look}
			filters={location.grammar === "architecture" ? location.filters : NO_FILTERS}
			onToggle={location.toggleFilter}
			onShowAll={location.showAllKinds}
			selection={selection}
		/>
	);
}

/**
 * What touches what the panel explains.
 * @param props The reader and the selection.
 * @param props.reader The reader.
 * @param props.selected What the panel explains.
 * @returns The lists.
 */
function ReadingContext(props: {
	readonly reader: Reader;
	readonly selected: ReadonlySet<string>;
}): JSX.Element {
	const { accepted, choices } = props.reader;
	const { model, projection, reading } = accepted.shown;
	return (
		<ModelPanelContext
			model={model}
			projection={projection}
			selected={props.selected}
			flow={reading.grammar === "architecture" ? null : reading.flow}
			onFlow={choices.chooseFlow}
			onWalkthrough={choices.findWalkthrough}
		/>
	);
}

/** What the right panel of a reading holds. */
interface ReadingPanelProps {
	readonly reader: Reader;
	readonly paneId: string;
	readonly onCodeTargetNotice: Parameters<typeof activateCodeTarget>[0]["onNotice"];
	readonly code: ReturnType<typeof useModelCodeFindings>;
	readonly actions: SelectionActions;
	readonly onReveal: () => void;
	/** Open the interface section of About. */
	readonly onAbout: () => void;
	/** Hold the slot that About puts its outline in, at the top of the panel while About is open. */
	readonly outlineSlot: (slot: HTMLElement | null) => void;
}

/**
 * The column beside the picture: what is selected, or else what is open, and what touches it, then
 * the legend, which ends the scroll under every subject, so a reader finds it in one place and a new
 * subject neither redraws it nor takes a group's tag from under the pointer. The foot under them
 * holds what can be done. While About lies over the picture, the outline of About stands in place of
 * the subject, and the page names its subject itself.
 * @param props The reader and what the panel explains.
 * @returns The panel.
 */
function ModelReadingPanel(props: ReadingPanelProps): JSX.Element {
	const { reader, code } = props;
	const { accepted, selection, tree, location, choices } = reader;
	const { shown } = accepted;
	const { model, projection } = shown;
	const scope = projection.opened;
	const ids = selectionToExplain(selection.ids, accepted.selected);
	useHistoryOnSelection(reader.vault, model, ids);
	const held = useMemo(() => ({ ...selection, ids }), [selection, ids]);
	const selecting = ids.size > 0;
	const key = [scope, ...ids].join();
	const pathOf = useCallback((id: string) => tree.owner.get(id)?.path, [tree]);
	const head = scopeHead({ model, scope, tree, projection });
	const appearances = useSceneAppearances(accepted.scene);
	const look = useMemo(() => kindLookOf(model.policy, appearances), [model.policy, appearances]);
	const legend = useMemo(() => <ReadingLegend reader={reader} look={look} />, [reader, look]);
	const context = <ReadingContext reader={reader} selected={ids} />;
	const { flow, reference } = projection;
	const { grammar, selectGrammar } = location;
	const { claimed } = reader;
	// The badge names the selection, or the flow or module that the head shows.
	const claims = useMemo(() => {
		if (!selecting) {
			const subject = flow?.id ?? scope;
			return subject === null ? NO_CLAIMS : claimsOn(claimed, [subject]);
		}
		const subject = selectedSubject({ model, projection, ids });
		return claimsOn(claimed, subject.kind === "flow" ? [...ids, subject.flow.id] : ids);
	}, [selecting, claimed, model, projection, ids, scope, flow]);
	const flowHead = useMemo(
		() =>
			flow === null ? undefined : (
				<ModelFlowHead
					flow={flow}
					collection={flowCollections(model, reference).get(flow.id)}
					grammar={grammar}
					onGrammar={selectGrammar}
				/>
			),
		[flow, model, reference, grammar, selectGrammar],
	);
	const { onAbout } = props;
	const onShow = useShowSubject(reader);
	const { onPage } = reader;
	const openAbout = useCallback((): void => onPage("about"), [onPage]);
	const line = useMemo(() => ({ onShow: choices.showHere, onAbout }), [choices.showHere, onAbout]);
	const subject = {
		vault: reader.vault,
		paneId: props.paneId,
		onCodeTargetNotice: props.onCodeTargetNotice,
		model,
		projection,
		selection: held,
		scope,
		onOpen: reader.onOpen,
		onToggle: reader.onToggle,
		onReveal: props.onReveal,
		onRevealFlow: reader.openFlow,
		code: code.reading,
		pathOf,
		context,
		flowHead,
		line,
		look,
	};
	const { outlineSlot } = props;
	const about = reader.page === "about";
	return (
		<ModelPanel selecting={selecting} onClose={about ? undefined : selection.clear}>
			<PanelScroll
				outlineSlot={about ? outlineSlot : undefined}
				subject={key}
				claims={claims}
				under={legend}
			>
				{selecting ? (
					<ModelPanelSubject {...subject} />
				) : (
					<ModelPanelScope
						name={head.name}
						kind={head.kind}
						path={head.path}
						look={look}
						description={head.description ?? head.lead}
						flowHead={flowHead}
					>
						<ModelInterfaceLine
							{...line}
							inspection={projection.inspection}
							projection={projection}
						/>
						<ModelPanelExpanded
							model={model}
							projection={projection}
							selection={held}
							onToggle={reader.onToggle}
						/>
						<ModelCodeDetails reading={code.reading} selected={ids} scope={scope} />
						<ModelStateStanding model={model} onOpen={openAbout} />
						{context}
					</ModelPanelScope>
				)}
			</PanelScroll>
			<ModelPanel.Foot>
				<ModelCodeWarnings reading={code.reading} onSelect={onShow} quiet />
				{selecting ? (
					<ModelPanelActions {...subject}>
						<SelectionControls {...props.actions} />
					</ModelPanelActions>
				) : (
					<ReadingExplain {...props.actions} />
				)}
			</ModelPanel.Foot>
		</ModelPanel>
	);
}

/**
 * What scrolls in the panel, over what stands under every subject: the subject, or while About is
 * open the slot that About puts its outline in.
 * @param props The subject, or the slot.
 * @param props.outlineSlot Hold the slot of the outline, while About is open.
 * @param props.subject What names the subject.
 * @param props.claims The purposes of the claims that hold the subject.
 * @param props.under What stands under every subject.
 * @param props.children What the panel says of the subject.
 * @returns The region that scrolls.
 */
function PanelScroll(props: {
	readonly outlineSlot: ((slot: HTMLElement | null) => void) | undefined;
	readonly subject: string;
	readonly claims: readonly string[];
	readonly under: ReactNode;
	readonly children: ReactNode;
}): JSX.Element {
	const { outlineSlot, subject } = props;
	if (outlineSlot !== undefined)
		return (
			<ModelPanel.Scroll subject="about" under={props.under}>
				<div ref={outlineSlot} data-slot="model-panel-outline" className="empty:hidden" />
			</ModelPanel.Scroll>
		);
	return (
		<ModelPanel.Scroll subject={subject} under={props.under}>
			<ModelPanel.Subject key={subject} claims={props.claims}>
				{props.children}
			</ModelPanel.Subject>
		</ModelPanel.Scroll>
	);
}

/**
 * What the panel explains. A selection that comes with a move explains the picture it comes with,
 * so the panel waits for that picture, and a selection let go leaves at once.
 * @param ids The selected identities.
 * @param shown The selection of the picture on show.
 * @returns The identities.
 */
function selectionToExplain(
	ids: ReadonlySet<string>,
	shown: ReadonlySet<string>,
): ReadonlySet<string> {
	return ids.size === 0 ? ids : shown;
}

export { ModelReadingPanel };
