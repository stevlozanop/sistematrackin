"use client";
import { useState, useSyncExternalStore } from "react";
import NextLink from "next/link";
import { Avatar, AvatarGroup, Badge, Button, ButtonGroup, Card, Chip, Separator, Tabs, Tooltip, toast } from "@heroui/react";
import { Check, Copy, ExternalLink, MessageCircle, Pencil, Store, Trash2, UserPlus, Users } from "lucide-react";

export type ConsortiumUser = { id: number; name: string; email: string; role: string; online: number; last_seen?: string | null };
export type Consortium = {
  id: number; name: string; code: string; slug: string | null; color: string | null; logo_v: string | null; parent: string | null;
  owner_id: number | null; created_at: string; users: ConsortiumUser[];
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
/** "Hace 5 min", "Hace 2 h", "Ayer", "Hace 4 días" */
function ago(iso?: string | null) {
  if (!iso) return "Nunca entró";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Ahora";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "Ayer" : `Hace ${d} días`;
}

/** Copiar con confirmación (ícono ✓ un momento) */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Tooltip delay={300}>
      <Button isIconOnly size="sm" variant="secondary" aria-label={label} onPress={() => navigator.clipboard?.writeText(text).then(() => {
        setDone(true); toast.success("Enlace copiado", { description: text }); setTimeout(() => setDone(false), 1500);
      })}>
        {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
      <Tooltip.Content>{done ? "Copiado" : "Copiar enlace"}</Tooltip.Content>
    </Tooltip>
  );
}

/**
 * Tarjeta de un consorcio (Honda…) hecha con los componentes de HeroUI:
 * encabezado con su logo y cifras, y pestañas para sus entradas (copiar, abrir, compartir) y sus cuentas.
 */
export function ConsortiumCard({ c, onEdit, onDelete, onAddAccount }: {
  c: Consortium; onEdit: () => void; onDelete?: () => void; onAddAccount?: () => void;
}) {
  // Dirección del sistema (en el servidor no se conoce: vacía hasta hidratar)
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const team = c.users.filter((u) => u.role !== "dealer");
  const clients = c.users.filter((u) => u.role === "dealer");
  const online = c.users.filter((u) => Number(u.online)).length;
  const lastClient = clients.map((u) => u.last_seen).filter(Boolean).sort().at(-1) ?? null;
  const entries = c.slug ? [
    { who: "Equipo", desc: `Cuenta principal y empleados de ${c.name}`, path: `/${c.slug}`, icon: Users, n: team.length, live: team.filter((u) => Number(u.online)).length },
    { who: "Clientes", desc: "Sus clientes (SORSA, CREDIVARGAS…) ven solo lo suyo", path: `/${c.slug}/clientes`, icon: Store, n: clients.length, live: clients.filter((u) => Number(u.online)).length },
  ] : [];
  const logo = c.logo_v ? `/api/companies/logo?id=${c.id}&v=${c.logo_v}` : null;

  return (
    <Card>
      <Card.Header className="flex flex-row items-start gap-3">
        <Avatar size="lg" className="rounded-xl">
          {logo && <Avatar.Image alt={`Logo de ${c.name}`} src={logo} />}
          <Avatar.Fallback style={c.color ? { background: c.color, color: "#fff" } : undefined}>{initials(c.name)}</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Card.Title className="truncate">{c.name}</Card.Title>
            <Chip size="sm" variant="soft" className="font-mono">{c.code}</Chip>
          </div>
          <Card.Description>Consorcio · solo lectura{c.parent ? ` · creado por ${c.parent}` : ""} · desde {c.created_at}</Card.Description>
        </div>
        <ButtonGroup size="sm" variant="tertiary">
          <Tooltip delay={300}>
            <Button isIconOnly size="sm" variant="tertiary" aria-label={`Editar ${c.name}`} onPress={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Tooltip.Content>Editar datos, color y logo</Tooltip.Content>
          </Tooltip>
          {onDelete && (
            <Tooltip delay={300}>
              <Button isIconOnly size="sm" variant="tertiary" aria-label={`Eliminar ${c.name}`} onPress={onDelete}><ButtonGroup.Separator /><Trash2 className="h-4 w-4" /></Button>
              <Tooltip.Content>Eliminar consorcio</Tooltip.Content>
            </Tooltip>
          )}
        </ButtonGroup>
      </Card.Header>

      <Card.Content className="flex flex-col gap-4">
        {/* Cifras */}
        <div className="flex items-stretch gap-4 text-sm">
          {[
            { k: "Equipo", v: team.length },
            { k: "Clientes con cuenta", v: clients.length },
            { k: "En línea ahora", v: online },
          ].map((s, i) => (
            <div key={s.k} className="flex items-stretch gap-4">
              {i > 0 && <Separator orientation="vertical" />}
              <div>
                <p className="text-xl font-semibold tabular-nums">{s.v}</p>
                <p className="text-xs text-sb-on-surface-variant">{s.k}</p>
              </div>
            </div>
          ))}
        </div>

        <Tabs aria-label={`Detalle de ${c.name}`}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Secciones">
              <Tabs.Tab id="entries">Entradas<Tabs.Indicator /></Tabs.Tab>
              <Tabs.Tab id="accounts">Cuentas ({team.length + clients.length})<Tabs.Indicator /></Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="entries" className="pt-3">
            {entries.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {entries.map((e) => {
                  const url = `${origin}${e.path}`;
                  return (
                    <Card key={e.path} variant="secondary">
                      <Card.Header className="flex flex-row items-center gap-2">
                        <e.icon className="h-4 w-4 text-sb-on-surface-variant" />
                        <Card.Title className="text-sm">Entrada · {e.who}</Card.Title>
                        <Chip size="sm" variant="soft" className="ml-auto">{e.n} {e.n === 1 ? "cuenta" : "cuentas"}</Chip>
                        {e.live > 0 && <Chip size="sm" color="success" variant="soft">{e.live} en línea</Chip>}
                      </Card.Header>
                      <Card.Content className="flex flex-col gap-1">
                        <Card.Description>{e.desc}</Card.Description>
                        <p className="font-mono text-base font-semibold">{e.path}</p>
                        <p className="truncate font-mono text-xs text-sb-on-surface-variant">{url || e.path}</p>
                      </Card.Content>
                      <Card.Footer>
                        <ButtonGroup size="sm" variant="secondary">
                          <CopyButton text={url} label={`Copiar enlace de ${e.who.toLowerCase()}`} />
                          <Tooltip delay={300}>
                            <Button isIconOnly size="sm" variant="secondary" aria-label={`Abrir entrada de ${e.who.toLowerCase()}`} onPress={() => window.open(e.path, "_blank", "noopener")}><ButtonGroup.Separator /><ExternalLink className="h-4 w-4" /></Button>
                            <Tooltip.Content>Abrir en otra pestaña</Tooltip.Content>
                          </Tooltip>
                          <Tooltip delay={300}>
                            <Button isIconOnly size="sm" variant="secondary" aria-label={`Compartir entrada de ${e.who.toLowerCase()} por WhatsApp`}
                              onPress={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Ingresa a System Trackin de ${c.name}: ${url}`)}`, "_blank", "noopener")}>
                              <ButtonGroup.Separator /><MessageCircle className="h-4 w-4" />
                            </Button>
                            <Tooltip.Content>Compartir por WhatsApp</Tooltip.Content>
                          </Tooltip>
                        </ButtonGroup>
                      </Card.Footer>
                    </Card>
                  );
                })}
              </div>
            ) : <p className="text-sm text-sb-on-surface-variant">Este consorcio aún no tiene dirección de entrada. Edítalo para ponerle una.</p>}
          </Tabs.Panel>

          <Tabs.Panel id="accounts" className="flex flex-col gap-3 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sb-on-surface-variant">Equipo</span>
              {onAddAccount && <Button size="sm" variant="secondary" onPress={onAddAccount}><UserPlus className="h-4 w-4" /> Agregar cuenta</Button>}
            </div>
            {team.length ? (
              <ul className="flex flex-col">
                {team.map((u, i) => (
                  <li key={u.id}>
                    {i > 0 && <Separator />}
                    <div className="flex items-center gap-3 py-2.5">
                      <Badge.Anchor>
                        <Avatar size="sm"><Avatar.Fallback>{initials(u.name)}</Avatar.Fallback></Avatar>
                        <Badge color={Number(u.online) ? "success" : "default"} placement="bottom-right" size="sm" />
                      </Badge.Anchor>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">{u.name}{u.id === c.owner_id && <Chip size="sm" color="accent" variant="soft">Principal</Chip>}</p>
                        <p className="truncate text-xs text-sb-on-surface-variant">{u.email}</p>
                      </div>
                      <span className="shrink-0 text-xs text-sb-on-surface-variant">{Number(u.online) ? "En línea" : ago(u.last_seen)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-sb-on-surface-variant">Sin cuentas todavía.</p>}

            {clients.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center gap-3">
                  <AvatarGroup size="sm" max={5} role="group" aria-label="Clientes con cuenta">
                    {clients.map((u) => <Avatar key={u.id}><Avatar.Fallback>{initials(u.name)}</Avatar.Fallback></Avatar>)}
                  </AvatarGroup>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{clients.length} cuentas de clientes</p>
                    <p className="text-xs text-sb-on-surface-variant">{lastClient ? `Último ingreso: ${ago(lastClient).toLowerCase()}` : "Todavía nadie entró"}</p>
                  </div>
                  <NextLink href="/admins" className="text-sm font-medium text-sb-primary hover:underline">Ver en Usuarios</NextLink>
                </div>
              </>
            )}
          </Tabs.Panel>
        </Tabs>
      </Card.Content>
    </Card>
  );
}
