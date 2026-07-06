import { useEffect, useRef } from "react";

/**
 * Tracks setTimeout/setInterval handles and clears them all on unmount, so
 * recursive simulation streams don't call setState after the step component
 * has been navigated away from. Returns guarded `setTimeout`/`setInterval`
 * plus an `isMounted` checker.
 */
export function useTimers() {
  const timeouts = useRef<Set<number>>(new Set());
  const intervals = useRef<Set<number>>(new Set());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const timeoutSet = timeouts.current;
    const intervalSet = intervals.current;
    return () => {
      mounted.current = false;
      timeoutSet.forEach((id) => window.clearTimeout(id));
      intervalSet.forEach((id) => window.clearInterval(id));
      timeoutSet.clear();
      intervalSet.clear();
    };
  }, []);

  const setTimeout = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timeouts.current.delete(id);
      if (mounted.current) fn();
    }, ms);
    timeouts.current.add(id);
    return id;
  };

  const setInterval = (fn: () => void, ms: number): number => {
    const id = window.setInterval(() => {
      if (mounted.current) fn();
    }, ms);
    intervals.current.add(id);
    return id;
  };

  const clearInterval = (id: number): void => {
    window.clearInterval(id);
    intervals.current.delete(id);
  };

  const isMounted = () => mounted.current;

  return { setTimeout, setInterval, clearInterval, isMounted };
}
