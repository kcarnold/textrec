/**
 * @format
 */
import { MasterView as MasterViewFactory } from "./MasterView";

function getAppInt(config) {
  // if (config === "cap") {
  //   return require("./CapTask");
  // }
  if (config === "gcap") {
    return require("./GatedCapTask");
  }
  // if (config === "gx") {
  //   return require("./GatedTranscribeTask");
  // }
  if (config === "cue") {
    return require("./CueTasks");
  }
}

function getApp(config) {
  let app = getAppInt(config);
  app.MasterView = MasterViewFactory(app.screenToView);
  return app;
}

export default getApp;
