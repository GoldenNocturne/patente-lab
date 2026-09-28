import re, json, hashlib, sys
from pathlib import Path
import pdfplumber
from pypdf import PdfReader

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'reference/listato-ufficiale.pdf'
OUT = ROOT / 'dist'
(OUT / 'images').mkdir(exist_ok=True)
for stale in (OUT / 'images').iterdir():
    if stale.is_file():
        stale.unlink()
reader = PdfReader(SOURCE)
bank, groups, images, chapters = [], {}, {}, {}
stable_chapters = json.loads((ROOT / 'reference/chapter-ids.json').read_text(encoding='utf-8'))
current = None
clean = lambda s: re.sub(r'\s+', ' ', s or '').strip()
heading_re = re.compile(r'Quesito n.\s*(\d+)\s*-\s*([^\n]+)')
with pdfplumber.open(SOURCE) as doc:
    for pi, page in enumerate(doc.pages):
        text = reader.pages[pi].extract_text()
        source_headings = list(heading_re.finditer(text))
        layout_headings = []
        for line in page.extract_text_lines():
            match = heading_re.search(line['text'])
            if match:
                layout_headings.append((line['top'], match.group(1)))
        assert [match.group(1) for match in source_headings] == [group for _, group in layout_headings], pi+1
        titles = {match.group(1): clean(match.group(2)) for match in source_headings}
        events = [(top, 0, 'heading', group) for top, group in layout_headings]
        events += [(table.bbox[1], 1, 'table', table) for table in page.find_tables()]
        for _, _, kind, value in sorted(events, key=lambda event:event[:2]):
            if kind == 'heading':
                current = (value, titles[value])
                assert current[1] in stable_chapters, (pi+1, current)
                groups.setdefault(current[0], {'chapter':current[1], 'questions':[]})
                continue
            table = value
            rows = table.extract()
            for ri, values in enumerate(rows):
                if not values or len(values) < 3:
                    continue
                if 'Numero' in (values[0] or ''):
                    continue
                qid, question, answer = clean(values[0]), clean(values[1]), clean(values[2])
                if not qid.isdigit():
                    continue
                assert current and question and answer in ('VERO','FALSO'), (pi,values,current)
                cell = table.rows[ri].cells[-1]
                matching = []
                if cell:
                    x0,y0,x1,y1 = cell
                    matching = [im for im in page.images if im['x0'] >= x0-1 and im['x1'] <= x1+1 and im['top'] >= y0-1 and im['bottom'] <= y1+1]
                assert len(matching) <= 1, (pi,qid,matching)
                image = None
                if matching:
                    im = reader.pages[pi].images['/'+matching[0]['name']]
                    digest = hashlib.sha256(im.data).hexdigest()[:20]
                    ext = Path(im.name).suffix
                    image = f'images/{digest}{ext}'
                    if image not in images:
                        (OUT/image).write_bytes(im.data)
                        images[image] = True
                ch = current[1]
                chapters[ch] = stable_chapters[ch]
                q = {'id':qid, 'text':question, 'answer':answer=='VERO', 'chapterId':str(chapters[ch]), 'groupId':current[0], 'image':image, 'page':pi+1}
                bank.append(q)
                groups[current[0]]['questions'].append(q)
        if pi % 40 == 0:
            print(f'{pi+1}/{len(doc.pages)} pagine; {len(bank)} domande',flush=True)
        page.close()

assert len({q['id'] for q in bank}) == len(bank), 'ID duplicati'
assert set(chapters) == set(stable_chapters), 'Categorie non corrispondenti al listato'
# Independent text-layer audit: every official number, answer and statement.
reference=[]
for p in reader.pages:
    txt=p.extract_text()
    txt=re.sub(r'Quesito n.[^\n]*\n|Ministero delle Infrastrutture e dei Trasporti|Numero\s*domanda\s*Testo domanda Risposta Corretta Immagine',' ',txt)
    reference.extend((m[1],clean(m[2]),m[3]=='VERO') for m in re.finditer(r'(?m)^\s*(\d{4,6})\s+(.*?)\s+(VERO|FALSO)\b',txt,re.S))
assert len(reference)==len(bank), (len(reference),len(bank))
assert {(i,t,a) for i,t,a in reference} == {(q['id'],q['text'],q['answer']) for q in bank}, 'Testi o risposte divergenti'
order=['Definizioni generali e doveri nell\'uso della strada','Segnali di pericolo','Segnali di divieto','Segnali di obbligo','Segnali di precedenza','Segnali di indicazione','Pannelli integrativi dei segnali','Segnali complementari; segnali temporanei e di cantiere']
chapter_list=[{'id':str(i),'title':title,'count':sum(q['chapterId']==str(i) for q in bank)} for title,i in chapters.items()]
short_titles={'11':'Definizioni, veicoli e doveri del conducente','12':'Circolazione, posizione e manovre','13':'Veicolo fermo, autostrade e strade extraurbane','14':'Luci, clacson, spie e simboli','15':'Velocità e passaggi a livello','19':'Cinture, bambini, casco e dispositivi di sicurezza','20':'Patenti, documenti e sanzioni','21':'Prevenzione e comportamento in caso di incidente','22':'Condizioni del conducente e primo soccorso','23':'Responsabilità e assicurazione','24':'Consumi, ambiente e inquinamento','25':'Meccanica, manutenzione e tenuta di strada','5':'Precedenza agli incroci','6':'Semafori e agenti del traffico','7':'Segnaletica orizzontale','4':'Segnali complementari, temporanei e di cantiere'}
chapter_order=['11','8','9','10','2','1','3','4','7','6','15','16','12','5','17','18','13','14','19','20','21','22','23','24','25']
for c in chapter_list:
    c['sourceTitle']=c['title']
    c['title']=short_titles.get(c['id'],c['title'])
chapter_list.sort(key=lambda c:chapter_order.index(c['id']))
data={'metadata':{'sourceUrl':'https://www.ilportaledellautomobilista.it/documents/56611/57321/domande%2BAB%2Bitaliano%2B23%2B04%2B2025/95e60cf5-8e20-444a-87d3-7b51e979e851?version=1.0','sourcePage':'https://www.ilportaledellautomobilista.it/web/portale-automobilista/dettaglio-news/-/asset_publisher/V57QhEdoCmc7/document/id/121608540','sourceListDate':'2025-04-23','retrievedAt':'2026-09-28','sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'catalogRevision':'2025-04-23-layout-verified-1','questions':len(bank),'images':len(images),'pages':len(reader.pages),'exam':{'questions':30,'minutes':20,'maxErrors':3},'explanations':'Contenuti didattici non ufficiali da Lamuo/quiz-patente, associati per ID, testo e risposta esatti.'},'chapters':chapter_list,'questions':bank}
(OUT/'bank.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(ROOT/'reference/extraction-audit.json').write_text(json.dumps({'questions':len(bank),'uniqueIds':len({q['id'] for q in bank}),'independentTextAudit':'PASS','images':len(images),'illustratedQuestions':sum(bool(q['image']) for q in bank),'chapters':chapter_list},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(data['metadata'],ensure_ascii=False),flush=True)
print(json.dumps(chapter_list,ensure_ascii=False),flush=True)
