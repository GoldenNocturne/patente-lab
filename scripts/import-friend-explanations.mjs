import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Lamuo/quiz-patente, pinned to the revision used for this import.
const SOURCE_COMMIT='58d9d213a26fe1f734bc1663abf76fa24031a214';
const SOURCE_BLOB='77fce0fa0eede17302045f2661a7032a43630038';
const input=process.argv[2];
if(!input) throw new Error('Usage: node scripts/import-friend-explanations.mjs <dataset.json>');
const bytes=fs.readFileSync(input);
const blob=crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
assert.equal(blob,SOURCE_BLOB,'The source dataset differs from the pinned GitHub revision');
const friend=JSON.parse(bytes.toString('utf8'));
const bank=JSON.parse(fs.readFileSync(new URL('../dist/bank.json',import.meta.url),'utf8'));
const corrections=JSON.parse(fs.readFileSync(new URL('../reference/explanation-corrections.json',import.meta.url),'utf8'));
assert.equal(friend.domande.length,7147);
assert.equal(bank.questions.length,7106);
const byId=new Map(friend.domande.map(q=>[String(q.numero),q]));
assert.equal(byId.size,friend.domande.length,'Duplicate IDs in the source dataset');

const notes={};
const sourceImageByLocal=new Map(),localImageBySource=new Map();
for(const q of bank.questions){
  const source=byId.get(q.id);
  assert(source,`Missing source question ${q.id}`);
  assert.equal(source.testo,q.text,`Question text differs for ${q.id}`);
  assert.equal(source.risposta,q.answer,`Correct answer differs for ${q.id}`);
  assert.equal(Boolean(source.immagine),Boolean(q.image),`Image presence differs for ${q.id}`);
  if(q.image){
    if(sourceImageByLocal.has(q.image))assert.equal(sourceImageByLocal.get(q.image),source.immagine,`Image group differs for ${q.id}`);
    if(localImageBySource.has(source.immagine))assert.equal(localImageBySource.get(source.immagine),q.image,`Image group differs for ${q.id}`);
    sourceImageByLocal.set(q.image,source.immagine);
    localImageBySource.set(source.immagine,q.image);
  }
  for(const field of ['spiegazione','focusLinguistico','regolaChiave'])
    assert(typeof source[field]==='string' && source[field].trim(),`Missing ${field} for ${q.id}`);
  notes[q.id]={text:source.spiegazione.trim(),focus:source.focusLinguistico.trim(),rule:source.regolaChiave.trim()};
}
const officialById=new Map(bank.questions.map(q=>[q.id,q]));
for(const [id,correction] of Object.entries(corrections)){
  const official=officialById.get(id);
  assert(official,'Correction refers to missing question '+id);
  assert.equal(official.text,correction.question,'Question changed for correction '+id);
  assert.equal(official.answer,correction.answer,'Answer changed for correction '+id);
  for(const field of ['text','focus','rule','sourceLabel','sourceUrl'])
    assert(typeof correction[field]==='string'&&correction[field].trim(),'Missing '+field+' in correction '+id);
  assert.equal(new URL(correction.sourceUrl).protocol,'https:');
  notes[id]=Object.fromEntries(['text','focus','rule','sourceLabel','sourceUrl'].map(field=>[field,correction[field]]));
}

const header=`// Explanation, language tip and key rule from Lamuo/quiz-patente, with reviewed corrections.\n// Source: https://github.com/Lamuo/quiz-patente/blob/${SOURCE_COMMIT}/src/data/dataset.json\n// Corrections: reference/explanation-corrections.json\n// Study advice is not ministerial text. Matched by exact ID, question text and answer.\n`;
fs.writeFileSync(new URL('../dist/explanations.js',import.meta.url),header+`window.PatenteExplanations=Object.freeze(${JSON.stringify(notes)});\n`);
console.log('Imported advice for '+Object.keys(notes).length+' exact-matching questions, including '+Object.keys(corrections).length+' reviewed corrections');
