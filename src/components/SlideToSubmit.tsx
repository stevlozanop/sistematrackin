"use client";
import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

const HANDLE = 120;
const PAD = 8;
const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 } as const;

/** Barra «arrastra para ingresar»: el botón interno (border-radius 50px) se desliza con resorte. */
export function SlideToSubmit({ label, loading = false, onComplete }: { label: string; loading?: boolean; onComplete: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState(0);
  const x = useMotionValue(0);
  const done = useRef(false);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const fill = useTransform(x, (v) => v + HANDLE);
  const hint = useTransform(x, [0, Math.max(max, 1) * 0.45], [1, 0]);
  const fillOpacity = useTransform(x, [0, Math.max(max, 1)], [0.04, 0.22]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMax(el.clientWidth - HANDLE - PAD * 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reset = () => {
    done.current = false;
    animate(x, 0, SPRING);
  };

  useEffect(() => {
    if (!loading && done.current) reset();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  function complete() {
    done.current = true;
    animate(x, max, SPRING);
    onComplete();
    setTimeout(() => !loadingRef.current && reset(), 800);
  }

  return (
    <div ref={track} className="relative h-[72px] select-none overflow-hidden rounded-[50px] bg-white/[0.07]" style={{ padding: PAD }}>
      <motion.div
        aria-hidden
        className="absolute rounded-[50px] bg-white"
        style={{ left: PAD, top: PAD, bottom: PAD, width: fill, opacity: fillOpacity }}
      />

      <motion.span aria-hidden style={{ opacity: hint }} className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 pl-28 text-lg text-white/60">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2], x: [0, 4, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}>
            ›
          </motion.span>
        ))}
      </motion.span>

      <motion.button
        type="button"
        aria-label={label}
        drag={loading ? false : "x"}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={() => (x.get() > max * 0.8 ? complete() : reset())}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), complete())}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96, cursor: "grabbing" }}
        style={{ x, width: HANDLE, touchAction: "none" }}
        className="relative grid h-14 cursor-grab place-items-center rounded-[50px] bg-white text-sm font-semibold text-black shadow-[0_4px_18px_rgba(255,255,255,.18)]"
      >
        {loading ? (
          <motion.span
            className="h-5 w-5 rounded-full border-2 border-black/20 border-t-black"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
          />
        ) : (
          label
        )}
      </motion.button>
    </div>
  );
}
