import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: ResizeObserverStub
});

Object.defineProperties(HTMLMediaElement.prototype, {
  load: {
    configurable: true,
    writable: true,
    value: () => undefined
  },
  pause: {
    configurable: true,
    writable: true,
    value: () => undefined
  },
  play: {
    configurable: true,
    writable: true,
    value: () => Promise.resolve()
  }
});
