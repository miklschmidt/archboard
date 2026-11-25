//! The render's binding: a render request in, as the JSON of the host's
//! request, and the picture with its key out (`archboard_render::Rendered`).
//!
//! The host runs each solve the render asks for on its layout engine, side by
//! side on as many workers as it has, and calls one off when the render calls
//! it off or drops it (`RenderHost`); it gives the path data of the icons a
//! picture draws.

use std::collections::BTreeMap;
use std::rc::Rc;

use archboard_layout::Solver;
use archboard_render::RenderRequest;
use archboard_render::{Host, Renderer};
use wasm_bindgen::prelude::*;

use crate::solving::{AbortSignal, Solving, said};

#[wasm_bindgen(typescript_custom_section)]
const RENDER_HOST: &str = r#"
import type { Rendered } from "./types.ts";

/** What a render asks of the place it runs in. */
export interface RenderHost {
    /**
     * One measured graph laid out the way its root options name, answered as
     * `layOutPicture` answers it. The signal calls off a solve that still waits
     * for an engine: it is refused with the signal's reason. One an engine
     * already lays out answers all the same, and the render may still read it.
     */
    solve(graph: string, signal: AbortSignal): Promise<string>;
    /** Each icon's path data, by export name, of the icons named that the host has. */
    icons(names: string[]): Record<string, readonly string[]>;
}

export type { Rendered };
"#;

#[wasm_bindgen]
extern "C" {
    /// What a render asks of the place it runs in.
    #[wasm_bindgen(typescript_type = "RenderHost")]
    pub type RenderHost;

    #[wasm_bindgen(method, catch, js_name = solve)]
    fn solve_on(this: &RenderHost, graph: String, signal: &AbortSignal)
    -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = icons)]
    fn icons_of(this: &RenderHost, names: Vec<String>) -> Result<JsValue, JsValue>;

    /// Read the host's map, including getters, within the exception boundary.
    #[wasm_bindgen(catch, js_namespace = Object, js_name = entries)]
    fn icon_entries(value: &JsValue) -> Result<js_sys::Array, JsValue>;
}

impl Solver for RenderHost {
    type Solve<'s> = Solving;

    fn solve(&self, graph: String) -> Solving {
        Solving::asked(|signal| self.solve_on(graph, signal))
    }
}

impl Host for RenderHost {
    fn icons(&self, names: &[&str]) -> Result<BTreeMap<String, Vec<String>>, String> {
        let named = names.iter().map(|name| (*name).to_owned()).collect();
        let icons = self
            .icons_of(named)
            .map_err(|error| said(&error, "Reading icons"))?;
        icon_entries(&icons)
            .map_err(|error| said(&error, "Reading icons"))?
            .iter()
            .map(|entry| {
                let entry: js_sys::Array = entry.unchecked_into();
                let name = entry.get(0).as_string().ok_or("An icon has no name")?;
                let paths = entry.get(1);
                let paths = paths
                    .dyn_ref::<js_sys::Array>()
                    .ok_or_else(|| format!("Icon {name} has no array of paths"))?;
                let paths = paths
                    .iter()
                    .map(|path| {
                        path.as_string()
                            .ok_or_else(|| format!("Icon {name} has a path that is not a string"))
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok((name, paths))
            })
            .collect()
    }
}

thread_local! {
    /// The renderer of this place, which remembers the layouts it laid out.
    static RENDERER: Rc<Renderer> = Rc::default();
}

/// One reading drawn in the grammar its view asked for: the JSON of a render
/// request in; the picture and its key, or why nothing was drawn, out.
///
/// # Errors
///
/// A request that does not read as its type, a solve the host failed or
/// answered unreadably, icons the host cannot read, and a document the SVG painter refuses.
#[wasm_bindgen(unchecked_return_type = "Rendered")]
pub async fn render(request: String, host: RenderHost) -> Result<JsValue, JsError> {
    let request: RenderRequest = serde_json::from_str(&request).map_err(|error| {
        JsError::new(&format!(
            "The render request does not match its type: {error}"
        ))
    })?;
    let renderer = RENDERER.with(Rc::clone);
    let rendered = renderer
        .render(&request, &host)
        .await
        .map_err(|error| JsError::new(&error))?;
    let written =
        serde_json::to_string(&rendered).map_err(|error| JsError::new(&error.to_string()))?;
    js_sys::JSON::parse(&written).map_err(|error| JsError::new(&said(&error, "Reading a picture")))
}
