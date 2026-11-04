//! The painter (ADR 0071): a scene and its presentation go in, and one frame
//! comes out. It holds no renderer of its own. `archboard-painter-wasm` gives
//! it Vello on WebGPU and Vello GPU on WebGL2, and `cpu` gives it Vello on the
//! CPU. `parts` keeps for both strip canvases what the GPU canvas keeps.

pub mod between;
pub mod canvas;
pub mod clock;
pub mod cpu;
mod definitions;
pub mod draw;
pub mod flight;
pub mod outlines;
pub mod palette;
pub mod parts;
pub mod passage;
mod path;
mod pick;
pub mod presentation;
mod raise;
pub mod stage;
pub mod sweep;
pub mod timing;
mod traffic;
pub mod warnings;
