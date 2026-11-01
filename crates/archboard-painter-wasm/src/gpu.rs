//! Vello on WebGPU. A page has one GPU: one device, and one Vello with its
//! pipelines compiled. Each canvas holds a surface on it. The page starts the GPU
//! once, before a picture needs it, and hears when it stops.

use std::cell::RefCell;
use std::collections::HashMap;
use std::mem;
use std::rc::Rc;
use std::sync::{Arc, Mutex};

use archboard_paint::canvas::{Canvas, Ink, Lens, PartKey};
use futures_channel::oneshot;
use js_sys::Function;
use kurbo::{Affine, BezPath, Rect, Shape as _};
use peniko::{BlendMode, Brush, Compose, Fill, Mix};
use vello::{AaConfig, AaSupport, RenderParams, Renderer, RendererOptions, Scene};
use wasm_bindgen::{JsError, JsValue};
use web_sys::{HtmlCanvasElement, OffscreenCanvas};

use crate::lens::{LensLevels, LensPipelines};
use crate::page_gpu::{Attempt, PageGpu};

/// The clip of a layer that composes with all that is under it, in canvas pixels.
const EVERYTHING: Rect = Rect::new(-1e5, -1e5, 1e5, 1e5);

/// How finely a straight-edged box stands in as a path.
const BOX_TOLERANCE: f64 = 0.1;

/// A brush and the transform of its own space.
fn brush_of(ink: &Ink) -> (Brush, Option<Affine>) {
    match ink {
        Ink::Solid(colour) => (Brush::Solid(*colour), None),
        Ink::Gradient(gradient, transform) => (Brush::Gradient(gradient.clone()), Some(*transform)),
    }
}

/// The most bytes of path data the parts a canvas keeps can hold. Past it, the
/// canvas starts again with none.
const MOST_KEPT: usize = 32 << 20;

/// How far past what it holds a see-through layer reaches, in pixels. A box in
/// whole pixels would cut the antialiased edge of what it holds.
const LAYER_MARGIN: f64 = 2.0;

/// How much wider than a stroke's width the box of a stroked path is, for a
/// mitred corner and a square cap.
const STROKE_REACH: f64 = 2.0;

/// A layer that the canvas started.
enum Layer {
    /// It went straight into the scene, with its clip.
    Clipped,
    /// It clips nothing, so it waits for what it holds. Vello gives a layer the
    /// tiles of its clip, and it holds tiles for only about 40 layers the size
    /// of a canvas 6669 pixels wide. Past them it draws nothing at all, so each
    /// see-through part clips to the box of what it holds.
    SeeThrough {
        /// What the canvas held before the layer began.
        under: Scene,
        opacity: f32,
    },
}

/// One frame's drawing, encoded for the GPU, and the parts of it that come back
/// from frame to frame, encoded once.
pub(crate) struct GpuCanvas {
    scene: Scene,
    transform: Affine,
    parts: HashMap<PartKey, (Scene, Rect)>,
    /// The drawings that wait for the part on the canvas to end.
    waiting: Vec<Scene>,
    /// The bytes of path data in `parts`.
    kept: usize,
    /// The layers that are open, the innermost last.
    layers: Vec<Layer>,
    /// The boxes of the see-through layers and the parts being drawn, in their
    /// own space, the innermost last. None holds nothing yet.
    boxes: Vec<Option<Rect>>,
    /// Scenes to use again for see-through layers.
    spare: Vec<Scene>,
    /// The lens this frame is seen through, if any.
    lens: Option<Lens>,
}

impl Canvas for GpuCanvas {
    fn set_transform(&mut self, transform: Affine) {
        self.transform = transform;
    }

    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool) {
        let (brush, own) = brush_of(ink);
        let rule = if even_odd {
            Fill::EvenOdd
        } else {
            Fill::NonZero
        };
        self.scene.fill(rule, self.transform, &brush, own, path);
        if !self.boxes.is_empty() {
            self.holds(self.transform.transform_rect_bbox(path.bounding_box()));
        }
    }

    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink) {
        let (brush, own) = brush_of(ink);
        self.scene.stroke(stroke, self.transform, &brush, own, path);
        if !self.boxes.is_empty() {
            let reach = stroke.width * STROKE_REACH;
            let inked = path.bounding_box().inflate(reach, reach);
            self.holds(self.transform.transform_rect_bbox(inked));
        }
    }

    fn push(&mut self, clip: Option<(&BezPath, bool)>, opacity: f32) {
        if let Some((path, even_odd)) = clip {
            let rule = if even_odd {
                Fill::EvenOdd
            } else {
                Fill::NonZero
            };
            self.scene
                .push_layer(rule, Mix::Normal, opacity, self.transform, path);
            self.layers.push(Layer::Clipped);
        } else {
            let held = self.spare.pop().unwrap_or_default();
            let under = mem::replace(&mut self.scene, held);
            self.layers.push(Layer::SeeThrough { under, opacity });
            self.boxes.push(None);
        }
    }

    fn push_cut(&mut self) {
        self.composed(Compose::DestOut);
    }

    fn push_keep(&mut self) {
        self.composed(Compose::DestIn);
    }

    fn pop(&mut self) {
        match self.layers.pop() {
            Some(Layer::SeeThrough { under, opacity }) => self.see_through(under, opacity),
            Some(Layer::Clipped) | None => self.scene.pop_layer(),
        }
    }

    fn again(&mut self, key: PartKey, transform: Affine) -> bool {
        let Some((part, inked)) = self.parts.get(&key) else {
            return false;
        };
        self.scene.append(part, Some(transform));
        let inked = transform.transform_rect_bbox(*inked);
        if !self.boxes.is_empty() {
            self.holds(inked);
        }
        true
    }

    fn keep(&mut self) -> bool {
        self.waiting.push(mem::take(&mut self.scene));
        self.boxes.push(None);
        true
    }

    fn look_through(&mut self, lens: Lens) {
        self.lens = Some(lens);
    }

    fn kept(&mut self, key: PartKey, transform: Affine) {
        let waiting = self.waiting.pop().unwrap_or_default();
        let part = mem::replace(&mut self.scene, waiting);
        self.scene.append(&part, Some(transform));
        let inked = self.boxes.pop().flatten().unwrap_or(Rect::ZERO);
        if !self.boxes.is_empty() {
            self.holds(transform.transform_rect_bbox(inked));
        }
        let bytes = part.encoding().path_data.len();
        if self.kept + bytes > MOST_KEPT {
            self.parts.clear();
            self.kept = 0;
        }
        if bytes <= MOST_KEPT {
            self.kept += bytes;
            self.parts.insert(key, (part, inked));
        }
    }
}

impl GpuCanvas {
    /// An empty canvas.
    fn new() -> GpuCanvas {
        GpuCanvas {
            scene: Scene::new(),
            transform: Affine::IDENTITY,
            parts: HashMap::new(),
            waiting: Vec::new(),
            kept: 0,
            layers: Vec::new(),
            boxes: Vec::new(),
            spare: Vec::new(),
            lens: None,
        }
    }

    /// Note that the innermost open box holds some ink.
    fn holds(&mut self, inked: Rect) {
        if let Some(open) = self.boxes.last_mut() {
            *open = Some(open.map_or(inked, |open| open.union(inked)));
        }
    }

    /// End a see-through layer: put what it holds on what was under it, clipped
    /// to its box.
    fn see_through(&mut self, under: Scene, opacity: f32) {
        let mut held = mem::replace(&mut self.scene, under);
        if let Some(inked) = self.boxes.pop().flatten() {
            let clip = inked.inflate(LAYER_MARGIN, LAYER_MARGIN);
            self.scene.push_layer(
                Fill::NonZero,
                Mix::Normal,
                opacity,
                Affine::IDENTITY,
                &clip.to_path(BOX_TOLERANCE),
            );
            self.scene.append(&held, None);
            self.scene.pop_layer();
            self.holds(clip);
        }
        held.reset();
        self.spare.push(held);
    }

    /// Start a layer that composes with what is under it.
    fn composed(&mut self, compose: Compose) {
        self.scene.push_layer(
            Fill::NonZero,
            BlendMode::new(Mix::Normal, compose),
            1.0,
            Affine::IDENTITY,
            &EVERYTHING.to_path(BOX_TOLERANCE),
        );
        self.layers.push(Layer::Clipped);
    }
}

/// What every canvas of a page shares.
struct Gpu {
    instance: wgpu::Instance,
    adapter: wgpu::Adapter,
    device: wgpu::Device,
    queue: wgpu::Queue,
    renderer: Renderer,
    watch: DeviceWatch,
    /// What the lens draws with, by surface format.
    lenses: HashMap<wgpu::TextureFormat, Rc<LensPipelines>>,
}

impl Drop for Gpu {
    fn drop(&mut self) {
        self.watch.cancel();
        // wgpu's WebGPU device drop is a no-op, so release its allocations here.
        self.device.destroy();
    }
}

thread_local! {
    /// The GPU of this page, once it started.
    static PAGE_GPU: RefCell<PageGpu<Rc<RefCell<Gpu>>>> = const { RefCell::new(PageGpu::new()) };
}

/// The side of the square canvas that the first frame lands on, in pixels.
const FIRST_FRAME_SIDE: u32 = 64;

/// An error as the page reads it.
fn failed(error: impl std::fmt::Display) -> JsError {
    JsError::new(&error.to_string())
}

/// A refusal of the browser as an error.
fn refused(error: &JsValue) -> JsError {
    JsError::new(&format!("{error:?}"))
}

/// Tell the page once when the device stops: it lost the device, or it refused
/// work. A surface that the compositor no longer gives textures for ends here.
struct DeviceWatch(Arc<Mutex<Option<oneshot::Sender<String>>>>);

impl DeviceWatch {
    /// Release the waiting task even when the device is destroyed without an error.
    fn cancel(&self) {
        self.0.lock().ok().and_then(|mut tell| tell.take());
    }
}

impl Drop for DeviceWatch {
    fn drop(&mut self) {
        self.cancel();
    }
}

fn watch(device: &wgpu::Device, attempt: Attempt, stopped: Function) -> DeviceWatch {
    let (tell, told) = oneshot::channel::<String>();
    let tell = Arc::new(Mutex::new(Some(tell)));
    let watch = DeviceWatch(Arc::clone(&tell));
    let once = move |reason: String| {
        let tell = tell.lock().ok().and_then(|mut tell| tell.take());
        if let Some(tell) = tell {
            tell.send(reason).ok();
        }
    };
    let refused = once.clone();
    device.on_uncaptured_error(Arc::new(move |error| refused(error.to_string())));
    device.set_device_lost_callback(move |reason, message| {
        if reason != wgpu::DeviceLostReason::Destroyed {
            once(message);
        }
    });
    wasm_bindgen_futures::spawn_local(async move {
        if let Ok(reason) = told.await
            && PAGE_GPU.with_borrow_mut(|page| page.stop(&attempt))
        {
            stopped.call1(&JsValue::NULL, &reason.into()).ok();
        }
    });
    watch
}

impl Gpu {
    /// Ask the browser for a device, and start Vello on it.
    async fn start(attempt: Attempt, stopped: Function) -> Result<Gpu, JsError> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
            .map_err(failed)?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                required_limits: adapter.limits(),
                ..wgpu::DeviceDescriptor::default()
            })
            .await
            .map_err(failed)?;
        let watch = watch(&device, attempt, stopped);
        let renderer = Renderer::new(
            &device,
            RendererOptions {
                use_cpu: false,
                antialiasing_support: AaSupport::area_only(),
                num_init_threads: None,
                pipeline_cache: None,
            },
        )
        .map_err(|error| {
            device.destroy();
            failed(error)
        })?;
        Ok(Gpu {
            instance,
            adapter,
            device,
            queue,
            renderer,
            watch,
            lenses: HashMap::new(),
        })
    }

    /// What the lens of a surface format draws with.
    fn lens_of(&mut self, format: wgpu::TextureFormat) -> Rc<LensPipelines> {
        Rc::clone(
            self.lenses
                .entry(format)
                .or_insert_with(|| Rc::new(LensPipelines::new(&self.device, format))),
        )
    }
}

/// Start the GPU of this page and draw one frame on a canvas nobody sees. A
/// browser compiles a pipeline when a frame first uses it, which takes it up to
/// a second, so the first frame a reader sees must not be the first it draws.
/// This ends when the GPU finished that frame.
pub(crate) async fn warm(stopped: Function) -> Result<(), JsError> {
    let attempt = PAGE_GPU.with_borrow_mut(PageGpu::begin);
    let gpu = Rc::new(RefCell::new(Gpu::start(attempt.clone(), stopped).await?));
    let canvas = OffscreenCanvas::new(FIRST_FRAME_SIDE, FIRST_FRAME_SIDE)
        .map_err(|error| refused(&error))?;
    let mut target = GpuTarget::on(
        Rc::clone(&gpu),
        wgpu::SurfaceTarget::OffscreenCanvas(canvas),
        (FIRST_FRAME_SIDE, FIRST_FRAME_SIDE),
    )?;
    first_frame(target.begin());
    target.finish()?;
    let (finished, drawn) = oneshot::channel();
    gpu.borrow().queue.on_submitted_work_done(move || {
        finished.send(()).ok();
    });
    drawn.await.map_err(failed)?;
    if PAGE_GPU.with_borrow_mut(|page| page.finish(&attempt, gpu)) {
        Ok(())
    } else {
        Err(JsError::new(
            "The GPU stopped or was replaced while it started.",
        ))
    }
}

/// A frame that uses all that a picture uses: a layer, a clip, a fill, a stroke
/// and the lens.
fn first_frame(canvas: &mut GpuCanvas) {
    let square = Rect::new(8.0, 8.0, 56.0, 56.0).to_path(BOX_TOLERANCE);
    let ink = Ink::Solid(peniko::color::palette::css::WHITE);
    canvas.push(Some((&square, false)), 0.5);
    canvas.fill(&square, &ink, false);
    canvas.stroke(&square, &kurbo::Stroke::new(2.0), &ink);
    canvas.pop();
    canvas.look_through(Lens {
        focus: None,
        blur: 1.0,
        sink: 0.0,
        ground: peniko::color::palette::css::BLACK,
    });
}

/// A surface and all that draws on it.
pub(crate) struct GpuTarget {
    gpu: Rc<RefCell<Gpu>>,
    surface: wgpu::Surface<'static>,
    configuration: wgpu::SurfaceConfiguration,
    blitter: wgpu::util::TextureBlitter,
    view: wgpu::TextureView,
    lens: Rc<LensPipelines>,
    /// The levels of the lens, once a frame needs them.
    levels: Option<LensLevels>,
    canvas: GpuCanvas,
}

/// The texture Vello draws into, and its view.
fn target_view(device: &wgpu::Device, width: u32, height: u32) -> wgpu::TextureView {
    device
        .create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        })
        .create_view(&wgpu::TextureViewDescriptor::default())
}

impl GpuTarget {
    /// Draw on a canvas with the GPU of this page.
    pub(crate) fn start(canvas: HtmlCanvasElement) -> Result<GpuTarget, JsError> {
        let gpu = PAGE_GPU
            .with_borrow(|page| page.ready().cloned())
            .ok_or_else(|| JsError::new("The GPU of this page did not start."))?;
        let size = (canvas.width(), canvas.height());
        GpuTarget::on(gpu, wgpu::SurfaceTarget::Canvas(canvas), size)
    }

    /// Draw on a surface of a size in pixels.
    fn on(
        gpu: Rc<RefCell<Gpu>>,
        surface: wgpu::SurfaceTarget<'static>,
        (width, height): (u32, u32),
    ) -> Result<GpuTarget, JsError> {
        let (surface, configuration, blitter, view, lens) = {
            let mut shared = gpu.borrow_mut();
            let surface = shared.instance.create_surface(surface).map_err(failed)?;
            let format = *surface
                .get_capabilities(&shared.adapter)
                .formats
                .first()
                .ok_or_else(|| JsError::new("The surface offers no format."))?;
            let configuration = wgpu::SurfaceConfiguration {
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
                format,
                width,
                height,
                present_mode: wgpu::PresentMode::AutoVsync,
                desired_maximum_frame_latency: 2,
                // Until its first frame lands, a canvas shows the page, not black.
                alpha_mode: wgpu::CompositeAlphaMode::PreMultiplied,
                view_formats: vec![],
                color_space: wgpu::SurfaceColorSpace::default(),
            };
            surface.configure(&shared.device, &configuration);
            let view = target_view(&shared.device, width, height);
            let blitter = wgpu::util::TextureBlitter::new(&shared.device, format);
            let lens = shared.lens_of(format);
            (surface, configuration, blitter, view, lens)
        };
        Ok(GpuTarget {
            gpu,
            surface,
            configuration,
            blitter,
            view,
            lens,
            levels: None,
            canvas: GpuCanvas::new(),
        })
    }

    /// Change the size of the surface, in pixels.
    pub(crate) fn resize(&mut self, width: u32, height: u32) {
        self.configuration.width = width;
        self.configuration.height = height;
        let gpu = self.gpu.borrow();
        self.surface.configure(&gpu.device, &self.configuration);
        self.view = target_view(&gpu.device, width, height);
        self.levels = None;
    }

    /// The canvas of the next frame, empty.
    pub(crate) fn begin(&mut self) -> &mut GpuCanvas {
        self.canvas.scene.reset();
        self.canvas.lens = None;
        &mut self.canvas
    }

    /// Render the frame on the canvas and show it.
    pub(crate) fn finish(&mut self) -> Result<(), JsError> {
        let (width, height) = (self.configuration.width, self.configuration.height);
        let gpu = &mut *self.gpu.borrow_mut();
        gpu.renderer
            .render_to_texture(
                &gpu.device,
                &gpu.queue,
                &self.canvas.scene,
                &self.view,
                &RenderParams {
                    base_color: peniko::Color::TRANSPARENT,
                    width,
                    height,
                    antialiasing_method: AaConfig::Area,
                },
            )
            .map_err(failed)?;
        let (wgpu::CurrentSurfaceTexture::Success(frame)
        | wgpu::CurrentSurfaceTexture::Suboptimal(frame)) = self.surface.get_current_texture()
        else {
            return Err(JsError::new("The surface gave no texture."));
        };
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        if let Some(lens) = &self.canvas.lens {
            let levels = self.levels.get_or_insert_with(|| {
                LensLevels::new(&gpu.device, &self.lens, &self.view, (width, height))
            });
            levels.draw(&self.lens, (&gpu.queue, &mut encoder), &view, lens);
        } else {
            self.blitter
                .copy(&gpu.device, &mut encoder, &self.view, &view);
        }
        gpu.queue.submit([encoder.finish()]);
        gpu.queue.present(frame);
        Ok(())
    }
}
