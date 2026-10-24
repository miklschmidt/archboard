// What a README asset's producer is made from, in one import: the browser, the encoder, the
// filming steps, what is stopped on a signal, the producer contract, the take's server and the tools. Each producer imports this
// surface rather than every sibling it uses.

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
export { Browser, now, type Page } from "./browser.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
export { encodeThumbnail, type Crop } from "./encode.ts";
export {
	Terminal,
	encodeTake,
	filmTogether,
	fit,
	foldSidebars,
	moment,
	present,
	stageUrl,
	withTake,
	type Moment,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./film.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
export { holding } from "./holding.ts";
export {
	attachmentFile,
	inRepository,
	readmeFile,
	type MakeContext,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./producer.ts";
export {
	readBoard,
	startCheckoutServer,
	startServer,
	type TakeServer,
	type TrackedVault,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./server.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
export { ffmpeg, inOrder, pyftsubsetCommand, run, scratch, scratchRoot } from "./tools.ts";
