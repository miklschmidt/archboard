import { useCallback, useMemo, type JSX } from "react";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import {
	interfaceCounts,
	type InterfaceCount,
} from "#ui/architecture-drawing/model-reader/rules/interface-counts.ts";
import { openModules } from "#ui/architecture-drawing/model-reader/rules/expansion.ts";
import type { Projection } from "#ui/architecture-drawing/model-reader/rules/scene.ts";
import type { ModuleInterface } from "#ui/architecture-drawing/model-reader/rules/selected-subject.ts";

/** What a hidden part is, for a reader who points at the count. */
const HIDDEN_MEANS =
	"Parts that nothing outside this module reaches. They are not in its interface.";

/** What the column says of a module's interface. */
interface ModelInterfaceLineProps {
	/** The module's interface facts. */
	readonly inspection: ModuleInterface | undefined;
	/** The reading it is shown in. */
	readonly projection: Pick<Projection, "complete" | "opened" | "expanded">;
	/** Show subjects selected on the picture of a module. */
	readonly onShow: (ids: readonly string[], module: string) => void;
	/** Open the interface section of About. */
	readonly onAbout: () => void;
}

/**
 * What a module offers the rest of the model, in one line, and the parts it keeps to itself apart
 * from it, because those are its implementation (ADR 0044). A count selects what it counts on the
 * module's own picture, so a reader sees the shape, and the heading holds the way to the whole of
 * it in About.
 * @param props The module and what its line does.
 * @returns The line, or nothing for a module with no parts: it has no interface.
 */
function ModelInterfaceLine(props: ModelInterfaceLineProps): JSX.Element | null {
	const { inspection, projection, onShow, onAbout } = props;
	const about = useMemo(
		() => (
			<button
				type="button"
				data-slot="model-interface-about"
				onClick={onAbout}
				className="text-body quiet-key rounded-control flex h-6 shrink-0 items-center px-2 font-semibold"
			>
				Open in About
			</button>
		),
		[onAbout],
	);
	if (inspection?.holdsParts !== true) return null;
	const module = inspection.container.id;
	const counts = interfaceCounts(inspection, projection.complete.nodes, openModules(projection));
	const line = { module, onShow };
	return (
		<>
			<ModelPanel.Section title="Interface" slot="model-panel-interface" action={about}>
				<Counts {...line} counts={counts} hidden={false} />
			</ModelPanel.Section>
			<ModelPanel.Section title="Implementation" slot="model-panel-implementation">
				<Counts {...line} counts={counts} hidden />
			</ModelPanel.Section>
		</>
	);
}

/**
 * The counts of one section, on one line.
 * @param props The counts and what they do.
 * @param props.counts Every count of the module.
 * @param props.hidden Whether this section shows its hidden parts, or the rest.
 * @param props.module The module they belong to.
 * @param props.onShow Show subjects selected on the module's picture.
 * @returns The line.
 */
function Counts(props: {
	readonly counts: readonly InterfaceCount[];
	readonly hidden: boolean;
	readonly module: string;
	readonly onShow: ModelInterfaceLineProps["onShow"];
}): JSX.Element {
	const { hidden, module, onShow } = props;
	return (
		<li className="grid grid-cols-2 gap-1">
			{props.counts
				.filter(({ key }) => (key === "hiddenParts") === hidden)
				.map((count) => (
					<Count key={count.key} count={count} module={module} onShow={onShow} />
				))}
		</li>
	);
}

/**
 * What a count counts, and the count in the mono face at the end of its well, as the site's
 * inspector sets it.
 * @param props The count.
 * @param props.count How many.
 * @param props.label What of.
 * @returns The words.
 */
function CountWords(props: { readonly count: number; readonly label: string }): JSX.Element {
	const { count, label } = props;
	return (
		<>
			<span className="truncate">{`${label.charAt(0).toUpperCase()}${label.slice(1)}`}</span>
			<span className="text-foreground font-mono text-[12px] leading-4">{count}</span>
		</>
	);
}

/**
 * One count, which shows what it counts. Nothing is there to show for a count of none.
 * @param props The count and what it does.
 * @param props.count The count.
 * @param props.module The module it belongs to.
 * @param props.onShow Show subjects selected on the module's picture.
 * @returns The count.
 */
function Count(props: {
	readonly count: InterfaceCount;
	readonly module: string;
	readonly onShow: ModelInterfaceLineProps["onShow"];
}): JSX.Element {
	const { count, module, onShow } = props;
	const show = useCallback((): void => onShow(count.subjects, module), [onShow, count, module]);
	return (
		<button
			type="button"
			data-measure={count.key}
			data-count={count.count}
			title={count.key === "hiddenParts" ? HIDDEN_MEANS : undefined}
			disabled={count.subjects.length === 0}
			onClick={show}
			className="text-body text-muted-foreground bg-tray-sink shadow-well enabled:hover:text-foreground enabled:hover:bg-face/60 rounded-control flex min-w-0 items-baseline justify-between gap-2 px-2 py-1.5 text-left whitespace-nowrap disabled:opacity-70"
		>
			<CountWords count={count.count} label={count.label} />
		</button>
	);
}

export { ModelInterfaceLine };
