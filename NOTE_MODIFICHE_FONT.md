# Note modifiche dimensione testo — App.jsx

> File di sola documentazione. Non è codice, non viene importato da
> App.jsx né da nessun altro file: serve solo come riferimento per
> trovare a mano i blocchi giusti in caso di ulteriori ritocchi.

---

## 1. Report — card compatte (lista "Report attivi")

**Cosa vedi a schermo:** il titolo grassetto (es. "Conteggio turni") e
la riga sotto (es. "4 turni 1°T 25% 2°T 75%") dentro ogni card chiusa
nella schermata Report.

**Dove cercarlo:** dentro la funzione `renderReportCard`, subito dopo
il bottone rosso "–".

```js
<div style={{fontSize:22,fontWeight:700,color:T.text,overflow:"hidden",
  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.label}</div>
{r.type==="conteggio_turni"&&(
  <div style={{fontSize:17,color:T.sub}}>
```

- `fontSize:22` → titolo card (era 14, +8)
- `fontSize:17` → riga sotto con conteggio (era 11, +6)

---

## 2. Modelli → Turni — lista compatta (ModelloCard)

**Cosa vedi a schermo:** il titolo grassetto del modello (es. "00 - 06")
e la riga sotto con orario/durata (es. "00:00-06:00 • 6h"), nella lista
in Modelli → Turni.

**Dove cercarlo:** dentro la funzione `ModelloCard`, subito dopo il
quadratino colorato a sinistra.

```js
<div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
<div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>
```

- `fontSize:17` → titolo modello (era 19, -2)
- `fontSize:16` → riga durata (era 14, +2)

---

## 3. Rotazioni — lista compatta (RotazioneCard)

**Cosa vedi a schermo:** il titolo grassetto della rotazione e la riga
sotto col tipo (es. "🗓 Domeniche 1/4"), nella lista in
Modelli → Rotazioni.

**Dove cercarlo:** dentro la funzione `RotazioneCard`.

```js
<div style={{fontSize:17,fontWeight:800,color:T.text,marginBottom:2}}>{r.titolo||"Senza nome"}</div>
<div style={{fontSize:16,color:T.sub}}>{tipoLabel}{r.dataInizio?` · dal ${r.dataInizio}`:""}</div>
```

- `fontSize:17` → titolo rotazione (era 14, uniformato a ModelloCard)
- `fontSize:16` → riga tipo (era 12, uniformato a ModelloCard)

---

## 4. Aggiungi modello → "Scegli modello" (picker)

**Cosa vedi a schermo:** il titolo del modello e la riga durata nella
schermata che si apre quando premi "+ Aggiungi" e scegli un modello
esistente.

**Dove cercarlo:** dentro il blocco `showModelloPicker`, nel render
della lista `modelliPicker.map((m,i,arr)=>{...})`.

```js
<div style={{fontSize:17,fontWeight:800,color:T.text,overflow:"hidden",
  textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.titolo||"Senza nome"}</div>
<div style={{fontSize:16,color:T.sub,marginTop:1}}>{durata}</div>
```

- `fontSize:17` → titolo modello nel picker (era 16, uniformato)
- `fontSize:16` → riga durata nel picker (era 14, uniformato)

**⚠️ Attenzione:** questo blocco è quasi identico a quello del punto 2
(`fontSize:17,fontWeight:800` ricorre in entrambi). Per distinguerli,
guarda il contesto sopra/sotto: quello del picker è dentro
`modelliPicker.map((m,i,arr)=>{...})`, quello di `ModelloCard` è in
una funzione a parte chiamata `function ModelloCard({m, T, accent, ...`.

---

## Riepilogo script applicati

| Script | Contenuto |
|---|---|
| `fix_app_parte1.py` | Font Report/Modelli/Rotazioni/Picker, ordine "Scegli modello", frecce immediate, Supabase collassabile |
| `fix_app_parte2.py` | Turni H24/senza orario liberi nell'ordinamento (moveH24) |
| `fix_app_parte3.py` | Pulizia codice morto/duplicato (nessun cambio visivo) |
