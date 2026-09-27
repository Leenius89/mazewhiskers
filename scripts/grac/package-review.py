"""Package static build with provenance; preserve the original 2026-09-19 ZIP."""
from pathlib import Path
import hashlib, json, zipfile, sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parents[2]
build=root/'build-grac'
out=root/'store-assets/grac/review-20260922'
commit='c7533e4e7e2f3d32a31ef4e9a4544ac3aa1bfe9f'
assert (build/'index.html').is_file()
assert not list(build.rglob('*.map')), 'Source maps must not be packaged'
files=sorted(p for p in build.rglob('*') if p.is_file())
assert all(not p.name.startswith('.env') for p in files)
manifest={
 'game':'Mazewhiskers(메이즈 위스커스)', 'package_version':'0.1.0',
 'source_commit':commit,'source_branch':'toss','built_date_kst':'2026-09-22',
 'build_type':'production browser review build, REACT_APP_TOSS_SIM=0, GENERATE_SOURCEMAP=false',
 'status':'review candidate; not an approved GRAC submission or Toss release bundle',
 'known_difference':'Toss SDK ads, leaderboard, user key and haptics unavailable in ordinary browser',
 'additional_path':'?mode=arcade remains accessible; see content description',
 'files':[{'path':p.relative_to(build).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
}
readme='''메이즈 위스커스 브라우저 실행 안내

버전 0.1.0 / 소스 c7533e4 / 2026-09-22
이 파일은 심사 준비용 웹 실행본입니다. 토스 업로드용 .ait 번들이 아닙니다.

1. ZIP 전체를 새 폴더에 압축 해제합니다.
2. Python 3가 있는 PC에서 그 폴더를 터미널로 열고 아래 명령을 실행합니다.
   py -3 -m http.server 8000 --bind 127.0.0.1
   Windows가 아니라면 python3를 사용할 수 있습니다.
3. 브라우저에서 http://127.0.0.1:8000/ 을 엽니다.
4. 방향키로 이동, Space로 점프, 메뉴 버튼으로 일시정지합니다.
5. 종료 시 터미널에서 Ctrl+C를 누릅니다.

별도 정적 서버도 사용 가능합니다. index.html과 static 폴더가 서버 루트에 있어야 합니다.
index.html 더블클릭(file://)은 지원하지 않습니다. 인터넷 공개 없이 로컬에서 실행됩니다.
브라우저의 자동재생 제한으로 소리는 화면을 눌러 시작한 뒤 재생될 수 있습니다.

검토 경로
- / : 기본 모드. 설정에서 EASY / NORMAL / HARD / NIGHTMARE 선택.
- /?tutorial=1 : 튜토리얼 다시 보기. NIGHTMARE는 별도 시작 대사 사용.
- /?mode=arcade : 현재 포함된 3구역·대시 모드. 기본 메뉴에는 선택 버튼 없음.
- '오늘의 도시' 버튼 : 한국 날짜에 따른 도시 종류와 시드로 시작.
- ?plan= 또는 ?tossSim=1은 이 production 실행본의 테스트 기능을 켜지 않습니다.

토스 앱과 다른 점
일반 브라우저에는 토스 순위표, 사용자 식별키, 진동, 실제 광고가 제공되지 않습니다.
개인 기록·설정은 브라우저 저장소에 남을 수 있습니다.
광고 기능은 토스 앱 영상으로 별도 입증해야 합니다. 광고가 없는 게임으로 신고하지 않습니다.
로그인 없는 URL 제출 또는 ZIP 접수 가능 여부는 GRAC 회신으로 확정합니다.

포함 파일
index.html과 정적 리소스, GRAC_BUILD_MANIFEST.json, 본 안내, 글꼴 라이선스.
소스 커밋은 게임 코드 기준입니다. 이 작업의 문서·준비 스크립트는 별도 변경 사항입니다.
'''
archive=root/'store-assets/grac/실행파일_메이즈위스커스_web_20260922_c7533e4.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in files: z.write(p,p.relative_to(build).as_posix())
 z.writestr('실행안내.txt',readme.encode('utf-8-sig'))
 z.writestr('GRAC_BUILD_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2).encode('utf-8'))
 for name in ('Pretendard-LICENSE.txt','PressStart2P-LICENSE.txt'):
  z.write(root/'src/assets/fonts'/name,'licenses/'+name)
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for f in manifest['files']:
  assert hashlib.sha256(z.read(f['path'])).hexdigest()==f['sha256']
summary={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'source_commit':commit,'file_count':len(files),'old_archive_preserved':True,'zip_crc_and_hashes':'passed'}
(out/'실행본-검증정보.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(out/'실행안내.md').write_text('# 실행본 사용 안내\n\n'+readme,encoding='utf-8')
(out/'실행본-파일목록.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
