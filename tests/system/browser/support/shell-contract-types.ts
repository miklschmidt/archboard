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

/** The shell's columns and bars as the desktop viewport lays them out. */
type DesktopShell = {
	viewport: { width: number; height: number };
	nav: Rect;
	centre: Rect;
	stages: Rect;
	pane: Rect;
	bar: Rect;
	composer: Rect;
	/** The conversation panel, while it is open. */
	panel: Rect | null;
};

type ThemeSnapshot = {
	theme: "light" | "dark";
	wordmark: string;
	wordmarkMask: string;
	wordmarkSize: { width: number; height: number };
	unexpectedBrandIconCount: number;
	headerHeight: number;
	selection: string;
	status: string;
	background: string;
	inkContrast: number;
	flatSurfaces: boolean;
	shadowlessSurfaces: boolean;
	visibleFocus: boolean;
	boardIdentity: string;
	/** The name of the variant the header says is shown. */
	variant: string;
	/** The board the navigator marks as the one being read. */
	selectedBoard: string | null;
	focusedPaneCount: number;
	/** Visible connection warnings in the header; none while the socket is up. */
	connectionTrouble: number;
	headerSectionsAligned: boolean;
	wordmarkTracking: string;
	fontChecks: boolean[];
	fontResources: string[];
	diagramFontResources: string[];
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

type PaneBarLayout = {
	tabCount: number;
	tabHeights: number[];
	pressedCount: number;
	tabType: ShellMetrics | null;
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
	type PaneBarLayout,
	type NoticeLayout,
};
