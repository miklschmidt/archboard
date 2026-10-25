//! The renderer core's one call (ADR 0057): a board's reading, the vault's
//! policy and the render's choices in; the picture, as one SVG document with
//! its atlas, and the key a pane lists beside it out.
//!
//! Agents author meaning, and this derives the presentation of every board
//! (ADR 0023, ADR 0028): what is drawn in which grammar, every word measured,
//! the layout solved and chosen between, the crossings settled, the look the
//! policy gives each subject, and the document written. A host does what only
//! the place it runs in can ([`Host`]): it runs the layout's solves, side by
//! side on as many engines as it has, and it holds the icons.
//!
//! Nothing here reads a clock, a random number or a file, so one host draws
//! the same request to the same bytes in any order.

mod appearance;
mod architecture;
mod entries;
mod flows;
mod memo;
pub mod request;
mod steps;

use std::collections::{BTreeMap, BTreeSet};

use archboard_layout::Solver;
use archboard_scene::paint::design::OWN_ICONS;
use archboard_scene::paint::paint;
use archboard_scene::request::{DocumentRequest, PageRequest, PaintRequest};
use archboard_scene::scene::{PaintedDocument, Scene};
use archboard_svg::{AppliedAppearance, PictureKey};
use serde::Serialize;
use ts_rs::TS;

pub use appearance::drill_direction;
use memo::Layouts;
use request::{Grammar, RenderRequest};

/// What a render asks of the place it runs in: the layout's solves, and the
/// path data of the icons a picture draws.
pub trait Host: Solver {
    /// Each icon's path data, by export name, of the icons named that the host has.
    fn icons(&self, names: &[&str]) -> BTreeMap<String, Vec<String>>;
}

/// What a render answers when it drew a picture.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Drawn {
    /// The document, its size, its atlas and what it placed.
    #[serde(flatten)]
    #[ts(flatten)]
    pub document: PaintedDocument,
    /// Each subject the picture draws with the appearance it was drawn with,
    /// in the order it draws them.
    pub appearances: Vec<AppliedAppearance>,
    /// What the picture's key lists, or null when it draws no subject of a kind.
    pub key: Option<PictureKey>,
    /// The picture as the painter described it, for a frontend that paints
    /// it itself (ADR 0057). A host that shows the document needs none of it.
    #[serde(skip)]
    #[ts(skip)]
    pub scene: Scene,
}

/// Why nothing was drawn: the reading holds nothing the grammar draws.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, TS)]
pub enum NothingDrawn {
    /// The reading holds no part, or no flow, to draw.
    #[serde(rename = "NOTHING_TO_RENDER")]
    #[ts(rename = "NOTHING_TO_RENDER")]
    NothingToRender,
}

/// What a render answers.
#[derive(Clone, Debug, Serialize, TS)]
#[serde(untagged)]
pub enum Rendered {
    /// The picture, and its key.
    Drawn(Box<Drawn>),
    /// Nothing, and why.
    Empty {
        /// Why nothing was drawn.
        empty: NothingDrawn,
    },
}

/// A picture to paint, or nothing to draw.
#[derive(Debug)]
enum Outline {
    Nothing,
    Paint(Box<PaintRequest>),
}

/// What a picture's document says about itself.
fn document_request(
    request: &RenderRequest,
    name: String,
    description: Option<String>,
) -> DocumentRequest {
    DocumentRequest {
        name,
        description,
        far_view_swap_ms: request.clock.far_view_swap_ms,
        theme: request.theme,
        theme_colors: request.theme.and_then(|_| request.theme_colors.clone()),
    }
}

/// The comparison a picture is read against, and the page around it.
fn page_request(request: &RenderRequest) -> PageRequest {
    PageRequest {
        standing: request.standing.clone(),
        plain: request.plain(),
        unsettled: request.unsettled.clone(),
        unbuilt: request.unbuilt,
        frame: request.frame.clone(),
    }
}

/// The icons a picture can draw: those named, and the renderer's own.
fn icons_of<H: Host>(host: &H, named: &[&str]) -> BTreeMap<String, Vec<String>> {
    let names: BTreeSet<&str> = OWN_ICONS.into_iter().chain(named.iter().copied()).collect();
    host.icons(&names.into_iter().collect::<Vec<_>>())
}

/// A painted picture, written as its document, with its key.
///
/// # Errors
///
/// A document the SVG painter refuses (`archboard_svg::document`).
fn drawn(request: &PaintRequest) -> Result<Drawn, String> {
    let scene = paint(request);
    let svg = archboard_svg::document(&scene, &request.document, &request.icons)
        .map_err(|error| error.0)?;
    let (appearances, key) = archboard_svg::appearances(&scene.body, &request.icons);
    Ok(Drawn {
        document: PaintedDocument {
            svg,
            width: scene.width,
            height: scene.height,
            atlas: scene.atlas.clone(),
            placed: scene.placed.clone(),
            reading_direction: scene.reading,
        },
        appearances,
        key,
        scene,
    })
}

/// The renderer: one per place it runs in, remembering the layouts it laid out.
#[derive(Debug, Default)]
pub struct Renderer {
    layouts: Layouts,
}

impl Renderer {
    /// One reading drawn in the grammar its view asked for.
    ///
    /// # Errors
    ///
    /// A solve the host failed or answered unreadably, and a document the SVG
    /// painter refuses.
    pub async fn render<H: Host>(
        &self,
        request: &RenderRequest,
        host: &H,
    ) -> Result<Rendered, String> {
        let outline = match request.grammar {
            Grammar::Architecture => architecture::picture(request, &self.layouts, host).await?,
            Grammar::Sequence => flows::sequence(request, host),
            Grammar::Flowchart => flows::flowchart(request, host).await?,
        };
        Ok(match outline {
            Outline::Nothing => Rendered::Empty {
                empty: NothingDrawn::NothingToRender,
            },
            Outline::Paint(paint) => Rendered::Drawn(Box::new(drawn(&paint)?)),
        })
    }
}
