import {
	RiCodeSSlashLine,
	RiGitCommitLine,
	RiStackLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, useMemo, useRef, useState, type JSX } from "react";
import { Dialog, Tabs } from "@archboard/ui-kit/components";
import { ModelCodeEvidence } from "#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx";
import { ModelMeasures } from "#ui/architecture-drawing/model-reader/reading/components/ModelMeasures.tsx";
import type { Reader } from "#ui/architecture-drawing/model-reader/hooks/use-reader.ts";
import { useCodeCheck } from "#ui/architecture-drawing/model-reader/reading/hooks/use-code-check.ts";
import { useModelCodeFindings } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import { useSceneAppearances } from "#ui/architecture-drawing/model-reader/reading/hooks/use-scene-appearances.ts";
import { useShowSubject } from "#ui/architecture-drawing/model-reader/reading/hooks/use-show-subject.ts";
import type {
	MeasureKey,
	MeasureView,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-measures.ts";
import { kindLookOf } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";

/** The three views of the dialog. */
type MeasuresTab = "code" | "interface" | "changes";

/** Each view as the selector offers it: an icon, a label and a line that says what it shows. */
const TABS: readonly {
	readonly value: MeasuresTab;
	readonly Icon: RemixiconComponentType;
	readonly label: string;
	readonly gloss: string;
}[] = [
	{
		value: "code",
		Icon: RiCodeSSlashLine,
		label: "Where the map and the code disagree",
		gloss: "Broken bindings, backwards lines, missing calls",
	},
	{
		value: "interface",
		Icon: RiStackLine,
		label: "What a module exposes",
		gloss: "Entry points, hidden parts and callers",
	},
	{
		value: "changes",
		Icon: RiGitCommitLine,
		label: "What changes together",
		gloss: "Each commit, read through the modules it touched",
	},
];

/** The columns of the table of what a module exposes, in their order. */
const EXPOSES: readonly MeasureKey[] = [
	"entryPoints",
	"hiddenParts",
	"passThrough",
	"callers",
	"wholeModule",
];

/** The columns of the table of what changes together, in their order. */
const TOGETHER: readonly MeasureKey[] = ["together", "unjoined", "commits"];

/** Each table as a reader first finds it: sorted by its first column, the most first. */
const EXPOSES_VIEW: MeasureView = { measure: "entryPoints", fewest: false, show: "all" };
const TOGETHER_VIEW: MeasureView = { measure: "together", fewest: false, show: "all" };

/**
 * A panel of a table, which hands its height on to the table so the rows scroll under the head.
 * A panel that leaves stays a moment with the `hidden` attribute, and it takes no room meanwhile.
 */
const PANEL = "flex min-h-0 flex-col [&[hidden]]:hidden";

/** Inputs for the dialog. */
interface ModelMeasuresDialogProps {
	readonly reader: Reader;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

/** A module a row chose, which waits for the dialog to go. */
interface Choice {
	readonly id: string;
	readonly beside: boolean;
}

/**
 * Measures: the checks of the reading on screen against its code and its history, in one dialog
 * drawn from the site. The site's content selector stands at its head, and each of its three views
 * reads only when it is open. The dialog keeps its view and the sort of each table while it is
 * away. A row of a table selects its module on its picture once the dialog has gone, as Find does,
 * so the keys go on from the picture, and a step of the findings selects its subject at once.
 * @param props The reader, and whether the dialog is open.
 * @returns The dialog.
 */
function ModelMeasuresDialog(props: ModelMeasuresDialogProps): JSX.Element {
	const { reader, open, onOpenChange } = props;
	const [tab, setTab] = useState<MeasuresTab>("code");
	const [exposes, setExposes] = useState(EXPOSES_VIEW);
	const [together, setTogether] = useState(TOGETHER_VIEW);
	const chosen = useRef<Choice | null>(null);
	const { findModule } = reader.choices;
	const { onDiagram } = reader;
	const choose = useCallback(
		(id: string, beside: boolean): void => {
			chosen.current = { id, beside };
			if (!beside) onDiagram();
			onOpenChange(false);
		},
		[onDiagram, onOpenChange],
	);
	// Base UI asks where the focus goes after the dialog has gone, so the choice stays until the
	// dialog opens again, and the focus stays on the picture that the choice moved it to.
	const settle = useCallback(
		(stillOpen: boolean): void => {
			const choice = chosen.current;
			if (stillOpen) chosen.current = null;
			else if (choice !== null) findModule(choice.id, choice.beside);
		},
		[findModule],
	);
	const returnsFocus = useCallback((): boolean => chosen.current === null, []);
	const changeTab = useCallback((value: unknown): void => {
		const next = TABS.find((one) => one.value === value);
		if (next !== undefined) setTab(next.value);
	}, []);
	return (
		<Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={settle}>
			<Dialog.Content
				data-slot="model-measures-dialog"
				finalFocus={returnsFocus}
				className="flex h-[min(880px,calc(100vh-4rem))] flex-col gap-4 sm:max-w-[1180px]"
			>
				<Dialog.Header>
					<Dialog.Title>Measures</Dialog.Title>
					<Dialog.Description className="sr-only">
						Where the model and its code disagree, what each module exposes, and what changes
						together, for the reading on screen.
					</Dialog.Description>
				</Dialog.Header>
				<Tabs value={tab} onValueChange={changeTab} className="min-h-0 flex-1 gap-4">
					<Tabs.List variant="selector" aria-label="Measures">
						{TABS.map(({ value, Icon, label, gloss }) => (
							<Tabs.Trigger key={value} value={value} data-measures-tab={value}>
								<Icon aria-hidden="true" className="mt-px" />
								<span className="flex flex-col gap-1">
									<span className="text-title">{label}</span>
									<span className="text-body text-muted-foreground font-normal">{gloss}</span>
								</span>
							</Tabs.Trigger>
						))}
					</Tabs.List>
					<Tabs.Content value="code" className={PANEL}>
						<CodePanel reader={reader} />
					</Tabs.Content>
					<Tabs.Content value="interface" className={PANEL}>
						<MeasuresPanel
							reader={reader}
							label="What a module exposes"
							keys={EXPOSES}
							view={exposes}
							onView={setExposes}
							onChoose={choose}
						/>
					</Tabs.Content>
					<Tabs.Content value="changes" className={PANEL}>
						<MeasuresPanel
							reader={reader}
							label="What changes together"
							keys={TOGETHER}
							view={together}
							onView={setTogether}
							onChoose={choose}
						/>
					</Tabs.Content>
				</Tabs>
			</Dialog.Content>
		</Dialog>
	);
}

/**
 * The findings of the pass that read the reading on screen. Opening the view starts a pass over the
 * reading when no remembered pass read it.
 * @param props The reader.
 * @param props.reader The reader.
 * @returns The findings.
 */
function CodePanel(props: { readonly reader: Reader }): JSX.Element {
	const { reader } = props;
	const { shown } = reader.accepted;
	const { reading, read } = useModelCodeFindings(reader.vault, shown.model);
	const check = useCodeCheck(reader.vault, shown.model, { read, matched: reading !== null });
	const onShow = useShowSubject(reader);
	return (
		<ModelCodeEvidence
			vault={reader.vault}
			reading={reading}
			check={check}
			ends={shown.projection.complete}
			onShow={onShow}
		/>
	);
}

/**
 * One table of counts, over the reading on screen.
 * @param props The reader, the table's columns, how it stands and what a row does.
 * @returns The table.
 */
function MeasuresPanel(
	props: Pick<
		Parameters<typeof ModelMeasures>[0],
		"label" | "keys" | "view" | "onView" | "onChoose"
	> & { readonly reader: Reader },
): JSX.Element {
	const { reader, ...table } = props;
	const { shown, scene } = reader.accepted;
	const appearances = useSceneAppearances(scene);
	const look = useMemo(
		() => kindLookOf(shown.model.policy, appearances),
		[shown.model.policy, appearances],
	);
	return (
		<ModelMeasures
			{...table}
			vault={reader.vault}
			model={shown.model}
			projection={shown.projection}
			look={look}
			selected={soleOf(reader.selection.ids)}
		/>
	);
}

/**
 * The module the reader has selected, when it is one alone.
 * @param ids The selected identities.
 * @returns The identity, or null.
 */
function soleOf(ids: ReadonlySet<string>): string | null {
	const [only, other] = ids;
	return other === undefined ? (only ?? null) : null;
}

export { ModelMeasuresDialog };
