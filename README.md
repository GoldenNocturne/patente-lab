# Patente Lab

Webapp statica per preparare la patente B, senza account interno. Il sito pubblicato è privato. La banca dati è in sola lettura; i progressi sono locali al browser e si possono esportare/ripristinare.

## Modalità

- Quiz per capitolo: scelta multipla dei capitoli, senza limite di tempo. Include soltanto domande mai risolte correttamente. Completamento = numero di domande distinte risolte correttamente almeno una volta, diviso per tutte le domande del capitolo.
- Ripasso errori: filtra per capitolo le domande con ultimo tentativo errato. Una risposta corretta le rimuove dal ripasso. Un nuovo errore in una scheda può reinserire anche una domanda già risolta in passato.
- Scheda: 30 domande uniche casuali dall'intero listato, 20 minuti, promozione fino a 3 errori. Le risposte mancanti sono errori. Risposte modificabili fino alla consegna, correzione finale e consegna automatica al termine. Il termine resta assoluto anche dopo refresh, sospensione o ritorno ai capitoli. La distribuzione è casuale, non certificata come algoritmo di estrazione ministeriale.

Durante un quiz, `V` o `1` risponde Vero; `F` o `2` risponde Falso. `Invio` o `Freccia destra` passa alla domanda seguente. In allenamento la risposta è obbligatoria prima di avanzare; nella scheda è possibile saltare una domanda. Le scorciatoie sono inattive mentre una finestra di dialogo o un campo di input ha il controllo. Il pulsante Successiva resta fisso in fondo allo schermo.

## Fonte e limiti

La banca dati proviene dal [listato A/B ufficiale datato 23 aprile 2025](https://www.ilportaledellautomobilista.it/documents/56611/57321/domande%2BAB%2Bitaliano%2B23%2B04%2B2025/95e60cf5-8e20-444a-87d3-7b51e979e851?version=1.0), acquisito il 28 settembre 2026. Il sito non si aggiorna automaticamente se il listato cambia in futuro.

- 7.106 domande con ID ministeriale unico, 25 categorie e 409 immagini distinte. Il listato contiene alcune formulazioni ripetute sotto ID diversi: sono conservate perché fanno parte delle 7.106 righe ufficiali; il conteggio dei progressi segue gli ID ufficiali.
- Testi, chiavi Vero/Falso e figure originali. I titoli lunghi dei capitoli hanno un'etichetta breve per l'interfaccia; `sourceTitle` conserva la prima riga del titolo del PDF.
- Il PDF ministeriale fornisce le domande e le risposte, non una motivazione per ciascuna. Spiegazioni, consigli di lettura e regole chiave provengono dal [dataset di Lamuo/quiz-patente](https://github.com/Lamuo/quiz-patente/blob/58d9d213a26fe1f734bc1663abf76fa24031a214/src/data/dataset.json). Sono contenuti didattici generati con AI, non commenti ufficiali. L'importazione richiede corrispondenza esatta di identificativo, testo e risposta per tutte le 7.106 domande: nessun abbinamento per somiglianza.
- `reference/extraction-audit.json` documenta l'estrazione e `reference/delta-audit.json` il passaggio dalla banca precedente: 7.020 quesiti invariati, 86 aggiunti, nessuno modificato o rimosso. Il confronto indipendente del testo verifica la corrispondenza esatta di ID, testo e risposta per ogni domanda. Le figure sono abbinate alla cella Immagine di ciascuna riga della tabella; i file immagine identici vengono conservati una sola volta.
- Il PDF originale non viene pubblicato nell'app ed è escluso dalla repository per dimensione. URL e SHA-256 sono in `bank.json`.

## Avvio locale

Servire `dist/` con un server HTTP e aprire l'indirizzo nel browser. Non aprire direttamente `index.html` come file locale, perché il browser deve caricare `bank.json`.

```text
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

## Verifica e rigenerazione

```text
node --check dist/app.js
node --check dist/explanations.js
node --check dist/core.js
node scripts/validate.mjs
node scripts/validate-lifecycle.mjs
python scripts/extract_bank.py
```

Per rigenerare occorrono `pypdf`, `pdfplumber`, Pillow e il PDF in `reference/listato-ufficiale.pdf`. Una nuova versione ministeriale richiede un nuovo confronto e verifica di categorie, numeri e figure: non sostituire la banca senza audit.

Per rigenerare solo i consigli, scaricare il `dataset.json` dalla revisione GitHub indicata sopra e passarlo a `node scripts/import-friend-explanations.mjs <percorso-del-dataset.json>`. Lo script verifica l'hash del file e la corrispondenza di tutte le domande prima di sostituire `dist/explanations.js`.

## Progressi e backup

Gli identificatori delle domande ministeriali sono stabili e usati per i progressi. La webapp salva la sessione corrente dopo ogni risposta. Un backup ripristinato sostituisce i progressi e annulla la sessione corrente solo dopo conferma esplicita. Non usare contemporaneamente più schede della webapp. La navigazione privata o la cancellazione dei dati del browser possono eliminare i progressi: esportare prima un backup.

Ogni risposta di allenamento, corretta o errata, viene salvata subito. Tornando ai capitoli si vedono il conteggio esatto dei quiz corretti e gli errori da ripassare; la percentuale mostra i decimali anche all'inizio di un capitolo lungo. Non serve completare la sessione o il capitolo per registrare i tentativi.
