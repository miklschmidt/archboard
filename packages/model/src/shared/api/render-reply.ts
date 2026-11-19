// What a render answers and the theme it draws with.
export {
	defaultLayoutEngine,
	diagramThemeSchema,
	layoutEngineSchema,
	legendLayoutSchema,
	offeredViewSchema,
	pictureReceiptShape,
	renderedVariantSchema,
	semanticRenderReplySchema,
	standaloneThemeSchema,
	subjectStandingSchema,
	wasDrawn,
} from "#shared/protocol/render-reply.ts";
export type {
	DiagramAtlas,
	DiagramBox,
	DiagramTheme,
	DrawnPicture,
	LayoutEngineName,
	LegendLayout,
	NothingDrawn,
	NothingDrawnReason,
	OfferedView,
	SemanticRenderReply,
	StandaloneTheme,
} from "#shared/protocol/render-reply.ts";
