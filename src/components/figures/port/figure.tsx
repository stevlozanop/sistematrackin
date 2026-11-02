import type * as React from "react";
import { ART, ITEMS } from "./geometry";
import { PortLive } from "./live";
import { CRATES, poseAt, readoutOf } from "./model";
import "@/components/iso/iso.css";
import "./port.css";

/**
 * Fig 1 del login: el muelle de Iquitos. Una grúa pórtico sube las cajas CKD a la chata (1.1 Embarque)
 * y la chata zarpa con su remolcador (2 Tránsito fluvial). accent = color de la empresa (el borde de la caja que se mueve).
 */
export function PortFigure({ accent = "#bedf3c", caption }: { accent?: string; caption?: React.ReactNode }) {
  return (
    <div className="iso port h-full" style={{ ["--anatomy-lit" as string]: accent }}>
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">Fig 1</span>
          <span className="iso-plate-corner" data-corner="title">Puerto de Iquitos</span>
          <span className="iso-plate-corner" data-corner="hint">Mueve el cursor ← →</span>
          <span className="iso-plate-corner" data-corner="readout" data-readout="">{readoutOf(poseAt(0))}</span>
        </div>
        <PortLive
          art={ART}
          items={ITEMS}
          label={`Muelle de Iquitos: una grúa pórtico sube ${CRATES} cajas CKD de motos a una chata empujada por un remolcador, y la chata zarpa por el río.`}
        />
        {caption && <div className="port-caption">{caption}</div>}
      </div>
    </div>
  );
}
