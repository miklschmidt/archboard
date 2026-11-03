//! The current attempt to start a page's GPU, and only its finished device.

use std::rc::Rc;

/// An attempt's identity. A replacement does not inherit its predecessor's events.
#[derive(Clone, Debug)]
pub(crate) struct Attempt(Rc<()>);

/// A page owns a GPU only after its first frame finishes successfully.
#[derive(Debug)]
pub(crate) struct PageGpu<T> {
    attempt: Option<Attempt>,
    ready: Option<T>,
}

impl<T> PageGpu<T> {
    pub(crate) const fn new() -> Self {
        Self {
            attempt: None,
            ready: None,
        }
    }

    /// Replace the previous attempt, releasing the page's old device.
    pub(crate) fn begin(&mut self) -> Attempt {
        let attempt = Attempt(Rc::new(()));
        self.attempt = Some(attempt.clone());
        self.ready = None;
        attempt
    }

    fn current(&self, attempt: &Attempt) -> bool {
        self.attempt
            .as_ref()
            .is_some_and(|current| Rc::ptr_eq(&current.0, &attempt.0))
    }

    /// Publish a completed attempt only while it still owns the page.
    pub(crate) fn finish(&mut self, attempt: &Attempt, gpu: T) -> bool {
        if !self.current(attempt) {
            return false;
        }
        self.ready = Some(gpu);
        true
    }

    /// Retire a failed attempt once. A retired attempt cannot publish later.
    pub(crate) fn stop(&mut self, attempt: &Attempt) -> bool {
        if !self.current(attempt) {
            return false;
        }
        self.attempt = None;
        self.ready = None;
        true
    }

    pub(crate) fn ready(&self) -> Option<&T> {
        self.ready.as_ref()
    }
}

#[cfg(test)]
mod tests {
    use std::rc::Rc;

    use super::PageGpu;

    #[test]
    fn an_old_warm_or_stop_cannot_replace_or_retire_the_current_gpu() {
        let mut page = PageGpu::new();
        let old = page.begin();
        assert!(page.ready().is_none());
        let current = page.begin();
        assert!(page.finish(&current, "current"));
        assert!(!page.finish(&old, "old"));
        assert!(!page.stop(&old));
        assert_eq!(page.ready(), Some(&"current"));
    }

    #[test]
    fn a_device_that_stops_while_warming_cannot_publish_afterwards() {
        let mut page = PageGpu::new();
        let attempt = page.begin();
        assert!(page.stop(&attempt));
        assert!(!page.stop(&attempt));
        let device = Rc::new(());
        assert!(!page.finish(&attempt, Rc::clone(&device)));
        assert!(page.ready().is_none());
        assert_eq!(Rc::strong_count(&device), 1);
    }

    #[test]
    fn replacing_or_stopping_a_gpu_releases_the_pages_resource() {
        let mut page = PageGpu::new();
        let attempt = page.begin();
        let device = Rc::new(());
        assert!(page.finish(&attempt, Rc::clone(&device)));
        let next = page.begin();
        assert_eq!(Rc::strong_count(&device), 1);
        assert!(page.finish(&next, Rc::clone(&device)));
        assert!(page.stop(&next));
        assert_eq!(Rc::strong_count(&device), 1);
    }
}
