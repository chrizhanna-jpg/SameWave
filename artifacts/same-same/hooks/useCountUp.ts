import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(target);
  const hasMountedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const from = hasMountedRef.current ? valueRef.current : 0;
    hasMountedRef.current = true;

    if (from === target) {
      setValue(target);
      return;
    }

    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
