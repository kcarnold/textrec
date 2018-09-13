/**
 * @format
 */
import { MasterView as MasterViewFactory } from "./MasterView";

function getAppInt(config) {
  if (config === "cap") {
    return require("./CapTask");
  }
  if (config === "gcap") {
    return require("./GatedCapTask");
  }
  if (config === "gx") {
    return require("./GatedTranscribeTask");
  }
  if (config === "dc") {
    return require("./DesktopCapTask");
  }
}

function getApp(config) {
  let app = getAppInt(config);
  app.MasterView = MasterViewFactory(app.screenToView);
  return app;
}

export default getApp;
