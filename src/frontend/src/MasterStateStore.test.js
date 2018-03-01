import Promise from "bluebird";
import { MasterStateStore } from "./MasterStateStore";
import { readLogFile } from './testUtil.js';

const participantIds = ["smoke0"];
let logData = {};

beforeAll(() => {
  return Promise.map(participantIds, readLogFile)
    .then(logs => {
      console.log(`Loaded ${logs.length} logs.`);
      logData = logs;
    })
    .catch(err => console.error(err));
});

it("creates state without crashing", () => {
  logData.forEach(([participantId, log]) => {
    var state = new MasterStateStore(participantId);
    log.forEach(entry => state.handleEvent(entry));
  });
});
