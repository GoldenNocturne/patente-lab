import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=require('../dist/core.js');
const bank=JSON.parse(fs.readFileSync(new URL('../dist/bank.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const explanationsSource=fs.readFileSync(new URL('../dist/explanations.js',import.meta.url),'utf8');
let now=1000000;
class FakeDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function harness(saved={}) {
  const nodes=new Map(),storage=new Map(Object.entries(saved)),intervals=[],listeners={},preloads=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',querySelectorAll:()=>[],classList:{toggle(){}},close(){this.open=false;},showModal(){this.open=true;},click(){},prepend(){}});return nodes.get(id);};
  const tools={};
  const context=vm.createContext({PatenteCore:core,Date:FakeDate,console,Set,Map,URL,Blob,AbortController,
    document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(name,handler)=>{listeners[name]=handler;},visibilityState:'visible',createElement:tag=>{if(tag==='img'){const image={src:'',fetchPriority:'',decoding:''};preloads.push(image);return image;}return node('created');},modelContext:{registerTool(t){tools[t.name]=t;}}},
    window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    fetch:async()=>({ok:true,json:async()=>bank}),setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout:fn=>fn()});
  const run=code=>vm.runInContext(code,context);
  const key=(name,extra={})=>{let prevented=false;listeners.keydown({key:name,target:{closest:()=>null},preventDefault(){prevented=true;},...extra});return prevented;};
  return {context,storage,nodes,intervals,tools,preloads,run,key,init:()=>{run(explanationsSource);return run(source.replace('} catch(error) {app.innerHTML=', '} catch(error) {console.error(error);app.innerHTML='));}};
}
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
const h=harness();await h.init();
const imageHarness=harness();await imageHarness.init();
const illustrated=[...new Map(bank.questions.filter(q=>q.image).map(q=>[q.image,q])).values()].slice(0,4);
imageHarness.run(`session={mode:'learn',ids:${JSON.stringify(illustrated.map(q=>q.id))},index:0,answers:{},flags:[],startedAt:Date.now(),deadline:null};renderQuiz()`);
test('current figure gets high priority and nearby figures are preloaded once',()=>{
  assert(imageHarness.nodes.get('#app').innerHTML.includes('fetchpriority="high"'));
  assert.deepEqual(imageHarness.preloads.map(image=>image.src),illustrated.slice(1).map(q=>q.image));
  assert(imageHarness.preloads.every(image=>image.fetchPriority==='low'));
  imageHarness.run('renderQuiz()');assert.equal(imageHarness.preloads.length,3);
});
test('feedback uses the matching moped advice without unrelated statements',()=>{
  const q=bank.questions.find(q=>q.id==='18545');
  const html=h.run('feedback('+JSON.stringify(q)+',true)');
  assert(html.includes('ciclomotori con due ruote'));
  assert(html.includes('Ciclomotore = 2 o 3 ruote'));
  assert(html.includes('non ufficiale'));
  assert(html.includes('<details open>'));
  assert(!html.includes('tricicli a motore'));
  assert(!html.includes('non possono avere un motore termico'));
});
test('other questions show their own advice after the answer',()=>{
  const q=bank.questions.find(q=>q.id==='18315');
  const html=h.run('feedback('+JSON.stringify(q)+','+q.answer+')');
  assert(html.includes('Risposta corretta'));
  assert(html.includes('strada con due carreggiate separate'));
  assert(html.includes('Consiglio di lettura e regola chiave'));
});
test('initial screen loads all real chapters and three modes',()=>{const html=h.nodes.get('#app').innerHTML;assert(/7\.?020/.test(html));assert.equal((html.match(/data-chapter=/g)||[]).length,25);assert.equal((html.match(/data-mode=/g)||[]).length,3);});
h.run("mode='learn';selected=new Set(['8']);startSession('learn')");
const qid=h.run('session.ids[0]'),answer=bank.questions.find(q=>q.id===qid).answer;
h.run(`answerQuestion(${answer})`);
test('training answer is saved once, mastered and excluded',()=>{h.run(`answerQuestion(${answer})`);const p=JSON.parse(h.storage.get('patente-lab-progress-v1')).progress;assert(p[qid].mastered);assert.equal(p[qid].attempts,1);assert.equal(h.run(`pool().some(q=>q.id==='${qid}')`),false);});
test('saved training resumes at the same question after reload',()=>{const s=JSON.parse(h.storage.get('patente-lab-session-v1'));assert.equal(s.ids[0],qid);assert.equal(s.answers[qid],answer);});
const fresh=harness(Object.fromEntries(h.storage));await fresh.init();assert.equal(fresh.run('session.ids[0]'),qid);
fresh.run("mode='exam';startSession('exam')");
const deadline=fresh.run('session.deadline');
test('exam answers do not reveal the correction or mutate study progress before submission',()=>{const before=fresh.storage.get('patente-lab-progress-v1');fresh.run('answerQuestion(true)');assert.equal(fresh.storage.get('patente-lab-progress-v1'),before);assert(!fresh.nodes.get('#app').innerHTML.includes('Regola da ricordare'));});
test('leaving for chapters retains the original exam deadline',()=>{fresh.run('home()');assert.equal(fresh.run('session.deadline'),deadline);});
now+=550000;
const resumed=harness(Object.fromEntries(fresh.storage));await resumed.init();
test('reload resumes exam without resetting its timer',()=>{assert.equal(resumed.run('session.deadline'),deadline);});
now=deadline+1;
resumed.intervals[0]();
test('deadline automatically submits once, including while viewing chapters',()=>{assert.equal(resumed.run('session'),null);assert(resumed.nodes.get('#app').innerHTML.includes('Tempo scaduto'));assert.equal(resumed.run('lastResult.result.unanswered'),29);const before=resumed.storage.get('patente-lab-progress-v1');resumed.intervals[0]();assert.equal(resumed.storage.get('patente-lab-progress-v1'),before);});
test('unanswered exam items enter error review',()=>{const p=JSON.parse(resumed.storage.get('patente-lab-progress-v1')).progress;assert(Object.values(p).filter(p=>p.error).length>=29);});
test('WebMCP registration and valid configuration use visible state',()=>{assert.deepEqual(Object.keys(h.tools),['read_study_progress','configure_study']);const r=h.tools.configure_study.execute({mode:'errors',chapterIds:['8']});assert.equal(r.mode,'errors');assert.equal(h.run('mode'),'errors');assert(h.nodes.get('#app').innerHTML.includes('Ripasso errori'));assert.equal(h.tools.read_study_progress.execute({}).length,25);});
test('invalid WebMCP input leaves selection unchanged',()=>{const before=h.run('JSON.stringify([...selected])');assert.throws(()=>h.tools.configure_study.execute({mode:'errors',chapterIds:['unknown']}));assert.equal(h.run('JSON.stringify([...selected])'),before);});
const keyboard=harness();await keyboard.init();
keyboard.run("mode='learn';selected=new Set(['8']);startSession('learn')");
test('Enter cannot skip an unanswered training question',()=>{assert.equal(keyboard.key('Enter'),false);assert.equal(keyboard.run('session.index'),0);});
test('V and Enter answer then advance without reaching the button',()=>{assert.equal(keyboard.key('v'),true);assert.equal(keyboard.run('session.answers[session.ids[0]]'),true);assert.equal(keyboard.key('Enter'),true);assert.equal(keyboard.run('session.index'),1);});
test('F and ArrowRight also answer then advance',()=>{assert.equal(keyboard.key('f'),true);assert.equal(keyboard.run('session.answers[session.ids[1]]'),false);assert.equal(keyboard.key('ArrowRight'),true);assert.equal(keyboard.run('session.index'),2);});
test('shortcuts ignore dialog, interactive focus, modifiers and repeat',()=>{const before=keyboard.run('session.index');keyboard.nodes.get('#data-dialog').open=true;assert.equal(keyboard.key('1'),false);keyboard.nodes.get('#data-dialog').open=false;assert.equal(keyboard.key('1',{target:{closest:()=>({})}}),false);assert.equal(keyboard.key('1',{ctrlKey:true}),false);assert.equal(keyboard.key('1',{repeat:true}),false);assert.equal(keyboard.run('session.index'),before);assert.equal(keyboard.run('session.answers[session.ids[2]]'),undefined);});
test('exam Enter can move to the next unanswered item',()=>{keyboard.run("mode='exam';startSession('exam')");assert.equal(keyboard.key('Enter'),true);assert.equal(keyboard.run('session.index'),1);});
test('quiz surface shows the shortcut guide and an always-visible next control',()=>{const html=keyboard.nodes.get('#app').innerHTML;const css=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert(html.includes('V / 1 Vero'));assert(html.includes('aria-keyshortcuts="Enter ArrowRight"'));assert(css.includes('.quiz-controls{position:fixed'));});
const single=harness();await single.init();single.run("mode='learn';selected=new Set(['8']);startSession('learn')");
const first=single.run('session.ids[0]'),firstQuestion=bank.questions.find(q=>q.id===first),chapterCount=bank.chapters.find(c=>c.id===firstQuestion.chapterId).count;
single.run(`answerQuestion(${firstQuestion.answer})`);single.run('home()');
test('one correct answer is shown as saved before the chapter ends',()=>{const html=single.nodes.get('#app').innerHTML;assert(html.includes(`1 / ${chapterCount} corretti`));assert(html.includes('1 risposta registrata'));assert(html.includes('0,15%')||html.includes('0,16%')||html.includes('0,19%'));});
const again=harness(Object.fromEntries(single.storage));await again.init();
test('one correct answer remains after reload and is excluded from study',()=>{assert(again.nodes.get('#app').innerHTML.includes(`1 / ${chapterCount} corretti`));assert.equal(again.run(`pool().some(q=>q.id==='${first}')`),false);});
const mistaken=harness();await mistaken.init();mistaken.run("mode='learn';selected=new Set(['8']);startSession('learn')");
const wrongId=mistaken.run('session.ids[0]'),wrongQuestion=bank.questions.find(q=>q.id===wrongId);
mistaken.run(`answerQuestion(${!wrongQuestion.answer})`);mistaken.run('home()');
test('one incorrect answer is saved immediately as an attempt and error',()=>{const html=mistaken.nodes.get('#app').innerHTML;assert(html.includes('1 risposta registrata'));assert(html.includes('1 errore da ripassare'));});
const retry=harness(Object.fromEntries(mistaken.storage));await retry.init();retry.run("mode='errors';selected=new Set(['8'])");
test('the individual error remains in review after reload',()=>{assert.equal(retry.run(`pool().some(q=>q.id==='${wrongId}')`),true);});
console.log(JSON.stringify({lifecycleChecks:checks,method:'isolated JavaScript state tests; no browser rendering'}));
