'use client';

import {
  ChatCircleText,
  Check,
  CheckCircle,
  DeviceMobile,
  DeviceMobileSlash,
  FloppyDisk,
  Key,
  Pause,
  PencilSimple,
  Play,
  Plus,
  Prohibit,
  Siren,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { MiniBars } from '@/components/charts/charts';
import { MiniMap, PhotoPlaceholder } from '@/components/map/MiniMap';
import { Drawer, InfoGrid } from '@/components/ui/overlays';
import { Button, Field, inputCls, Pill, StatusPill } from '@/components/ui/primitives';
import { api, patch, post } from '@/lib/api';
import { fmt, fmtDateTime, fmtDay, fmtM, initials, monthShort } from '@/lib/format';
import { useOverlay } from '@/lib/overlay-store';
import { can } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { ContraventionDetail, OfficerDetail, OwnerDetail, VehicleDetail } from '@/lib/types';
import { vehicleIcon } from '@/components/vehicleIcon';

const MODE_LABEL = { wave: 'Wave', orange_money: 'Orange Money', especes: 'Espèces', carte: 'Carte bancaire' } as const;
const OFFICER_STATUS = {
  actif: { label: 'Actif', color: '#0E8C57', bg: '#E7F7EF' },
  suspendu: { label: 'Suspendu', color: '#C93642', bg: '#FDEDEE' },
  inactif: { label: 'Inactif', color: '#6E8378', bg: '#EEF2EF' },
};

function useAct() {
  const qc = useQueryClient();
  return (fn: () => Promise<unknown>, msg: string, keys: string[]) =>
    fn()
      .then(() => {
        toast.success(msg);
        keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      })
      .catch((e: Error) => toast.error(e.message));
}

export function DrawerHost() {
  const { drawer, closeDrawer } = useOverlay();
  return (
    <>
      <ContraventionDrawer id={drawer?.type === 'contravention' ? drawer.id : null} onClose={closeDrawer} />
      <OfficerDrawer id={drawer?.type === 'officer' ? drawer.id : null} onClose={closeDrawer} />
      <OwnerDrawer id={drawer?.type === 'owner' ? drawer.id : null} onClose={closeDrawer} />
      <VehicleDrawer plate={drawer?.type === 'vehicle' ? drawer.id : null} onClose={closeDrawer} />
    </>
  );
}

/** Chargement, ou erreur explicite (plus de squelette infini si l'API refuse l'accès). */
function Loading({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-danger-bg p-6 text-center">
        <WarningCircle weight="fill" size={28} color="#C93642" />
        <div className="text-[13.5px] font-bold text-danger-ink">{(error as Error).message || 'Impossible de charger cette fiche'}</div>
        {onRetry && (
          <button onClick={onRetry} className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-extrabold text-danger-ink">
            Réessayer
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="skeleton h-[88px] rounded-2xl" />
      <div className="skeleton h-[160px] rounded-2xl" />
      <div className="skeleton h-[150px] rounded-2xl" />
    </div>
  );
}

/* ── Contravention ─────────────────────────────────────────────────────────── */

function ContraventionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { me } = useSession();
  const act = useAct();
  const [edit, setEdit] = useState<{ lieuTexte: string; notes: string } | null>(null);
  const { data: c, error: cErr, refetch: cRetry } = useQuery({ queryKey: ['contravention', id], queryFn: () => api<ContraventionDetail>(`/contraventions/${id}`), enabled: !!id });
  const keys = ['contravention', 'contraventions', 'dashboard', 'counts'];
  const close = () => {
    setEdit(null);
    onClose();
  };

  return (
    <Drawer
      open={!!id}
      onClose={close}
      kicker="CONTRAVENTION"
      title={c?.numero ?? '…'}
      actions={
        c &&
        !c.horsZone &&
        (edit ? (
          <>
            <Button kind="primary" icon={FloppyDisk} onClick={() => act(() => patch(`/contraventions/${c.id}`, edit), `${c.numero} mise à jour`, keys).then(() => setEdit(null))}>
              Enregistrer
            </Button>
            <Button onClick={() => setEdit(null)}>Annuler</Button>
          </>
        ) : (
          <>
            {can(me?.role, 'collect') && (c.statut === 'impayee' || c.statut === 'partielle') && (
              <Button kind="primary" icon={Check} onClick={() => act(() => post(`/contraventions/${c.id}/mark-paid`, { mode: 'especes' }), `${c.numero} marquée comme payée`, keys)}>
                Marquer comme payée
              </Button>
            )}
            {can(me?.role, 'emit') && (
              <Button icon={PencilSimple} onClick={() => setEdit({ lieuTexte: c.lieuTexte ?? '', notes: c.notes ?? '' })}>
                Modifier
              </Button>
            )}
            {can(me?.role, 'emit') && c.statut !== 'annulee' && c.statut !== 'payee' && (
              <Button kind="danger" icon={Prohibit} onClick={() => act(() => post(`/contraventions/${c.id}/cancel`, {}), `${c.numero} annulée`, keys)}>
                Annuler
              </Button>
            )}
          </>
        ))
      }
    >
      {!c ? (
        <Loading error={cErr} onRetry={() => cRetry()} />
      ) : (
        <>
          {c.horsZone && (
            <div className="rounded-xl bg-warn-bg px-3.5 py-2.5 text-[12.5px] font-bold text-warn-ink">
              Amende émise dans la zone {c.zone} · consultation seule
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-head p-[18px]">
            <div>
              <div className="text-[12px] font-bold text-muted">Montant de l&apos;amende</div>
              <div className="font-mono text-[28px] font-extrabold">{fmt(c.montantTotal)} F</div>
              {c.statut === 'partielle' && <div className="text-[12px] font-bold text-warn-ink">Reste à payer : {fmt(c.resteAPayer)} F</div>}
            </div>
            <StatusPill statut={c.statut} size="lg" />
          </div>
          {edit ? (
            <div className="grid gap-3.5">
              <Field label="LIEU">
                <input className={inputCls} value={edit.lieuTexte} onChange={(e) => setEdit({ ...edit, lieuTexte: e.target.value })} />
              </Field>
              <Field label="NOTES">
                <textarea className={`${inputCls} h-24 py-3`} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              </Field>
            </div>
          ) : (
            <InfoGrid
              items={[
                { k: 'PLAQUE', v: <span className="font-mono">{c.plaque}</span> },
                { k: 'PROPRIÉTAIRE', v: c.proprietaire },
                { k: 'INFRACTION', v: c.items.map((i) => `${i.libelle} (${fmt(i.montant)} F)`).join(' + ') },
                { k: 'DATE', v: fmtDateTime(c.dateHeure) },
                { k: 'OFFICIER', v: c.officier ?? '—' },
                { k: 'ZONE', v: c.zone },
                { k: 'LIEU', v: c.lieuTexte ?? '—' },
                { k: 'CANAL', v: c.canal === 'mobile' ? 'Terminal mobile' : 'Administration' },
                ...(c.notes ? [{ k: 'NOTES', v: c.notes }] : []),
              ]}
            />
          )}
          <PhotoPlaceholder url={c.photoPreuveUrl} label="photo preuve · terminal agent" />
          {c.lat != null && c.lng != null && <MiniMap lat={c.lat} lng={c.lng} height={130} />}
          <div>
            <div className="mb-2.5 text-[13.5px] font-extrabold">Historique des paiements</div>
            {c.paiements.map((p) => (
              <div key={p.numeroRecu} className="mb-2 flex items-center gap-[11px] rounded-xl border border-line-3 px-3 py-[11px]">
                <CheckCircle weight="fill" size={20} color="#16A86E" />
                <div className="flex-1">
                  <div className="font-mono text-[12.5px] font-extrabold">{p.numeroRecu}</div>
                  <div className="text-[11.5px] font-semibold text-faint">
                    {MODE_LABEL[p.mode]} · {fmtDateTime(p.dateHeure)}
                  </div>
                </div>
                <span className="font-mono font-extrabold text-brand-600">{fmt(p.montant)} F</span>
              </div>
            ))}
            {!c.paiements.length && <div className="rounded-xl bg-danger-bg p-3.5 text-[12.5px] font-bold text-danger-ink">Aucun paiement enregistré pour cette amende.</div>}
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ── Officier ──────────────────────────────────────────────────────────────── */

function OfficerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { me } = useSession();
  const act = useAct();
  const { openDrawer, openModal } = useOverlay();
  const [edit, setEdit] = useState<{ telephone: string; email: string; grade: string } | null>(null);
  const { data: o, error: oErr, refetch: oRetry } = useQuery({ queryKey: ['officer', id], queryFn: () => api<OfficerDetail>(`/officers/${id}`), enabled: !!id });
  const keys = ['officer', 'officers'];
  const manage = can(me?.role, 'manageOfficers');
  const susp = o?.statut === 'suspendu';

  return (
    <Drawer
      open={!!id}
      onClose={() => {
        setEdit(null);
        onClose();
      }}
      kicker="PROFIL OFFICIER"
      title={o?.nomComplet ?? '…'}
      actions={
        o &&
        manage &&
        (edit ? (
          <>
            <Button kind="primary" icon={FloppyDisk} onClick={() => act(() => patch(`/officers/${o.id}`, { ...edit, email: edit.email || undefined }), 'Profil mis à jour', keys).then(() => setEdit(null))}>
              Enregistrer
            </Button>
            <Button onClick={() => setEdit(null)}>Annuler</Button>
          </>
        ) : (
          <>
            <Button icon={PencilSimple} onClick={() => setEdit({ telephone: o.telephone ?? '', email: o.email ?? '', grade: o.grade })}>
              Modifier
            </Button>
            <Button icon={Key} onClick={() => act(() => post(`/officers/${o.id}/reset-password`), `Nouveau mot de passe envoyé par SMS à ${o.nomComplet}`, keys)}>
              Réinitialiser MDP
            </Button>
            <Button
              kind={susp ? 'primary' : 'danger'}
              icon={susp ? Play : Pause}
              onClick={() =>
                susp
                  ? act(() => post(`/officers/${o.id}/reactivate`), `${o.nomComplet} réactivé`, keys)
                  : openModal({ type: 'suspend', officer: { id: o.id, nomComplet: o.nomComplet } })
              }
            >
              {susp ? 'Réactiver' : 'Suspendre'}
            </Button>
          </>
        ))
      }
    >
      {!o ? (
        <Loading error={oErr} onRetry={() => oRetry()} />
      ) : (
        <>
          <div className="flex items-center gap-3.5">
            <div className="grad-hero flex h-[62px] w-[62px] items-center justify-center rounded-[18px] text-[20px] font-extrabold text-white">{initials(o.nomComplet)}</div>
            <div>
              <div className="text-[13px] font-bold text-muted">
                {o.grade} · {o.zoneNom}
              </div>
              <div className="mt-0.5 font-mono text-[13px] font-extrabold">{o.matricule}</div>
              <Pill className="mt-1.5" color={OFFICER_STATUS[o.statut].color} bg={OFFICER_STATUS[o.statut].bg}>
                {OFFICER_STATUS[o.statut].label}
              </Pill>
            </div>
          </div>
          {susp && (
            <div className="rounded-xl bg-danger-bg px-3.5 py-3">
              <div className="text-[11px] font-extrabold tracking-[.4px] text-danger-ink">MOTIF DE SUSPENSION</div>
              <div className="mt-1 text-[13.5px] font-bold text-ink">{o.suspensionMotif ?? 'Non renseigné (suspension antérieure)'}</div>
              {o.suspendedAt && (
                <div className="mt-1 text-[11.5px] font-semibold text-muted">
                  {fmtDateTime(o.suspendedAt)}
                  {o.suspendedBy ? ` · par ${o.suspendedBy}` : ''}
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              [fmt(o.amendes), 'Amendes', ''],
              [fmtM(o.collecte), 'Collecté', '#0E8C57'],
              [fmt(o.paiements), 'Paiements', ''],
            ].map(([v, l, c]) => (
              <div key={l} className="rounded-[13px] bg-head p-3">
                <div className="font-mono text-[18px] font-extrabold" style={{ color: c || undefined }}>
                  {v}
                </div>
                <div className="text-[11px] font-bold text-faint">{l}</div>
              </div>
            ))}
          </div>
          {edit ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="TÉLÉPHONE">
                <input className={inputCls} value={edit.telephone} onChange={(e) => setEdit({ ...edit, telephone: e.target.value })} />
              </Field>
              <Field label="EMAIL">
                <input className={inputCls} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </Field>
              <Field label="GRADE" full>
                <select className={inputCls} value={edit.grade} onChange={(e) => setEdit({ ...edit, grade: e.target.value })}>
                  {['Sergent', 'Brigadier', 'Officier', 'Adjudant', 'Lieutenant', 'Capitaine', 'Commissaire'].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <InfoGrid
              items={[
                { k: 'TÉLÉPHONE', v: <span className="font-mono">{o.telephone ?? '—'}</span> },
                { k: 'EMAIL', v: <span className="break-all">{o.email ?? '—'}</span> },
              ]}
            />
          )}
          <div className="rounded-[14px] border border-line-3 p-4">
            <div className="text-[13.5px] font-extrabold">Activité mensuelle</div>
            <MiniBars data={o.activite.map((a) => ({ label: monthShort(a.mois), value: a.count }))} />
          </div>
          <div>
            <div className="mb-2 text-[13.5px] font-extrabold">Contraventions récentes</div>
            {o.recentes.map((c) => (
              <button
                key={c.id}
                onClick={() => openDrawer({ type: 'contravention', id: c.id })}
                className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line-3 py-2.5 text-left text-[13px] hover:bg-hover"
              >
                <span className="w-[100px] font-mono font-extrabold">{c.plaque}</span>
                <span className="flex-1 truncate font-semibold text-ink-2">{c.infraction}</span>
                <StatusPill statut={c.statut} size="sm" />
              </button>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ── Usager ────────────────────────────────────────────────────────────────── */

function OwnerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { me } = useSession();
  const act = useAct();
  const { openDrawer } = useOverlay();
  const [edit, setEdit] = useState<{ telephone: string; quartier: string; adresse: string; email: string } | null>(null);
  const { data: u, error: uErr, refetch: uRetry } = useQuery({ queryKey: ['owner', id], queryFn: () => api<OwnerDetail>(`/owners/${id}`), enabled: !!id });
  const keys = ['owner', 'owners'];

  return (
    <Drawer
      open={!!id}
      onClose={() => {
        setEdit(null);
        onClose();
      }}
      kicker="USAGER"
      title={u?.nomComplet ?? '…'}
      actions={
        u &&
        (edit ? (
          <>
            <Button kind="primary" icon={FloppyDisk} onClick={() => act(() => patch(`/owners/${u.id}`, { ...edit, email: edit.email || undefined }), 'Fiche usager mise à jour', keys).then(() => setEdit(null))}>
              Enregistrer
            </Button>
            <Button onClick={() => setEdit(null)}>Annuler</Button>
          </>
        ) : (
          <>
            {can(me?.role, 'remind') && (
              <Button kind="primary" icon={ChatCircleText} onClick={() => act(() => post(`/owners/${u.id}/remind`), `Rappel de paiement envoyé au ${u.telephone}`, [])}>
                Relance SMS
              </Button>
            )}
            {can(me?.role, 'write') && (
              <Button icon={PencilSimple} onClick={() => setEdit({ telephone: u.telephone, quartier: u.quartier ?? '', adresse: u.adresse ?? '', email: u.email ?? '' })}>
                Modifier
              </Button>
            )}
          </>
        ))
      }
    >
      {!u ? (
        <Loading error={uErr} onRetry={() => uRetry()} />
      ) : (
        <>
          <div className="flex items-center gap-3.5">
            <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-line-3 text-[20px] font-extrabold text-ink-2">{initials(u.nomComplet)}</div>
            <div>
              <div className="font-mono text-[13px] font-bold">CNI {u.cni}</div>
              <div className="mt-0.5 text-[13px] font-semibold text-muted">
                {u.telephone} · {u.quartier ?? '—'}
              </div>
              <AppPill on={u.compteApp} />
            </div>
          </div>
          {edit ? (
            <div className="grid grid-cols-2 gap-3">
              {(['telephone', 'quartier', 'adresse', 'email'] as const).map((k) => (
                <Field key={k} label={{ telephone: 'TÉLÉPHONE', quartier: 'QUARTIER', adresse: 'ADRESSE', email: 'EMAIL' }[k]}>
                  <input className={inputCls} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                </Field>
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-2xl p-[18px]" style={{ background: u.du ? '#FDEDEE' : '#E7F7EF' }}>
            <div>
              <div className="text-[12px] font-bold text-muted">Montant total dû</div>
              <div className="font-mono text-[26px] font-extrabold" style={{ color: u.du ? '#C93642' : '#0E8C57' }}>
                {fmt(u.du)} F
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[18px] font-extrabold">{u.amendes}</div>
              <div className="text-[11px] font-bold text-muted">amendes au total</div>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[13.5px] font-extrabold">Véhicules</div>
            {u.vehicules.map((v) => {
              const I = vehicleIcon(v.type);
              return (
                <button
                  key={v.plaque}
                  onClick={() => openDrawer({ type: 'vehicle', id: v.plaque })}
                  className="mb-2 flex w-full cursor-pointer items-center gap-[11px] rounded-xl border border-line-3 px-3 py-[11px] text-left hover:bg-hover"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-mint">
                    <I weight="fill" size={19} color="#16A86E" />
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-[13px] font-extrabold">{v.plaque}</div>
                    <div className="text-[11.5px] font-semibold text-faint">{v.libelle}</div>
                  </div>
                  <Pill size="sm" color={v.documentsOk ? '#0E8C57' : '#C93642'} bg={v.documentsOk ? '#E7F7EF' : '#FDEDEE'}>
                    {v.documentsOk ? 'En règle' : 'Docs expirés'}
                  </Pill>
                </button>
              );
            })}
          </div>
          <div>
            <div className="mb-2 text-[13.5px] font-extrabold">Amendes</div>
            {u.contraventions.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onClick={() => openDrawer({ type: 'contravention', id: c.id })}
                className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line-3 py-2.5 text-left text-[13px] hover:bg-hover"
              >
                <span className="w-[124px] font-mono font-bold text-brand-600">{c.numero}</span>
                <span className="flex-1 truncate font-semibold text-ink-2">{c.infraction}</span>
                <span className="font-mono font-extrabold">{fmt(c.montantTotal)} F</span>
                <StatusPill statut={c.statut} size="sm" />
              </button>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}

export function AppPill({ on }: { on: boolean }) {
  return (
    <Pill className="mt-1.5" color={on ? '#0E8C57' : '#6E8378'} bg={on ? '#E7F7EF' : '#EEF2EF'}>
      {on ? <DeviceMobile weight="fill" /> : <DeviceMobileSlash />}
      {on ? 'Active' : 'Sans compte'}
    </Pill>
  );
}

/* ── Véhicule ──────────────────────────────────────────────────────────────── */

function VehicleDrawer({ plate, onClose }: { plate: string | null; onClose: () => void }) {
  const { me } = useSession();
  const act = useAct();
  const { openModal, openDrawer } = useOverlay();
  const { data: v, error: vErr, refetch: vRetry } = useQuery({ queryKey: ['vehicle', plate], queryFn: () => api<VehicleDetail>(`/vehicles/${encodeURIComponent(plate!)}`), enabled: !!plate });
  const typeLabel = { VP: 'Voiture', Moto: 'Moto', Camion: 'Camion', Bus: 'Bus' };

  return (
    <Drawer
      open={!!plate}
      onClose={onClose}
      kicker="FICHE VÉHICULE"
      title={v ? `${v.marque} ${v.modele}` : '…'}
      actions={
        v &&
        can(me?.role, 'emit') && (
          <>
            <Button kind="primary" icon={Plus} onClick={() => openModal({ type: 'contravention', plaque: v.plaque })}>
              Contravention manuelle
            </Button>
            {!v.flagged && (
              <Button kind="danger" icon={Siren} onClick={() => act(() => post(`/vehicles/${v.plaque}/flag`, {}), `${v.plaque} signalé à toutes les brigades`, ['vehicle', 'vehicles'])}>
                Signaler
              </Button>
            )}
          </>
        )
      }
    >
      {!v ? (
        <Loading error={vErr} onRetry={() => vRetry()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-[9px] border-2 border-[#0e8054] bg-white px-3.5 py-1.5">
              <div className="flex h-6 w-[15px] items-center justify-center rounded-[3px] bg-[#0e8054]">
                <span className="text-[7px] font-extrabold text-white">SN</span>
              </div>
              <span className="font-mono text-[20px] font-extrabold tracking-[2px]">{v.plaque}</span>
            </div>
            <Pill color={v.alerte ? '#C93642' : '#0E8C57'} bg={v.alerte ? '#FDEDEE' : '#E7F7EF'}>
              {v.flagged ? 'Signalé' : v.alerte ? 'Alerte' : 'RAS'}
            </Pill>
          </div>
          {v.flagged && <div className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[12.5px] font-bold text-danger-ink">Signalé : {v.flagReason}</div>}
          <InfoGrid
            items={[
              { k: 'MARQUE / MODÈLE', v: `${v.marque} ${v.modele}` },
              { k: 'TYPE', v: typeLabel[v.type] },
              { k: 'COULEUR', v: v.couleur ?? '—' },
              { k: 'ANNÉE', v: v.annee ?? '—' },
              {
                k: 'PROPRIÉTAIRE',
                v: (
                  <button className="cursor-pointer text-left text-brand-600 hover:underline" onClick={() => openDrawer({ type: 'owner', id: v.proprietaire.id })}>
                    {v.proprietaire.prenom} {v.proprietaire.nom}
                  </button>
                ),
              },
              { k: 'MONTANT DÛ', v: <span className={v.totalDu ? 'text-danger-ink' : ''}>{fmt(v.totalDu)} F</span> },
            ]}
          />
          <div className="flex flex-col gap-2.5 rounded-[14px] border border-line-3 p-3.5">
            <div className="text-[13.5px] font-extrabold">Documents</div>
            {v.documents.map((d) => (
              <div key={d.code} className="flex items-center gap-2.5">
                {d.ok ? <CheckCircle weight="fill" size={20} color="#0E8C57" /> : <XCircle weight="fill" size={20} color="#C93642" />}
                <span className="flex-1 text-[13.5px] font-bold">{d.label}</span>
                <span className="text-[12px] font-extrabold" style={{ color: d.ok ? '#0E8C57' : '#C93642' }}>
                  {d.ok ? 'À jour' : 'Expiré'}
                  {d.expiration && <span className="ml-1 font-semibold text-faint">· {fmtDay(d.expiration)}</span>}
                </span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-2 text-[13.5px] font-extrabold">Historique des contraventions</div>
            {v.historique.slice(0, 8).map((c) => (
              <button
                key={c.id}
                onClick={() => openDrawer({ type: 'contravention', id: c.id })}
                className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line-3 py-2.5 text-left text-[13px] hover:bg-hover"
              >
                <span className="w-[100px] font-semibold text-muted">{fmtDay(c.dateHeure)}</span>
                <span className="flex-1 truncate font-bold">{c.infraction}</span>
                <span className="font-mono font-extrabold">{fmt(c.montantTotal)} F</span>
                <StatusPill statut={c.statut} size="sm" />
              </button>
            ))}
            {!v.historique.length && <div className="rounded-xl bg-mint p-3.5 text-[12.5px] font-bold text-brand-600">Aucune contravention · véhicule en règle</div>}
          </div>
        </>
      )}
    </Drawer>
  );
}
