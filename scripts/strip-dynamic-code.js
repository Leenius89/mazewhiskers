/**
 * Takes the last `new Function` out of the bundle, and refuses to pass a
 * build that still has one.
 *
 * Toss rejects a mini-app whose bundle contains `eval` or its relatives, and
 * the check is a text search: forum threads show builds bounced for an `eval`
 * inside a third-party library that was never called. Our source has none.
 * What is left is webpack's own runtime, which finds the global object with
 *
 *     if ("object" === typeof globalThis) return globalThis;
 *     try { return this || new Function("return this")() } catch ...
 *
 * On every system Toss supports (iOS 16, Android 7 with a current WebView)
 * the first line returns and the second is never reached, so replacing the
 * constructor call with `globalThis` changes nothing that runs — and removes
 * the one string a scanner would stop on.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'build', 'static', 'js');
const FALLBACK = 'new Function("return this")()';
const FORBIDDEN = [/new Function\s*\(/, /[^\w.$]eval\s*\(/, /[^\w.$]Function\s*\(\s*["'`]/];

let failed = false;

for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.js'))) {
    const file = path.join(dir, name);
    const before = fs.readFileSync(file, 'utf8');
    const after = before.split(FALLBACK).join('globalThis');

    if (after !== before) {
        fs.writeFileSync(file, after);
        console.log(`[strip] ${name}: removed ${before.split(FALLBACK).length - 1} global-object fallback(s)`);
    }

    for (const pattern of FORBIDDEN) {
        const hit = after.match(pattern);
        if (!hit) continue;

        failed = true;
        const at = after.indexOf(hit[0]);
        console.error(`[strip] ${name}: still contains ${pattern} near "${after.slice(Math.max(0, at - 60), at + 60)}"`);
    }
}

if (failed) {
    console.error('[strip] The bundle contains dynamic code evaluation. Toss will reject it.');
    process.exit(1);
}

console.log('[strip] bundle is free of eval and new Function');
