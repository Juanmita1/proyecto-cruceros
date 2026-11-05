/**
 * Ficha rápida de incidencia. Es el único lugar donde se pueden guardar datos
 * del pasajero (leídos del BCBP), y solo si el vigilante lo marca.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getState, navigate, requestPin, useApp } from '../app/store';
import * as A from '../app/actions';
import { tagId } from '../domain/lpn';
import type { BcbpData } from '../domain/bcbp';
import { classify } from '../domain/classify';
import type { Incident, IncidentPhoto, PassengerData } from '../domain/types';
import { getIncident, controlsOf, uid } from '../storage/db';
import { camera } from '../scanner/camera';
import { ScannerView } from './ScannerView';
import { compressPhoto } from './photo';
import { fmtTime } from '../domain/report';

function passengerFrom(b: BcbpData): PassengerData {
  const l = b.legs[0];
  return { name: b.displayName, pnr: l?.pnr ?? '', flight: l?.flight ?? '', from: l?.from ?? '', to: l?.to ?? '', date: l?.date ?? null, seat: l?.seat };
}

export function IncidentForm({ controlId, incidentId, presetType }: { controlId?: string; incidentId?: string; presetType?: string }) {
  const { config, pass, shift } = useApp();
  const fromPass = !incidentId && (pass.claims.length > 0 || pass.bags.length > 0 || !!pass.bcbp);
  const [existing, setExisting] = useState<Incident | null>(null);
  const [type, setType] = useState(presetType ?? '');
  const [action, setAction] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<IncidentPhoto[]>([]);
  const [passenger, setPassenger] = useState<PassengerData | undefined>(pass.bcbp ? passengerFrom(pass.bcbp) : undefined);
  const [keepPassenger, setKeepPassenger] = useState(true);
  const [flight, setFlight] = useState(A.passFlight() ?? '');
  const [scanBp, setScanBp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [claims, setClaims] = useState<string[]>(fromPass ? pass.claims.map(tagId) : []);
  const [bags, setBags] = useState<string[]>(fromPass ? pass.bags.map((b) => tagId(b.code)) : []);

  // Edición de una incidencia existente.
  useEffect(() => {
    if (!incidentId) return;
    void getIncident(incidentId).then((i) => {
      if (!i) return;
      setExisting(i);
      setType(i.type);
      setAction(i.action);
      setNotes(i.notes);
      setPhotos(i.photos);
      setPassenger(i.passenger);
      setKeepPassenger(!!i.passenger);
      setFlight(i.flight ?? '');
      setClaims(i.claims);
      setBags(i.bags);
    });
  }, [incidentId]);

  // Si viene de un control guardado pero el pasajero ya se reinició, recuperamos sus LPN.
  useEffect(() => {
    if (!controlId || fromPass || !shift) return;
    void controlsOf(shift.id).then((cs) => {
      const c = cs.find((x) => x.id === controlId);
      if (c) {
        setClaims(c.claims);
        setBags(c.bags.map((b) => b.id));
      }
    });
  }, [controlId]);

  // Lectura de la tarjeta de embarque desde la propia ficha.
  useEffect(() => {
    if (!scanBp) return;
    return camera.onDetect((dets) => {
      for (const d of dets) {
        const c = classify(d.text, getState().airlines, 'camera');
        if (c.kind === 'bcbp') {
          setPassenger(passengerFrom(c.data));
          setFlight((f) => f || c.data.legs[0]?.flight || '');
          setScanBp(false);
        }
      }
    });
  }, [scanBp]);

  const photoUrls = useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  useEffect(() => () => photoUrls.forEach((u) => URL.revokeObjectURL(u)), [photoUrls]);

  const addPhoto = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    for (const f of files) {
      try {
        const p = await compressPhoto(f);
        setPhotos((ps) => [...ps, { id: uid(), ...p }]);
      } catch {
        alert('No se pudo procesar la foto');
      }
    }
  };

  const back = () => navigate({ name: shift?.endedAt ? 'report' : incidentId ? 'report' : 'control' });

  const save = async () => {
    if (!type) return;
    setBusy(true);
    await A.saveIncident({
      id: existing?.id,
      ts: existing?.ts,
      controlId: existing?.controlId ?? controlId,
      type,
      action,
      notes: notes.trim(),
      claims,
      bags,
      flight: flight.trim().toUpperCase() || undefined,
      passenger: keepPassenger ? passenger : undefined,
      photos,
    });
    setBusy(false);
    if (!incidentId) A.nextPassenger();
    back();
  };

  return (
    <div class="screen screen--form">
      <header class="topbar">
        <button class="iconbtn" onClick={back} aria-label="Volver">
          ←
        </button>
        <div class="topbar__title">
          <strong>{existing ? 'Editar incidencia' : 'Nueva incidencia'}</strong>
          <span>{existing ? fmtTime(existing.ts) : 'Registro rápido'}</span>
        </div>
      </header>

      <div class="form">
        {(claims.length > 0 || bags.length > 0) && (
          <div class="card">
            <div>
              Resguardos: <strong>{claims.join(', ') || '—'}</strong>
            </div>
            <div>
              Maletas: <strong>{bags.join(', ') || '—'}</strong>
            </div>
          </div>
        )}

        <fieldset>
          <legend>Tipo de incidencia *</legend>
          <div class="choices">
            {config.incidentTypes.map((t) => (
              <button key={t} type="button" class={`choice ${type === t ? 'choice--on' : ''}`} aria-pressed={type === t} onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Acción tomada</legend>
          <div class="choices">
            {config.actions.map((t) => (
              <button key={t} type="button" class={`choice ${action === t ? 'choice--on' : ''}`} aria-pressed={action === t} onClick={() => setAction(action === t ? '' : t)}>
                {t}
              </button>
            ))}
          </div>
        </fieldset>

        <label class="field">
          <span>Observaciones</span>
          <textarea class="input" rows={3} value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
        </label>

        <label class="field">
          <span>Vuelo</span>
          <input class="input" value={flight} placeholder="IB3167" autocapitalize="characters" onInput={(e) => setFlight((e.target as HTMLInputElement).value)} />
        </label>

        <fieldset>
          <legend>Fotos (etiqueta / resguardo)</legend>
          <div class="photos">
            {photos.map((p, i) => (
              <figure key={p.id}>
                <img src={photoUrls[i]} alt={`Foto ${i + 1}`} />
                <button class="code__x" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} aria-label="Quitar foto">
                  ✕
                </button>
              </figure>
            ))}
            <label class="photo-add">
              📷 Añadir foto
              <input type="file" accept="image/*" capture="environment" onChange={addPhoto} hidden />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Datos del pasajero (solo incidencias)</legend>
          {passenger ? (
            <div class="card">
              <div>
                <strong>{passenger.name}</strong>
              </div>
              <div>
                PNR {passenger.pnr} · {passenger.flight} · {passenger.from}→{passenger.to} {passenger.date ?? ''}
              </div>
              <label class="check">
                <input type="checkbox" checked={keepPassenger} onChange={(e) => setKeepPassenger((e.target as HTMLInputElement).checked)} />
                Guardar estos datos en la incidencia
              </label>
            </div>
          ) : scanBp ? (
            <div class="stack">
              <ScannerView compact hint="Enfoque el PDF417 / QR / Aztec de la tarjeta de embarque" />
              <button class="btn" onClick={() => setScanBp(false)}>
                Cancelar lectura
              </button>
            </div>
          ) : (
            <button class="btn" onClick={() => setScanBp(true)}>
              📷 Leer tarjeta de embarque (BCBP)
            </button>
          )}
        </fieldset>
      </div>

      <footer class="actions">
        <button class="btn btn--xl btn--primary" disabled={!type || busy} onClick={save}>
          {busy ? 'Guardando…' : 'GUARDAR INCIDENCIA'}
        </button>
        {existing && (
          <button
            class="btn btn--bad"
            onClick={async () => {
              if (!(await requestPin('Eliminar incidencia'))) return;
              await A.deleteIncidentById(existing.id);
              back();
            }}
          >
            Eliminar
          </button>
        )}
      </footer>
    </div>
  );
}
