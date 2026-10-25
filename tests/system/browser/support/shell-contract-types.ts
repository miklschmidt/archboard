type ShellMetrics = {
	family: string;
	size: number;
	lineHeight: number;
	weight: number;
};

type Rect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

/** The shell's columns as the desktop viewport lays them out. */
type DesktopShell = {
	viewport: { width: number; height: number };
	/** The navigator's column: the brand bar, the navigator and the agent dock. */
	column: Rect;
	/** The pane centre: every pane and its header. */
	stages: Rect;
	pane: Rect;
	/** The agent dock at the navigator's foot. */
	dock: Rect;
	/** The composer, at the foot of the conversation while it is open. */
	composer: Rect | null;
	/** The conversation panel, while it is open. */
	panel: Rect | null;
};

type ThemeSnapshot = {
	theme: "light" | "dark";
	/** The wordmark's visible text, set in the display face. */
	wordmark: string;
	wordmarkSize: { width: number; height: number };
	/** The brand bar and the pane header share one top edge and one height. */
	chromeRowsAligned: boolean;
	status: string;
	background: string;
	inkContrast: number;
	flatSurfaces: boolean;
	visibleFocus: boolean;
	boardIdentity: string;
	/** The name of the variant the header says is shown. */
	variant: string;
	/** The board the navigator marks as the one being read. */
	selectedBoard: string | null;
	focusedPaneCount: number;
	/** Visible connection warnings in the pane header; none while the socket is up. */
	connectionTrouble: number;
	/** The board's name sits before the pane's controls, centred on one line with them. */
	headerSectionsAligned: boolean;
	fontChecks: boolean[];
	fontResources: string[];
	humanLabels: Array<{ family: string; transform: string; weight: number }>;
	/** A section heading in the pane's sidebar: the body size, semibold, never uppercase. */
	sectionHeading: { family: string; transform: string; weight: number; size: number };
	titleType: ShellMetrics;
	bodyType: ShellMetrics;
	stateType: ShellMetrics;
	technicalType: ShellMetrics;
	controlType: ShellMetrics;
	actionTargets: Array<{ width: number; height: number }>;
	presentTarget: { width: number; height: number };
};

/** The pane letters in the pane headers. */
type PaneLetters = {
	count: number;
	/** How many are drawn as the letter of the pane with focus. */
	active: number;
};

type NoticeLayout = {
	parentIsPanes: boolean;
	insidePanes: boolean;
	width: number;
	copyType: ShellMetrics;
	actionHeight: number;
	dismissHeight: number;
	flat: boolean;
	text: string;
};

export {
	type ShellMetrics,
	type DesktopShell,
	type ThemeSnapshot,
	type PaneLetters,
	type NoticeLayout,
};
