"""Display names only; official question text, IDs and answer keys stay unchanged."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'dist/bank.json'
data=json.loads(p.read_text(encoding='utf-8'))
titles={'11':'Definizioni, veicoli e doveri del conducente','12':'Circolazione, posizione e manovre','13':'Veicolo fermo, autostrade e strade extraurbane','14':'Luci, clacson, spie e simboli','15':'Velocità e passaggi a livello','19':'Cinture, bambini, casco e dispositivi di sicurezza','20':'Patenti, documenti e sanzioni','21':'Prevenzione e comportamento in caso di incidente','22':'Condizioni del conducente e primo soccorso','23':'Responsabilità e assicurazione','24':'Consumi, ambiente e inquinamento','25':'Meccanica, manutenzione e tenuta di strada','5':'Precedenza agli incroci','6':'Semafori e agenti del traffico','7':'Segnaletica orizzontale','4':'Segnali complementari, temporanei e di cantiere'}
order=['11','8','9','10','2','1','3','4','7','6','15','16','12','5','17','18','13','14','19','20','21','22','23','24','25']
for c in data['chapters']:
    c.setdefault('sourceTitle',c['title'])
    c['title']=titles.get(c['id'],c['title'])
data['chapters'].sort(key=lambda c:order.index(c['id']))
p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('25 capitoli: nomi brevi e ordine di studio applicati.')
