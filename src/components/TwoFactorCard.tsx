"use client";
import { useEffect, useState } from "react";
import { Button, toast } from "@heroui/react";
import { ShieldCheck, Smartphone } from "lucide-react";
import { Card } from "@/components/ui";

const input = "h-11 w-full rounded-xl border border-sb-outline-variant bg-sb-surface px-3 text-center text-lg tracking-[0.35em] outline-none focus:border-sb-on-surface";

/**
 * Doble verificación de la propia cuenta: al ingresar, además de la contraseña, se pide el código de 6 dígitos
 * de una app del celular (Google Authenticator, Microsoft Authenticator…). Recomendada para supervisores.
 */
export function TwoFactorCard() {
  const [st, setSt] = useState<{ enabled: boolean; recommended: boolean } | null>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/profile/2fa").then((r) => r.json()).then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);
  const post = async (body: object) => {
    setBusy(true);
    const r = await fetch("/api/profile/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: "Error del servidor" }));
    setBusy(false);
    if (!r.ok) { toast.danger(j.error); return null; }
    return j;
  };
  if (!st) return null;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4" /> Doble verificación</h3>
      {st.enabled ? (
        <>
          <p className="flex items-center gap-2 rounded-xl bg-sb-primary-soft px-3 py-2 text-sm"><ShieldCheck className="h-4 w-4 text-sb-primary" /> <b>Activa.</b> Al ingresar te pedimos el código de tu app.</p>
          <p className="text-[11px] text-sb-on-surface-variant">Para desactivarla (o cambiar de celular), escribe un código de tu app:</p>
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <Button variant="secondary" className="shrink-0 rounded-full" isDisabled={busy || code.length !== 6}
              onPress={async () => { if (await post({ action: "disable", code })) { toast.success("Doble verificación desactivada"); setCode(""); load(); } }}>Desactivar</Button>
          </div>
        </>
      ) : setup ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-sb-on-surface-variant">
            <li>Abre <b>Google Authenticator</b> o <b>Microsoft Authenticator</b> en tu celular.</li>
            <li>Toca «Agregar» y escanea este código.</li>
            <li>Escribe abajo los 6 dígitos que te muestra la app.</li>
          </ol>
          <div className="mx-auto w-48 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <p className="text-center text-[11px] text-sb-on-surface-variant">¿No puedes escanear? Escribe esta clave en la app: <span className="select-all break-all font-mono text-sb-on-surface">{setup.secret}</span></p>
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <Button variant="primary" className="shrink-0 rounded-full" isDisabled={busy || code.length !== 6}
              onPress={async () => { if (await post({ action: "enable", code })) { toast.success("Doble verificación activada", { description: "Desde ahora te pediremos el código al ingresar." }); setSetup(null); setCode(""); load(); } }}>Activar</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-sb-on-surface-variant">
            Además de tu contraseña, al ingresar te pediremos un código de 6 dígitos de una app de tu celular. Si alguien conoce tu contraseña, igual no podrá entrar.
            {st.recommended && <b className="text-sb-on-surface"> Recomendada para tu cuenta.</b>}
          </p>
          <Button variant="primary" className="self-start rounded-full" isDisabled={busy}
            onPress={async () => { const j = await post({ action: "setup" }); if (j) setSetup({ qr: j.qr, secret: j.secret }); }}>
            <ShieldCheck className="h-4 w-4" /> Activar doble verificación
          </Button>
        </>
      )}
    </Card>
  );
}
