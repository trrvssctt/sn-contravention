'use client';

import { CarProfile, CheckCircle, ListPlus, Pause, Receipt, ShieldPlus, UserPlus, WarningCircle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/overlays';
import { Field, inputCls } from '@/components/ui/primitives';
import { api, post } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useOverlay } from '@/lib/overlay-store';
import { useSession } from '@/lib/session';
import type { InfractionType, OfficerRow, Zone } from '@/lib/types';

const GRADES = ['Sergent', 'Brigadier', 'Officier', 'Adjudant', 'Lieutenant', 'Capitaine', 'Commissaire'];

type Form = Record<string, string>;

/** Logique commune : état du formulaire, erreur inline, soumission et invalidation. */
function useForm(initial: Form, open: boolean) {
  const [form, setForm] = useState<Form>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { form, set, setForm, error, setError, busy, run };
}

function useRefs(open: boolean) {
  const zones = useQuery({ queryKey: ['zones'], queryFn: () => api<Zone[]>('/zones'), enabled: open, staleTime: 5 * 60_000 });
  return { zones: zones.data ?? [] };
}

export function ModalHost() {
  const { modal, closeModal } = useOverlay();
  return (
    <>
      <ContraventionModal open={modal?.type === 'contravention'} plaque={modal?.type === 'contravention' ? modal.plaque : undefined} onClose={closeModal} />
      <OfficerModal open={modal?.type === 'officer'} onClose={closeModal} />
      <VehicleModal open={modal?.type === 'vehicle'} onClose={closeModal} />
      <InfractionModal open={modal?.type === 'infraction'} onClose={closeModal} />
      <AdminModal open={modal?.type === 'admin'} onClose={closeModal} />
      <SuspendModal officer={modal?.type === 'suspend' ? modal.officer : null} onClose={closeModal} />
    </>
  );
}

function ContraventionModal({ open, plaque, onClose }: { open: boolean; plaque?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const { zones } = useRefs(open);
  const dakar = zones.filter((z) => z.isDakar || z.id === me?.zone?.id);
  const f = useForm({ plaque: plaque ?? '', inf: '', officerId: '', zoneId: me?.zone?.id ?? '' }, open);
  const types = useQuery({ queryKey: ['infractions', 'list'], queryFn: () => api<InfractionType[]>('/infraction-types'), enabled: open });
  const zoneId = f.form.zoneId || dakar[0]?.id || '';
  const officers = useQuery({
    queryKey: ['officers', 'zone', zoneId],
    queryFn: () => api<{ data: OfficerRow[] }>(`/officers?statut=actif&zone_id=${zoneId}`),
    enabled: open && !!zoneId,
  });
  const plate = f.form.plaque.trim().toUpperCase();
  const lookup = useQuery({
    queryKey: ['vehicle-lookup', plate],
    queryFn: () => api<{ marque: string; modele: string; proprietaire: { prenom: string; nom: string } }>(`/vehicles/${encodeURIComponent(plate)}`),
    enabled: open && plate.length >= 6,
    retry: false,
  });
  const active = types.data?.filter((t) => t.actif) ?? [];
  const inf = f.form.inf || active[0]?.id || '';

  const submit = () =>
    f.run(async () => {
      if (!plate) throw new Error('La plaque est obligatoire.');
      const c = await post<{ numero: string }>('/contraventions', {
        plaque: plate,
        infractionTypeIds: [inf],
        zoneId,
        officerId: f.form.officerId || officers.data?.data[0]?.id,
      });
      toast.success(`Contravention ${c.numero} enregistrée · SMS envoyé au propriétaire`);
      ['contraventions', 'dashboard', 'counts', 'status', 'vehicle'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    });

  return (
    <Modal open={open} onClose={onClose} icon={Receipt} title="Contravention manuelle" subtitle="Saisie administrative · SMS envoyé au propriétaire" cta="Enregistrer" onSubmit={submit} error={f.error} submitting={f.busy}>
      <Field label="PLAQUE">
        <input className={`${inputCls} font-mono uppercase`} placeholder="DK-0000-XX" value={f.form.plaque} onChange={f.set('plaque')} autoFocus />
        {plate.length >= 6 && (
          <span className={`flex items-center gap-1 text-[11.5px] font-bold tracking-normal ${lookup.data ? 'text-brand-600' : lookup.isError ? 'text-danger-ink' : 'text-faint'}`}>
            {lookup.data ? (
              <>
                <CheckCircle weight="fill" /> {lookup.data.marque} {lookup.data.modele} · {lookup.data.proprietaire.prenom} {lookup.data.proprietaire.nom}
              </>
            ) : lookup.isError ? (
              <>
                <WarningCircle weight="fill" /> Véhicule inconnu au fichier national
              </>
            ) : (
              'Recherche…'
            )}
          </span>
        )}
      </Field>
      <Field label="INFRACTION">
        <select className={inputCls} value={inf} onChange={f.set('inf')}>
          {active.map((t) => (
            <option key={t.id} value={t.id}>
              {t.libelle} · {fmt(t.montantDefaut)} F
            </option>
          ))}
        </select>
      </Field>
      <Field label="ZONE">
        <select className={inputCls} value={zoneId} onChange={f.set('zoneId')} disabled={!!me?.zone}>
          {dakar.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nom}
            </option>
          ))}
        </select>
      </Field>
      <Field label="OFFICIER">
        <select className={inputCls} value={f.form.officerId} onChange={f.set('officerId')}>
          {officers.data?.data.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nomComplet}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}

function OfficerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const { zones } = useRefs(open);
  const f = useForm({ prenom: '', nom: '', matricule: '', grade: 'Sergent', zoneId: me?.zone?.id ?? '', telephone: '', email: '', password: '' }, open);
  const zoneId = f.form.zoneId || zones[0]?.id || '';
  const submit = () =>
    f.run(async () => {
      if (!f.form.prenom.trim() || !f.form.nom.trim() || !f.form.matricule.trim()) throw new Error('Prénom, nom et matricule sont obligatoires.');
      if (f.form.password && f.form.password.length < 8) throw new Error('Le mot de passe initial doit faire au moins 8 caractères.');
      const o = await post<{ nomComplet: string }>('/officers', {
        ...f.form,
        zoneId,
        telephone: f.form.telephone || undefined,
        email: f.form.email || undefined,
        password: f.form.password || undefined,
      });
      toast.success(`${o.nomComplet} ajouté · identifiants envoyés par SMS`);
      qc.invalidateQueries({ queryKey: ['officers'] });
      onClose();
    });
  return (
    <Modal open={open} onClose={onClose} icon={UserPlus} title="Ajouter un officier" subtitle="Le compte mobile sera activé immédiatement" cta="Créer le compte" onSubmit={submit} error={f.error} submitting={f.busy}>
      <Field label="PRÉNOM *">
        <input className={inputCls} placeholder="ex. Awa" value={f.form.prenom} onChange={f.set('prenom')} autoFocus />
      </Field>
      <Field label="NOM *">
        <input className={inputCls} placeholder="ex. Sarr" value={f.form.nom} onChange={f.set('nom')} />
      </Field>
      <Field label="MATRICULE *">
        <input className={`${inputCls} font-mono uppercase`} placeholder="PN-0000" value={f.form.matricule} onChange={f.set('matricule')} />
      </Field>
      <Field label="GRADE">
        <select className={inputCls} value={f.form.grade} onChange={f.set('grade')}>
          {GRADES.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </Field>
      <Field label="ZONE AFFECTÉE">
        <select className={inputCls} value={zoneId} onChange={f.set('zoneId')} disabled={!!me?.zone}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nom}
            </option>
          ))}
        </select>
      </Field>
      <Field label="TÉLÉPHONE">
        <input className={inputCls} placeholder="+221 77 000 00 00" value={f.form.telephone} onChange={f.set('telephone')} />
      </Field>
      <Field label="EMAIL">
        <input className={inputCls} type="email" placeholder="nom@police.sn" value={f.form.email} onChange={f.set('email')} />
      </Field>
      <Field label="MOT DE PASSE INITIAL">
        <input className={inputCls} type="password" placeholder="Min. 8 caractères (sinon généré)" value={f.form.password} onChange={f.set('password')} />
      </Field>
    </Modal>
  );
}

function VehicleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { openDrawer } = useOverlay();
  const f = useForm({ plaque: '', marque: '', type: 'VP', couleur: '', annee: '', owner: '', cni: '', telephone: '' }, open);
  const submit = () =>
    f.run(async () => {
      const { plaque, marque, owner, cni, telephone } = f.form;
      if (!plaque.trim() || !marque.trim() || !owner.trim()) throw new Error('Plaque, marque/modèle et propriétaire requis.');
      if (!cni.trim() || !telephone.trim()) throw new Error('CNI et téléphone du propriétaire requis (lien avec l’Espace Usager).');
      const [mk, ...md] = marque.trim().split(/\s+/);
      const [prenom, ...nom] = owner.trim().split(/\s+/);
      const v = await post<{ plaque: string }>('/vehicles', {
        plaque,
        marque: mk,
        modele: md.join(' ') || '—',
        type: f.form.type,
        couleur: f.form.couleur || undefined,
        annee: f.form.annee ? Number(f.form.annee) : undefined,
        owner: { prenom, nom: nom.join(' ') || prenom, cni, telephone },
      });
      toast.success(`Véhicule ${v.plaque} enregistré au fichier national`);
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      onClose();
      openDrawer({ type: 'vehicle', id: v.plaque });
    });
  return (
    <Modal open={open} onClose={onClose} icon={CarProfile} title="Enregistrer un véhicule" subtitle="Ajout au fichier national des immatriculations" cta="Enregistrer" onSubmit={submit} error={f.error} submitting={f.busy}>
      <Field label="PLAQUE">
        <input className={`${inputCls} font-mono uppercase`} placeholder="DK-0000-XX" value={f.form.plaque} onChange={f.set('plaque')} autoFocus />
      </Field>
      <Field label="MARQUE / MODÈLE">
        <input className={inputCls} placeholder="ex. Toyota Yaris" value={f.form.marque} onChange={f.set('marque')} />
      </Field>
      <Field label="TYPE">
        <select className={inputCls} value={f.form.type} onChange={f.set('type')}>
          <option value="VP">Voiture</option>
          <option value="Moto">Moto</option>
          <option value="Camion">Camion</option>
          <option value="Bus">Bus</option>
        </select>
      </Field>
      <Field label="COULEUR">
        <input className={inputCls} placeholder="ex. Blanc" value={f.form.couleur} onChange={f.set('couleur')} />
      </Field>
      <Field label="ANNÉE">
        <input className={inputCls} inputMode="numeric" placeholder="ex. 2021" value={f.form.annee} onChange={f.set('annee')} />
      </Field>
      <Field label="PROPRIÉTAIRE">
        <input className={inputCls} placeholder="Nom complet" value={f.form.owner} onChange={f.set('owner')} />
      </Field>
      <Field label="CNI DU PROPRIÉTAIRE">
        <input className={`${inputCls} font-mono`} placeholder="1 2345 1990 00123" value={f.form.cni} onChange={f.set('cni')} />
      </Field>
      <Field label="TÉLÉPHONE">
        <input className={inputCls} placeholder="+221 77 000 00 00" value={f.form.telephone} onChange={f.set('telephone')} />
      </Field>
    </Modal>
  );
}

function InfractionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const f = useForm({ libelle: '', montant: '' }, open);
  const submit = () =>
    f.run(async () => {
      const m = Number(f.form.montant.replace(/\s/g, ''));
      if (!f.form.libelle.trim() || !f.form.montant || Number.isNaN(m)) throw new Error('Libellé et montant (nombre) requis.');
      await post('/infraction-types', { libelle: f.form.libelle, montantDefaut: m });
      toast.success(`Infraction « ${f.form.libelle.trim()} » ajoutée au barème`);
      qc.invalidateQueries({ queryKey: ['infractions'] });
      onClose();
    });
  return (
    <Modal open={open} onClose={onClose} icon={ListPlus} title="Nouvelle infraction" subtitle="Ajoutée au barème de tous les terminaux" cta="Ajouter au barème" onSubmit={submit} error={f.error} submitting={f.busy}>
      <Field label="LIBELLÉ" full>
        <input className={inputCls} placeholder="ex. Surcharge passagers" value={f.form.libelle} onChange={f.set('libelle')} autoFocus />
      </Field>
      <Field label="MONTANT PAR DÉFAUT (FCFA)">
        <input className={`${inputCls} font-mono`} inputMode="numeric" placeholder="ex. 15000" value={f.form.montant} onChange={f.set('montant')} />
      </Field>
    </Modal>
  );
}

function AdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { zones } = useRefs(open);
  const f = useForm({ nom: '', email: '', role: 'superviseur', zoneId: '' }, open);
  const needsZone = f.form.role === 'commandant' || f.form.role === 'superviseur';
  const submit = () =>
    f.run(async () => {
      if (!f.form.nom.trim() || !f.form.email.trim()) throw new Error('Nom et email requis.');
      const r = await post<{ activationLink?: string }>('/admins', {
        ...f.form,
        zoneId: needsZone ? f.form.zoneId || zones[0]?.id : undefined,
      });
      toast.success(`Invitation envoyée à ${f.form.email}`, r.activationLink ? { description: 'Lien d’activation copié dans le presse-papiers (dev)' } : undefined);
      if (r.activationLink) navigator.clipboard?.writeText(r.activationLink).catch(() => {});
      qc.invalidateQueries({ queryKey: ['admins'] });
      onClose();
    });
  return (
    <Modal open={open} onClose={onClose} icon={ShieldPlus} title="Inviter un administrateur" subtitle="Un lien d'activation sera envoyé par email" cta="Envoyer l'invitation" onSubmit={submit} error={f.error} submitting={f.busy}>
      <Field label="NOM COMPLET">
        <input className={inputCls} placeholder="ex. Moussa Diouf" value={f.form.nom} onChange={f.set('nom')} autoFocus />
      </Field>
      <Field label="EMAIL">
        <input className={inputCls} type="email" placeholder="nom@police.sn" value={f.form.email} onChange={f.set('email')} />
      </Field>
      <Field label="RÔLE">
        <select className={inputCls} value={f.form.role} onChange={f.set('role')}>
          <option value="super_admin">Super Admin</option>
          <option value="commandant">Commandant</option>
          <option value="tresorier">Trésorier</option>
          <option value="superviseur">Superviseur</option>
        </select>
      </Field>
      {needsZone && (
        <Field label="ZONE">
          <select className={inputCls} value={f.form.zoneId || zones[0]?.id} onChange={f.set('zoneId')}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nom}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  );
}

const MOTIFS = [
  'Faute professionnelle',
  'Enquête disciplinaire en cours',
  'Suspicion de fraude ou de corruption',
  'Perte ou vol du terminal',
  'Absence injustifiée',
  'Non-respect des procédures de verbalisation',
];
const AUTRE = '__autre__';

/** Suspension d'un officier : motif obligatoire (liste ou texte libre), tracé dans la fiche et l'audit. */
function SuspendModal({ officer, onClose }: { officer: { id: string; nomComplet: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const f = useForm({ choix: '', detail: '' }, !!officer);
  const autre = f.form.choix === AUTRE;
  const submit = () =>
    f.run(async () => {
      if (!f.form.choix) throw new Error('Sélectionnez un motif de suspension.');
      if (autre && f.form.detail.trim().length < 3) throw new Error('Précisez le motif (3 caractères minimum).');
      const motif = autre ? f.form.detail.trim() : f.form.detail.trim() ? `${f.form.choix} · ${f.form.detail.trim()}` : f.form.choix;
      await post(`/officers/${officer!.id}/suspend`, { motif });
      toast.success(`${officer!.nomComplet} suspendu · terminal verrouillé`, { description: motif });
      ['officers', 'officer'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    });
  return (
    <Modal
      open={!!officer}
      onClose={onClose}
      icon={Pause}
      title={`Suspendre ${officer?.nomComplet ?? ''}`}
      subtitle="Le terminal de l'agent est verrouillé immédiatement"
      cta="Confirmer la suspension"
      onSubmit={submit}
      error={f.error}
      submitting={f.busy}
    >
      <Field label="MOTIF *" full>
        <select className={inputCls} value={f.form.choix} onChange={f.set('choix')} autoFocus>
          <option value="" disabled>
            Choisir un motif…
          </option>
          {MOTIFS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={AUTRE}>Autre (préciser)</option>
        </select>
      </Field>
      <Field label={autre ? 'PRÉCISEZ LE MOTIF *' : 'PRÉCISIONS (FACULTATIF)'} full>
        <textarea
          className={`${inputCls} h-24 py-3`}
          maxLength={400}
          placeholder={autre ? 'Décrivez le motif de la suspension' : 'Référence de rapport, circonstances…'}
          value={f.form.detail}
          onChange={f.set('detail')}
        />
      </Field>
    </Modal>
  );
}
