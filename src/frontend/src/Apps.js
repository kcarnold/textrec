/**
 * @format
 */
import { MasterView as MasterViewFactory } from "./MasterView";

function getAppInt(config) {
  if (config === "gcap") {
    return require("./GatedCapTask");
  }
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
