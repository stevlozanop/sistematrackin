"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, Modal } from "@heroui/react";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Building2, CalendarCheck, CheckCircle2, CircleUser, ClipboardCheck,
  FileSpreadsheet, Gauge, LayoutDashboard, Lock, Map as MapIcon, PackageSearch, Route, ShieldCheck, Ship, SlidersHorizontal, Store, Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { SITE_INFO, type Site } from "@/lib/hsp";
import { AREAS, areaOf } from "@/lib/workflow";

import type { Role } from "@/lib/workflow";
type Me = { name: string; role: Role; area: string | null; carrier: string | null; canImport: boolean; stages: { site: Site; field: string }[] };
type Step = { icon: LucideIcon; title: string; body: React.ReactNode };

/* ---------- Piezas visuales ---------- */

const P = ({ children }: { children: React.ReactNode }) => <p className="text-sm leading-relaxed text-sb-on-surface/80">{children}</p>;
const List = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-sb-on-surface/80">
    {items.map((x, i) => (
      <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sb-on-surface/40" /><span>{x}</span></li>
    ))}
  </ul>
);
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-sb-outline-variant/50 bg-sb-surface-container-low px-3 py-2 text-[12px] leading-relaxed text-sb-on-surface-variant">{children}</div>
);
const Term = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5 border-b border-sb-outline-variant/25 py-2 last:border-0 sm:flex-row sm:gap-3">
    <b className="w-40 shrink-0 text-[13px]">{k}</b><span className="text-[13px] leading-relaxed text-sb-on-surface/75">{children}</span>
  </div>
);

/** Recorrido de un módulo como línea de pasos numerados. */
function Route_({ site, mine = [] }: { site: Site; mine?: string[] }) {
  const dates = SITE_INFO[site].dates;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-sb-on-surface-variant/60">{SITE_INFO[site].title}</span>
      <div className="flex flex-wrap items-center gap-1">
        {site === "PCL" && <Chip>1. Iquitos (facturado)</Chip>}
        {dates.map((d) => (
          <span key={d.key} className="flex items-center gap-1">
            <span className="text-sb-on-surface-variant/40">›</span>
            <Chip on={mine.includes(d.key)} dashed={d.key === "d_alm_lima" || d.key === "d_sal_lima"}>{d.label}</Chip>
          </span>
        ))}
      </div>
    </div>
  );
}
const Chip = ({ children, on, dashed }: { children: React.ReactNode; on?: boolean; dashed?: boolean }) => (
  <span className={cn(
    "rounded-full px-2.5 py-1 text-[11px] font-medium",
    on ? "bg-sb-primary text-sb-on-primary" : "bg-sb-surface-container-high text-sb-on-surface-variant",
    dashed && !on && "border border-dashed border-sb-on-surface-variant/40 bg-transparent",
  )}>{children}</span>
);

const stageName = (site: Site, field: string) => SITE_INFO[site].dates.find((d) => d.key === field)?.label ?? field;

/* ---------- Pasos comunes ---------- */

const ROUTE_STEP: Step = {
  icon: Route,
  title: "El recorrido de cada unidad",
  body: (
    <>
      <P>Las cajas CKD llegan de Japón al Callao, suben por tierra hasta Pucallpa y por río hasta la fábrica de Iquitos, donde se arman. <b>El sistema empieza cuando la unidad se factura en Iquitos</b> y termina cuando llega al dealer.</P>
      <P>Hay dos rutas, cada una con su módulo y sus fechas:</P>
      <Route_ site="PCL" />
      <Route_ site="YUR" />
      <Note>Los pasos <b>5.1</b> y <b>5.2</b> (línea punteada) solo existen para los dealers de <b>Ruta Lima</b> (Madre de Dios y Lima): la unidad pasa por el almacén del transportista en Lima antes de ir al dealer. Los demás van directo del paso 5 al 6.</Note>
    </>
  ),
};

const STATUS_STEP: Step = {
  icon: Gauge,
  title: "Estado, plazo y nivel de servicio",
  body: (
    <>
      <P>Nadie escribe el estado a mano: el sistema lo calcula solo con las fechas.</P>
      <div className="flex flex-col">
        <Term k="Estado">Es la <b>última etapa que tiene fecha</b>. Sin fechas = IQT-PORT. Con zarpe = TRÁNSITO FLUVIAL. Con entrega al dealer = ENTREGADO.</Term>
        <Term k="Plazo (lead time)">Días que debería tardar. PCL depende del <b>departamento</b> (Ucayali 16, Madre de Dios 25…). YUR depende de la <b>ruta</b> y de si el río está en creciente (enero–abril) o vaciante.</Term>
        <Term k="Fecha estimada">Fecha de facturación + plazo.</Term>
        <Term k="Nivel de servicio"><b className="text-sky-600">A TIEMPO</b> si se entregó (o sigue en camino) hasta la fecha estimada. Si no, <b className="text-red-500">FUERA DE TIEMPO</b>.</Term>
        <Term k="Meta">85 % de unidades a tiempo (se cambia en Plazos y meta).</Term>
      </div>
    </>
  ),
};

const RULES_STEP: Step = {
  icon: Lock,
  title: "Las reglas para registrar fechas",
  body: (
    <>
      <P>Para que los datos sean confiables, los encargados siguen cuatro reglas:</P>
      <List items={[
        <><b>Orden estricto:</b> solo se puede registrar la etapa que sigue. No se puede registrar el arribo si todavía no hay zarpe.</>,
        <><b>Sin fechas futuras</b> y nunca antes que la fecha de la etapa anterior.</>,
        <><b>Queda bloqueada:</b> una vez guardada, el encargado ya no puede cambiarla.</>,
        <><b>Solo su parte:</b> cada encargado ve y registra solo las etapas de su área (y, si es transportista, solo las unidades de su empresa).</>,
      ]} />
      <Note>Si alguien se equivoca, un <b>supervisor o el super admin</b> corrige la fecha desde la tabla del módulo. Cada cambio queda guardado en el historial con quién y cuándo lo hizo.</Note>
    </>
  ),
};

const PROFILE_STEP: Step = {
  icon: CircleUser,
  title: "Tu perfil y esta guía",
  body: (
    <>
      <P>En <b>Mi perfil</b> (abajo en el menú, o tocando tu nombre arriba a la derecha) ves tus datos, cuántas fechas registraste y puedes cambiar tu nombre y tu contraseña.</P>
      <P>Esta guía se abre sola la primera vez. Para volver a verla cuando quieras, usa el botón <b>Guía del sistema</b> <BookOpen className="inline h-3.5 w-3.5" /> del menú.</P>
    </>
  ),
};

/* ---------- Guía del super admin / supervisor ---------- */

function superSteps(role: Role): Step[] {
  const dev = role === "dev";
  return [
    {
      icon: BookOpen,
      title: dev ? "Bienvenido, Super admin" : "Bienvenido, Supervisor",
      body: (
        <>
          <P><b>System Trackin</b> sigue cada moto desde que se factura en Iquitos hasta que llega al dealer, y mide si llegó a tiempo. Reemplaza al Excel <b>HSP-OFICIAL</b>: las mismas hojas PCL, YUR y TABLA, pero en vivo y con cada persona registrando su parte.</P>
          <P>En esta guía verás, paso a paso: el recorrido, cómo se calcula el estado, quién hace qué, y para qué sirve cada pantalla.</P>
          <Note>Usa <b>Siguiente</b> para avanzar. Puedes saltar a cualquier paso con los puntos de arriba.</Note>
        </>
      ),
    },
    ROUTE_STEP,
    STATUS_STEP,
    {
      icon: ShieldCheck,
      title: "Los tipos de cuenta",
      body: (
        <div className="flex flex-col">
          <Term k="Super admin (dev)">Ve y corrige todo. Es el único que registra <b>empresas</b> y crea <b>supervisores</b>. También crea encargados, cambia plazos y carga el Excel general.</Term>
          <Term k="Supervisor">El administrador de la empresa (por ejemplo, Consorcio Leyva). Ve todo, corrige fechas, carga el Excel y crea <b>encargados</b> y cuentas de <b>dealers</b> y de solo lectura.</Term>
          <Term k="Encargado">Una persona del recorrido (puerto, almacén, transporte). Solo registra las fechas de <b>su área</b>, en orden. Entra directo a su pantalla <b>Mi trabajo</b>.</Term>
          <Term k="Solo lectura">Para Honda u otro cliente: ve el dashboard, las alertas y las unidades en vivo, pero <b>no puede cambiar nada</b>.</Term>
          <Term k="Dealer">Cada tienda ve <b>solo sus unidades</b>: en qué etapa van, cuándo llegan y si llegan a tiempo. Tampoco puede cambiar nada.</Term>
        </div>
      ),
    },
    {
      icon: MapIcon,
      title: "Las áreas de los encargados",
      body: (
        <>
          <P>Al crear un encargado eliges su <b>área</b>, y el área define qué fechas registra:</P>
          <div className="flex flex-col">
            {AREAS.filter((a) => a.id !== "CUSTOM").map((a) => (
              <Term key={a.id} k={a.label}>
                {a.fields.map((f) => stageName(a.site!, f)).join(" · ")}
                {a.carrier && <span className="text-sb-on-surface-variant"> — se puede ligar a una empresa de transporte</span>}
              </Term>
            ))}
            <Term k="Personalizado">Eliges a mano las etapas (de PCL, YUR o ambas).</Term>
          </div>
          <Note>El <b>Almacén PCL</b>, al registrar el despacho, indica qué empresa de transporte lleva la unidad. Así el transportista ligado a esa empresa solo ve sus unidades.</Note>
        </>
      ),
    },
    RULES_STEP,
    {
      icon: FileSpreadsheet,
      title: "Cargar el Excel (carga masiva)",
      body: (
        <>
          <P>En los módulos <b>PCL</b> o <b>YUR</b>, el botón <b>Cargar Excel</b> acepta dos archivos:</P>
          <List items={[
            <><b>HSP-OFICIAL</b> (hojas PCL y YUR): el histórico completo.</>,
            <><b>PCL-FACT</b>: la facturación diaria. Agrega las unidades nuevas.</>,
          ]} />
          <P>Primero ves una <b>vista previa</b>: cuántas unidades son nuevas, cuántas se actualizan y si hay chasis repetidos. Nada se guarda hasta que presionas <b>Guardar</b>.</P>
          <Note>Los dealers se crean solos con el Excel. Los encargados con permiso de carga pueden subir su propia plantilla con las fechas de su etapa desde <b>Mi trabajo</b>.</Note>
        </>
      ),
    },
    {
      icon: LayoutDashboard,
      title: "Dashboard",
      body: (
        <>
          <P>Es la hoja <b>TABLA</b> del Excel. Muestra, por mes de facturación, cuántas unidades hay en cada estado y cuántas van a tiempo o fuera de tiempo.</P>
          <List items={[
            <>% a tiempo de <b>PCL</b>, <b>YUR</b> y <b>HSP</b> (promedio de ambos) frente a la meta del 85 %.</>,
            <>Mapa de calor: más intenso = más unidades. Haz clic en una celda para ver esas unidades.</>,
            <>Filtros por año y por centro (CL 3101, 3106, 3114).</>,
          ]} />
        </>
      ),
    },
    {
      icon: Ship,
      title: "Módulos PCL y YUR",
      body: (
        <>
          <P>Son las hojas PCL y YUR del Excel: una tabla con todas las unidades, sus fechas, estado, fecha estimada y nivel de servicio. Se actualiza sola cada 10 segundos.</P>
          <List items={[
            <>Busca por chasis, motor, lote, factura, guía o pedido, y filtra por estado, mes o nivel de servicio.</>,
            <>Tú puedes <b>corregir cualquier fecha</b>, incluso las bloqueadas.</>,
            <>Si una unidad llega tarde, se pide el <b>motivo de demora</b>.</>,
          ]} />
        </>
      ),
    },
    {
      icon: AlertTriangle,
      title: "Alertas",
      body: (
        <>
          <P>Avisan antes de que una unidad quede fuera de tiempo. La campana de arriba muestra cuántas hay.</P>
          <div className="flex flex-col">
            <Term k="VENCIDA">Ya pasó la fecha estimada y no se entregó.</Term>
            <Term k="POR VENCER">Faltan 2 días o menos (se cambia en Plazos y meta).</Term>
          </div>
          <P>La pantalla también muestra <b>en qué etapa están detenidas</b>, para saber a qué encargado llamar.</P>
        </>
      ),
    },
    {
      icon: Activity,
      title: "En vivo",
      body: (
        <>
          <P>Tu centro de control. Se actualiza cada 5 segundos:</P>
          <List items={[
            <>Qué encargados están <b>conectados</b> ahora.</>,
            <>Cuántas unidades le <b>faltan</b> a cada uno en su etapa.</>,
            <>Cada fecha que se registra, al instante: quién, qué unidad y a qué hora.</>,
          ]} />
        </>
      ),
    },
    {
      icon: SlidersHorizontal,
      title: "Dealers y Plazos y meta",
      body: (
        <div className="flex flex-col">
          <Term k="Dealers">Lista de tiendas. Aquí marcas cuáles son <b>Ruta Lima</b>: sus unidades pasarán por los pasos 5.1 y 5.2.</Term>
          <Term k="Plazos y meta">Días de plazo por departamento (PCL) o ruta (YUR), los meses de creciente del río, la meta % y los días de aviso de «por vencer». Al guardar, todas las fechas estimadas se recalculan.</Term>
          <Term k="Zonas sin plazo">Si una zona tiene unidades pero no tiene plazo, aparece abajo para agregarla con un clic.</Term>
        </div>
      ),
    },
    {
      icon: Users,
      title: "Usuarios: crear cuentas",
      body: (
        <>
          <P>En <b>Usuarios</b> presiona <b>Nuevo usuario</b> y elige el tipo: Encargado, Dealer, Solo lectura{dev ? " o Supervisor" : ""}.</P>
          <List items={[
            <>Escribe el nombre: el <b>correo y la contraseña se autocompletan</b> (puedes editarlos).</>,
            <>Si es <b>Dealer</b>, elige su tienda: solo verá esas unidades.</>,
            <>Elige el <b>módulo</b> (PCL o YUR) y el <b>área</b>. Si es transporte, opcionalmente la empresa.</>,
            <>Activa <b>carga de Excel</b> si quieres que suba fechas en bloque.</>,
            <>Copia los accesos y entrégaselos. Al entrar por primera vez, verá su propia guía paso a paso.</>,
          ]} />
          <Note>Desde la misma lista puedes cambiar el área de alguien (aplica al instante), resetear su contraseña o eliminarlo.</Note>
        </>
      ),
    },
    ...(dev ? [{
      icon: Building2,
      title: "Empresas y compartir el sistema",
      body: (
        <>
          <P>En <b>Empresas</b> registras a quién pertenece el sistema y con quién se comparte:</P>
          <List items={[
            <><b>Transportista</b> (Consorcio Leyva): sus cuentas son supervisores. Eliges sus transportistas del grupo (Transportes Leyva, Joseph…) y ves cuántas unidades llevó y su % a tiempo.</>,
            <><b>Cliente</b> (Honda): sus cuentas son de solo lectura, para que vean cómo van los estados.</>,
          ]} />
          <P>A cada <b>dealer</b> se le crea su cuenta en Usuarios: entra a <b>Mis unidades</b> y ve solo lo suyo.</P>
        </>
      ),
    } satisfies Step] : []),
    {
      icon: CalendarCheck,
      title: "Un día normal",
      body: (
        <List items={[
          <><b>Mañana:</b> carga el PCL-FACT del día → aparecen las unidades nuevas en IQT-PORT.</>,
          <><b>Durante el día:</b> cada encargado registra su etapa desde Mi trabajo. Tú lo ves en <b>En vivo</b>.</>,
          <><b>Revisa Alertas:</b> llama a quien tenga unidades detenidas o por vencer.</>,
          <><b>Corrige</b> en los módulos si alguien se equivocó.</>,
          <><b>Fin de mes:</b> el Dashboard te da el % a tiempo frente a la meta, igual que la hoja TABLA.</>,
        ]} />
      ),
    },
    PROFILE_STEP,
  ];
}

/* ---------- Guía del encargado (personalizada) ---------- */

function operatorSteps(me: Me): Step[] {
  const area = areaOf(me.area);
  const sites = [...new Set(me.stages.map((s) => s.site))];
  const mine = me.stages.map((s) => s.field);
  const despacho = me.stages.some((s) => s.site === "PCL" && s.field === "d_despacho");
  return [
    {
      icon: BookOpen,
      title: `Hola, ${me.name.split(" ")[0]}`,
      body: (
        <>
          <P><b>System Trackin</b> sigue cada moto desde que se factura en Iquitos hasta que llega al dealer. Cada persona del recorrido registra <b>la fecha de su paso</b>, y así todos ven en qué va cada unidad.</P>
          <P>Tú eres <b>Encargado</b>{area && area.id !== "CUSTOM" ? <> de <b>{area.label}</b></> : ""}{me.carrier ? <> para la empresa <b>{me.carrier}</b></> : ""}. Esta guía te explica qué te toca hacer.</P>
          <Note>Usa <b>Siguiente</b> para avanzar.</Note>
        </>
      ),
    },
    {
      icon: Route,
      title: "Tu lugar en el recorrido",
      body: (
        <>
          <P>Estos son los pasos de la unidad. Los que están en <b>negro</b> son los tuyos:</P>
          {sites.map((s) => <Route_ key={s} site={s} mine={mine} />)}
          {sites.includes("PCL") && <Note>Los pasos con línea punteada (5.1 y 5.2) solo aplican a dealers de Ruta Lima.</Note>}
        </>
      ),
    },
    {
      icon: ClipboardCheck,
      title: "Tu pantalla: Mi trabajo",
      body: (
        <>
          <P>Al entrar llegas a <b>Mi trabajo</b>. Ahí ves solo las unidades que <b>esperan tu etapa</b>, es decir, las que ya pasaron el paso anterior.</P>
          <P>Tus etapas:</P>
          <div className="flex flex-wrap gap-1.5">{me.stages.map((s) => <Chip key={s.site + s.field} on>{s.site} · {stageName(s.site, s.field)}</Chip>)}</div>
          {me.carrier && <Note>Solo ves las unidades que lleva <b>{me.carrier}</b>.</Note>}
        </>
      ),
    },
    {
      icon: CheckCircle2,
      title: "Cómo registrar una fecha",
      body: (
        <>
          <List items={[
            <><b>1.</b> Marca las unidades que ya pasaron por tu etapa (puedes marcar varias).</>,
            <><b>2.</b> Elige la fecha{despacho ? " y la empresa de transporte que lleva la unidad" : ""}.</>,
            <><b>3.</b> Presiona <b>Registrar</b>.</>,
          ]} />
          <P>Las unidades registradas desaparecen de tu lista y pasan al siguiente encargado.</P>
        </>
      ),
    },
    RULES_STEP,
    ...(me.canImport ? [{
      icon: FileSpreadsheet,
      title: "Registrar muchas a la vez con Excel",
      body: (
        <List items={[
          <>En Mi trabajo, descarga la <b>plantilla</b>: ya trae tus unidades pendientes.</>,
          <>Escribe la fecha en la columna de tu etapa y sube el archivo.</>,
          <>Antes de guardar verás cuáles se registran y cuáles no (y por qué).</>,
        ]} />
      ),
    } satisfies Step] : []),
    {
      icon: AlertTriangle,
      title: "Alertas y demoras",
      body: (
        <>
          <P>La campana de arriba te avisa de unidades <b>vencidas</b> o <b>por vencer</b> en tu etapa. Atiéndelas primero.</P>
          <P>Si una unidad ya llegó tarde, el sistema te pedirá el <b>motivo de demora</b> al registrar la fecha.</P>
        </>
      ),
    },
    {
      icon: Store,
      title: "Si algo no cuadra",
      body: (
        <List items={[
          <>¿Te equivocaste de fecha? Avisa a tu <b>supervisor</b>: él la corrige.</>,
          <>¿No ves una unidad? Seguramente falta el paso anterior. Tu supervisor puede ver en qué etapa está.</>,
          <>¿Necesitas otra etapa? Tu supervisor cambia tu área y aparece al instante.</>,
        ]} />
      ),
    },
    PROFILE_STEP,
  ];
}

/* ---------- Guía de solo lectura (Honda) ---------- */

function viewerSteps(me: Me): Step[] {
  return [
    {
      icon: BookOpen,
      title: `Hola, ${me.name.split(" ")[0]}`,
      body: (
        <>
          <P><b>System Trackin</b> sigue cada moto desde que se factura en Iquitos hasta que llega al dealer. Lo opera la transportista; tú tienes una cuenta de <b>solo lectura</b>: ves todo en vivo, sin poder cambiar nada.</P>
          <Note>Usa <b>Siguiente</b> para avanzar.</Note>
        </>
      ),
    },
    ROUTE_STEP,
    STATUS_STEP,
    {
      icon: LayoutDashboard,
      title: "Qué puedes ver",
      body: (
        <div className="flex flex-col">
          <Term k="Dashboard">% a tiempo de PCL, YUR y HSP por mes, frente a la meta del 85 %, como la hoja TABLA.</Term>
          <Term k="Alertas">Unidades vencidas o por vencer y en qué etapa están detenidas.</Term>
          <Term k="PCL y YUR">Todas las unidades con sus fechas, estado y nivel de servicio. Busca por chasis, motor, guía…</Term>
          <Term k="En vivo">Quién está registrando y cada fecha que se guarda, al instante.</Term>
        </div>
      ),
    },
    PROFILE_STEP,
  ];
}

/* ---------- Guía del dealer ---------- */

function dealerSteps(me: Me): Step[] {
  return [
    {
      icon: BookOpen,
      title: `Hola, ${me.name.split(" ")[0]}`,
      body: (
        <>
          <P>Aquí sigues <b>las unidades de tu tienda</b> desde que se facturan en Iquitos hasta que llegan a ti: en qué etapa van, cuándo deberían llegar y si llegan a tiempo.</P>
          <P>Tu cuenta es de <b>solo consulta</b>: las fechas las registra la transportista en cada paso.</P>
          <Note>Usa <b>Siguiente</b> para avanzar.</Note>
        </>
      ),
    },
    ROUTE_STEP,
    {
      icon: PackageSearch,
      title: "Tu pantalla: Mis unidades",
      body: (
        <>
          <List items={[
            <>Arriba ves cuántas tienes <b>en camino</b>, cuántas están <b>retrasadas</b>, cuántas se entregaron y qué % llegó a tiempo.</>,
            <>Cada unidad muestra una <b>barra de avance</b> por etapa y la fecha aproximada de llegada.</>,
            <>Toca una unidad para ver su <b>recorrido completo</b> con la fecha de cada paso.</>,
            <>Busca por chasis, motor, modelo o guía. La pantalla se actualiza sola.</>,
          ]} />
        </>
      ),
    },
    {
      icon: Gauge,
      title: "¿Llega a tiempo?",
      body: (
        <div className="flex flex-col">
          <Term k="Fecha estimada">Fecha de facturación + el plazo de tu zona.</Term>
          <Term k="A tiempo"><b className="text-sky-600">A TIEMPO</b> si llega hasta la fecha estimada.</Term>
          <Term k="Retrasada">Ya pasó la fecha estimada y todavía no llega: se marca en <b className="text-red-500">rojo</b>.</Term>
        </div>
      ),
    },
    PROFILE_STEP,
  ];
}

/* ---------- Modal ---------- */

export function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    if (open && !me) fetch("/api/profile").then((r) => r.json()).then(setMe).catch(() => {});
  }, [open, me]);
  const close = () => { onClose(); setI(0); }; // la próxima vez empieza desde el paso 1

  const steps = !me ? [] : me.role === "operator" ? operatorSteps(me) : me.role === "viewer" ? viewerSteps(me) : me.role === "dealer" ? dealerSteps(me) : superSteps(me.role);
  const step = steps[i];
  const last = i === steps.length - 1;
  const go = (n: number) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(steps.length - 1, n))); };

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={(o) => !o && close()}>
        <Modal.Container size="lg">
          <Modal.Dialog className="sm:max-w-2xl">
            <Modal.CloseTrigger aria-label="Cerrar guía" />
            {!step ? (
              <Modal.Body className="p-6 text-sm text-sb-on-surface-variant">Cargando guía…</Modal.Body>
            ) : (
              <>
                <Modal.Header className="flex flex-col gap-3">
                  <div className="flex items-center gap-1" role="tablist" aria-label="Pasos de la guía">
                    {steps.map((s, n) => (
                      <button key={n} type="button" role="tab" aria-selected={n === i} aria-label={`Paso ${n + 1}: ${s.title}`} title={s.title}
                        onClick={() => go(n)}
                        className={cn("h-1.5 rounded-full transition-all duration-300", n === i ? "w-6 bg-sb-on-surface" : n < i ? "w-3 bg-sb-on-surface/40" : "w-3 bg-sb-surface-container-highest")} />
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sb-primary text-sb-on-primary"><step.icon className="h-5 w-5" /></span>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-sb-on-surface-variant/60">Paso {i + 1} de {steps.length}</p>
                      <Modal.Heading className="text-lg font-semibold tracking-tight">{step.title}</Modal.Heading>
                    </div>
                  </div>
                </Modal.Header>
                <Modal.Body className="max-h-[60vh] overflow-y-auto p-1">
                  <AnimatePresence mode="wait" custom={dir}>
                    <motion.div key={i} custom={dir} className="flex flex-col gap-3"
                      initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }}
                      transition={{ duration: 0.2, ease: [0.37, 0.35, 0, 1] }}>
                      {step.body}
                    </motion.div>
                  </AnimatePresence>
                </Modal.Body>
                <Modal.Footer className="flex items-center justify-between">
                  <Button variant="secondary" className="rounded-full" isDisabled={i === 0} onPress={() => go(i - 1)}>
                    <ArrowLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <Button variant="primary" className="rounded-full" onPress={() => (last ? close() : go(i + 1))}>
                    {last ? <>Entendido <CheckCircle2 className="h-4 w-4" /></> : <>Siguiente <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
