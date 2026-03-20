// Polyfill browser globals for UMD bundles inside @hashgraphonline/standards-sdk (forge-light, hcs-3)
if (typeof window === 'undefined') {
  (global as any).window = global;
  (global as any).self = global;
}
if (typeof location === 'undefined') {
  (global as any).location = { href: 'http://localhost/', hostname: 'localhost', origin: 'http://localhost' };
}
if (typeof navigator === 'undefined') {
  (global as any).navigator = { userAgent: 'node' };
}
if (typeof document === 'undefined') {
  const noop = () => {};
  const el = () => ({
    style: {},
    setAttribute: noop,
    appendChild: noop,
    removeChild: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    textContent: '',
    innerHTML: '',
    nodeType: 1,
    childNodes: [],
  });
  (global as any).document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: el,
    createTextNode: () => ({ nodeType: 3, textContent: '' }),
    head: el(),
    body: el(),
    addEventListener: noop,
    removeEventListener: noop,
  };
}
if (typeof MutationObserver === 'undefined') {
  (global as any).MutationObserver = class {
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
if (typeof CustomEvent === 'undefined') {
  (global as any).CustomEvent = class CustomEvent extends Error {
    constructor(type: string, opts?: any) { super(type); }
  };
}
if (typeof Event === 'undefined') {
  (global as any).Event = class Event {
    constructor(public type: string) {}
  };
}
if (typeof requestAnimationFrame === 'undefined') {
  (global as any).requestAnimationFrame = (cb: Function) => setTimeout(cb, 16);
  (global as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
}
if (typeof localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}
