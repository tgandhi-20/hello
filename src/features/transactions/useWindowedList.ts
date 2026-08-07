import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Minimal hand-rolled list windowing (CONTRACTS.md forbids adding a virtualization
 * dependency). Items can have different heights (day headers vs. rows) as long as the
 * caller can estimate each item's height cheaply — we don't measure the live DOM, we
 * just keep a running offset table from the estimates, which is enough to keep
 * thousands of rows scrolling smoothly since only the visible slice ever mounts.
 */
export function useWindowedList<T>(items: T[], estimateHeight: (item: T, index: number) => number, overscanPx = 600) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const offsets = useMemo(() => {
    const out: number[] = new Array(items.length + 1);
    out[0] = 0;
    for (let i = 0; i < items.length; i++) {
      out[i + 1] = out[i] + estimateHeight(items[i], i);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, items.length]);

  const totalHeight = offsets[offsets.length - 1] ?? 0;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const rangeTop = Math.max(0, scrollTop - overscanPx);
  const rangeBottom = scrollTop + viewportHeight + overscanPx;

  let startIndex = 0;
  let endIndex = items.length;
  // Binary search would be nicer at huge N, but a linear scan over a few thousand
  // offsets is still sub-millisecond and keeps this dependency-free and simple.
  for (let i = 0; i < items.length; i++) {
    if (offsets[i + 1] >= rangeTop) {
      startIndex = i;
      break;
    }
  }
  for (let i = startIndex; i < items.length; i++) {
    if (offsets[i] > rangeBottom) {
      endIndex = i;
      break;
    }
  }

  const visible = items.slice(startIndex, endIndex).map((item, i) => ({
    item,
    index: startIndex + i,
    top: offsets[startIndex + i],
  }));

  return { containerRef, visible, totalHeight };
}
