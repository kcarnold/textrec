import {analyzeLog} from './src/Analyzer.js';
var fs = require('fs');

console.log = console.warn;
global.alert = () => {};

let skip = true;
let files = [];
process.argv.forEach((filename) => {
  if (filename === '--') {
    skip = false;
    return;
  }
  if (skip) {
    return;
  }
  files.push(filename);
});

Promise.all(files.map(filename => {
  let logRaw = fs.readFileSync(filename, 'utf-8');
  let log = (
    logRaw
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line)));
  return analyzeLog(log).then(
    result => ({filename, result}),
    error => ({filename, error}),
  );
})).then(results => {
  results.forEach(result => {process.stdout.write(JSON.stringify(result) + '\n')});
});
