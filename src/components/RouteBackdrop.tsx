const NODES = [
  { id: "callao", label: "CALLAO", x: 220, y: 730 },
  { id: "pucallpa", label: "PUCALLPA", x: 640, y: 520 },
  { id: "yurimaguas", label: "YURIMAGUAS", x: 900, y: 250 },
  { id: "iquitos", label: "IQUITOS", x: 1330, y: 170 },
];

const ROUTES = [
  { id: "r1", d: "M220 730 C 380 700, 480 600, 640 520", dur: "5s" },
  { id: "r2", d: "M640 520 C 760 470, 800 340, 900 250", dur: "4s" },
  { id: "r3", d: "M640 520 C 900 560, 1180 420, 1330 170", dur: "7s" },
];

/** Animación de rutas: Callao → Pucallpa → Iquitos / Yurimaguas. */
export function RouteBackdrop() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="100 60 1400 780" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {ROUTES.map((r) => (
        <g key={r.id}>
          <path id={r.id} d={r.d} fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 10">
            <animate attributeName="stroke-dashoffset" from="0" to="-56" dur="2.5s" repeatCount="indefinite" />
          </path>
          {[0, 0.5].map((o) => (
            <circle key={o} r="4" fill="#bedf3c">
              <animateMotion dur={r.dur} begin={`${-o * parseFloat(r.dur)}s`} repeatCount="indefinite">
                <mpath href={`#${r.id}`} />
              </animateMotion>
            </circle>
          ))}
        </g>
      ))}

      {NODES.map((n, i) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r="6" fill="#09ae04" />
          <circle cx={n.x} cy={n.y} r="6" fill="none" stroke="#09ae04">
            <animate attributeName="r" values="6;30" dur="3s" begin={`${i * 0.7}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0" dur="3s" begin={`${i * 0.7}s`} repeatCount="indefinite" />
          </circle>
          <text x={n.x + 18} y={n.y + 5} fill="#fff" fillOpacity="0.55" fontSize="18" letterSpacing="4" fontFamily="monospace">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
