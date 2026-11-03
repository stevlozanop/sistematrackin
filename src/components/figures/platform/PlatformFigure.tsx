"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cylinder, lineOnTop, ring, translateAlong } from "@/components/iso/iso-kit";
import { follow, useLoop } from "@/components/iso/react/live";
import { ART, CABLES, GAUGE, HEIGHT, LEDS, LEVEL_SPAN, MONITORS, P, SWEEP, SWEEP_FROM, TANK, WIDTH, rider } from "./geometry";
import { iso, pathOf } from "@/components/iso/iso-kit";
import "@/components/iso/iso.css";
import "./platform.css";

export type PlatformLive = {
  online: number; accounts: number; conns: number; max_conns: number; db_mb: number; limit_mb: number;
  cache_hit: number | null; api_per_min: number; api_hour: number;
};

type Part = "users" | "rack" | "db" | "cache" | "api";
const GO: Record<Part, string> = { users: "/dev/users", rack: "/dev/usage", db: "/dev/usage", cache: "/dev/usage", api: "/dev/live" };
const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-PE");
const many = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

function readoutOf(d: PlatformLive, part: Part | null) {
  const hit = d.cache_hit === null ? "—" : `${one(d.cache_hit)}%`;
  if (part === "users") return `${many(d.online, "conectado", "conectados")} ahora · ${many(d.accounts, "cuenta", "cuentas")}`;
  if (part === "rack") return `${many(d.conns, "conexión abierta", "conexiones abiertas")} de ${d.max_conns}`;
  if (part === "db") return `${one(d.db_mb)} MB de ${d.limit_mb} MB · ${one((d.db_mb / d.limit_mb) * 100)}% usado`;
  if (part === "cache") return `Aciertos de caché ${hit}`;
  if (part === "api") return `${one(d.api_per_min)} llamadas/min · ${d.api_hour.toLocaleString("es-PE")} esta hora`;
  return `${many(d.online, "conectado", "conectados")} · ${many(d.conns, "conexión", "conexiones")} · ${one(d.db_mb)} MB · caché ${hit}`;
}

/** Fig 2 · Plataforma en vivo: la sala de la plataforma movida por los datos reales. Toca una pieza para ir a su detalle. */
export function PlatformFigure({ data }: { data: PlatformLive }) {
  const router = useRouter();
  const root = React.useRef<HTMLDivElement>(null);
  const liquid = React.useRef<SVGGElement>(null);
  const riderRef = React.useRef<SVGGElement>(null);
  const needle = React.useRef<SVGPathElement>(null);
  const [part, setPart] = React.useState<Part | null>(null);
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");

  // Mismo tema que el resto del sistema (claro u oscuro)
  React.useEffect(() => {
    const html = document.documentElement;
    const read = () => setTheme(html.classList.contains("dark") ? "dark" : "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // Valores que se mueven con suavidad hacia el dato real
  const level = Math.min(1, Math.max(0, data.db_mb / data.limit_mb));
  const hit = data.cache_hit ?? 0;
  const shown = React.useRef({ level: 0, hit: 0 });
  const draw = React.useCallback(() => {
    const s = shown.current;
    const h = Math.max(0.4, s.level * LEVEL_SPAN);
    const c = cylinder(TANK.x, TANK.y, TANK.liquid, TANK.z, h, P, 64);
    const g = liquid.current;
    if (g) {
      g.querySelector(".iso-fill")?.setAttribute("d", c.fill);
      g.querySelectorAll<SVGPathElement>(".iso-shade").forEach((n, i) => n.setAttribute("d", c.shades[i] ?? ""));
      g.querySelector(".iso-top")?.setAttribute("d", c.top);
      g.querySelector(".iso-edge")?.setAttribute("d", c.outline);
    }
    riderRef.current?.setAttribute("transform", translateAlong(P, [0, 0, s.level * LEVEL_SPAN]));
    const a = SWEEP_FROM + (Math.min(100, Math.max(0, s.hit)) / 100) * SWEEP;
    const R = GAUGE.r - 4;
    needle.current?.setAttribute("d", lineOnTop([GAUGE.x - Math.sin(a) * 3, GAUGE.y + Math.cos(a) * 3], [GAUGE.x + Math.sin(a) * R, GAUGE.y - Math.cos(a) * R], GAUGE.top + 0.2, P));
  }, []);
  const kick = useLoop((dt, calm) => {
    const s = shown.current;
    s.level = follow(s.level, level, dt, 0.6, calm);
    s.hit = follow(s.hit, hit, dt, 0.6, calm);
    draw();
    return s.level !== level || s.hit !== hit;
  }, true);
  React.useEffect(() => { kick(); }, [level, hit, kick]);

  const lit = Math.min(MONITORS.length, data.online);
  const leds = Math.min(LEDS.length, data.conns);
  // Velocidad del tráfico: más llamadas por minuto, más rápido corre por los cables
  const flow = data.api_per_min > 0 ? `${Math.min(6, Math.max(0.35, 6 / data.api_per_min)).toFixed(2)}s` : "0s";

  const hover = (p: Part | null) => () => setPart(p);
  const props = (p: Part, label: string) => ({
    "data-part": p, "data-hot": part === p ? "" : undefined, role: "link", tabIndex: 0, "aria-label": label,
    onMouseEnter: hover(p), onMouseLeave: hover(null), onFocus: hover(p), onBlur: hover(null),
    onClick: () => router.push(GO[p]), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(GO[p]); } },
  });
  const empty = cylinder(TANK.x, TANK.y, TANK.liquid, TANK.z, 0.4, P, 64);

  return (
    <div ref={root} className="iso pf" data-theme={theme}>
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">Fig 2</span>
          <span className="iso-plate-corner" data-corner="title">Plataforma en vivo</span>
          <span className="iso-plate-corner" data-corner="hint">Toca una pieza para ver su detalle</span>
          <span className="iso-plate-corner" data-corner="readout">{readoutOf(data, part)}</span>
        </div>
        <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="Sala de la plataforma: terminales conectadas, rack de la base de datos, tanque de espacio usado y medidor de caché, con datos reales">
          <g dangerouslySetInnerHTML={{ __html: ART.base }} />
          <g {...props("api", `Tráfico de la API: ${readoutOf(data, "api")}`)} className="pf-api" style={{ ["--pf-flow" as string]: flow }} data-idle={data.api_per_min > 0 ? undefined : ""}>
            {CABLES.map(([a, b], i) => {
              const d = pathOf([iso(a, P), iso(b, P)]);
              return (
                <g key={i}>
                  <path className="pf-hit" d={d} />
                  <path className="iso-line" data-tone="mid" d={d} />
                  <path className="iso-line pf-traffic" data-tone="lit" data-flow="" d={d} />
                  {[a, b].map((p, j) => { const [x, y] = iso(p, P); return <circle key={j} className="iso-wire-end" cx={x} cy={y} r={1.1} />; })}
                </g>
              );
            })}
          </g>
          <g dangerouslySetInnerHTML={{ __html: ART.floor }} />
          <g {...props("users", `Personas conectadas: ${readoutOf(data, "users")}`)}>
            <g dangerouslySetInnerHTML={{ __html: ART.desk }} />
            {ART.monitors.map((html, i) => <g key={i} className="pf-monitor" data-on={i < lit ? "" : undefined} dangerouslySetInnerHTML={{ __html: html }} />)}
          </g>
          <g {...props("rack", `Conexiones a la base: ${readoutOf(data, "rack")}`)}>
            <g dangerouslySetInnerHTML={{ __html: ART.rack }} />
            {LEDS.map(([x, y], i) => <circle key={i} className="pf-led" data-on={i < leds ? "" : undefined} cx={Math.round(x * 10) / 10} cy={Math.round(y * 10) / 10} r={1} />)}
          </g>
          <g {...props("db", `Espacio de la base: ${readoutOf(data, "db")}`)}>
            <g dangerouslySetInnerHTML={{ __html: ART.tankBack }} />
            <g ref={liquid} className="iso-solid pf-liquid">
              <path className="iso-fill" d={empty.fill} />
              {empty.shades.map((d, i) => <path key={i} className="iso-shade" data-shade={i} d={d} />)}
              <path className="iso-top" d={empty.top} />
              <path className="iso-line iso-edge" data-tone="lo" d={empty.outline} />
            </g>
            <g dangerouslySetInnerHTML={{ __html: ART.tankGlass }} />
            <g dangerouslySetInnerHTML={{ __html: ART.post }} />
            <g ref={riderRef} dangerouslySetInnerHTML={{ __html: rider() }} />
          </g>
          <g {...props("cache", `Caché de la base: ${readoutOf(data, "cache")}`)}>
            <g dangerouslySetInnerHTML={{ __html: ART.gauge }} />
            <path ref={needle} className="iso-line" data-tone="lit" style={{ strokeWidth: 1.1 }} data-free="end" d="" />
            <path className="iso-line" data-tone="hi" d={ring(GAUGE.x, GAUGE.y, 1.6, GAUGE.top + 0.2, P, 16)} />
          </g>
        </svg>
      </div>
    </div>
  );
}
