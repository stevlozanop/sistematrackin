"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { TrackingMark } from "@/components/TrackingMark";
import { cn } from "@/lib/cn";

/**
 * Asistente de System Tracking: preguntas en lenguaje normal sobre la operación en vivo
 * («¿en qué parte está la guía 0157233?», «¿qué se despachó hoy?»).
 * Computadora: panel a la derecha que deja ver la pantalla. Celular: pantalla completa con la caja de texto abajo.
 */

type Bubble = { role: "user" | "assistant"; text: string; error?: boolean };
type Saved = { bubbles: Bubble[]; api: unknown[] };
const KEY = "assistant-chat";

const SUGGEST: Record<string, string[]> = {
  staff: ["¿Cómo vamos hoy?", "¿En qué parte está la guía 0157233?", "¿Qué naves están en camino?", "¿Qué guías están vencidas sin motivo?", "¿Qué se registró hoy?"],
  dealer: ["¿Dónde están mis pedidos?", "¿Qué guías tengo pendientes?", "¿Qué me entregaron este mes?"],
};

function load(): Saved {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "") as Saved; } catch { return { bubbles: [], api: [] }; }
}

/** **negritas**, listas con «-» y saltos de línea; todo como texto (sin HTML) */
function Rich({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <b key={i} className="font-semibold">{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>);
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="my-1 list-disc space-y-0.5 pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*[-•*]\s+(.*)$/);
    if (m) { list.push(m[1]); continue; }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length} className="my-1">{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export function AssistantPanel({ open, onClose, dealer }: { open: boolean; onClose: () => void; dealer: boolean }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [api, setApi] = useState<unknown[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  // La conversación sigue mientras la pestaña esté abierta
  useEffect(() => {
    const t = setTimeout(() => { const s = load(); setBubbles(s.bubbles ?? []); setApi(s.api ?? []); }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify({ bubbles, api })); } catch {}
  }, [bubbles, api]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [bubbles, status]);
  useEffect(() => { if (open) setTimeout(() => field.current?.focus(), 250); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true); setStatus("Pensando");
    const history = [...api, { role: "user", content: question }];
    setBubbles((b) => [...b, { role: "user", text: question }, { role: "assistant", text: "" }]);
    const ctl = new AbortController(); abort.current = ctl;
    const write = (fn: (t: string) => string, error = false) =>
      setBubbles((b) => { const c = [...b]; const last = c[c.length - 1]; c[c.length - 1] = { ...last, text: fn(last.text), error: error || last.error }; return c; });
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history }), signal: ctl.signal });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => null);
        write(() => j?.error ?? "No pude responder. Intenta de nuevo.", true);
        return;
      }
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { t: string; d?: string; label?: string; messages?: unknown[]; error?: string };
          if (ev.t === "text" && ev.d) { setStatus(null); write((t) => t + ev.d); }
          else if (ev.t === "tool") setStatus(ev.label ?? "Consultando");
          else if (ev.t === "done" && ev.messages) setApi(ev.messages);
          else if (ev.t === "error") write((t) => (t ? t + "\n\n" : "") + (ev.error ?? "Error"), true);
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") write((t) => (t ? t + " …" : "Detenido."));
      else write(() => "Sin conexión con el servidor. Intenta de nuevo.", true);
    } finally {
      setBusy(false); setStatus(null); abort.current = null;
    }
  }, [api, busy]);

  const reset = () => { abort.current?.abort(); setBubbles([]); setApi([]); setInput(""); };
  const suggestions = dealer ? SUGGEST.dealer : SUGGEST.staff;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog" aria-label="Asistente de System Tracking"
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22, ease: [0.37, 0.35, 0, 1] }}
          className="fixed inset-0 z-[70] flex flex-col bg-sb-surface md:inset-y-3 md:left-auto md:right-3 md:w-[420px] md:rounded-3xl md:shadow-2xl md:ring-1 md:ring-sb-outline-variant/50"
          style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sb-outline-variant/40 px-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sb-primary text-sb-on-primary"><TrackingMark className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">Asistente</p>
              <p className="truncate text-[11px] text-sb-on-surface-variant">Consulta el sistema en vivo</p>
            </div>
            {bubbles.length > 0 && (
              <button type="button" onClick={reset} title="Nueva conversación" aria-label="Nueva conversación"
                className="grid h-9 w-9 place-items-center rounded-full text-sb-on-surface-variant hover:bg-sb-surface-container"><RotateCcw className="h-4 w-4" /></button>
            )}
            <button type="button" onClick={onClose} aria-label="Cerrar asistente" className="grid h-9 w-9 place-items-center rounded-full text-sb-on-surface-variant hover:bg-sb-surface-container"><X className="h-5 w-5" /></button>
          </header>

          <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {!bubbles.length ? (
              <div className="flex flex-col gap-4 pt-4">
                <div className="flex flex-col items-start gap-2">
                  <Sparkles className="h-6 w-6 text-sb-primary" />
                  <p className="text-lg font-semibold leading-snug">¿Qué quieres saber?</p>
                  <p className="text-[13px] text-sb-on-surface-variant">Pregunta como le preguntarías a un compañero: dónde está una guía, cuántas hay en almacén, qué se despachó hoy… Respondo con los datos en vivo{dealer ? " de tus pedidos" : ""}.</p>
                </div>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => ask(s)}
                      className="rounded-2xl border border-sb-outline-variant/60 px-3.5 py-2.5 text-left text-[13px] transition-colors hover:border-sb-primary hover:bg-sb-primary-soft">{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {bubbles.map((b, i) => b.role === "user" ? (
                  <p key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-md bg-sb-primary px-3.5 py-2 text-[14px] text-sb-on-primary">{b.text}</p>
                ) : (
                  <div key={i} className="flex max-w-[95%] gap-2 self-start">
                    <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-sb-primary-soft text-sb-primary"><TrackingMark className="h-4 w-4" /></span>
                    <div className={cn("min-w-0 rounded-2xl rounded-tl-md px-3.5 py-2 text-[14px] leading-relaxed", b.error ? "bg-sb-late-soft/60" : "bg-sb-surface-container-low")}>
                      {b.text ? <Rich text={b.text} /> : <span className="text-sb-on-surface-variant">…</span>}
                    </div>
                  </div>
                ))}
                {status && (
                  <p className="flex items-center gap-2 pl-8 text-[12px] text-sb-on-surface-variant" aria-live="polite">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-sb-primary border-t-transparent" />{status}…
                  </p>
                )}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="shrink-0 border-t border-sb-outline-variant/40 p-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            <div className="flex items-end gap-2 rounded-3xl bg-sb-surface-container-low p-1.5 pl-4 ring-1 ring-sb-outline-variant/50 focus-within:ring-sb-primary">
              <textarea ref={field} rows={1} value={input} maxLength={2000} placeholder="Escribe tu pregunta…" aria-label="Pregunta"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
                className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent py-2 text-[16px] outline-none md:text-[14px]" />
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()} aria-label="Detener" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sb-on-surface text-sb-surface"><Square className="h-3.5 w-3.5" /></button>
              ) : (
                <button type="submit" disabled={!input.trim()} aria-label="Enviar" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sb-primary text-sb-on-primary disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
              )}
            </div>
            <p className="mt-1.5 text-center text-[10px] text-sb-on-surface-variant">Solo consulta: no cambia datos. Puede equivocarse; revisa lo importante en su pantalla.</p>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
