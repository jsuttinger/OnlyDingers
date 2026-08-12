/**
 * Minimal, framework-agnostic async state container. Wraps any data-layer
 * call (e.g. getRecentHomeRuns) so the UI can react to loading/error/success
 * without the data layer knowing anything about how it's rendered.
 *
 *   const resource = createAsyncResource(getRecentHomeRuns);
 *   const unsubscribe = resource.subscribe((state) => { ... });
 *   resource.load({ daysBack: 2 });
 */
export function createAsyncResource(loader) {
  /** @type {{status: 'idle'|'loading'|'success'|'error', data: any, error: Error|null}} */
  let state = { status: 'idle', data: null, error: null };
  const listeners = new Set();

  function setState(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  async function load(...args) {
    setState({ status: 'loading', error: null });
    try {
      const data = await loader(...args);
      setState({ status: 'success', data });
      return data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setState({ status: 'idle' });
        return undefined;
      }
      setState({ status: 'error', error });
      throw error;
    }
  }

  function getState() {
    return state;
  }

  /** Calls `listener` immediately with the current state, then on every change. Returns an unsubscribe function. */
  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  return { load, getState, subscribe };
}
