'use client';

import { Database, FloppyDisk, UserPlus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, cx, ErrorBanner, Field, PageHeader, Pill, SkeletonRows, Toggle } from '@/components/ui/primitives';
import { api, post, put } from '@/lib/api';
import { fmt, fmtRelative, initials } from '@/lib/format';
import { useOverlay } from '@/lib/overlay-store';
import { ROLE_COLORS, ROLE_LABEL } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { AdminRow, Settings } from '@/lib/types';

const COLS = 'minmax(230px,1.5fr) 140px 160px 140px 100px 110px';
const STATUS = {
  actif: { label: 'Actif', color: '#0E8C57', bg: '#E7F7EF' },
  en_attente: { label: 'En attente', color: '#B4701A', bg: '#FBF0DF' },
  revoque: { label: 'Révoqué', color: '#C93642', bg: '#FDEDEE' },
};
const field = 'h-11 rounded-xl border-[1.5px] border-line-2 bg-field px-3.5 text-[14px] font-bold tracking-normal text-ink outline-none focus:border-brand focus:bg-white';

export default function ParametresPage() {
  const qc = useQueryClient();
  const { me } = useSession();
  const { openModal } = useOverlay();
  const admins = useQuery({ queryKey: ['admins'], queryFn: () => api<AdminRow[]>('/admins') });
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const revoke = useMutation({
    mutationFn: (a: AdminRow) => post(`/admins/${a.id}/${a.statut === 'revoque' ? 'restore' : 'revoke'}`),
    onSuccess: (_d, a) => toast.success(`${a.nom}${a.statut === 'revoque' ? ' rétabli' : ' · accès révoqué'}`),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admins'] }),
  });
  const save = useMutation({
    mutationFn: (s: Settings) => put<Settings>('/settings', s),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      toast.success('Paramètres enregistrés et synchronisés');
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const preview = form?.smsTemplate.replaceAll('{montant}', fmt(20000)).replaceAll('{numero}', 'CNT-2026-00847').replaceAll('{plaque}', 'DK-1234-AB') ?? '';
  const dirty = !!form && !!settings.data && JSON.stringify(form) !== JSON.stringify(settings.data);

  return (
    <>
      <PageHeader
        title="Admins & paramètres"
        subtitle="Comptes d'administration, rôles et configuration générale"
        actions={
          <Button kind="primary" icon={UserPlus} onClick={() => openModal({ type: 'admin' })}>
            Inviter un admin
          </Button>
        }
      />
      {admins.error && <ErrorBanner error={admins.error} onRetry={() => admins.refetch()} />}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 text-[15px] font-extrabold">Comptes d&apos;administration</div>
        <div className="scroll-x">
          <div className="min-w-[880px]">
            <div className="th grid gap-3" style={{ gridTemplateColumns: COLS }}>
              <span>Administrateur</span>
              <span>Rôle</span>
              <span>Périmètre</span>
              <span>Dernier accès</span>
              <span>Statut</span>
              <span />
            </div>
            {admins.isLoading && <SkeletonRows rows={4} cols={COLS} />}
            {admins.data?.map((a) => {
              const rv = a.statut === 'revoque';
              const [rc, rb] = ROLE_COLORS[a.role];
              return (
                <div key={a.id} className="tr grid items-center gap-3 py-3" style={{ gridTemplateColumns: COLS }}>
                  <div className="flex min-w-0 items-center gap-[11px]">
                    <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-mint text-[13px] font-extrabold text-brand-600">{initials(a.nom)}</div>
                    <div className="min-w-0">
                      <div className="truncate font-extrabold">{a.nom}</div>
                      <div className="truncate text-[11.5px] font-semibold text-faint">{a.email}</div>
                    </div>
                  </div>
                  <Pill color={rc} bg={rb}>
                    {ROLE_LABEL[a.role]}
                  </Pill>
                  <span className="font-semibold text-ink-2">{a.perimetre}</span>
                  <span className="text-[12.5px] font-semibold text-muted">{a.statut === 'en_attente' ? 'Invitation envoyée' : fmtRelative(a.lastLoginAt)}</span>
                  <Pill color={STATUS[a.statut].color} bg={STATUS[a.statut].bg}>
                    {STATUS[a.statut].label}
                  </Pill>
                  {a.id !== me?.id && (
                    <button
                      onClick={() => revoke.mutate(a)}
                      className={cx(
                        'flex h-8 cursor-pointer items-center justify-self-start rounded-[9px] px-3 text-[12px] font-extrabold',
                        rv ? 'bg-mint text-brand-600' : 'border-[1.5px] border-[#F4C9CE] text-danger-ink hover:bg-danger-bg',
                      )}
                    >
                      {rv ? 'Rétablir' : 'Révoquer'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {form && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
          <div className="card flex flex-col gap-3.5 p-5">
            <div className="text-[15px] font-extrabold">Institution</div>
            <div className="flex items-center gap-3.5">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/flag-senegal.svg" alt="" className="h-[29px] w-11 rounded object-cover" />
              </div>
              <div>
                <div className="text-[14px] font-extrabold">Logo officiel</div>
                <div className="text-[12px] font-semibold text-faint">Affiché sur les reçus et les applications</div>
              </div>
            </div>
            <Field label="NOM DE L'INSTITUTION">
              <input className={field} value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DEVISE">
                <select className={field} value={form.devise} onChange={(e) => setForm({ ...form, devise: e.target.value })}>
                  <option value="XOF">FCFA (XOF)</option>
                </select>
              </Field>
              <Field label="FORMAT DATE">
                <select className={field} value={form.dateFormat} onChange={(e) => setForm({ ...form, dateFormat: e.target.value })}>
                  <option value="DD/MM/YYYY">JJ/MM/AAAA</option>
                </select>
              </Field>
              <Field label="DÉLAI DE PAIEMENT (JOURS)">
                <input className={field} inputMode="numeric" value={form.delaiPaiementJours} onChange={(e) => setForm({ ...form, delaiPaiementJours: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              </Field>
              <Field label="OBJECTIF RECOUVREMENT (%)">
                <input className={field} inputMode="numeric" value={form.objectifRecouvrement} onChange={(e) => setForm({ ...form, objectifRecouvrement: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
              </Field>
            </div>
            <div role="button" tabIndex={0} onClick={() => setForm({ ...form, autoBackup: !form.autoBackup })} className="flex cursor-pointer items-center gap-3 rounded-xl bg-head px-3.5 py-3 text-left">
              <Database weight="fill" size={20} color="#16A86E" />
              <div className="flex-1">
                <div className="text-[13.5px] font-extrabold">Sauvegarde automatique</div>
                <div className="text-[11.5px] font-semibold text-faint">Quotidienne à 02:00</div>
              </div>
              <Toggle on={form.autoBackup} />
            </div>
          </div>
          <div className="card flex flex-col gap-3.5 p-5">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-extrabold">Modèle SMS d&apos;amende</div>
              <span className="rounded-[20px] bg-mint px-[9px] py-[3px] text-[11px] font-extrabold text-brand-600">API connectée</span>
            </div>
            <textarea
              rows={5}
              value={form.smsTemplate}
              onChange={(e) => setForm({ ...form, smsTemplate: e.target.value })}
              className="resize-y rounded-xl border-[1.5px] border-line-2 bg-field px-3.5 py-3 text-[13.5px] leading-normal font-semibold text-ink outline-none focus:border-brand focus:bg-white"
            />
            <div className="flex flex-wrap gap-1.5">
              {['{montant}', '{numero}', '{plaque}'].map((v) => (
                <button
                  key={v}
                  onClick={() => setForm({ ...form, smsTemplate: `${form.smsTemplate} ${v}` })}
                  className="cursor-pointer rounded-[7px] bg-line-3 px-2 py-[3px] font-mono text-[11px] font-bold text-ink-2 hover:bg-mint-2"
                  title="Insérer la variable"
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="rounded-[14px] bg-mint p-3.5">
              <div className="mb-1.5 text-[11px] font-extrabold tracking-[.4px] text-brand-600">APERÇU</div>
              <div className="text-[13px] leading-normal font-semibold text-ink">{preview}</div>
              <div className={cx('mt-1.5 text-[11px] font-bold', preview.length > 160 ? 'text-warn-ink' : 'text-mint-ink')}>
                {preview.length} caractères{preview.length > 160 ? ` · ${Math.ceil(preview.length / 153)} SMS` : ''}
              </div>
            </div>
            <Button kind="primary" icon={FloppyDisk} className="h-11 text-[14px]" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(form)}>
              Enregistrer les paramètres
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
