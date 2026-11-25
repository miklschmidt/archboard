//! The painter (ADR 0071): a scene and its presentation go in, and one frame
//! comes out. It holds no renderer of its own. `archboard-painter-wasm` gives
//! it Vello on WebGPU and Vello GPU on WebGL2, and `cpu` gives it Vello on the
//! CPU. `parts` keeps for both strip canvases what the GPU canvas keeps.

mod between;
mod canvas;
mod clock;
mod cpu;
mod definitions;
mod draw;
mod flight;
mod outlines;
mod palette;
mod parts;
mod passage;
mod path;
mod pick;
mod presentation;
mod raise;
mod stage;
mod sweep;
#[cfg(test)]
mod testing;
mod timing;
mod traffic;
mod warnings;

pub use canvas::{Canvas, Count, Ink, Lens, PartKey};
pub use clock::StageClock;
pub use cpu::CpuCanvas;
pub use flight::DiveWay;
pub use palette::Theme;
pub use parts::Keeper;
pub use presentation::{Camera, Light, Marks};
pub use stage::Stage;
