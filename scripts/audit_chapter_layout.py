from pathlib import Path
import pdfplumber
import re
import json
import hashlib
from collections import Counter
from pypdf import PdfReader

source = Path(__file__).resolve().parents[1] / 'reference/listato-ufficiale.pdf'
reader = PdfReader(source)
bank = json.loads((source.parent.parent / 'dist/bank.json').read_text(encoding='utf-8'))
existing = {q['id']: q for q in bank['questions']}
assignments = {}
group_titles = {}
current = None
heading_re = re.compile(r'Quesito n.\s*(\d+)\s*-\s*([^\n]+)')
with pdfplumber.open(source) as pdf:
    for number, page in enumerate(pdf.pages, 1):
        titles = list(heading_re.finditer(reader.pages[number - 1].extract_text()))
        for match in titles:
            group_titles[match.group(1)] = re.sub(r'\s+', ' ', match.group(2)).strip()
        headings = []
        for line in page.extract_text_lines():
            match = heading_re.search(line['text'])
            if match:
                headings.append((line['top'], match.group(1)))
        assert [m.group(1) for m in titles] == [group for _, group in headings], (number, [m.group(1) for m in titles], headings)
        events = [(top, 0, 'heading', group) for top, group in headings]
        events += [(table.bbox[1], 1, 'table', table) for table in page.find_tables()]
        for _, _, kind, value in sorted(events, key=lambda event: event[:2]):
            if kind == 'heading':
                current = value
            else:
                for row in value.extract():
                    if row and row[0] and re.fullmatch(r'\d{4,6}', str(row[0]).strip()):
                        question_id = str(row[0]).strip()
                        assert question_id not in assignments, (number, question_id)
                        assignments[question_id] = current
        page.close()
        if number % 100 == 0:
            print(number, len(assignments), flush=True)
assert set(assignments) == set(existing), (len(assignments), len(existing), set(existing) - set(assignments))
changed = [{'id': question_id, 'was': existing[question_id]['groupId'], 'now': group}
           for question_id, group in assignments.items() if existing[question_id]['groupId'] != group]
chapter_by_title = {chapter['sourceTitle']: chapter['id'] for chapter in bank['chapters']}
missing = sorted(set(group_titles.values()) - set(chapter_by_title))
print('titles', len(set(group_titles.values())), 'missing from current bank', missing)
chapter_changes = [{'id': question_id, 'was': existing[question_id]['chapterId'],
                    'now': chapter_by_title.get(group_titles[group]), 'group': group}
                   for question_id, group in assignments.items()
                   if existing[question_id]['chapterId'] != chapter_by_title.get(group_titles[group])]
assert not missing and not changed and not chapter_changes, (missing, changed[:5], chapter_changes[:5])
canonical = '\n'.join(f"{qid},{assignments[qid]},{chapter_by_title[group_titles[assignments[qid]]]}" for qid in sorted(assignments, key=int))
result = {
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'method': 'Each PDF page is read from top to bottom; every question inherits the closest preceding Quesito heading, including across page breaks.',
    'questions': len(assignments),
    'groups': len(set(assignments.values())),
    'chapterCounts': dict(sorted(Counter(chapter_by_title[group_titles[g]] for g in assignments.values()).items(), key=lambda x:int(x[0]))),
    'idGroupChapterSha256': hashlib.sha256(canonical.encode('utf-8')).hexdigest(),
    'layoutComparison': 'PASS',
}
(source.parent / 'chapter-layout-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'questions': len(assignments), 'changedGroups': len(changed),
                  'changedChapters': len(chapter_changes),
                  'oldChapterTotals': dict(Counter(q['chapterId'] for q in existing.values())),
                  'newChapterTotals': dict(Counter(chapter_by_title.get(group_titles[g]) for g in assignments.values())),
                  'chapterSamples': chapter_changes[:30]}, indent=2))
