// The code exports of the open module on its About page (TASK-646.08): what the last code pass
// over this version of the reading counted, by kind, each name with its findings. A row opens the
// export's own source. The page reads the names of this module alone, and never starts a pass.

import {
	RiCodeBoxLine,
	RiCornerDownRightLine,
	RiFunctionLine,
	RiHashtag,
	RiTBoxLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import { useCallback, useMemo, type JSX, type ReactNode } from "react";
import { activateCodeTarget } from "@archboard/code-opener/code-target";
import { Badge, cn } from "@archboard/ui-kit/components";
import { rowTone } from "#ui/shell/rules/row-tone.ts";
import { CheckedAt } from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";
import {
	SEVERITY_WORDS,
	findingName,
} from "#ui/architecture-drawing/model-reader/reading/components/CodeFindingCard.tsx";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import { useCodeExports } from "#ui/architecture-drawing/model-reader/reading/code-exports/hooks/use-code-exports.ts";
import {
	exportCount,
	exportList,
	type ExportKind,
	type ListedExport,
} from "#ui/architecture-drawing/model-reader/reading/code-exports/rules/export-list.ts";
import type { ModelCodeReading } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import {
	codeByModule,
	type ModuleCode,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-code.ts";

type Notice = Parameters<typeof activateCodeTarget>[0]["onNotice"];

/** The icon of each kind's list. */
const KIND_ICONS = {
	function: RiFunctionLine,
	class: RiCodeBoxLine,
	method: RiCornerDownRightLine,
	value: RiHashtag,
	type: RiTBoxLine,
} as const satisfies Readonly<Record<ExportKind["kind"], RemixiconComponentType>>;
type Finding = ModelCodeReading["findings"][number];

/** Inputs for the code exports of one module. */
interface CodeExportsProps {
	readonly vault: string;
	readonly module: string;
	/** The pass that read the reading on screen, or null when none did. */
	readonly reading: ModelCodeReading | null;
	/** Where an open of code tells what went wrong. */
	readonly onNotice: Notice;
}

/**
 * The code exports of a module, or why the page has none to list.
 * @param props The module and the pass on screen.
 * @returns The list, or the words that stand in its place.
 */
function CodeExports(props: CodeExportsProps): JSX.Element {
	const { reading, module } = props;
	const code = useMemo(
		() => (reading === null ? undefined : codeByModule(reading).get(module)),
		[reading, module],
	);
	if (reading === null)
		return (
			<Words slot="code-exports-unread">
				No code check read this version of the reading. The first view of Measures runs one.
			</Words>
		);
	if (code === undefined)
		return (
			<Words slot="code-exports-unmeasured">The last code check did not measure this module.</Words>
		);
	if (code.kind === "skipped")
		return (
			<Words slot="code-exports-skipped">
				The code check did not judge this module: {code.words}.
			</Words>
		);
	return <ReadExports {...props} reading={reading} code={code} />;
}

/**
 * The exports of a module the pass read: when it ran, what it did not read, its findings on the
 * module, then the names by kind.
 * @param props The module, the pass and what it says of the module.
 * @returns The list.
 */
function ReadExports(
	props: CodeExportsProps & {
		readonly reading: ModelCodeReading;
		readonly code: Extract<ModuleCode, { kind: "read" }>;
	},
): JSX.Element {
	const { vault, reading, module, code } = props;
	const counted = exportCount(code.exports) > 0;
	const query = useCodeExports(vault, reading, module, counted);
	const list = useMemo(
		() =>
			exportList(query.data?.names ?? [], reading.findings, {
				id: module,
				directory: query.data?.directory ?? "",
			}),
		[query.data, reading.findings, module],
	);
	return (
		<div data-slot="code-exports" className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<CheckedAt checkedAt={reading.checkedAt} />
				{code.partial.length > 0 && (
					<p data-slot="code-exports-partial" className="text-body text-muted-foreground">
						Read in part: {code.partial.join(", ")}.
					</p>
				)}
			</div>
			{list.rollUp.length > 0 && <RollUp findings={list.rollUp} />}
			<ExportsBody {...props} counted={counted} query={query} kinds={list.kinds} />
		</div>
	);
}

/**
 * The names by kind, or what stands in their place: no export to read, the read under way, or why
 * it gave none.
 * @param props The read and the lists it gives.
 * @returns The lists, or the words.
 */
function ExportsBody(
	props: CodeExportsProps & {
		readonly counted: boolean;
		readonly query: ReturnType<typeof useCodeExports>;
		readonly kinds: readonly ExportKind[];
	},
): JSX.Element {
	const { counted, query } = props;
	if (!counted)
		return <Words slot="code-exports-none">The code check counted no export of this module.</Words>;
	if (query.isPending) return <Words slot="code-exports-reading">Reading the exports…</Words>;
	if (query.isError)
		return (
			<Words slot="code-exports-unavailable">
				The exports could not be read: {query.error.message}
			</Words>
		);
	if (query.data === null)
		return (
			<Words slot="code-exports-unavailable">
				The server no longer remembers this code check. Run it again to list the exports.
			</Words>
		);
	const { repo } = query.data;
	return (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-x-12 gap-y-6">
			{props.kinds.map((kind) => (
				<KindList
					key={kind.kind}
					kind={kind}
					vault={props.vault}
					repo={repo}
					onNotice={props.onNotice}
				/>
			))}
		</div>
	);
}

/**
 * The findings on the exports as a whole: the roll-up of a shallow module, and an undeclared interface.
 * @param props The findings.
 * @param props.findings The findings.
 * @returns Each with its chip and its words.
 */
function RollUp(props: { readonly findings: readonly Finding[] }): JSX.Element {
	return (
		<ul data-slot="code-exports-module" className="flex flex-col gap-2">
			{props.findings.map((finding) => (
				<li key={`${finding.code}:${finding.message}`} className="flex items-baseline gap-2">
					<FindingChip finding={finding} />
					<span className="text-body text-muted-foreground">{finding.message}</span>
				</li>
			))}
		</ul>
	);
}

/** Inputs for the list of one kind. */
interface KindListProps {
	readonly kind: ExportKind;
	readonly vault: string;
	/** The repository the exports' paths are in. */
	readonly repo: string;
	readonly onNotice: Notice;
}

/**
 * The exports of one kind. A long list shows its first rows and offers the rest, and the methods
 * stand under their classes.
 * @param props The kind and where its code is.
 * @returns The list.
 */
function KindList(props: KindListProps): JSX.Element {
	const { kind } = props;
	return (
		<div data-export-kind={kind.kind}>
			<ModelPanel.Section
				icon={KIND_ICONS[kind.kind]}
				title={kind.label}
				count={kind.exports.length}
				slot="code-export-kind"
			>
				<ModelPanel.Rows
					items={kind.exports}
					groupOf={kind.kind === "method" ? ownerOf : undefined}
				>
					{(entry) => <ExportRow key={entry.name} {...props} entry={entry} />}
				</ModelPanel.Rows>
			</ModelPanel.Section>
		</div>
	);
}

/**
 * The class a method belongs to, which groups its rows.
 * @param entry The method.
 * @returns Its class.
 */
function ownerOf(entry: ListedExport): string {
	return entry.owner ?? "";
}

/**
 * One export, which opens its own source: its name and findings, and where it is.
 * @param props The export and where its code is.
 * @returns The row.
 */
function ExportRow(props: KindListProps & { readonly entry: ListedExport }): JSX.Element {
	const { entry, vault, repo, onNotice } = props;
	const { name, path, line, file } = entry;
	const open = useCallback((): void => {
		activateCodeTarget({ vault, target: { repo, path, symbol: name, line }, onNotice });
	}, [vault, repo, path, name, line, onNotice]);
	return (
		<li className="flex">
			<button
				type="button"
				data-slot="code-export"
				data-export={name}
				title={`Open ${path}:${line}`}
				onClick={open}
				className={cn(
					rowTone({ lit: false }),
					"-mx-2 flex min-w-0 flex-1 items-baseline gap-x-3 px-2 py-1.25 text-left transition-colors",
				)}
			>
				<span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
					<code className="text-technical font-mono [overflow-wrap:anywhere]">{entry.shown}</code>
					{entry.findings.map((finding) => (
						<FindingChip key={`${finding.code}:${finding.message}`} finding={finding} />
					))}
				</span>
				<span className="text-body text-muted-foreground flex min-w-0 flex-1 justify-end font-mono">
					<span className="truncate">{file}</span>
					<span className="shrink-0">:{line}</span>
				</span>
			</button>
		</li>
	);
}

/**
 * The chip that names a finding, solid for a warning and tinted for information, with its words
 * on hover.
 * @param props The finding.
 * @param props.finding The finding.
 * @returns The chip.
 */
function FindingChip(props: { readonly finding: Finding }): JSX.Element {
	const { finding } = props;
	return (
		<Badge
			variant={finding.severity === "warning" ? "changed" : "changed-tint"}
			size="label"
			data-finding-code={finding.code}
			title={finding.message}
		>
			<span className="sr-only">{SEVERITY_WORDS[finding.severity]}: </span>
			{findingName(finding.code)}
		</Badge>
	);
}

/**
 * The words that stand where no list does.
 * @param props What they say.
 * @param props.slot What names them.
 * @param props.children The words.
 * @returns The words.
 */
function Words(props: { readonly slot: string; readonly children: ReactNode }): JSX.Element {
	return (
		<p data-slot={props.slot} className="text-body text-muted-foreground max-w-[68ch]">
			{props.children}
		</p>
	);
}

export { CodeExports };
