/** @format */
import * as TouchAnalyzer from "./src/TouchAnalyzer.js";
import * as CueAnalyzer from "./src/CueAnalyzer.js";
var fs = require("fs");

console.log = console.warn;
global.alert = () => {};

let skip = true;
let files = [];
process.argv.forEach(filename => {
  if (filename === "--") {
    skip = false;
    return;
  }
  if (skip) {
    return;
  }
  files.push(filename);
});

Promise.all(
  files.map(filename => {
    let logRaw = fs.readFileSync(filename, "utf-8");
    let log = logRaw
      .split("\n")
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line));
    return TouchAnalyzer.analyzeLog(log).then(
      result => ({ filename, result }),
      // Magic: https://stackoverflow.com/a/26199752/69707
      error => ({
        filename,
        error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      })
    );
  })
).then(results => {
  results.forEach(result => {
    process.stdout.write(JSON.stringify(result) + "\n");
  });
});
