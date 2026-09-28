# Patente Lab

Webapp statica per esercitarsi con i quiz della patente B. Si usa nel browser, senza account o server applicativo: i tentativi e i progressi restano sul dispositivo e si possono esportare e ripristinare.

## Cosa contiene

- 7.020 domande Vero/Falso organizzate in 25 capitoli, con 407 figure distinte.
- **Quiz per capitolo:** nessun limite di tempo; propone solo le domande mai risolte correttamente e mostra il completamento del capitolo.
- **Ripasso errori:** filtra per capitolo le domande il cui ultimo tentativo è errato.
- **Scheda d'esame:** 30 domande casuali, 20 minuti, non superata dal quarto errore; le risposte mancanti contano come errori.
- Spiegazione, consiglio di lettura e regola chiave sotto la risposta. Sono testi didattici non ufficiali, generati con AI dal progetto [quiz-patente](https://github.com/Lamuo/quiz-patente); l'importazione richiede ID, testo e risposta identici per ciascuna domanda.

Le risposte di allenamento vengono salvate una per volta: non serve finire il capitolo. Durante un quiz, `V`/`1` risponde Vero, `F`/`2` risponde Falso, `Invio` o `Freccia destra` passa alla domanda seguente. Le figure delle domande vicine vengono precaricate.

## Avvio locale

È sufficiente un server HTTP statico; non serve installare dipendenze JavaScript.

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Aprire `http://127.0.0.1:8765/`. L'apertura diretta di `dist/index.html` come file locale non funziona perché l'app deve caricare `bank.json`.

## Verifica

Con Node.js 22 o successivo:

```sh
node --check dist/app.js
node --check dist/explanations.js
node scripts/validate.mjs
node scripts/validate-lifecycle.mjs
```

I test verificano completezza e integrità della banca dati, presenza delle figure, corrispondenza delle spiegazioni, modalità di studio, scorciatoie e salvataggio dei progressi. La stessa verifica gira su GitHub Actions.

## Provenienza e aggiornamento dei dati

Domande, risposte e immagini sono state estratte dal [PDF A/B collegato dal Portale dell'Automobilista](https://ilportaledellautomobilista.it/web/portale-automobilista/-/quiz-per-le-patenti-am-b-superiori-e-cqc), acquisito il 27 settembre 2026. `reference/extraction-audit.json` registra il controllo indipendente di identificativi, testi e risposte. Il PDF originale non è incluso nel repository.

Le spiegazioni derivano dalla [revisione `58d9d21` di Lamuo/quiz-patente](https://github.com/Lamuo/quiz-patente/tree/58d9d213a26fe1f734bc1663abf76fa24031a214). Sono indicazioni di studio e non testo ministeriale. I quiz possono cambiare in futuro: il repository non si aggiorna automaticamente quando esce un nuovo listato.

Per rigenerare la banca occorrono il PDF ufficiale in `reference/listato-ufficiale.pdf` e le dipendenze Python `pypdf`, `pdfplumber`, Pillow. Eseguire `python scripts/extract_bank.py`, poi ripetere l'audit. Per reimportare i consigli, scaricare il `src/data/dataset.json` della revisione indicata sopra ed eseguire `node scripts/import-friend-explanations.mjs <percorso-del-dataset.json>`. Lo script verifica l'hash del file e la corrispondenza esatta di ogni domanda, inclusa la presenza e la corrispondenza dei gruppi di immagini.

## Struttura

- `dist/`: sito statico pronto da servire, banca dati, consigli e immagini.
- `scripts/`: estrazione, importazione e controlli.
- `reference/extraction-audit.json`: riepilogo dell'audit del listato.

Il codice originale dell'app è distribuito con licenza MIT. La licenza non si estende ai contenuti di terzi; dettagli in [THIRD_PARTY.md](THIRD_PARTY.md).
