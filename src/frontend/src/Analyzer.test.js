import Promise from "bluebird";
import { readLogFile } from "./testUtil.js";
import { analyzeLog } from "./Analyzer.js";


const participantIds = [
  "26f62q",
];
let logData = null;
let analyzed = null;

beforeAll(async () => {
  let logs = await Promise.map(participantIds, readLogFile);
  console.log(`Loaded ${logs.length} logs.`);
  logData = logs;
  analyzed = await Promise.map(logData, async ([participantId, log]) => [
    participantId,
    await analyzeLog(log),
  ]);
});

it("includes the overall fields we expect", () => {
  analyzed.forEach(([participantId, analysis]) => {
    expect(analysis.byExpPage).toBeDefined();
    expect(analysis.screenTimes).toEqual(expect.any(Array));
    analysis.screenTimes.forEach(obj => {
      expect(obj).toMatchObject({
        num: expect.any(Number),
        name: expect.any(String),
        timestamp: expect.any(Number),
      });
    });
    expect(analysis.allControlledInputs).toEqual(expect.any(Object));
  });
});

function expectNotToContainAttnCheck(recset) {
  recset.predictions.concat(recset.synonyms).forEach(rec => {
    (rec.words || [rec.word]).forEach(word => {
      expect(word).not.toMatch(/æ/);
    });
  });
}

it("extracts what suggestions were displayed", () => {
  analyzed.forEach(([participantId, result]) => {
    let page = result.byExpPage["final-0-0"];
    expect(page.displayedSuggs.length).toBeGreaterThan(0);
    page.displayedSuggs.forEach(suggEntry => {
      expect(suggEntry).toMatchObject({
        contextTimestamp: expect.any(Number),
        sofar: expect.any(String),
        cur_word: expect.any(Array),
        context: expect.any(String),
        // recs: expect.anything(),
        recsTimestamp: expect.any(Number),
        latency: expect.any(Number),
        action: expect.objectContaining({ type: expect.any(String) }),
      });
    });
    page.displayedSuggs.forEach(({ recs, action }) => {
      if ((action || {}).type === "tapSuggestion")
        expectNotToContainAttnCheck(recs);
    });
  });
});

it("extracts final text", () => {
  analyzed.forEach(([participantId, result]) => {
    let page = result.byExpPage["final-0-0"];
    expect(page.finalText).toEqual(expect.any(String));
    expect(page.finalText.length).toBeGreaterThan(0);
  });
});

it("includes all actions", () => {
  analyzed.forEach(([participantId, result]) => {
    let page = result.byExpPage["final-0-0"];
    expect(page.actions.length).toBeGreaterThan(0);
    page.actions.forEach(action => {
      expect(action).toMatchObject({
        timestamp: expect.any(Number),
        type: expect.any(String),
        curText: expect.any(String),
      });
    });
    expect(page.secsOnPage).toBeGreaterThan(0);
    expect(page.lastEventTimestamp - page.firstEventTimestamp).toBeGreaterThan(
      0
    );
  });
});

it("annotates the final text by the actions that entered it", () => {
  analyzed.forEach(([participantId, result]) => {
    let page = result.byExpPage["final-0-0"];
    expect(page.chunks).toEqual(expect.any(Array));
    let finalText = "";
    page.chunks.forEach(chunk => {
      expect(chunk).toMatchObject({
        timestamp: expect.any(Number),
        actionClass: expect.any(String),
        chars: expect.any(String),
        action: expect.objectContaining({ type: expect.any(String) }),
      });
      if (chunk.action.type === "tapSuggestion") {
        expect(chunk.action.annoType).toMatch(/^tapSugg/);
        expect(chunk.action.sugInserted).toMatch(/^(([\w']*)|[,!.?])$/);
      }
      finalText += chunk.chars;
    });
    expect(finalText).toEqual(page.finalText);
  });
});
