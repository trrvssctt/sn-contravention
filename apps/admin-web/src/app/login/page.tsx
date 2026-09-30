'use client';

import { ArrowRight, Envelope, LockKey, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[linear-gradient(140deg,#1FB87E_0%,#0E8C57_60%,#0B6E45_100%)] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-24 -right-24 h-[380px] w-[380px] rounded-full bg-white/[.07]" />
        <div className="absolute right-24 -bottom-32 h-[280px] w-[280px] rounded-full bg-white/[.05]" />
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/flag-senegal.svg" alt="" className="h-[22px] w-8 rounded-[3px] object-cover" />
          </div>
          <div>
            <div className="text-[17px] font-extrabold">SEN Contraventions</div>
            <div className="text-[12.5px] font-bold text-[#D3F2E3]">Administration centrale</div>
          </div>
        </div>
        <motion.div className="mt-auto max-w-[460px]" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-[34px] leading-[1.15] font-extrabold tracking-[-.6px]">Du constat sur le terrain au recouvrement, en temps réel.</div>
          <div className="mt-4 text-[15px] font-semibold text-[#D3F2E3]">
            Pilotez les brigades, le barème des infractions et les encaissements Wave & Orange Money depuis une seule console.
          </div>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              ['3', 'interfaces reliées'],
              ['Wave · OM', 'paiement mobile'],
              ['24/7', 'synchronisation'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-[14px] bg-white/[.12] p-3">
                <div className="font-mono text-[20px] font-extrabold">{v}</div>
                <div className="text-[11.5px] font-bold text-[#D3F2E3]">{l}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="flex items-center justify-center p-6">
        <motion.form
          onSubmit={submit}
          className="w-full max-w-[400px]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-[14px] bg-mint">
            <ShieldCheck weight="fill" size={26} color="#16A86E" />
          </div>
          <h1 className="text-[26px] font-extrabold tracking-[-.4px]">Connexion</h1>
          <p className="mt-1 text-[14px] font-semibold text-muted">Accès réservé aux administrateurs habilités.</p>

          <label className="mt-7 flex flex-col gap-[7px] text-[11.5px] font-extrabold tracking-[.4px] text-muted">
            EMAIL PROFESSIONNEL
            <div className="flex h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-line-2 bg-white px-3.5 focus-within:border-brand">
              <Envelope size={18} color="#9CB0A4" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@police.sn"
                className="flex-1 bg-transparent text-[14.5px] font-semibold tracking-normal text-ink outline-none"
              />
            </div>
          </label>
          <label className="mt-4 flex flex-col gap-[7px] text-[11.5px] font-extrabold tracking-[.4px] text-muted">
            MOT DE PASSE
            <div className="flex h-12 items-center gap-2.5 rounded-xl border-[1.5px] border-line-2 bg-white px-3.5 focus-within:border-brand">
              <LockKey size={18} color="#9CB0A4" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent text-[14.5px] font-semibold tracking-normal text-ink outline-none"
              />
            </div>
          </label>

          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center gap-2 rounded-xl bg-danger-bg px-3.5 py-[11px] text-[12.5px] font-bold text-danger-ink">
              <WarningCircle weight="fill" /> {error}
            </motion.div>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            disabled={busy}
            className="grad-cta mt-6 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold text-white shadow-cta disabled:opacity-70"
          >
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <>Se connecter <ArrowRight weight="bold" /></>}
          </motion.button>

          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-6 rounded-xl bg-head p-3.5 text-[12px] font-semibold text-muted">
              <div className="mb-1 font-extrabold text-ink-2">Comptes de démo · Passer123!</div>
              {[
                ['a.diagne@interieur.gouv.sn', 'Super Admin'],
                ['m.thiaw@police.sn', 'Commandant'],
                ['nf.kebe@tresor.gouv.sn', 'Trésorier'],
                ['o.sall@police.sn', 'Superviseur'],
              ].map(([e, r]) => (
                <button
                  type="button"
                  key={e}
                  onClick={() => {
                    setEmail(e);
                    setPassword('Passer123!');
                  }}
                  className="block cursor-pointer hover:text-brand-600"
                >
                  {r} · <span className="font-mono">{e}</span>
                </button>
              ))}
            </div>
          )}
        </motion.form>
      </div>
    </div>
  );
}
