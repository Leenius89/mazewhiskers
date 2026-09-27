# GRAC 검토 자료 재현

이 스크립트는 2026-09-22의 게임 소스 c7533e4와 기존 인수인계 DOCX를 기준으로 만든 검토 자료를 재현합니다. 게임 코드가 바뀌면 문구 교정 규칙·자료 버전·촬영안을 먼저 갱신해야 합니다. 새 버전에 그대로 실행해도 자동으로 적절한 심사 자료가 되는 도구가 아닙니다.

프로젝트 루트에서 다음 순서로 실행합니다. 문서용 Python은 Codex 번들 런타임을 사용합니다.

1. `extract-content.cjs`: TypeScript AST로 한국어·영어 문자열과 도시·크레딧 정적 데이터를 추출합니다. 게임 모듈은 실행하지 않습니다.
2. `react-scripts build`: 환경 `CI=false`, `GENERATE_SOURCEMAP=false`, `REACT_APP_TOSS_SIM=0`, `BUILD_PATH=build-grac`로 웹 빌드합니다. 토스 `.ait` 생성·업로드는 하지 않습니다.
3. `package-review.py`: 실행 안내·manifest·글꼴 라이선스를 포함한 날짜별 ZIP을 만듭니다. 원래 ZIP을 덮어쓰지 않습니다.
4. `build-review.py`: 원본 DOCX에서 내용과 참고 이미지를 읽어 내용 교정 Markdown·PDF를 생성합니다. DOCX 레이아웃을 보존하는 변환은 아니며, 원본 DOCX는 변경하지 않습니다. `reportlab`, `python-docx`, `pypdf`, `pypdfium2`와 Windows 맑은 고딕 글꼴을 사용합니다.
5. 생성된 PDF의 모든 페이지를 확인하고, 토스 실기기와 공식 회신을 대조한 뒤 최종 제출본을 별도로 확정합니다.

스크립트가 생성하는 파일은 `store-assets/grac/review-20260922`와 날짜가 있는 ZIP입니다. 렌더링 검사용 PNG는 이 작업의 Codex 시각화 폴더에 저장합니다. 자료를 다음 단계에서 편집할 때는 생성 스크립트도 함께 갱신하거나 재생성으로 편집본이 덮어써지지 않도록 합니다.
