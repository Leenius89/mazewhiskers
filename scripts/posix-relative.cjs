// Preload for `ait build` on Windows: the packer names bundle entries with
// path.relative, which answers with backslashes there. Toss's servers expect
// "static/js/main.js", so make it answer with forward slashes.
//   NODE_OPTIONS="--require ./scripts/posix-relative.cjs" npx ait build
const path = require('path');
const relative = path.relative;
path.relative = (...args) => relative(...args).split(path.sep).join('/');
require('module').syncBuiltinESMExports();
