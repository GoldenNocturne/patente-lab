/* Patente Lab — bank is read-only; only study progress lives in this browser. */
'use strict';
const C = PatenteCore, app = document.querySelector('#app');
const KEY = 'patente-lab-progress-v1', SESSION_KEY = 'patente-lab-session-v1', SETTINGS_KEY = 'patente-lab-settings-v1';
let bank, byId, chapterMap, progress = {}, selected = new Set(), mode = 'learn', session = null, timer = null;
let storageWarning = '', pendingImport = null, lastResult = null;
const preloadedImages=new Map();
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e = escapeHtml;
function studyText(value) {
  const text = String(value)
    .replace(/\bE['’](?!\p{L})/gu, 'È')
    .replace(/\bVELOCITA['’](?!\p{L})/gu, 'VELOCITÀ')
    .replace(/(^|[\s([{])'((?:[^'\n]|(?<=[\p{L}])'(?=[\p{L}])){1,200})'(?=$|[\s.,;:!?)}\]])/gu, '$1"$2"')
    .replace(/(^|[\s([{])‘([^’\n]{1,200})’(?=$|[\s.,;:!?)}\]])/gu, '$1"$2"');
  return e(text);
}
const labels = {learn:'Quiz per capitolo', errors:'Ripasso errori', exam:'Scheda d’esame'};
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { storageWarning = 'Il browser non riesce a leggere i dati salvati. Puoi esportare i progressi da questa sessione.'; return null; } };
function save(key, data) { try { localStorage.setItem(key, JSON.stringify(data)); } catch { storageWarning = 'Il browser non riesce a salvare i progressi. Esportali prima di chiudere la pagina.'; } }
function saveProgress() { save(KEY, {format:'patente-lab-progress',version:1,progress}); }
function saveSession() { save(SESSION_KEY, session); }
function saveSettings() { save(SETTINGS_KEY, {mode,selected:[...selected]}); }
function percentage(s) { return s.total ? Math.round(10000*s.mastered/s.total)/100 : 0; }
function percentLabel(s) { return `${new Intl.NumberFormat('it',{maximumFractionDigits:2}).format(percentage(s))}%`; }
function bar(value) { return `<div class="bar" role="progressbar" aria-label="Completamento" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100"><span style="width:${value}%;${value>0?'min-width:2px;':''}"></span></div>`; }
function pool() { return C.eligible(bank.questions, progress, [...selected], mode); }
function stats() { return {total:bank.questions.length,mastered:bank.questions.filter(q=>progress[q.id]?.mastered).length,attempts:Object.values(progress).reduce((n,p)=>n+p.attempts,0)}; }
function stopTimer() { if (timer) clearInterval(timer); timer = null; }
function home() {
  stopTimer(); lastResult=null;
  const total = stats();
  app.innerHTML = `<section class="intro"><div><h1>Preparati alla patente B.</h1><p>Scegli come allenarti. I tuoi progressi restano qui.</p></div><div class="overall"><div><span>Preparazione completata</span><strong>${percentLabel(total)}</strong></div>${bar(percentage(total))}<small>${total.mastered.toLocaleString('it')} / ${total.total.toLocaleString('it')} quiz corretti · ${total.attempts.toLocaleString('it')} ${total.attempts===1?'risposta registrata':'risposte registrate'}</small></div></section>
    ${storageWarning?`<p class="notice">${e(storageWarning)}</p>`:''}
    ${session?`<div class="resume"><span>${session.mode==='exam'?'Hai una scheda in corso. Il tempo continua a scorrere.':'Hai un allenamento in corso.'}</span><div class="resume-actions"><button class="quiet" id="discard-session">Lascia</button><button class="secondary" id="resume-session">Riprendi</button></div></div>`:''}
    <nav class="modes" aria-label="Modalità di studio">${[['learn','▤','Quiz per capitolo','Solo quelli ancora da risolvere.'],['errors','↺','Ripasso errori','Riprova i quiz che hai sbagliato.'],['exam','◷','Scheda d’esame','30 domande · 20 minuti.']].map(([id,symbol,title,desc])=>`<button class="mode ${mode===id?'selected':''}" data-mode="${id}" aria-pressed="${mode===id}"><span class="mode-symbol" aria-hidden="true">${symbol}</span><span><strong>${title}</strong><small>${desc}</small></span></button>`).join('')}</nav>
    <div class="workspace"><section class="panel">${mode==='exam'?examSetup():chapterPicker()}</section><aside class="session-panel" id="session-panel"></aside></div>
    <p class="source-note">${bank.metadata.questions.toLocaleString('it')} quiz ministeriali · <a href="${e(bank.metadata.sourcePage)}" target="_blank" rel="noopener">Fonte e listato ufficiale</a> · Progressi salvati su questo browser.</p>`;
  app.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;saveSettings();home();});
  app.querySelectorAll('[data-chapter]').forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.chapter):selected.delete(input.dataset.chapter);saveSettings();updateSessionPanel();});
  if(mode!=='exam') {
    document.querySelector('#select-all').onclick=()=>{bank.chapters.forEach(c=>selected.add(c.id));saveSettings();home();};
    document.querySelector('#select-none').onclick=()=>{selected.clear();saveSettings();home();};
  }
  if(session) {
    document.querySelector('#resume-session').onclick=()=>{renderQuiz();};
    document.querySelector('#discard-session').onclick=()=>confirmDialog('Lasciare la sessione?',session.mode==='exam'?'La scheda verrà annullata. Le risposte non verranno corrette.':'Le risposte già corrette e i progressi resteranno salvati.',()=>{session=null;saveSession();home();});
  }
  updateSessionPanel();
}
function chapterPicker() {
  return `<div class="panel-top"><h2>Scegli i capitoli</h2><div class="selection-actions"><button class="quiet" id="select-all">Tutti</button><button class="quiet" id="select-none">Nessuno</button></div></div><div class="chapters">${bank.chapters.map(ch=>{
    const s=C.chapterStats(bank.questions,progress,ch.id), pct=percentage(s);
    return `<label class="chapter"><input type="checkbox" data-chapter="${ch.id}" ${selected.has(ch.id)?'checked':''}><div class="chapter-body"><div class="chapter-name">${e(ch.title)}</div><div class="chapter-sub">${s.mastered} / ${s.total} corretti${s.errors?` · ${s.errors} ${s.errors===1?'errore da ripassare':'errori da ripassare'}`:''}</div></div><div class="chapter-progress"><span>${percentLabel(s)}</span>${bar(pct)}</div></label>`;
  }).join('')}</div>`;
}
function examSetup() {
  return `<div class="exam-setup"><span class="eyebrow">Come all’esame</span><h2 style="margin-top:12px">Mettiti alla prova.</h2><p>Domande estratte casualmente dall’intera banca dati, anche dai capitoli già completati.</p><div class="exam-facts"><div><strong>30</strong><span>domande Vero / Falso</span></div><div><strong>20</strong><span>minuti a disposizione</span></div><div><strong>3</strong><span>errori consentiti</span></div></div><p>Puoi cambiare le risposte e tornare sulle domande. La correzione arriva alla consegna. Dal quarto errore la scheda è non superata; le risposte mancanti contano come errori.</p></div>`;
}
function updateSessionPanel() {
  const n=mode==='exam'?30:pool().length;
  const errors=mode==='errors';
  const message=mode==='exam'?'Una scheda completa. Il tempo parte quando inizi.':errors?'Gli errori escono dal ripasso quando rispondi correttamente.':'Ogni risposta corretta completa un quiz del capitolo.';
  document.querySelector('#session-panel').innerHTML=`<span class="eyebrow">${mode==='exam'?'Simulazione':'Il tuo allenamento'}</span><div class="big-number">${n.toLocaleString('it')}</div><p>${mode==='exam'?'domande casuali':errors?'errori da ripassare':'quiz ancora da risolvere'}</p><div class="session-details"><div><span>Tempo</span><strong>${mode==='exam'?'20 minuti':'Senza limite'}</strong></div><div><span>${mode==='exam'?'Bocciatura':'Capitoli'}</span><strong>${mode==='exam'?'4 errori':selected.size+' selezionati'}</strong></div></div><button id="start-session" class="primary" ${n===0?'disabled':''}>${mode==='exam'?'Inizia la scheda':'Inizia i quiz'} <span aria-hidden="true">→</span></button><p style="margin:13px 0 0;font-size:13px">${message}</p>${!n?`<p>${selected.size?(errors?'Non hai errori da ripassare in questi capitoli.':'Hai già risolto correttamente tutti i quiz selezionati.'):'Seleziona almeno un capitolo.'}</p>`:''}`;
  document.querySelector('#start-session').onclick=()=>{
    const launch=()=>startSession(mode);
    session?confirmDialog('Iniziare una nuova sessione?','La sessione in corso verrà sostituita. I progressi già registrati resteranno salvati.',launch):launch();
  };
}
function startSession(newMode) {
  const ids=C.shuffle(newMode==='exam'?bank.questions:pool()).slice(0,newMode==='exam'?C.EXAM.questions:undefined).map(q=>q.id);
  if(!ids.length) return;
  session={mode:newMode,ids,index:0,answers:{},flags:[],startedAt:Date.now(),deadline:newMode==='exam'?Date.now()+C.EXAM.milliseconds:null,chapters:[...selected]};
  saveSession(); renderQuiz(); window.scrollTo({top:0,behavior:'instant'});
}
function preloadNearbyImages() {
  if(!session) return;
  const first=Math.max(0,session.index-2),last=Math.min(session.ids.length,session.index+9);
  for(let i=first;i<last;i++) {
    if(i===session.index) continue;
    const path=byId.get(session.ids[i])?.image;
    if(!path || preloadedImages.has(path)) continue;
    const image=document.createElement('img');
    image.fetchPriority='low'; image.decoding='async'; image.src=path;
    preloadedImages.set(path,image);
  }
}
function renderQuiz() {
  stopTimer();
  if(!session) return home();
  if(session.mode==='exam' && Date.now()>=session.deadline) return finishExam(true);
  const q=byId.get(session.ids[session.index]), ch=chapterMap.get(q.chapterId);
  const isExam=session.mode==='exam', answered=typeof session.answers[q.id]==='boolean';
  const count=Object.keys(session.answers).length;
  const chapterProgress=C.chapterStats(bank.questions,progress,q.chapterId), pct=percentage(chapterProgress);
  app.innerHTML=`<div class="quiz-shell"><div class="quiz-top"><button class="quiet" id="back-home">← Capitoli</button><h1>${e(labels[session.mode])}</h1>${isExam?'<span id="timer" class="timer" aria-label="Tempo rimanente"></span>':''}</div><div class="quiz-meta"><span>${e(ch.title)}</span><span>${isExam?`${count} / 30 risposte`:`Quiz ${session.index+1} / ${session.ids.length} · ${chapterProgress.mastered}/${chapterProgress.total} corretti (${percentLabel(chapterProgress)})`}</span></div>${bar(isExam?Math.round(count/30*100):pct)}${storageWarning?`<p class="notice" role="status">${e(storageWarning)}</p>`:''}<section class="question-card"><div class="question-label">Domanda ministeriale ${q.id}</div><div class="question-content"><h2>${studyText(q.text)}</h2>${q.image?`<img class="question-image" src="${e(q.image)}" fetchpriority="high" alt="Figura ministeriale associata alla domanda ${q.id}">`:''}</div><div class="answers">${[true,false].map(a=>`<button class="answer ${answered&&session.answers[q.id]===a?'chosen':''} ${!isExam&&answered?(q.answer===a?'correct':session.answers[q.id]===a?'wrong':''):''}" data-answer="${a}" ${answered&&!isExam?'disabled':''} aria-pressed="${answered&&session.answers[q.id]===a}" aria-keyshortcuts="${a?'V 1':'F 2'}">${a?'Vero':'Falso'}</button>`).join('')}</div>${!isExam&&answered?feedback(q,session.answers[q.id]):''}</section>${isExam?`<details class="exam-navigation"><summary>Vai a una domanda della scheda</summary><nav class="numbers" aria-label="Domande della scheda">${session.ids.map((id,i)=>`<button class="number ${i===session.index?'current':''} ${typeof session.answers[id]==='boolean'?'answered':''} ${session.flags.includes(id)?'flagged':''}" data-index="${i}" aria-label="Domanda ${i+1}${typeof session.answers[id]==='boolean'?', risposta inserita':''}" ${i===session.index?'aria-current="step"':''}>${i+1}</button>`).join('')}</nav><div class="exam-actions"><button class="secondary" id="finish-exam">Consegna scheda</button></div></details>`:''}<div class="quiz-controls"><div class="quiz-controls-inner"><button class="secondary" id="previous" ${session.index===0?'disabled':''}>← Precedente</button>${isExam?`<button class="quiet" id="flag-question">${session.flags.includes(q.id)?'★ Da rivedere':'☆ Segna da rivedere'}</button>`:''}<span class="shortcut-help">V / 1 Vero · F / 2 Falso · Invio avanti</span><button class="primary" id="next" aria-keyshortcuts="Enter ArrowRight" ${!isExam&&!answered?'disabled':''}>${session.index===session.ids.length-1?(isExam?'Consegna scheda':'Termina allenamento'):'Successiva'} <span aria-hidden="true">→</span></button></div></div></div>`;
  document.querySelector('#back-home').onclick=home;
  app.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>answerQuestion(b.dataset.answer==='true'));
  document.querySelector('#previous').onclick=()=>{session.index--;saveSession();renderQuiz();};
  document.querySelector('#next').onclick=nextQuestion;
  if(isExam) {
    app.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>{session.index=Number(b.dataset.index);saveSession();renderQuiz();});
    document.querySelector('#flag-question').onclick=()=>{session.flags=session.flags.includes(q.id)?session.flags.filter(id=>id!==q.id):[...session.flags,q.id];saveSession();renderQuiz();};
    document.querySelector('#finish-exam').onclick=askFinishExam;
    updateTimer(); timer=setInterval(updateTimer,250);
  }
  preloadNearbyImages();
}
function nextQuestion() {
  if(!session || otherTabChanged) return;
  const q=byId.get(session.ids[session.index]);
  if(session.mode!=='exam' && typeof session.answers[q.id]!=='boolean') return;
  if(session.mode==='exam' && Date.now()>=session.deadline) return finishExam(true);
  if(session.index===session.ids.length-1) return session.mode==='exam'?askFinishExam():finishTraining();
  session.index++;saveSession();renderQuiz();
}
function quizShortcut(event) {
  if(!session || otherTabChanged || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || document.querySelector('#data-dialog').open) return;
  if(event.target?.closest?.('input,textarea,select,button,a,summary,[contenteditable="true"],dialog') || event.target?.isContentEditable) return;
  const key=event.key.toLowerCase();
  if(key==='v' || key==='1' || key==='f' || key==='2') {
    event.preventDefault();answerQuestion(key==='v' || key==='1');
  } else if(key==='enter' || key==='arrowright') {
    const q=byId.get(session.ids[session.index]);
    if(session.mode!=='exam' && typeof session.answers[q.id]!=='boolean') return;
    event.preventDefault();nextQuestion();
  }
}
document.addEventListener('keydown',quizShortcut);
function explanation(q) {
  const note=window.PatenteExplanations?.[q.id];
  if(!note) return '';
  return `<div class="explanation"><p><strong>Spiegazione</strong> <small>non ufficiale</small></p><p>${studyText(note.text)}</p><details open><summary>Consiglio di lettura e regola chiave</summary><p>${studyText(note.focus)}</p><p><strong>Da ricordare:</strong> ${studyText(note.rule)}</p></details><small><a href="https://github.com/Lamuo/quiz-patente/blob/58d9d213a26fe1f734bc1663abf76fa24031a214/src/data/dataset.json" target="_blank" rel="noopener">Fonte: quiz-patente</a></small></div>`;
}
function feedback(q, answer) {
  const correct=answer===q.answer;
  return `<div class="feedback ${correct?'':'wrong'}" role="status"><h3>${correct?'✓ Risposta corretta':'Risposta errata'} · ${q.answer?'Vero':'Falso'}</h3>${explanation(q)}</div>`;
}
function answerQuestion(answer) {
  if(!session || session.mode==='exam'&&Date.now()>=session.deadline) return session?finishExam(true):undefined;
  const q=byId.get(session.ids[session.index]);
  if(session.mode!=='exam'&&typeof session.answers[q.id]==='boolean') return;
  session.answers[q.id]=answer;
  if(session.mode!=='exam') {C.record(progress,q,answer);saveProgress();}
  saveSession();renderQuiz();
}
function updateTimer() {
  if(!session || session.mode!=='exam') return;
  const left=Math.max(0,session.deadline-Date.now());
  if(!left) return finishExam(true);
  const node=document.querySelector('#timer');
  if(node) {const sec=Math.ceil(left/1000);node.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;node.classList.toggle('urgent',sec<=120);}
}
function askFinishExam() {
  const missing=30-Object.keys(session.answers).length;
  confirmDialog('Consegnare la scheda?',missing?`Mancano ${missing} risposte: verranno conteggiate come errori.`:'Dopo la consegna vedrai il risultato e le risposte corrette.',()=>finishExam(false));
}
function finishExam(expired) {
  if(!session || session.mode!=='exam') return;
  stopTimer();
  const completed=session;
  const questions=completed.ids.map(id=>byId.get(id)), result=C.examResult(questions,completed.answers);
  questions.forEach(q=>C.record(progress,q,typeof completed.answers[q.id]==='boolean'?completed.answers[q.id]:null));
  saveProgress();session=null;saveSession();
  document.querySelector('#data-dialog').close();
  lastResult={completed,questions,result,expired};renderResult();
}
function finishTraining() {
  const completed=session, questions=completed.ids.filter(id=>typeof completed.answers[id]==='boolean').map(id=>byId.get(id));
  const result=C.examResult(questions,completed.answers);
  session=null;saveSession();lastResult={completed,questions,result,expired:false};renderResult();
}
function renderResult() {
  const {completed,questions,result,expired}=lastResult, isExam=completed.mode==='exam';
  app.innerHTML=`<div class="quiz-shell"><div class="result-top"><span class="result-badge ${isExam&&!result.passed?'fail':''}">${isExam?(result.passed?'Scheda superata':'Scheda non superata'):'Allenamento completato'}</span><h1>${isExam?(result.passed?'Un passo più vicino.':'Riparti dai tuoi errori.'):'Hai fatto progressi.'}</h1><p>${expired?'Tempo scaduto. La scheda è stata consegnata automaticamente.':isExam?'Massimo 3 errori per superare la scheda.':'Le risposte corrette sono state salvate nei tuoi capitoli.'}</p><div class="result-stats"><div><strong>${result.correct}</strong><span>corrette</span></div><div><strong>${result.errors}</strong><span>errori${result.unanswered?' / non risposte':''}</span></div><div><strong>${Math.floor((Math.min(Date.now(),completed.deadline||Date.now())-completed.startedAt)/60000)}′</strong><span>tempo impiegato</span></div></div><div class="result-buttons"><button class="secondary" id="result-home">Torna ai capitoli</button>${result.errors?'<button class="primary" id="result-errors">Ripassa questi errori →</button>':''}</div></div><div class="review"><h2 style="margin-bottom:18px">${isExam?'Correzione della scheda':'Rivedi le risposte'}</h2>${questions.map((q,i)=>{
    const a=completed.answers[q.id],correct=a===q.answer;
    return `<details><summary class="${correct?'correct-summary':''}"><span>${correct?'✓':'✕'} ${i+1}</span>${studyText(q.text)}</summary><div class="review-content">${q.image?`<img src="${e(q.image)}" loading="lazy" decoding="async" alt="Figura della domanda ${q.id}">`:''}<p>La tua risposta: <strong>${typeof a==='boolean'?(a?'Vero':'Falso'):'Non risposta'}</strong> · Risposta corretta: <strong>${q.answer?'Vero':'Falso'}</strong></p>${explanation(q)}</div></details>`;
  }).join('')}</div></div>`;
  document.querySelector('#result-home').onclick=home;
  if(result.errors) document.querySelector('#result-errors').onclick=()=>{mode='errors';selected=new Set(questions.filter(q=>result.wrongIds.includes(q.id)).map(q=>q.chapterId));saveSettings();home();};
  window.scrollTo({top:0,behavior:'instant'});
}
function confirmDialog(title,message,action) {
  const dialog=document.querySelector('#data-dialog');
  document.querySelector('#data-content').innerHTML=`<h3>${e(title)}</h3><p>${e(message)}</p><div class="confirm-actions"><button class="secondary" id="cancel-confirm">Annulla</button><button class="primary" id="accept-confirm">Conferma</button></div>`;
  document.querySelector('#cancel-confirm').onclick=()=>dialog.close();
  document.querySelector('#accept-confirm').onclick=()=>{dialog.close();action();};
  dialog.showModal();
}
function dataDialog() {
  if(!bank) return;
  const dialog=document.querySelector('#data-dialog');
  document.querySelector('#data-content').innerHTML=`<p>I progressi sono salvati su questo browser e dispositivo. Non vengono sincronizzati: esporta un backup prima di cambiare browser o cancellarne i dati.</p>${storageWarning?`<p class="notice">${e(storageWarning)}</p>`:''}<div class="data-actions"><button class="primary" id="export-progress">Esporta progressi</button><button class="secondary" id="import-progress">Ripristina backup</button><input id="backup-file" type="file" accept=".json,application/json" hidden></div><div id="import-notice" role="status"></div><h3>La banca dati</h3><p>${bank.metadata.questions.toLocaleString('it')} domande · ${bank.chapters.length} capitoli · ${bank.metadata.images} figure distinte. Testi, risposte e immagini estratti dal PDF A/B collegato dal Portale dell’Automobilista, acquisito il 28 settembre 2026. Il listato è datato 23 aprile 2025.</p><p><a href="${e(bank.metadata.sourceUrl)}" target="_blank" rel="noopener">Apri il listato ufficiale</a> · <a href="https://www.ilportaledellautomobilista.it/web/portale-automobilista/dettaglio-comunicazioni/-/asset_publisher/KpkdgCToF6Aa/content/foglio-rosa-e-prove-d%E2%80%99esame" target="_blank" rel="noopener">Regole dell’esame</a></p><h3>Le spiegazioni</h3><p>Spiegazioni, consigli di lettura e regole chiave provengono da <a href="https://github.com/Lamuo/quiz-patente" target="_blank" rel="noopener">quiz-patente</a>. Ciascuna è associata solo quando identificativo, testo e risposta coincidono esattamente con la nostra domanda. Sono contenuti didattici generati con AI, non commenti ufficiali del Ministero.</p>`;
  document.querySelector('#export-progress').onclick=()=>{
    const b=new Blob([JSON.stringify({format:'patente-lab-progress',version:1,exportedAt:new Date().toISOString(),bankSha256:bank.metadata.sha256,progress},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(b),link=document.createElement('a');link.href=url;link.download=`patente-lab-progressi-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  document.querySelector('#import-progress').onclick=()=>document.querySelector('#backup-file').click();
  document.querySelector('#backup-file').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    const target=document.querySelector('#import-notice');
    try {
      if(file.size>5*1024*1024)throw new Error('Questo file è troppo grande per essere un backup dei progressi.');
      pendingImport=C.validateBackup(JSON.parse(await file.text()),bank.questions);
      target.innerHTML='<p class="notice">Il ripristino sostituirà i progressi attuali e annullerà la sessione in corso.</p><button class="primary" id="confirm-import">Conferma ripristino</button>';
      document.querySelector('#confirm-import').onclick=()=>{progress=pendingImport;pendingImport=null;session=null;saveProgress();saveSession();dialog.close();home();};
    } catch(error) {target.innerHTML=`<p class="inline-error">${e(error.message)}</p>`;}
  };
  dialog.showModal();
}
document.querySelector('#data-button').onclick=dataDialog;
document.querySelector('#close-dialog').onclick=()=>document.querySelector('#data-dialog').close();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session?.mode==='exam'){if(Date.now()>=session.deadline)finishExam(true);else if(document.querySelector('#timer'))updateTimer();}});
let otherTabChanged=false;
window.addEventListener('storage',event=>{if(event.key===KEY||event.key===SESSION_KEY){otherTabChanged=true;stopTimer();storageWarning='I progressi sono cambiati in un’altra scheda. Usa una sola scheda per allenarti e ricarica questa pagina prima di rispondere.';document.querySelectorAll('[data-answer],#start-session,#resume-session,#finish-exam,#next,#data-button').forEach(b=>b.disabled=true);const notice=document.createElement('p');notice.className='notice';notice.textContent=storageWarning;app.prepend(notice);}});
setInterval(()=>{if(!otherTabChanged&&session?.mode==='exam'&&Date.now()>=session.deadline)finishExam(true);},1000);
async function init() {
  try {
    const response=await fetch('bank.json');if(!response.ok)throw new Error('Caricamento non riuscito');
    bank=await response.json();byId=new Map(bank.questions.map(q=>[q.id,q]));chapterMap=new Map(bank.chapters.map(c=>[c.id,c]));
    const saved=read(KEY);if(saved)try{progress=C.validateBackup(saved,bank.questions);}catch(error){storageWarning='I progressi salvati non sono leggibili. Conserva un backup prima di ripristinarli.';}
    const settings=read(SETTINGS_KEY);mode=['learn','errors','exam'].includes(settings?.mode)?settings.mode:'learn';
    selected=new Set(Array.isArray(settings?.selected)?settings.selected.filter(id=>chapterMap.has(id)):bank.chapters.filter(c=>c.title==='Segnali di pericolo').map(c=>c.id));
    const savedSession=read(SESSION_KEY);
    if(savedSession&&['learn','errors','exam'].includes(savedSession.mode)&&Array.isArray(savedSession.ids)&&savedSession.ids.length&&savedSession.ids.every(id=>byId.has(id))&&new Set(savedSession.ids).size===savedSession.ids.length&&Number.isInteger(savedSession.index)&&savedSession.index>=0&&savedSession.index<savedSession.ids.length&&savedSession.answers&&typeof savedSession.answers==='object'&&Object.entries(savedSession.answers).every(([id,a])=>savedSession.ids.includes(id)&&typeof a==='boolean')&&Number.isFinite(savedSession.startedAt)&&(savedSession.mode!=='exam'||savedSession.ids.length===30&&Number.isFinite(savedSession.deadline))&&Array.isArray(savedSession.flags))session=savedSession;
    if(session?.mode==='exam'&&Date.now()>=session.deadline)finishExam(true);else home();
    registerTools();
  } catch(error) {app.innerHTML='<div class="empty"><h2>Non riesco a caricare i quiz.</h2><p>Controlla la connessione e riprova.</p><button class="primary" id="retry">Riprova</button></div>';document.querySelector('#retry').onclick=init;}
}
function registerTools() {
  if(!document.modelContext?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  try {Promise.resolve(document.modelContext.registerTool({name:'read_study_progress',description:'Legge i progressi e gli errori attivi per ogni capitolo della patente B.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||Object.keys(input).length)throw new Error('Nessun parametro previsto');return bank.chapters.map(c=>({id:c.id,title:c.title,...C.chapterStats(bank.questions,progress,c.id)}));}},{signal:lifecycle.signal})).catch(()=>{});
    Promise.resolve(document.modelContext.registerTool({name:'configure_study',description:'Seleziona una modalità e i capitoli nella schermata iniziale senza avviare né consegnare un quiz.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['learn','errors','exam']},chapterIds:{type:'array',items:{type:'string'}}},required:['mode','chapterIds'],additionalProperties:false},execute:input=>{if(!input||!['learn','errors','exam'].includes(input.mode)||!Array.isArray(input.chapterIds)||input.chapterIds.some(id=>!chapterMap.has(id))||Object.keys(input).some(k=>!['mode','chapterIds'].includes(k)))throw new Error('Modalità o capitoli non validi');mode=input.mode;selected=new Set(input.chapterIds);saveSettings();home();return {mode,selected:[...selected],available:mode==='exam'?30:pool().length};}},{signal:lifecycle.signal})).catch(()=>{});
  }catch{}
}
init();
