// Prints the studio's quotes for the cases on stdin, so tests/run.php can compare them with the server's.
const P = require('../public_html/js/pricing.js');
const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(cases.map((c) => P.quote(c))));
