"""Build a review PDF and editable Markdown without overwriting the handover DOCX."""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import re
import sys
from html import escape
from docx import Document
from docx.table import Table as WordTable
from docx.text.paragraph import Paragraph as WordParagraph
from docx.oxml.ns import qn
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
import pypdfium2 as pdfium
from pypdf import PdfReader

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'store-assets/grac/review-20260922'
OUT.mkdir(parents=True, exist_ok=True)
ART = OUT / 'reference-images'
ART.mkdir(exist_ok=True)
DOC = Document(ROOT / 'store-assets/grac/게임물내용설명서_메이즈위스커스_초안.docx')
DATA = json.loads((OUT / 'content-source.json').read_text(encoding='utf-8'))
QA = Path('C:/Users/wndal/.codex/visualizations/2026/09/21/01a0c420-98eb-7f60-8c0d-9ba8b65bceaf/grac-pdf-qa')
QA.mkdir(parents=True, exist_ok=True)

REPLACE = {
    '[사업자등록증상의 상호]': '요철', '[대표자 성명]': '이중민', '[상호와 동일]': '요철',
    '[작성일]': '2026년 9월 22일', '[개발 연도]': '2024년 개발 시작',
    '전체 대사는 부록에 있습니다.': '주요 대사는 부록에 있습니다.',
    '이 설명서는 등급 결정 후 공개됩니다. 개인정보를 적지 마십시오.': '대상 버전 0.1.0 / 소스 c7533e4 / 웹 실행본 기준. 계정 및 인증 정보는 포함하지 않습니다.',
    '골목을 순찰하다 플레이어를 발견하면 추격합니다. 난이도가 높을수록 빠르고 멀리 보며, 하드 이상에서는 건물을 뛰어넘기도 합니다.':
        '등장 예고 후 플레이어를 지속적으로 추격합니다. 시야에서 벗어나도 추격을 포기하지 않습니다. 난이도가 높을수록 추격 속도와 표시되는 시야 원뿔 범위가 커지고, 하드 이상에서는 더 넓은 건물도 뛰어넘을 수 있습니다.',
    '닿으면 플레이어가 튕겨 나가고 체력이 35 줄어듭니다.': '닿으면 플레이어가 튕겨 나가고 기본 모드에서 체력이 35 줄어듭니다(별도 아케이드 경로에서는 50).',
    '체력 +20 (체력이 낮을 때 +35), 점수 +100. 골목 곳곳에 놓여 있습니다.':
        '체력 +20, 점수 +100. 공사 예고 구역에 놓인 생선은 체력을 +35 회복합니다. 회복량은 체력의 낮고 높음으로 결정되지 않으며, 최대 체력은 100입니다.',
    '체력은 100에서 시작해 1초마다 1씩 줄어듭니다.':
        '체력은 100에서 시작합니다. 조작 가능한 플레이 중에는 이지 기준 1초마다 1씩 줄며, 다른 난이도에서는 비용 배율을 적용합니다. 일시정지·대화 연출 중에는 이 감소를 적용하지 않습니다.',
    '검은 고양이는 순찰 → 의심 → 추격 순서로 행동합니다. 시야에서 벗어나면 잠시 찾다가 포기합니다.':
        '검은 고양이는 등장 예고 후 계속 추격합니다. 장애물이 있으면 길을 찾거나 점프하며, 시야에서 벗어났다는 이유로 수색을 끝내거나 순찰로 돌아가지 않습니다.',
    '월세가 더 비싸고 적이 조금 더 빠르며 멀리 봅니다.': '생활비·월세 배율 1.3. 재개발이 빨라지고 적의 추격 속도와 표시 시야 범위가 커집니다.',
    '적이 더 빠르고, 건물을 뛰어넘어 추격합니다.': '생활비·월세 배율 1.75. 재개발과 추격이 더 빨라지며, 적이 더 넓은 건물을 뛰어넘을 수 있습니다.',
    '맵이 1.5배 넓고,': '생활비·월세 배율 1.95. 기본 도시의 한 변이 약 1.5배이며(41칸에서 61칸, 별도 크기가 정해진 오늘의 도시는 예외),',
    '글리치 효과의 깜빡임은 초당 2.6회 이하로 제한되어 있습니다(광과민성 발작 권고 기준 초당 3회 미만).':
        '적 접근 시 붉은 화면의 맥동 주파수 설정은 최대 2.6Hz입니다. 화면이 찢어지는 글리치는 별도 효과이며 적이 가까울수록 발생 간격이 짧아집니다. 이 수치를 글리치 전체의 깜빡임 제한이나 광과민성 안전성 검증 결과로 해석하지 않습니다.',
    '빙판 때문에 체력이 줄거나 게임이 끝나지는 않습니다.':
        '빙판 자체가 별도 피해를 주지는 않습니다. 미끄러지는 동안에도 생활비·월세, 적과의 접촉 및 재개발에 따른 종료 조건은 적용됩니다.',
    '골목의 8~22%가 얼어 있고,': '골목의 8~22%를 목표 비율로 얼리며 실제 배치는 구간 생성 및 보호 구역에 따라 달라집니다.',
    '‘오늘의 도시’에서는 그날 정해진 비율(없음/10%/30%/55%)로 나옵니다.':
        '‘오늘의 도시’에는 빙판 없음, 목표 비율 10%·30%·55%, 긴 직선을 얼리는 결빙 대로 유형이 있습니다.',
    '그날 모든 이용자에게 같은 미로가 나옵니다(한국 날짜 기준으로 하루에 하나).':
        '한국 날짜를 기준으로 같은 도시 종류와 시드가 정해집니다. 같은 난이도·모드에서는 초기 배치가 재현되지만, 난이도에 따라 도시 크기가 달라질 수 있고 이후 아파트 배치는 플레이 경로에 따라 달라집니다.',
    '날마다 도시의 종류(모양·크기·골목의 성격·빙판 비율)가 달라집니다.':
        '도시 종류는 20종이며 20일 단위로 순서를 섞어 하루에 하나씩 제공합니다. 같은 종류도 날짜 시드에 따라 배치가 달라집니다.',
    '소리, 화면 밝기(어둡게/밝게), 언어(한국어/영어), 난이도, 진동 켜기/끄기, 화면 효과 줄이기.':
        '소리, 메뉴·패널의 화면 테마(어둡게/밝게), 언어(한국어/영어), 난이도, 진동 켜기/끄기, 화면 효과 줄이기. 밝은 테마는 게임 세계의 어둠을 제거하는 기능이 아닙니다.',
    '끝까지 보면 다음 판을 점프 2회(기본 1회)로 시작합니다.':
        '광고 SDK에서 보상 획득 이벤트를 받은 경우 다음 판을 점프 2회(기본 1회)로 시작합니다. 광고를 닫기만 했거나 로드에 실패한 경우에는 보상을 지급하지 않습니다.',
    '광고는 토스의 인앱 광고(토스 애즈, 구글 애드몹)를 통해 제공되며, 게임은 광고 내용을 선택하거나 변경하지 않습니다.':
        '광고는 토스의 인앱 광고 SDK를 통해 요청합니다. 광고 소재는 게임 코드에 포함되어 있지 않습니다. 보상형 광고 표시 직후에는 전면 광고 간격을 다시 계산해 연속 노출을 피하며, 준비된 광고가 없으면 전면 광고 없이 다음 화면으로 이동합니다.',
    '기준 시간보다 빨리 도착한 1초당 10점': '기준 시간(이지·노말·하드 120초, 나이트메어 180초)보다 빨리 도착한 1초당 10점',
    '체력이 다하면 쓰러지는 연출이 있습니다.':
        '종료 시 바닥에 검은 구멍이 열리고 고양이가 뒤집히며 작아져 구멍 속으로 사라지는 만화식 연출이 있습니다.',
    '있음(나이트메어)': '있음',
    '게임에 나오는 한국어 문장 전체입니다(메뉴 버튼 같은 짧은 UI 문구는 대표만 적음). 영어 설정에서는 같은 내용이 영어로 나옵니다.':
        '아래는 주요 한국어 대사와 엔딩 문구입니다. 영어에도 기호 욕설 표현이 존재하며, 언어별 실제 문구는 별첨 한국어 영어 문구 대조표에서 확인할 수 있습니다. 메뉴·도시 설명·기록 안내를 포함한 모든 문구를 이 부록에 실었다는 뜻은 아닙니다.'
}
seen = set()
def fix(s):
    for a,b in REPLACE.items():
        if a in s:
            seen.add(a)
            s=s.replace(a,b)
    return s

pdfmetrics.registerFont(TTFont('Malgun', 'C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('MalgunB', 'C:/Windows/Fonts/malgunbd.ttf'))
pdfmetrics.registerFontFamily('Malgun', normal='Malgun', bold='MalgunB', italic='Malgun', boldItalic='MalgunB')
styles = {
    'body': ParagraphStyle('body', fontName='Malgun', fontSize=9.5, leading=14.8, spaceAfter=7, wordWrap='CJK'),
    'small': ParagraphStyle('small', fontName='Malgun', fontSize=8.1, leading=12.3, spaceAfter=5, wordWrap='CJK'),
    'h1': ParagraphStyle('h1', fontName='MalgunB', fontSize=14, leading=20, spaceBefore=16, spaceAfter=9, keepWithNext=True, wordWrap='CJK'),
    'h2': ParagraphStyle('h2', fontName='MalgunB', fontSize=10.5, leading=16, spaceBefore=10, spaceAfter=5, keepWithNext=True, wordWrap='CJK'),
    'title': ParagraphStyle('title', fontName='MalgunB', fontSize=23, leading=32, spaceAfter=12, wordWrap='CJK')
}
story=[]
md=[]
def para(s, kind='body'):
    return Paragraph(escape(s).replace('\n','<br/>'),styles[kind])
def add(s, kind='body'):
    story.append(para(s,kind)); md.append(('## ' if kind=='h1' else '### ' if kind=='h2' else '# ' if kind=='title' else '')+s+'\n')
def image_from_cell(cell, maxw, maxh):
    images=[]
    for b in cell._element.xpath('.//a:blip'):
        rid=b.get(qn('r:embed'))
        part=DOC.part.related_parts[rid]
        ext=part.partname.rsplit('.',1)[-1]
        name=hashlib.sha256(part.blob).hexdigest()[:12]+'.'+ext
        (ART/name).write_bytes(part.blob)
        im=Image(BytesIO(part.blob))
        scale=min(maxw/im.imageWidth,maxh/im.imageHeight)
        im.drawWidth=im.imageWidth*scale; im.drawHeight=im.imageHeight*scale
        images.append(im)
        md.append(f'![기존 설명서 참고 이미지](reference-images/{name})\n')
    return images

add('메이즈 위스커스 게임물내용설명서','title')
add('2026년 9월 22일 내용 교정본','h2')
add('현재 게임의 규칙과 표현을 설명합니다. 기존 설명서의 회복 조건, 추격 방식, 종료 연출, 화면 효과 및 숨은 실행 경로를 실제 소스에 맞춰 보완했습니다.')
add('검토 상태: 제출 전 검토용. 기존 삽입 화면의 촬영 버전은 확인되지 않았으며, 토스 전용 기능의 실기기 영상과 GRAC 제출 형식 확인이 남아 있습니다. 게임명·상호 표기는 접수 전 증빙과 대조해야 합니다.','small')

table_index=0
for idx,element in enumerate(DOC.element.body):
    if idx in (0,1,2): continue
    if element.tag==qn('w:p'):
        p=WordParagraph(element,DOC)
        s=fix(p.text).strip()
        if not s: continue
        kind='h1' if re.match(r'^\d+\. |^부록',s) else 'h2' if len(s)<25 and idx not in (4,) else 'body'
        add(s,kind)
    elif element.tag==qn('w:tbl'):
        wt=WordTable(element,DOC)
        if table_index==6:
            add('주요 장면 참고 화면','h1')
            add('다음 화면은 기존 DOCX에 포함된 이미지를 유지한 것입니다. 현재 실행본과 동일 버전에서 재촬영한 증거로 사용하지 않습니다.','small')
            for r in wt.rows:
                cards=[]
                for c in r.cells:
                    ims=image_from_cell(c,190,300)
                    if ims: cards.append(ims+[Spacer(1,6),para(fix(c.text).strip(),'small')])
                    else: cards.append('')
                gallery=Table([cards],colWidths=[245,245])
                gallery.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10)]))
                story.append(gallery); story.append(Spacer(1,12))
        else:
            rows=[]
            for ri,r in enumerate(wt.rows):
                row=[]
                texts=[]
                for c in r.cells:
                    s=fix(c.text).strip()
                    texts.append(s.replace('\n',' / ').replace('|','&#124;'))
                    ims=image_from_cell(c,45,45)
                    row.append(ims+[para(s,'small')] if ims else para(s,'small'))
                rows.append(row)
                md.append('| '+' | '.join(texts)+' |')
                if ri==0: md.append('|'+'---|'*len(texts))
            md.append('')
            n=len(wt.columns)
            widths=[490] if n==1 else [97,393] if n==2 else [79,97,314]
            tab=Table(rows,colWidths=widths,repeatRows=1 if table_index not in (0,1,13) else 0,hAlign='LEFT')
            commands=[('VALIGN',(0,0),(-1,-1),'MIDDLE'),('GRID',(0,0),(-1,-1),0.4,colors.HexColor('#D9D9D9')),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]
            if table_index not in (0,1,13): commands.append(('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E9EEF2')))
            tab.setStyle(TableStyle(commands)); story.extend([tab,Spacer(1,10)])
        table_index+=1

story.append(PageBreak())
add('추가 설명 현재 포함된 아케이드 경로','h1')
add('기본 메뉴에는 모드 선택 버튼이 없지만, 현재 웹 실행본은 주소에 ?mode=arcade를 붙이면 아케이드 규칙을 사용합니다. 이 경로는 출시 빌드에서도 차단되지 않습니다. 네 가지 난이도 및 오늘의 도시와는 별도의 실행 모드입니다.')
add('기본 경로는 1구역, 적 1마리, 접촉 피해 35, 대시 비활성입니다. 아케이드 경로는 3구역을 이어 진행하고 구역마다 적이 1마리씩 늘며, 접촉 피해는 50입니다. 재개발이 기본 모드보다 빠르고 구역을 진행할수록 압박이 커집니다.')
add('아케이드에서는 Shift 키 또는 DASH 버튼으로 짧게 돌진합니다. 재사용 대기시간과 짧은 무적 시간이 있으며 점프 재화는 소비하지 않습니다. 판 전체를 클리어하려면 마지막 구역까지 도착해야 합니다.')
add('현재 포함된 경로를 설명한 것이며, 실제 토스 출시 진입 주소와 이 경로의 포함 여부는 출시 담당자가 확정해야 합니다. 제거할 경우에는 코드·실행본·설명서·촬영본을 함께 갱신해야 합니다.','small')
add('실행 환경 및 토스 전용 기능','h1')
add('본 게임은 토스 앱 내 WebView에서 실행되는 HTML5 게임입니다. 별도 APK 또는 IPA 설치 파일 대신 같은 소스로 만든 브라우저 실행본을 검토용으로 준비했습니다. 정적 웹 서버의 루트에서 제공해야 하며 index.html을 직접 더블클릭하는 방식은 지원하지 않습니다.')
add('일반 브라우저에서는 토스 게임센터 순위표, 사용자 식별키, 진동 및 실제 광고 SDK 호출이 제공되지 않습니다. 개인 기록은 브라우저 저장소로 처리됩니다. 토스판의 사용자 식별키는 로컬 기록 저장 위치를 구분하며, 점수는 토스 게임센터 API로 전달합니다.')
add('브라우저판에 광고가 보이지 않는다고 광고 없는 게임으로 신고하지 않습니다. 광고 보상과 토스 순위표는 토스 앱에서 촬영한 영상으로 추가 입증합니다. 새 실행본은 시뮬레이터 광고를 활성화하지 않은 production 빌드입니다.')
add('영어 설정의 기호 욕설','h1')
for key in ('bark.panic','bark.hurt'):
    add('한국어: '+DATA['ko'][key].replace('|',' / '))
    add('영어: '+DATA['en'][key].replace('|',' / '))
add('영어에서도 Ah %$#%!, $@#^%#&*!, @#$%! Get away!, #$%@!가 표시됩니다. 한국어만 검토해 언어 표현이 없다고 판단하지 않습니다.')
add('별첨 문구 대조표 범위','h2')
add('한국어 170개 항목, 영어 170개 항목, 도시 종류 20종의 이름·설명, 크레딧 문자열을 소스에서 추출했습니다. 주요 대사 외 UI 문구도 함께 대조할 수 있습니다. 다른 파일에 하드코딩된 모든 문자열의 전수 수집을 의미하지는 않습니다.')

pdf=OUT/'게임물내용설명서_메이즈위스커스_내용교정본.pdf'
def footer(c,d):
    c.setFont('Malgun',8); c.setFillColor(colors.HexColor('#666666'))
    c.drawString(52,27,'메이즈 위스커스 | 2026-09-22 | 제출 전 검토용')
    c.drawRightString(A4[0]-52,27,str(d.page))
SimpleDocTemplate(str(pdf),pagesize=A4,rightMargin=52,leftMargin=52,topMargin=42,bottomMargin=43,title='메이즈 위스커스 게임물내용설명서',author='요철').build(story,onFirstPage=footer,onLaterPages=footer)
(OUT/'게임물내용설명서_메이즈위스커스_내용교정본.md').write_text('\n'.join(md),encoding='utf-8')
reader=PdfReader(pdf)
text='\n'.join(p.extract_text() or '' for p in reader.pages)
for required in ('2024년 개발 시작','공사 예고 구역','mode=arcade','기호 욕설'):
    assert required in text,required
for wrong in ('체력이 낮을 때 +35','순찰 → 의심 → 추격','[개발 연도]','글리치 효과의 깜빡임은 초당 2.6회 이하'):
    assert wrong not in text,wrong
doc=pdfium.PdfDocument(str(pdf))
for i,page in enumerate(doc): page.render(scale=1.35).to_pil().save(QA/f'page-{i+1:02}.png')
print(json.dumps({'pdf':str(pdf),'pages':len(reader.pages),'replacements_matched':len(seen),'not_matched':[a for a in REPLACE if a not in seen],'qa':str(QA)},ensure_ascii=False))
