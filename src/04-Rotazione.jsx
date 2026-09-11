import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ==========================================
// SEZIONE 0: PALETTE E COSTANTI GLOBALI EXPORTATE
// ==========================================
export const PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#6366F1', '#64748B'
];

export const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

export const NOMI_GIORNI_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export const FESTIVITA_DEFAULT_ATTIVE = [
  '01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'
];

export const FASCE_AUTOMATICHE_DEFAULT = [
  { nome: 'Primo Turno', orarioInizio: '07:00', colore: '#3B82F6' },
  { nome: 'Secondo Turno', orarioInizio: '15:00', colore: '#F59E0B' },
  { nome: 'Terzo Turno', orarioInizio: '23:00', colore: '#8B5CF6' },
  { nome: 'Notte', orarioInizio: '22:00', colore: '#10B981' }
];

export function dkey(year, monthIndex, day) {
  const m = (monthIndex + 1).toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function categoriaTurnoAutomatica(orarioInizio) {
  if (!orarioInizio) return 'Altro';
  const h = parseInt(orarioInizio.split(':')[0], 10);
  if (h >= 6 && h < 14) return 'Mattina';
  if (h >= 14 && h < 22) return 'Pomeriggio';
  return 'Notte';
}

export function categoriaAppAutoAutomatica(orarioInizio) {
  return categoriaTurnoAutomatica(orarioInizio);
}

// ==========================================
// SEZIONE 1: UTILITY COLORI E YIQ CONTRAST
// ==========================================
export function getContrastTextColor(hexColor) {
  if (!hexColor || typeof hexColor !== 'string') return '#000000';
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length !== 6) return '#000000';
  
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#000000' : '#FFFFFF';
}

export function getColorByTime(timeStr, fasce = FASCE_AUTOMATICHE_DEFAULT) {
  if (!timeStr) return '#64748B';
  const minInput = oraInMinuti(timeStr);
  
  let coloreSelezionato = '#64748B';
  let diffMinima = Infinity;

  fasce.forEach(fasca => {
    const minFascia = oraInMinuti(fasca.orarioInizio);
    const diff = Math.abs(minInput - minFascia);
    if (diff < diffMinima) {
      diffMinima = diff;
      coloreSelezionato = fasca.colore;
    }
  });

  return coloreSelezionato;
}

export function getColorLabel(colore) {
  const t = PALETTE.indexOf(colore);
  return t !== -1 ? `Colore ${t + 1}` : 'Personalizzato';
}

// ==========================================
// SEZIONE 2: PERSISTENZA E LOGGING
// ==========================================
export function saveToLocalStorage(key, value) {
  try {
    let dataToSave = value;
    if (key === 'cache_modelli' && Array.isArray(value)) {
      dataToSave = [...value].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    localStorage.setItem(key, JSON.stringify(dataToSave));
    return { ok: true, errore: null };
  } catch (err) {
    console.error(`[LocalStorage Error] Impossibile salvare la chiave "${key}":`, err);
    segnalaErrore(`Errore di salvataggio per ${key}: memoria piena o restrittiva.`, err);
    return { ok: false, dettaglio: err };
  }
}

export function loadFromLocalStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item);
  } catch (err) {
    console.error(`[LocalStorage Error] Errore lettura per "${key}":`, err);
    return defaultValue;
  }
}

export function segnalaErrore(messaggio, dettaglio = null) {
  const logIniziale = loadFromLocalStorage('log_errori_app', []);
  const nuovoLog = {
    timestamp: new Date().toISOString(),
    messaggio,
    dettaglio: dettaglio?.toString() || null
  };
  const logAggiornato = [nuovoLog, ...logIniziale].slice(0, 50);
  saveToLocalStorage('log_errori_app', logAggiornato);
}

export function registraProblemiImport(sessioneImport) {
  const storico = loadFromLocalStorage('storico_import_problemi', []);
  const aggiornato = [{ timestamp: new Date().toISOString(), ...sessioneImport }, ...storico].slice(0, 30);
  saveToLocalStorage('storico_import_problemi', aggiornato);
}

export function generaIdLocale() {
  return 'loc_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
}

export function accodaOperazioneSync(operazione) {
  const coda = loadFromLocalStorage('coda_sync_offline', []);
  coda.push({ ...operazione, timestamp: Date.now() });
  saveToLocalStorage('coda_sync_offline', coda);
}

// ==========================================
// SEZIONE 3: PARSING ORARI E CALCOLI DURATA
// ==========================================
export function normalizzaOraHHMM(str) {
  if (!str || typeof str !== 'string') return '00:00';
  let pulito = str.replace(/[^0-9.:]/g, '').trim();
  
  if (pulito.includes(':')) {
    const parti = pulito.split(':');
    const h = parti[0].padStart(2, '0');
    const m = (parti[1] || '00').padEnd(2, '0').substring(0, 2);
    return `${h}:${m}`;
  }
  
  if (pulito.includes('.')) {
    const parti = pulito.split('.');
    const h = parti[0].padStart(2, '0');
    const m = (parti[1] || '00').padEnd(2, '0').substring(0, 2);
    return `${h}:${m}`;
  }

  if (pulito.length === 3) {
    return `0${pulito[0]}:${pulito.substring(1)}`;
  }
  
  if (pulito.length === 4) {
    return `${pulito.substring(0, 2)}:${pulito.substring(2)}`;
  }

  const num = parseInt(pulito, 10);
  if (!isNaN(num) && num >= 0 && num <= 23) {
    return `${num.toString().padStart(2, '0')}:00`;
  }

  return '00:00';
}

export function oraInMinuti(oraHHMM) {
  const norm = normalizzaOraHHMM(oraHHMM);
  const [h, m] = norm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function calcFine6h15(inizioStr) {
  const minInizio = oraInMinuti(inizioStr);
  const minFine = (minInizio + 6 * 60 + 15) % (24 * 60);
  const h = Math.floor(minFine / 60).toString().padStart(2, '0');
  const m = (minFine % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function calcFine6h30(inizioStr) {
  const minInizio = oraInMinuti(inizioStr);
  const minFine = (minInizio + 6 * 60 + 30) % (24 * 60);
  const h = Math.floor(minFine / 60).toString().padStart(2, '0');
  const m = (minFine % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function calcFineModello(modello) {
  if (!modello) return '00:00';
  if (modello.tipoDurata === 'H24') return modello.orarioInizio || '00:00';
  if (modello.tipoDurata === '6h15') return calcFine6h15(modello.orarioInizio);
  if (modello.tipoDurata === '6h30') return calcFine6h30(modello.orarioInizio);
  return modello.orarioFine || '00:00';
}

export function calcDurata(inizioStr, fineStr, tipoDurata) {
  if (tipoDurata === 'H24') return '24h 00m';
  if (tipoDurata === '6h15') return '6h 15m';
  if (tipoDurata === '6h30') return '6h 30m';
  
  const mInizio = oraInMinuti(inizioStr);
  let mFine = oraInMinuti(fineStr);
  
  if (mFine <= mInizio) {
    mFine += 24 * 60;
  }
  
  const diff = mFine - mInizio;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

// ==========================================
// SEZIONE 4: FESTIVITÀ E ISTANZIATORE TURNI
// ==========================================
export function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function italianHols(year) {
  const h = [
    { date: `${year}-01-01`, name: 'Capodanno' },
    { date: `${year}-01-06`, name: 'Epifania' },
    { date: `${year}-04-25`, name: 'Liberazione' },
    { date: `${year}-05-01`, name: 'Festa del Lavoro' },
    { date: `${year}-06-02`, name: 'Festa della Repubblica' },
    { date: `${year}-08-15`, name: 'Ferragosto' },
    { date: `${year}-11-01`, name: 'Ognissanti' },
    { date: `${year}-12-08`, name: 'Immacolata' },
    { date: `${year}-12-25`, name: 'Natale' },
    { date: `${year}-12-26`, name: 'Santo Stefano' }
  ];

  const p = easter(year);
  const pM = new Date(p);
  pM.setDate(p.getDate() + 1);

  const format = (d) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  
  h.push({ date: format(p), name: 'Pasqua' });
  h.push({ date: format(pM), name: 'Lunedì dell\'Angelo' });

  return h;
}

export function resolveFestivitaCatalogo(year, configurazioneExtra = []) {
  const base = italianHols(year);
  return [...base, ...configurazioneExtra];
}

export function classificaNoteVecchiaApp(notaTesto = '') {
  if (!notaTesto) return { notePulite: '', targaMezzo: '', colleghi: '', protrazioneRecupero: false, oreProtrazione: '' };
  
  let notePulite = notaTesto;
  let targaMezzo = '';
  let colleghi = '';
  let protrazioneRecupero = false;
  let oreProtrazione = '';

  const matchProt = notePulite.match(/(?:protrazione|recupero|prot\.?\s*rec\.?)(?:\s*:?\s*(\d+(?:\.\d+)?\s*h?))?/i);
  if (matchProt) {
    protrazioneRecupero = true;
    oreProtrazione = matchProt[1] || '';
    notePulite = notePulite.replace(matchProt[0], '').trim();
  }

  const matchTarga = notePulite.match(/\b([A-Z]{2}\s*\d{3}[A-Z]{2}|\d{3}[A-Z]{2})\b/i);
  if (matchTarga) {
    targaMezzo = matchTarga[0];
    notePulite = notePulite.replace(matchTarga[0], '').trim();
  }

  return { notePulite, targaMezzo, colleghi, protrazioneRecupero, oreProtrazione };
}

export function estraiJsonDaTesto(testoGrezzo) {
  if (!testoGrezzo) return null;
  try {
    const inizio = testoGrezzo.indexOf('[');
    const fine = testoGrezzo.lastIndexOf(']');
    if (inizio !== -1 && fine !== -1 && fine > inizio) {
      const jsonStr = testoGrezzo.substring(inizio, fine + 1);
      return JSON.parse(jsonStr);
    }
    const inizioObj = testoGrezzo.indexOf('{');
    const fineObj = testoGrezzo.lastIndexOf('}');
    if (inizioObj !== -1 && fineObj !== -1 && fineObj > inizioObj) {
      const jsonStr = testoGrezzo.substring(inizioObj, fineObj + 1);
      return JSON.parse(jsonStr);
    }
  } catch (e) {
    console.warn("Estrazione JSON fallita:", e);
  }
  return null;
}

export function normalizzaRigheImportGrezzo(righe) {
  if (!Array.isArray(righe)) return [];
  
  return righe.map(r => {
    const noteElaborate = classificaNoteVecchiaApp(r.note || r.Note || '');
    
    const protrazioneRecupero = r.protrazioneRecupero !== undefined 
      ? Boolean(r.protrazioneRecupero) 
      : noteElaborate.protrazioneRecupero;

    const oreProtrazione = r.oreProtrazione || noteElaborate.oreProtrazione || '';

    return {
      id: r.id || generaIdLocale(),
      data: r.data || r.Data || '',
      labelTurno: r.labelTurno || r.Turno || r.titolo || '',
      orarioInizio: normalizzaOraHHMM(r.orarioInizio || r.Inizio || '00:00'),
      orarioFine: normalizzaOraHHMM(r.orarioFine || r.Fine || '00:00'),
      colore: r.colore || getColorByTime(r.orarioInizio),
      note: noteElaborate.notePulite,
      targaMezzo: r.targaMezzo || noteElaborate.targaMezzo,
      colleghi: r.colleghi || noteElaborate.colleghi,
      
      protrazioneRecupero: protrazioneRecupero,
      oreProtrazione: oreProtrazione,

      creatoIl: r.creatoIl || new Date().toISOString()
    };
  });
}

export function normalizzaTestoGrezzoTurni(testo) {
  const jsonEstratto = estraiJsonDaTesto(testo);
  if (jsonEstratto) {
    return normalizzaRigheImportGrezzo(Array.isArray(jsonEstratto) ? jsonEstratto : [jsonEstratto]);
  }

  const righe = testo.split('\n');
  const risultati = [];

  righe.forEach(r => {
    if (!r.trim()) return;
    const parti = r.split(/\t|,|;/);
    if (parti.length >= 2) {
      risultati.push({
        data: parti[0].trim(),
        labelTurno: parti[1].trim(),
        orarioInizio: parti[2] ? parti[2].trim() : '07:00',
        orarioFine: parti[3] ? parti[3].trim() : '13:15',
        note: parti[4] ? parti[4].trim() : ''
      });
    }
  });

  return normalizzaRigheImportGrezzo(risultati);
}

// ==========================================
// SEZIONE 5: COMPONENTI UI - FRECCE E PRESSABLE
// ==========================================
export function PressableArrow({ direction, onClick, disabled = false, title = '' }) {
  const symbol = direction === 'up' ? '▲' : '▼';
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && onClick) onClick(e);
      }}
      style={{
        background: disabled ? '#E2E8F0' : '#F1F5F9',
        border: '1px solid #CBD5E1',
        borderRadius: '4px',
        padding: '2px 6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '10px',
        color: disabled ? '#94A3B8' : '#334155',
        margin: '0 2px',
        userSelect: 'none'
      }}
    >
      {symbol}
    </button>
  );
}

// ==========================================
// SEZIONE 26: COMPONENTE MODELLOCARD & MODELFORM
// ==========================================
export function ModelForm({ modelloIniziale, onSalva, onAnnulla }) {
  const [formData, setFormData] = useState(() => ({
    id: modelloIniziale?.id || generaIdLocale(),
    titolo: modelloIniziale?.titolo || '',
    labelTurno: modelloIniziale?.labelTurno || '',
    tipoDurata: modelloIniziale?.tipoDurata || 'custom',
    orarioInizio: modelloIniziale?.orarioInizio || '07:00',
    orarioFine: modelloIniziale?.orarioFine || '13:15',
    colore: modelloIniziale?.colore || '#3B82F6',
    
    protrazioneRecupero: modelloIniziale?.protrazioneRecupero || false,
    oreProtrazione: modelloIniziale?.oreProtrazione || '',

    sortOrder: modelloIniziale?.sortOrder ?? 0
  }));

  const handleChange = (field, val) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: val };
      if (field === 'orarioInizio') {
        if (updated.tipoDurata === '6h15') updated.orarioFine = calcFine6h15(val);
        if (updated.tipoDurata === '6h30') updated.orarioFine = calcFine6h30(val);
      }
      if (field === 'tipoDurata') {
        if (val === '6h15') updated.orarioFine = calcFine6h15(updated.orarioInizio);
        if (val === '6h30') updated.orarioFine = calcFine6h30(updated.orarioInizio);
        if (val === 'H24') updated.orarioFine = updated.orarioInizio;
      }
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.titolo.trim()) {
      alert("Inserisci un titolo per il modello.");
      return;
    }
    
    onSalva(formData);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
      <h4 style={{ margin: '0 0 12px 0' }}>{modelloIniziale ? 'Modifica Modello' : 'Nuovo Modello Turno'}</h4>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Titolo Modello</label>
          <input
            type="text"
            value={formData.titolo}
            onChange={(e) => handleChange('titolo', e.target.value)}
            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1' }}
            placeholder="es. Mattina 6h15"
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Etichetta Turno (M, N, R...)</label>
          <input
            type="text"
            value={formData.labelTurno}
            onChange={(e) => handleChange('labelTurno', e.target.value)}
            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1' }}
            placeholder="es. M"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Tipo Durata</label>
          <select
            value={formData.tipoDurata}
            onChange={(e) => handleChange('tipoDurata', e.target.value)}
            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1' }}
          >
            <option value="custom">Personalizzata</option>
            <option value="6h15">6 Ore e 15 Minuti</option>
            <option value="6h30">6 Ore e 30 Minuti</option>
            <option value="H24">24 Ore intere</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Ora Inizio</label>
          <input
            type="time"
            value={formData.orarioInizio}
            onChange={(e) => handleChange('orarioInizio', e.target.value)}
            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Ora Fine</label>
          <input
            type="time"
            disabled={formData.tipoDurata !== 'custom'}
            value={formData.orarioFine}
            onChange={(e) => handleChange('orarioFine', e.target.value)}
            style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #CBD5E1', opacity: formData.tipoDurata !== 'custom' ? 0.6 : 1 }}
          />
        </div>
      </div>

      <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', padding: '10px', borderRadius: '6px', marginBottom: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '13px', color: '#92400E', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={formData.protrazioneRecupero}
            onChange={(e) => handleChange('protrazioneRecupero', e.target.checked)}
          />
          Imposta Protrazione a Recupero per questo modello
        </label>

        {formData.protrazioneRecupero && (
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: '#B45309' }}>Ore di Protrazione Previste</label>
            <input
              type="text"
              value={formData.oreProtrazione}
              onChange={(e) => handleChange('oreProtrazione', e.target.value)}
              placeholder="es. 1h 30m"
              style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #F59E0B', marginTop: '2px' }}
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Colore:</label>
        {PALETTE.map(c => (
          <div
            key={c}
            onClick={() => handleChange('colore', c)}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: c,
              cursor: 'pointer',
              border: formData.colore === c ? '3px solid #000' : '1px solid #ccc'
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button type="button" onClick={onAnnulla} style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#FFF' }}>Annulla</button>
        <button type="submit" style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', background: '#3B82F6', color: '#FFF', fontWeight: 'bold' }}>Salva Modello</button>
      </div>
    </form>
  );
}

export function ModelloCard({ modello, onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const colorTesto = getContrastTextColor(modello.colore);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: '6px',
      marginBottom: '8px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '6px',
          backgroundColor: modello.colore,
          color: colorTesto,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: '14px'
        }}>
          {modello.labelTurno || 'T'}
        </div>

        <div>
          <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1E293B' }}>
            {modello.titolo}
            {modello.protrazioneRecupero && (
              <span style={{ marginLeft: '8px', fontSize: '10px', background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B', padding: '1px 5px', borderRadius: '4px' }}>
                Protrazione a Recupero {modello.oreProtrazione ? `(${modello.oreProtrazione})` : ''}
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>
            Orario: {modello.orarioInizio} - {calcFineModello(modello)} ({calcDurata(modello.orarioInizio, calcFineModello(modello), modello.tipoDurata)})
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <PressableArrow direction="up" disabled={isFirst} onClick={onMoveUp} title="Sposta su" />
        <PressableArrow direction="down" disabled={isLast} onClick={onMoveDown} title="Sposta giù" />
        <button onClick={onEdit} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Modifica</button>
        <button onClick={onDelete} style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Elimina</button>
      </div>
    </div>
  );
}

// ==========================================
// SEZIONE 27: GESTIONE MODELLI E ROTAZIONE
// ==========================================
export default function GestioneRotazione() {
  const [modelli, setModelli] = useState(() => loadFromLocalStorage('cache_modelli', []));
  const [inModifica, setInModifica] = useState(null);
  const [nuovoAperto, setNuovoAperto] = useState(false);

  useEffect(() => {
    const res = saveToLocalStorage('cache_modelli', modelli);
    if (!res.ok) {
      alert("Attenzione: Impossibile salvare la lista modelli in memoria locale. I dati potrebbero essere persi ricaricando la pagina.");
    }
  }, [modelli]);

  const handleSalvaModello = (modelloDaSalvare) => {
    setModelli(prev => {
      const indice = prev.findIndex(m => m.id === modelloDaSalvare.id);
      if (indice !== -1) {
        const aggiornati = [...prev];
        aggiornati[indice] = { ...aggiornati[indice], ...modelloDaSalvare };
        return aggiornati;
      }
      return [...prev, { ...modelloDaSalvare, sortOrder: prev.length }];
    });
    setInModifica(null);
    setNuovoAperto(false);
  };

  const handleElimina = (id) => {
    if (window.confirm("Sei sicuro di voler eliminare questo modello?")) {
      setModelli(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleSposta = (index, direzione) => {
    setModelli(prev => {
      const copia = [...prev];
      const targetIndex = direzione === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copia.length) return prev;
      
      const temp = copia[index];
      copia[index] = copia[targetIndex];
      copia[targetIndex] = temp;

      return copia.map((m, idx) => ({ ...m, sortOrder: idx }));
    });
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#0F172A' }}>Gestione Modelli e Rotazione Turni</h2>
        {!nuovoAperto && !inModifica && (
          <button
            onClick={() => setNuovoAperto(true)}
            style={{ background: '#10B981', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            + Nuovo Modello
          </button>
        )}
      </div>

      {(nuovoAperto || inModifica) && (
        <ModelForm
          modelloIniziale={inModifica}
          onSalva={handleSalvaModello}
          onAnnulla={() => { setInModifica(null); setNuovoAperto(false); }}
        />
      )}

      <div>
        {modelli.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748B', padding: '30px', background: '#F8FAFC', borderRadius: '8px', border: '1px border-dashed #CBD5E1' }}>
            Nessun modello turno registrato. Clicca su "+ Nuovo Modello" per crearne uno.
          </div>
        ) : (
          modelli.map((m, idx) => (
            <ModelloCard
              key={m.id}
              modello={m}
              isFirst={idx === 0}
              isLast={idx === modelli.length - 1}
              onEdit={() => { setInModifica(m); setNuovoAperto(false); }}
              onDelete={() => handleElimina(m.id)}
              onMoveUp={() => handleSposta(idx, 'up')}
              onMoveDown={() => handleSposta(idx, 'down')}
            />
          ))
        )}
      </div>
    </div>
  );
}