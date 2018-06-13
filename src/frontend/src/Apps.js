import { MasterView as MasterViewFactory } from "./MasterView";

function getAppInt(config) {

  // if (config === "sum") {
  //   return require("./SumTask");
  // }
  // if (config === "cap") {
  //   return require("./CapTask");
  // }
  if (config === "gcap") {
    return require("./GatedCapTask");
  }
  // if (config === "xs") {
  //   return require("./TranscribeTask");
  // }
}

function getApp(config) {
  let app = getAppInt(config);
  app.MasterView = MasterViewFactory(app.screenToView);
  return app;
}

export default getApp;
