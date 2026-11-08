"""
Generate the Aralytics demo files (docs/demo-files/) used to test uploads by hand.

  python scripts/demo-files/generate.py              # regenerate docs/demo-files
  python scripts/demo-files/generate.py --oversize   # also write over-limit files to output/demo-oversize/

Needs: pip install python-docx python-pptx reportlab pillow openpyxl
The roster comes from server/src/db/seeds/demoAccounts.js (run through node), so the
names, sections and tasks always match the 157 demo accounts.
"""
import json, os, random, shutil, subprocess, sys, zipfile
from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor
from pptx import Presentation
from pptx.util import Inches, Pt as PPt
from pptx.dml.color import RGBColor as PRGB
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from PIL import Image, ImageDraw, ImageFont
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'demo-files'
BROWN = (92, 58, 40)

# ---------------------------------------------------------------------------
# Roster
# ---------------------------------------------------------------------------
def load_roster():
    env = dict(os.environ, DB_DIALECT='sqlite', TURSO_DATABASE_URL='', DB_SQLITE_PATH=str(ROOT / 'output' / 'roster-probe.sqlite'))
    code = ("const {buildAllAccountDefinitions}=require('./src/db/seeds/demoAccounts');"
            "process.stdout.write(JSON.stringify(buildAllAccountDefinitions()))")
    raw = subprocess.check_output(['node', '-e', code], cwd=ROOT / 'server', env=env)
    for suffix in ('', '-shm', '-wal'):
        p = ROOT / 'output' / f'roster-probe.sqlite{suffix}'
        if p.exists(): p.unlink()
    return json.loads(raw)

# ---------------------------------------------------------------------------
# Course content per instructor
# ---------------------------------------------------------------------------
TEACHERS = {
    'teacher-ponce': {
        'sections': '10-Rizal at 10-Bonifacio',
        'lesson': {
            'title': 'Modyul 2: Disaster Risk Reduction and Management (CBDRRM)',
            'competency': 'Natatalakay ang konsepto ng Community-Based Disaster Risk Reduction and Management (AP10-Q1)',
            'sections': [
                ('Panimula', 'Ang Pilipinas ay nasa Pacific Ring of Fire at dinaraanan ng humigit-kumulang 20 bagyo bawat taon. Dahil dito, mahalagang maunawaan ng bawat mamamayan ang kahandaan sa kalamidad.'),
                ('Hazard, Vulnerability at Capacity', 'Ang hazard ay banta na maaaring magdulot ng pinsala (hal. bagyo, lindol). Ang vulnerability ay kahinaan ng pamayanan na harapin ito, at ang capacity ay kakayahan, kaalaman at kagamitang makatutulong upang mabawasan ang pinsala.'),
                ('Top-Down at Bottom-Up Approach', 'Sa top-down approach, ang pamahalaang nasyonal ang nagpaplano. Sa bottom-up approach, ang mamamayan at barangay ang aktibong nakikilahok sa pagtukoy ng panganib at paggawa ng plano. Ang CBDRRM ay gumagamit ng bottom-up approach.'),
                ('Apat na Yugto ng CBDRRM', '1) Disaster Prevention and Mitigation, 2) Disaster Preparedness, 3) Disaster Response, 4) Disaster Rehabilitation and Recovery. Ayon sa RA 10121, bawat barangay ay dapat may sariling Disaster Risk Reduction and Management Committee.'),
                ('Pagtataya', 'Gumawa ng hazard map ng inyong purok at tukuyin ang tatlong pinakaligtas na evacuation route. Isumite ito sa Activities bilang PDF o DOCX.'),
            ],
        },
        'slides': ('CBDRRM: Kahandaan ng Barangay', [
            ('Bakit kailangan ang CBDRRM?', ['20 bagyo bawat taon', 'Nasa Pacific Ring of Fire', 'Mamamayan ang unang tumutugon']),
            ('Hazard • Vulnerability • Capacity', ['Hazard: banta (bagyo, lindol, baha)', 'Vulnerability: kahinaan ng pamayanan', 'Capacity: kakayahan at kagamitan']),
            ('Apat na Yugto', ['Prevention & Mitigation', 'Preparedness', 'Response', 'Rehabilitation & Recovery']),
            ('RA 10121', ['Philippine DRRM Act of 2010', 'BDRRM Committee sa bawat barangay', '5% ng IRA para sa DRRM Fund']),
            ('Gawain', ['Gumawa ng hazard map ng purok', 'Tukuyin ang evacuation routes', 'Isumite sa Activities']),
        ]),
        'worksheet': ('Gawain 2.1: Hazard Map ng Aming Purok', [
            'Ano ang tatlong pangunahing hazard sa inyong barangay?',
            'Aling mga pamilya o lugar ang pinaka-vulnerable? Bakit?',
            'Anong capacity o kagamitan ang mayroon na ang inyong barangay?',
            'Ilarawan ang pinakaligtas na evacuation route mula sa inyong bahay.',
            'Paano makatutulong ang kabataan sa Disaster Preparedness?',
        ]),
        'task': 'Barangay CBDRRM Hazard & Evacuation Map Action Plan',
        'photo_task': 'Photo-Essay: Pagsusuri sa Suliraning Solid Waste sa Pamayanan',
        'announcement': ('Paalala: Quarterly Nationwide Simultaneous Earthquake Drill', 'Sa Huwebes, 9:00 n.u., magkakaroon ng earthquake drill. Dalhin ang inyong go-bag at sundin ang evacuation route na nakapaskil sa silid-aralan.'),
    },
    'teacher-magsaysay': {
        'sections': '10-Luna',
        'lesson': {
            'title': 'Aralin 3: Suliranin sa Solid Waste at ang RA 9003',
            'competency': 'Nasusuri ang kalagayan, suliranin at pagtugon sa isyung pangkapaligiran ng Pilipinas (AP10-Q1)',
            'sections': [
                ('Panimula', 'Tinatayang mahigit 40,000 tonelada ng basura ang nalilikha ng Pilipinas araw-araw. Malaking bahagi nito ay plastik na napupunta sa ilog at dagat.'),
                ('RA 9003: Ecological Solid Waste Management Act', 'Itinatakda ng batas ang segregation at source, pagkakaroon ng Materials Recovery Facility (MRF) sa bawat barangay, at pagbabawal sa open dumpsite.'),
                ('Ang 3R at Segregation', 'Reduce, Reuse, Recycle. Hatiin ang basura sa nabubulok, di-nabubulok, recyclable at special/hazardous waste.'),
                ('Pagtataya', 'Magsagawa ng isang linggong waste audit sa inyong tahanan at iulat ang resulta sa Solid Waste Audit Report.'),
            ],
        },
        'slides': ('Solid Waste: Problema at Solusyon', [
            ('Gaano karami ang basura?', ['40,000+ tonelada bawat araw', 'Plastik: pangunahing problema', 'Ilog at dagat ang apektado']),
            ('RA 9003', ['Segregation at source', 'MRF sa bawat barangay', 'Bawal ang open dumpsite']),
            ('3R', ['Reduce', 'Reuse', 'Recycle']),
            ('Gawain', ['Isang linggong waste audit', 'Itala ang uri at dami', 'Magmungkahi ng solusyon']),
        ]),
        'worksheet': ('Gawain 3.1: Waste Audit ng Aming Tahanan', [
            'Ilang kilo (tantiya) ng basura ang nalilikha ng inyong pamilya sa isang linggo?',
            'Anong uri ng basura ang pinakamarami? Bakit?',
            'Paano isinasagawa ang segregation sa inyong tahanan?',
            'Mayroon bang MRF ang inyong barangay? Ilarawan.',
            'Magbigay ng dalawang paraan upang mabawasan ang plastik sa inyong tahanan.',
        ]),
        'task': '10-Luna Solid Waste Audit Report (Due Soon)',
        'photo_task': '10-Luna Purok Evacuation & Hazard Map Plan',
        'announcement': ('Paalala: Clean-Up Drive sa Sabado', 'Magkita-kita sa harap ng paaralan, 7:00 n.u. Magdala ng guwantes, sako at tubig. May dagdag na puntos sa Performance Task ang dadalo.'),
    },
    'teacher-tecson': {
        'sections': '10-Mabini',
        'lesson': {
            'title': 'Aralin 1: Primary at Secondary Sources sa Pag-aaral ng Kontemporaryong Isyu',
            'competency': 'Nasusuri ang kahalagahan ng pag-aaral ng kontemporaryong isyu gamit ang mapanuring pag-iisip (AP10-Q1)',
            'sections': [
                ('Panimula', 'Sa panahon ng social media, mahalagang matukoy kung aling impormasyon ang totoo, may kinikilingan, o maling balita.'),
                ('Primary Sources', 'Orihinal na tala o ebidensya mula mismo sa pangyayari: diary, larawan, panayam, opisyal na dokumento at talumpati.'),
                ('Secondary Sources', 'Interpretasyon o pagsusuri ng primary sources: aklat, artikulo, ensiklopedya at dokumentaryo.'),
                ('Katotohanan at Opinyon', 'Ang katotohanan ay mapatutunayan ng ebidensya; ang opinyon ay pananaw o paniniwala. Suriin ang may-akda, petsa at layunin ng bawat sanggunian.'),
                ('Pagtataya', 'Bumuo ng Primary vs Secondary Source Matrix tungkol sa isang isyu sa inyong barangay.'),
            ],
        },
        'slides': ('Sanggunian at Katotohanan', [
            ('Bakit mapanuri?', ['Fake news sa social media', 'May kinikilingan ang ilang balita', 'Kailangan ng ebidensya']),
            ('Primary Sources', ['Diary at liham', 'Larawan at video', 'Opisyal na dokumento']),
            ('Secondary Sources', ['Aklat at artikulo', 'Ensiklopedya', 'Dokumentaryo']),
            ('Katotohanan o Opinyon?', ['Katotohanan: may ebidensya', 'Opinyon: pananaw', 'Suriin ang may-akda at petsa']),
        ]),
        'worksheet': ('Gawain 1.2: Katotohanan o Opinyon?', [
            'Magbigay ng isang halimbawa ng primary source tungkol sa Bagyong Yolanda.',
            'Magbigay ng isang halimbawa ng secondary source tungkol sa parehong pangyayari.',
            'Paano mo malalaman kung maling balita ang isang post sa social media?',
            'Isulat ang isang pahayag na katotohanan at isang opinyon tungkol sa climate change.',
            'Bakit mahalaga ang mapanuring pag-iisip sa pag-aaral ng kontemporaryong isyu?',
        ]),
        'task': '10-Mabini Primary vs Secondary Source Matrix (Past Due)',
        'photo_task': '10-Mabini Community Clean-Up Proposal (Due Soon)',
        'announcement': ('Paalala: Pagsusulit sa Biyernes', 'Magkakaroon ng maikling pagsusulit tungkol sa Primary at Secondary Sources. Basahin muli ang Aralin 1 sa Lessons.'),
    },
}

# Answers for each worksheet, three quality levels. Index matches the question.
ANSWERS = {
    'teacher-ponce': {
        'strong': ['Baha tuwing bagyo, landslide sa gilid ng bundok, at lindol dahil malapit kami sa fault line.',
                   'Ang mga pamilyang nakatira sa tabing-ilog at ang mga nakatatanda, dahil sila ang unang tinatamaan ng baha at mahirap ilikas.',
                   'May rescue boat, early warning na batingaw, evacuation center sa covered court at mga trained na BDRRM volunteers.',
                   'Mula sa bahay, dadaan sa Rizal St. paakyat sa covered court; iniiwasan ang tulay dahil binabaha ito.',
                   'Maaaring tumulong sa information drive, maghanda ng family go-bag at sumali sa youth DRRM volunteers ng SK.'],
        'average': ['Baha at bagyo.', 'Yung mga nasa tabi ng ilog.', 'May evacuation center.', 'Pupunta sa covered court.', 'Tumulong sa paglilinis at maghanda.'],
        'weak': ['Bagyo', 'Hindi ko alam', 'Wala', 'Sa daan', 'Tumulong'],
    },
    'teacher-magsaysay': {
        'strong': ['Mga 6 na kilo bawat linggo para sa limang miyembro ng pamilya.',
                   'Plastik na pambalot ng pagkain, dahil madalas kaming bumili ng sachet at take-out.',
                   'May tatlong basurahan: nabubulok, di-nabubulok at recyclable; ang nabubulok ay ginagawang compost.',
                   'Mayroon, sa likod ng barangay hall, kung saan tinitimbang at ibinebenta ang recyclables.',
                   'Magdala ng eco-bag sa palengke at bumili ng refill sa halip na sachet.'],
        'average': ['Mga 5 kilo.', 'Plastik.', 'Hinihiwalay ang plastik.', 'Hindi ako sigurado.', 'Eco-bag at bawas plastik.'],
        'weak': ['Marami', 'Basura', 'Wala', 'Ewan', 'Wag mag plastic'],
    },
    'teacher-tecson': {
        'strong': ['Mga larawan at panayam sa mga nakaligtas sa Tacloban noong 2013.',
                   'Isang artikulo sa aklat-aralin na nagsusuri sa pagtugon ng pamahalaan sa Yolanda.',
                   'Sinusuri ko ang pinagmulan, petsa at kung may ibang mapagkakatiwalaang balita na nag-uulat nito.',
                   'Katotohanan: Tumaas ang karaniwang temperatura ng mundo. Opinyon: Ang climate change ang pinakamahalagang isyu ngayon.',
                   'Upang makagawa ng tamang desisyon at hindi madala sa maling impormasyon.'],
        'average': ['Larawan ng bagyo.', 'Balita sa TV.', 'Tinitingnan kung totoo.', 'Mainit na ang mundo / Nakakatakot ito.', 'Para hindi maloko.'],
        'weak': ['Picture', 'Libro', 'Basta', 'Climate change', 'Mahalaga'],
    },
}

def quality_for(acc):
    tier = (acc.get('tier') or '').upper()
    prof = (acc.get('profile_type') or '').lower()
    if 'mastered' in prof or tier in ('MASTERED', 'HIGH'): return 'strong'
    if 'needs practice' in prof or 'flag' in prof or tier in ('NEEDS_INTERVENTION', 'LOW'): return 'weak'
    return random.Random(acc['key']).choice(['strong', 'average', 'average', 'weak'])

def safe(name):
    return ''.join(c for c in name if c.isalnum() or c in ' -_.,()&').strip()

# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------
styles = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=styles['Title'], textColor=colors.Color(*[c / 255 for c in BROWN]), fontSize=20, spaceAfter=8)
H2 = ParagraphStyle('h2', parent=styles['Heading2'], textColor=colors.Color(*[c / 255 for c in BROWN]))
BODY = ParagraphStyle('body', parent=styles['BodyText'], fontSize=11, leading=15)
SMALL = ParagraphStyle('small', parent=BODY, fontSize=9, textColor=colors.grey)

def pdf(path, story, title):
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(path), pagesize=A4, title=title, author='Aralytics demo files',
                            leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm)
    doc.build(story)

def table(rows, widths=None):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.Color(*[c / 255 for c in BROWN])),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('FONTSIZE', (0, 0), (-1, -1), 9.5),
    ]))
    return t

def P(text, style=BODY): return Paragraph(text, style)

def docx_heading(doc, text, size=16):
    p = doc.add_paragraph(); r = p.add_run(text); r.bold = True; r.font.size = Pt(size); r.font.color.rgb = RGBColor(*BROWN)

def write_lesson_pdf(path, teacher, t):
    l = t['lesson']
    story = [P(l['title'], H1), P(f"Araling Panlipunan 10 · {teacher['full_name']} · {t['sections']}", SMALL),
             P(f"<b>Kasanayang Pampagkatuto:</b> {l['competency']}", BODY), Spacer(1, 10)]
    for i, (h, body) in enumerate(l['sections']):
        story += [P(h, H2), P(body, BODY), Spacer(1, 6)]
        if i == 2: story.append(PageBreak())
    story += [Spacer(1, 12), P('Demo file para sa pagsubok ng Aralytics. Hindi opisyal na DepEd material.', SMALL)]
    pdf(path, story, l['title'])

def write_slides(path, teacher, t):
    title, slides = t['slides']
    prs = Presentation(); prs.slide_width = Inches(13.333); prs.slide_height = Inches(7.5)
    s = prs.slides.add_slide(prs.slide_layouts[0])
    s.shapes.title.text = title
    s.placeholders[1].text = f"Araling Panlipunan 10 · {teacher['full_name']}"
    for head, bullets in slides:
        s = prs.slides.add_slide(prs.slide_layouts[1])
        s.shapes.title.text = head
        s.shapes.title.text_frame.paragraphs[0].runs[0].font.color.rgb = PRGB(*BROWN)
        tf = s.placeholders[1].text_frame; tf.text = bullets[0]
        for b in bullets[1:]: tf.add_paragraph().text = b
        for p in tf.paragraphs: p.runs[0].font.size = PPt(28)
    path.parent.mkdir(parents=True, exist_ok=True); prs.save(str(path))

def write_worksheet(path, teacher, t):
    title, questions = t['worksheet']
    doc = Document(); docx_heading(doc, title, 18)
    doc.add_paragraph(f"Araling Panlipunan 10 · {teacher['full_name']} · {t['sections']}")
    doc.add_paragraph('Pangalan: ______________________   Seksyon: __________   Petsa: __________')
    doc.add_paragraph('Panuto: Sagutin nang buong pangungusap ang bawat tanong.')
    for i, q in enumerate(questions, 1):
        doc.add_paragraph(f'{i}. {q}'); doc.add_paragraph('_' * 70)
    path.parent.mkdir(parents=True, exist_ok=True); doc.save(str(path))

def write_rubric(path, teacher, t):
    rows = [['Pamantayan', 'Napakahusay (4)', 'Mahusay (3)', 'Umuunlad (2)', 'Nagsisimula (1)'],
            ['Nilalaman at Pagsusuri (40%)', 'Malalim at may ebidensya', 'Wasto ngunit kulang sa ebidensya', 'May ilang mali', 'Hindi tumutugon sa gawain'],
            ['Organisasyon (30%)', 'Malinaw at lohikal', 'Maayos', 'Medyo magulo', 'Walang kaayusan'],
            ['Praktikalidad sa Komunidad (30%)', 'Magagamit agad ng barangay', 'Magagamit na may kaunting ayos', 'Mahirap isagawa', 'Hindi praktikal']]
    story = [P(f"Rubrik: {t['task']}", H1), P(f"{teacher['full_name']} · {t['sections']} · Kabuuang puntos: 100", SMALL), Spacer(1, 10),
             table(rows, [4.2 * cm, 3.2 * cm, 3.2 * cm, 3 * cm, 3 * cm]), Spacer(1, 12),
             P('I-upload ang awtput sa Activities bilang PDF o DOCX. Ang late submission ay may bawas na 10% bawat araw.', BODY)]
    pdf(path, story, 'Rubrik')

def write_announcement(path, teacher, t):
    head, body = t['announcement']
    pdf(path, [P(head, H1), P(f"Mula kay {teacher['full_name']} · {t['sections']}", SMALL), Spacer(1, 10), P(body, BODY)], head)

def write_gradebook_xlsx(path, teacher, students):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Class record'
    ws.append(['LRN', 'Pangalan', 'Seksyon', 'Written Work (30%)', 'Performance Task (50%)', 'Quarterly Exam (20%)'])
    for s in students:
        r = random.Random(s['key'])
        ws.append([s.get('suggested_lrn') or s['lrn_or_id'], s['full_name'], s.get('section'), r.randint(60, 98), r.randint(60, 98), r.randint(55, 98)])
    path.parent.mkdir(parents=True, exist_ok=True); wb.save(str(path))

def write_lesson_pack(path, members):
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for m in members: z.write(m, m.name)

def write_workbook_answers(path, student, teacher, t, quality):
    title, questions = t['worksheet']
    answers = ANSWERS[student['teacher_key']][quality]
    doc = Document(); docx_heading(doc, title, 18)
    doc.add_paragraph(f"Pangalan: {student['full_name']}   Seksyon: {student.get('section')}   LRN: {student.get('suggested_lrn') or student['lrn_or_id']}")
    doc.add_paragraph(f"Guro: {teacher['full_name']}")
    for i, (q, a) in enumerate(zip(questions, answers), 1):
        p = doc.add_paragraph(); p.add_run(f'{i}. {q}').bold = True
        doc.add_paragraph(a)
    path.parent.mkdir(parents=True, exist_ok=True); doc.save(str(path))

def write_task_pdf(path, student, teacher, t, quality):
    r = random.Random(student['key'])
    purok = r.choice(['Purok 1 Sampaguita', 'Purok 2 Ilang-Ilang', 'Purok 3 Rosal', 'Purok 4 Dama de Noche'])
    rows = {
        'strong': [['Hazard', 'Lugar', 'Plano'], ['Baha', 'Tabing-ilog', 'Ilikas sa covered court bago umapaw'], ['Landslide', 'Gilid ng bundok', 'Babala mula sa BDRRMC'], ['Lindol', 'Lumang gusali', 'Duck, cover and hold; lumabas sa open field']],
        'average': [['Hazard', 'Lugar', 'Plano'], ['Baha', 'Ilog', 'Lumikas'], ['Bagyo', 'Buong purok', 'Maghanda']],
        'weak': [['Hazard', 'Plano'], ['Bagyo', 'Lumikas']],
    }[quality]
    story = [P(t['task'], H1), P(f"{student['full_name']} · {student.get('section')} · {purok}", SMALL), Spacer(1, 8),
             P('Panimula', H2), P({'strong': f'Ang {purok} ay nasa mababang bahagi ng barangay malapit sa ilog. Sa planong ito, tinukoy ko ang mga pangunahing hazard, ang mga pinaka-vulnerable na pamilya, at ang ligtas na evacuation route.',
                                   'average': f'Ito ang plano ko para sa {purok}.', 'weak': 'Plano.'}[quality], BODY),
             P('Talaan ng Hazard at Plano', H2), table(rows), Spacer(1, 8)]
    if quality != 'weak':
        story += [P('Evacuation Route', H2), P('Bahay → Rizal St. → Mabini St. → Covered Court (Evacuation Center). Iwasan ang tulay sa Luna St.', BODY)]
    if quality == 'strong':
        story += [P('Go-Bag ng Pamilya', H2), P('Tubig (3 litro bawat tao), de-lata, flashlight, radyo, first aid kit, gamot, kopya ng mahahalagang dokumento sa plastic envelope, power bank.', BODY),
                  P('Pagninilay', H2), P('Natutunan ko na ang kahandaan ay hindi lamang responsibilidad ng pamahalaan kundi ng bawat pamilya.', BODY)]
    pdf(path, story, t['task'])

def write_photo(path, student, t, quality):
    r = random.Random(student['key'] + 'photo')
    img = Image.new('RGB', (800, 534), (236 - r.randint(0, 30), 226 - r.randint(0, 30), 205))
    d = ImageDraw.Draw(img)
    for _ in range(14 if quality == 'strong' else 7):
        x, y = r.randint(40, 700), r.randint(150, 450); w = r.randint(30, 120)
        d.rectangle([x, y, x + w, y + w // 2], fill=(r.randint(60, 200), r.randint(60, 160), r.randint(40, 120)), outline=(60, 40, 30))
    d.rectangle([0, 0, 800, 120], fill=BROWN)
    try: font = ImageFont.truetype('arial.ttf', 30); small = ImageFont.truetype('arial.ttf', 22)
    except OSError: font = small = ImageFont.load_default()
    d.text((30, 25), t['photo_task'][:60], fill='white', font=font)
    d.text((30, 75), f"{student['full_name']} · {student.get('section')}", fill='white', font=small)
    d.text((30, 495), 'Larawan 1: Tambak ng basura malapit sa kanal (demo image)', fill=(40, 30, 20), font=small)
    path.parent.mkdir(parents=True, exist_ok=True); img.save(str(path), 'JPEG', quality=55, optimize=True)

def write_edge_cases(folder, oversize=False):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'notes-plain-text.txt').write_text('Plain text is not an allowed upload type. Expect: Unsupported file type.\n', encoding='utf-8')
    (folder / 'fake-module.pdf').write_text('This is text renamed to .pdf. Expect the upload to be refused after the content check.\n', encoding='utf-8')
    (folder / 'empty-file.pdf').write_bytes(b'')
    wb = openpyxl.Workbook(); wb.active.append(['Spreadsheets are not accepted for lessons or submissions']); wb.save(str(folder / 'spreadsheet-not-allowed.xlsx'))
    pdf(folder / 'Modyul na may mahabang pangalan — Ñ, ü at mga simbolo (2026-Q1) v2 FINAL.pdf',
        [P('Unicode filename test', H1), P('Use this to check that long names with accents survive upload, listing and download.', BODY)], 'Unicode name')
    if oversize:
        big = ROOT / 'output' / 'demo-oversize'; big.mkdir(parents=True, exist_ok=True)
        for name, mb in [('teacher-over-15MB.pdf', 16), ('student-over-10MB.pdf', 11)]:
            with open(big / name, 'wb') as f:
                f.write(b'%PDF-1.4\n%demo oversize\n'); f.write(os.urandom(mb * 1024 * 1024))
        print(f'Oversize files written to {big}')

# ---------------------------------------------------------------------------
def main():
    oversize = '--oversize' in sys.argv
    roster = load_roster()
    by_key = {a['key']: a for a in roster}
    if OUT.exists():
        for child in OUT.iterdir():
            if child.name != 'README.md':
                shutil.rmtree(child) if child.is_dir() else child.unlink()
    counts = {'instructor': 0, 'student': 0}

    for key, t in TEACHERS.items():
        teacher = by_key[key]
        folder = OUT / 'instructors' / safe(f"{teacher['full_name']} ({t['sections'].replace(' at ', ' & ')})")
        lesson = folder / safe(f"{t['lesson']['title']}.pdf")
        slides = folder / safe(f"Presentasyon - {t['slides'][0]}.pptx")
        sheet = folder / safe(f"Worksheet - {t['worksheet'][0]}.docx")
        write_lesson_pdf(lesson, teacher, t); write_slides(slides, teacher, t); write_worksheet(sheet, teacher, t)
        write_rubric(folder / safe(f"Rubrik - {t['task']}.pdf"), teacher, t)
        write_announcement(folder / safe(f"Announcement attachment - {t['announcement'][0]}.pdf"), teacher, t)
        write_lesson_pack(folder / 'Lesson pack (PDF + slides + worksheet).zip', [lesson, slides, sheet])
        students = [a for a in roster if a.get('teacher_key') == key and a['role'] == 'STUDENT' and a.get('enrollment_status') == 'APPROVED']
        write_gradebook_xlsx(folder / 'Class record - spreadsheet, not an allowed upload type.xlsx', teacher, students)
        counts['instructor'] += len(list(folder.iterdir()))

    for s in roster:
        if s['role'] != 'STUDENT' or s.get('teacher_key') not in TEACHERS: continue
        t, teacher = TEACHERS[s['teacher_key']], by_key[s['teacher_key']]
        q = quality_for(s)
        folder = OUT / 'students' / (s.get('section') or 'no-section') / safe(f"{s['key']} - {s['full_name']}")
        write_workbook_answers(folder / safe(f"{s['full_name']} - Workbook - {t['worksheet'][0]}.docx"), s, teacher, t, q)
        write_task_pdf(folder / safe(f"{s['full_name']} - {t['task']}.pdf"), s, teacher, t, q)
        write_photo(folder / safe(f"{s['full_name']} - Photo-essay larawan 1.jpg"), s, t, q)
        counts['student'] += 3

    write_edge_cases(OUT / 'edge-cases', oversize)
    print(f"Wrote {counts['instructor']} instructor files and {counts['student']} student files to {OUT}")

if __name__ == '__main__':
    main()
