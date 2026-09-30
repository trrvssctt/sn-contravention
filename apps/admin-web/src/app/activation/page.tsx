'use client';

import { ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { API_URL, tokens } from '@/lib/api';

/** Activation d'un compte admin invité (lien reçu par email). */
function Activation() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) return setError('8 caractères minimum');
    if (pwd !== pwd2) return setError('Les mots de passe ne correspondent pas');
    const res = await fetch(`${API_URL}/v1/auth/admin/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: pwd }),
    });
    const body = await res.json();
    if (!res.ok) return setError(body.message);
    tokens.set(body);
    router.replace('/dashboard');
  }

  const input = 'h-12 rounded-xl border-[1.5px] border-line-2 bg-white px-3.5 text-[14.5px] font-semibold outline-none focus:border-brand';
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-[420px] p-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-[14px] bg-mint">
          <ShieldCheck weight="fill" size={26} color="#16A86E" />
        </div>
        <h1 className="text-[24px] font-extrabold">Activer votre compte</h1>
        <p className="mt-1 mb-6 text-[14px] font-semibold text-muted">Choisissez votre mot de passe d&apos;administration.</p>
        <div className="flex flex-col gap-3">
          <input type="password" placeholder="Nouveau mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} className={input} />
          <input type="password" placeholder="Confirmation" value={pwd2} onChange={(e) => setPwd2(e.target.value)} className={input} />
        </div>
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-danger-bg px-3.5 py-[11px] text-[12.5px] font-bold text-danger-ink">
            <WarningCircle weight="fill" /> {error}
          </div>
        )}
        <button className="grad-cta mt-6 h-12 w-full cursor-pointer rounded-xl text-[15px] font-extrabold text-white shadow-cta">Activer</button>
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Activation />
    </Suspense>
  );
}
