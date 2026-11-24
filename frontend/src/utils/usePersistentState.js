import { useCallback, useState } from 'react';

// RecruiterApp mounts one view at a time, so a page's useState is thrown away whenever the recruiter
// switches tabs. This keeps a value in module memory under a key instead: switching tabs and coming
// back restores it, while a browser refresh (or closing the tab) starts clean again.
const store = new Map();

export default function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => (store.has(key) ? store.get(key) : (typeof initial === 'function' ? initial() : initial)));
  // Same call shape as useState's setter, including functional updates.
  const set = useCallback((next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      store.set(key, v);
      return v;
    });
  }, [key]);
  return [value, set];
}
