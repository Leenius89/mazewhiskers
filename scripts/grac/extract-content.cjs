// Read static string literals with the TypeScript parser; never execute game modules.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'store-assets/grac/review-20260922');
fs.mkdirSync(out, { recursive: true });
function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.text, literal(p.initializer)]));
  }
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) return -literal(node.operand);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  throw new Error('Not a static literal: ' + node.getText().slice(0, 80));
}
function variables(file, names) {
  const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const found = {};
  function visit(n) {
    if (ts.isVariableDeclaration(n) && names.includes(n.name.text)) found[n.name.text] = literal(n.initializer);
    ts.forEachChild(n, visit);
  }
  visit(ast);
  for (const name of names) if (!(name in found)) throw new Error('Missing ' + name);
  return found;
}
const data = {
  ...variables('src/i18n.ts', ['ko', 'en']),
  ...variables('src/game/core/cityKinds.ts', ['CITY_KINDS']),
  ...variables('src/game/victory/creditsSystem.ts', ['credits'])
};
fs.writeFileSync(path.join(out, 'content-source.json'), JSON.stringify(data, null, 2) + '\n');
function safe(s) { return String(s).replaceAll('|', '&#124;').replaceAll('\n', '<br>'); }
const rows = ['# 한국어 영어 문구 대조표', '', '2026-09-22 / 소스 c7533e4 / 정적 문자열 추출. 번역 일치 및 내용정보 검토용이며 공식 설문 답안이 아닙니다.', '',
  '범위: src/i18n.ts의 한국어·영어 사전 전체, 도시 이름·설명, 엔딩 크레딧. 다른 파일의 하드코딩 UI 문자열까지 전부 수집했다고 주장하지 않습니다.', '',
  '| 키 | 한국어 | 영어 |', '|---|---|---|'];
for (const key of new Set([...Object.keys(data.ko), ...Object.keys(data.en)])) rows.push(`| ${key} | ${safe(data.ko[key] ?? '')} | ${safe(data.en[key] ?? '')} |`);
rows.push('', '## 오늘의 도시', '', '| 종류 | 한국어 | 영어 |', '|---|---|---|');
for (const c of data.CITY_KINDS) rows.push(`| ${c.key} | ${safe(c.label.ko)} / ${safe(c.note.ko)} | ${safe(c.label.en)} / ${safe(c.note.en)} |`);
rows.push('', '## 크레딧 원문', '', '```text', data.credits.join('\n'), '```', '');
fs.writeFileSync(path.join(out, '한국어-영어-문구-대조표.md'), rows.join('\n'));
console.log(JSON.stringify({ koKeys: Object.keys(data.ko).length, enKeys: Object.keys(data.en).length, cityKinds: data.CITY_KINDS.length }));
