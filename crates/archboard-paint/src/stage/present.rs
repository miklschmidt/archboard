//! How the picture on a stage is seen: what the page states, each value
//! replacing the last, and the timed values that start at their own moments.

use std::collections::{HashMap, HashSet};

use super::{Glide, Stage};
use crate::palette::{Palette, Theme};
use crate::presentation::{Camera, FarLine, Hovered, Light, LineSweep, Marks, Presentation, Timed};
use crate::sweep::{Sweep, Timing};
use crate::timing::{EASE_OUT, Fade};

impl Stage {
    /// Take what the page says about how the picture is seen. A value it
    /// states replaces the last, and a value it leaves out stays. Each timed
    /// value starts at its own moment.
    pub fn present(&mut self, said: Presentation) {
        let Presentation {
            theme,
            size,
            traffic_shown,
            heads,
            warnings,
            marks,
            hovered,
            camera,
            far_line,
            awaited,
            light,
            sweep,
        } = said;
        self.restyle(theme, size, traffic_shown);
        self.remark(heads, warnings, marks, hovered);
        self.retime(camera, far_line, awaited, light, sweep);
    }

    /// Take the theme, the size of the canvas and whether traffic runs.
    fn restyle(&mut self, theme: Option<Theme>, size: Option<(f64, f64)>, traffic: Option<bool>) {
        if let Some(theme) = theme {
            self.palette = Palette::of(theme);
            self.looks += 1;
        }
        if let Some(size) = size {
            self.size = size;
            self.parts.resize(size);
        }
        if let Some(shown) = traffic {
            self.traffic.show(shown);
        }
    }

    /// Take what is marked on the picture: the held heads, the warnings, the
    /// marks and the control under the pointer.
    fn remark(
        &mut self,
        heads: Option<HashMap<String, f64>>,
        warnings: Option<HashSet<String>>,
        marks: Option<Marks>,
        hovered: Option<Hovered>,
    ) {
        if let Some(heads) = heads {
            self.seen.heads = heads;
            self.forget_targets();
        }
        if let Some(warned) = warnings {
            self.warned = warned;
            self.find_warnings();
        }
        if let Some(marks) = marks {
            self.seen.selected = marks.selected;
            self.seen.whole = marks.whole;
            self.forget_targets();
        }
        if let Some(hovered) = hovered {
            self.seen.hovered_toggle = hovered.toggle;
        }
    }

    /// Take the values that change over a time, each from its own moment.
    fn retime(
        &mut self,
        camera: Option<Timed<Camera>>,
        far_line: Option<FarLine>,
        awaited: Option<Timed<bool>>,
        light: Option<Light>,
        sweep: Option<LineSweep>,
    ) {
        if let Some(camera) = camera {
            self.set_camera(camera);
        }
        if let Some(line) = far_line {
            self.far_line = line;
        }
        if let Some(awaited) = awaited {
            self.set_awaited(awaited);
        }
        if let Some(light) = light {
            self.now = self.clock.at(light.at);
            self.lighting.set(&light, self.now);
        }
        if let Some(sweep) = sweep {
            self.sweep(&sweep);
        }
    }

    /// Move the picture on the canvas, over a time in milliseconds.
    fn set_camera(&mut self, Timed { to: camera, ms, at }: Timed<Camera>) {
        let now = self.clock.at(at);
        self.now = now;
        let move_to = |fade: &Fade, to: f64| fade.toward(to, now, 0.0, ms, EASE_OUT);
        self.glide = Glide {
            x: move_to(&self.glide.x, camera.x),
            y: move_to(&self.glide.y, camera.y),
            scale: move_to(&self.glide.scale, camera.scale),
        };
    }

    /// Drop what the pointer could land on, because the order or the place of
    /// the parts changed. The next pick finds it again.
    fn forget_targets(&mut self) {
        if let Some(shown) = &mut self.shown {
            shown.near = None;
            shown.far = None;
        }
    }

    /// Draw on the lines of the relationships that light, in place of any sweep
    /// that runs. A sweep with no delays only takes the last away, and names
    /// no moment.
    fn sweep(&mut self, sweep: &LineSweep) {
        if sweep.delays.is_empty() {
            self.seen.sweep = None;
            return;
        }
        let now = self.clock.at(sweep.at);
        self.now = now;
        let timing = Timing {
            shortest: sweep.shortest_ms,
            longest: sweep.longest_ms,
            now,
        };
        self.seen.sweep = self
            .shown
            .as_ref()
            .and_then(|shown| Sweep::of(&shown.picture.scene, &sweep.delays, timing));
    }

    /// Say whether the next picture is on its way, and how long the picture on
    /// the stage takes to step back for it or to step forward again. It starts a
    /// flight at the reader's click, while the next picture is still being drawn.
    fn set_awaited(
        &mut self,
        Timed {
            to: awaited,
            ms,
            at,
        }: Timed<bool>,
    ) {
        let now = self.clock.at(at);
        self.now = now;
        let goal = if awaited { 1.0 } else { 0.0 };
        self.awaited = self.awaited.toward(goal, now, 0.0, ms, EASE_OUT);
    }
}
