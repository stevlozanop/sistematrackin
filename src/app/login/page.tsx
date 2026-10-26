"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlideToSubmit } from "@/components/SlideToSubmit";
import { RouteBackdrop } from "@/components/RouteBackdrop";
import { Input, toast } from "@heroui/react";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [shake, setShake] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (r.ok) { router.replace("/"); router.refresh(); }
    else {
      const data = await r.json().catch(() => null);
      toast.danger(data?.error ?? "Error del servidor, intenta de nuevo");
      setShake((n) => n + 1);
    }
  }

  const field = "h-14 w-full rounded-2xl border-0 bg-white/[0.07] px-4 text-white shadow-none outline-none placeholder:text-white/40 focus:bg-white/10";

  return (
    <main className="grid min-h-screen bg-[#0b0b0b] text-white lg:grid-cols-[minmax(24rem,1fr)_1.25fr]">
      <section className="flex items-center justify-center px-6 py-10">
        <form key={shake} ref={formRef} onSubmit={submit} className={`flex w-full max-w-sm flex-col ${shake ? "sb-anim-shake" : ""}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo de public/ */}
              <img src="/ConsorcioLeyva.png" alt="Consorcio Leyva" className="h-11 w-11 rounded-full bg-white object-cover" />
              <span className="flex flex-col text-[11px] leading-tight text-white/50">
                <span className="font-semibold text-leyva-lime">Consorcio Leyva</span>System Trackin
              </span>
            </span>
            <h1 className="text-4xl font-extralight tracking-tight">Ingresar</h1>
          </div>
          <p className="mt-6 text-center text-sm leading-relaxed text-white/40">
            Ingresa tu correo y contraseña
            <br />
            para dar seguimiento a las cajas CKD
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Input aria-label="Correo" placeholder="Correo" className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
            <Input aria-label="Contraseña" placeholder="Contraseña" className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <div className="my-8 flex items-center gap-3 text-xs text-white/30">
            <span className="h-px flex-1 bg-white/10" />
            Iquitos · Pucallpa · Yurimaguas
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <button type="submit" hidden />
          <SlideToSubmit label="Ingresar" loading={loading} onComplete={() => formRef.current?.requestSubmit()} />
        </form>
      </section>

      <section className="hidden p-3 lg:block">
        <div
          className="relative h-full overflow-hidden rounded-[2rem] bg-black"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px),radial-gradient(circle at 50% 50%,rgba(255,255,255,.12),transparent 65%)",
            backgroundSize: "48px 48px,48px 48px,100% 100%",
          }}
        >
          <RouteBackdrop />
          <div className="absolute bottom-8 left-8 right-8">
            <p className="text-xs tracking-[0.3em] text-white/50">CALLAO · PUCALLPA · IQUITOS · YURIMAGUAS</p>
            <p className="mt-2 text-xl font-light">Cada caja, de puerto a dealer.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
