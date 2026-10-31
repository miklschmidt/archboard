import { useCallback, useMemo, type JSX } from "react";
import { ModelPanel } from "#ui/components/architecture-model/ModelPanel.tsx";
import {
	interfaceCounts,
	type InterfaceCount,
} from "#ui/rules/architecture-model/interface-counts.ts";
import type { ModuleInterface } from "#ui/rules/architecture-model/selected-subject.ts";

/** What the column says of a module's interface. */
interface ModelInterfaceLineProps {
	/** The module's interface facts. */
	readonly inspection: ModuleInterface | undefined;
	/** Every module of the selected state. */
	readonly nodes: Parameters<typeof interfaceCounts>[1];
	/** Show subjects selected on the picture of a module. */
	readonly onShow: (ids: readonly string[], module: string) => void;
	/** Open the interface section of About. */
	readonly onAbout: () => void;
}

/**
 * What a module offers the rest of the model, in one line. A count selects what it counts on the
 * module's own picture, so a reader sees the shape, and the heading holds the way to the whole of
 * it in About.
 * @param props The module and what its line does.
 * @returns The line, or nothing for a module with no parts: it has no interface.
 */
function ModelInterfaceLine(props: ModelInterfaceLineProps): JSX.Element | null {
	const { inspection, nodes, onShow, onAbout } = props;
	const about = useMemo(
		() => (
			<button
				type="button"
				data-slot="model-interface-about"
				onClick={onAbout}
				className="text-body border-border hover:bg-sidebar-accent/50 rounded-control flex h-6 shrink-0 items-center border px-2 transition-colors"
			>
				Open in About
			</button>
		),
		[onAbout],
	);
	if (inspection?.holdsParts !== true) return null;
	const module = inspection.container.id;
	return (
		<ModelPanel.Section title="Interface" slot="model-panel-interface" action={about}>
			<li className="ml-1.5 flex flex-wrap gap-x-0.5">
				{interfaceCounts(inspection, nodes).map((count) => (
					<Count key={count.key} count={count} module={module} onShow={onShow} />
				))}
			</li>
		</ModelPanel.Section>
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
			disabled={count.subjects.length === 0}
			onClick={show}
			className="text-body text-muted-foreground enabled:hover:bg-sidebar-accent enabled:hover:text-foreground rounded-control px-0.5 py-0.5 text-left whitespace-nowrap"
		>
			<span className="text-technical font-mono">{count.count}</span> {count.label}
		</button>
	);
}

export { ModelInterfaceLine };
