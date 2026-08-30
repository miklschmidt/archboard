export type PanesBody = { paneCount?: number; panes?: Array<{ board?: string }> };

export type ShellMetrics = {
	family: string;
	size: number;
	lineHeight: number;
	weight: number;
};

export type DesktopShell = {
	navLeftOfCanvas: boolean;
	navWidth: number;
	workbenchBelowPane: boolean;
	workbenchInsideCanvas: boolean;
	columnsAlign: boolean;
	canvasLargest: boolean;
};

export type ThemeSnapshot = {
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
	level: string;
	connectionState: string;
	persistenceState: string;
	paneIdentity: string;
	legacyVaultLineCount: number;
	boardLeftAligned: boolean;
	tokens: string[];
	weightTokens: string[];
	wordmarkTracking: string;
	fontChecks: boolean[];
	fontResources: string[];
	humanLabels: Array<{ family: string; transform: string; weight: number }>;
	titleType: ShellMetrics;
	bodyType: ShellMetrics;
	kickerType: ShellMetrics;
	controlType: ShellMetrics;
	paneType: ShellMetrics;
	actionTargets: Array<{ width: number; height: number }>;
	paneTarget: { width: number; height: number };
	presentTarget: { width: number; height: number };
};

export type PaneBarLayout = {
	height: number;
	tabCount: number;
	tabHeights: number[];
	focusedEdgeWidth: number;
	focusedEdgeColor: string;
	focusedDotColor: string;
	labels: string[];
};

export type ActivityLayout = {
	lineCount: number;
	linesFit: boolean;
	panelFits: boolean;
	canvasClear: boolean;
	timestampsAlign: boolean;
};

export type NoticeLayout = {
	parentIsPanes: boolean;
	insidePanes: boolean;
	overlapsInspector: boolean;
	width: number;
	copyType: ShellMetrics;
	actionHeight: number;
	dismissHeight: number;
	flat: boolean;
	text: string;
};

export type InspectorTypeMetrics = {
	family: string;
	size: number;
	lineHeight: number;
	weight: number;
	transform: string;
};

export type InspectorContract = {
	sections: string[];
	titleType: InspectorTypeMetrics;
	statusType: InspectorTypeMetrics;
	kickerType: InspectorTypeMetrics;
	sectionType: InspectorTypeMetrics;
	labelType: InspectorTypeMetrics;
	humanType: InspectorTypeMetrics;
	technicalType: InspectorTypeMetrics;
	copyType: InspectorTypeMetrics;
	controlType: InspectorTypeMetrics;
	kickerContrast: number;
	labelContrast: number;
	openHeight: number;
	focusHeight: number;
};

export type NavigatorContract = {
	boardCount: number;
	draftMarkers: string[];
	humanFonts: Array<{ family: string; lineHeight: number; size: number; transform: string }>;
	initials: number;
	navWidth: number;
	primaryVariants: string[];
	targets: Array<{ height: number; width: number }>;
	technicalFonts: string[];
};
