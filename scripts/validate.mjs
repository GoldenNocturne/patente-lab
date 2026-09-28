import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), C=require('../dist/core.js');
const bank=JSON.parse(fs.readFileSync(new URL('../dist/bank.json',import.meta.url),'utf8'));
let checks=0;
function test(name, action) {action();checks++;console.log('PASS '+name);}
test('complete official bank, unique IDs and chapter totals',()=>{
  assert.equal(bank.questions.length,7020);assert.equal(bank.chapters.length,25);
  assert.equal(new Set(bank.questions.map(q=>q.id)).size,7020);
  assert.equal(bank.chapters.reduce((s,c)=>s+c.count,0),7020);
});
const ids=new Map(bank.questions.map(q=>[q.id,q]));
test('every image exists and automatic pseudo-explanations are absent',()=>{
  for(const q of bank.questions){
    assert.equal(typeof q.answer,'boolean');assert(q.text.trim());assert(bank.chapters.some(c=>c.id===q.chapterId));
    if(q.image)assert(fs.existsSync(new URL('../dist/'+q.image,import.meta.url)));
    assert.equal(Object.hasOwn(q,'explanation'),false);
  }
});
const explanationContext={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../dist/explanations.js',import.meta.url),'utf8'),explanationContext);
const verified=explanationContext.window.PatenteExplanations;
test('all 7020 questions have individual advice from the exact-match import',()=>{
  assert.equal(Object.keys(verified).length,bank.questions.length);
  for(const q of bank.questions){
    const note=verified[q.id];assert(note,`Missing advice for ${q.id}`);
    for(const field of ['text','focus','rule'])assert(typeof note[field]==='string'&&note[field].trim(),`Missing ${field} for ${q.id}`);
  }
  assert.match(verified['18545'].text,/due ruote.*tre ruote/);
  assert.match(verified['18545'].rule,/2 o 3 ruote/);
});
const q=bank.questions[0], another=bank.questions.find(x=>x.chapterId!==q.chapterId);
test('study includes only selected chapters and never-correct questions',()=>{
  const p={};assert(C.eligible([q,another],p,[q.chapterId],'learn').length===1);
  C.record(p,q,!q.answer,1);assert(C.eligible([q],p,[q.chapterId],'learn').length===1);
  C.record(p,q,q.answer,2);assert(C.eligible([q],p,[q.chapterId],'learn').length===0);
  C.record(p,q,!q.answer,3);assert(C.eligible([q],p,[q.chapterId],'learn').length===0);
});
test('error review removes a question only after a correct answer',()=>{
  const p={};assert.equal(C.eligible([q],p,[q.chapterId],'errors').length,0);
  C.record(p,q,!q.answer,1);assert.equal(C.eligible([q],p,[q.chapterId],'errors').length,1);
  C.record(p,q,!q.answer,2);assert.equal(C.eligible([q],p,[q.chapterId],'errors').length,1);
  C.record(p,q,q.answer,3);assert.equal(C.eligible([q],p,[q.chapterId],'errors').length,0);
  assert.equal(p[q.id].attempts,3);assert.equal(p[q.id].wrong,2);
});
test('chapter completion counts unique mastered questions',()=>{
  const p={};C.record(p,q,q.answer,1);C.record(p,q,q.answer,2);
  assert.deepEqual(C.chapterStats([q,another],p,q.chapterId),{total:1,mastered:1,errors:0});
});
test('exam has 30 unique questions and a 20-minute deadline',()=>{
  const sample=C.shuffle(bank.questions).slice(0,C.EXAM.questions);
  assert.equal(sample.length,30);assert.equal(new Set(sample.map(q=>q.id)).size,30);
  assert.equal(C.EXAM.milliseconds,1200000);assert.equal(C.EXAM.maxErrors,3);
});
const exam=bank.questions.slice(0,30);
test('zero or three errors pass; four errors fail',()=>{
  for(const n of [0,3,4]){const answers=Object.fromEntries(exam.map((q,i)=>[q.id,i<n?!q.answer:q.answer]));const r=C.examResult(exam,answers);assert.equal(r.errors,n);assert.equal(r.passed,n<=3);}
});
test('unanswered questions count as errors',()=>{
  const answers=Object.fromEntries(exam.slice(4).map(q=>[q.id,q.answer]));const r=C.examResult(exam,answers);
  assert.equal(r.errors,4);assert.equal(r.unanswered,4);assert.equal(r.passed,false);
});
test('exam answers can be changed before marking',()=>{
  const answers=Object.fromEntries(exam.map(q=>[q.id,q.answer]));answers[q.id]=!q.answer;answers[q.id]=q.answer;
  assert.equal(C.examResult(exam,answers).errors,0);
});
test('backup roundtrip preserves progress',()=>{
  const p={};C.record(p,q,q.answer,123);C.record(p,another,null,124);
  assert.deepEqual(C.validateBackup(JSON.parse(JSON.stringify({format:'patente-lab-progress',version:1,progress:p})),bank.questions),p);
});
test('invalid backup is rejected without modifying existing progress',()=>{
  const p={};C.record(p,q,q.answer,123);const copy=JSON.stringify(p);
  assert.throws(()=>C.validateBackup({format:'patente-lab-progress',version:1,progress:{unknown:p[q.id]}},bank.questions));
  assert.throws(()=>C.validateBackup({format:'patente-lab-progress',version:1,progress:{[q.id]:{...p[q.id],mastered:'true'}}},bank.questions));
  assert.equal(JSON.stringify(p),copy);
});
test('empty selections and completed chapters have empty study pools',()=>{
  assert.equal(C.eligible([q],{},[],'learn').length,0);
  assert.equal(C.eligible([q],{[q.id]:{mastered:true}},[q.chapterId],'learn').length,0);
});
test('shuffle preserves the source bank',()=>{
  const before=bank.questions.map(q=>q.id).join(',');C.shuffle(bank.questions);
  assert.equal(bank.questions.map(q=>q.id).join(','),before);
});
const audit=JSON.parse(fs.readFileSync(new URL('../reference/extraction-audit.json',import.meta.url),'utf8'));
assert.equal(audit.independentTextAudit,'PASS');
console.log(JSON.stringify({checks,questions:bank.questions.length,chapters:bank.chapters.length,images:bank.metadata.images,illustratedQuestions:audit.illustratedQuestions,officialTextAudit:audit.independentTextAudit}));
