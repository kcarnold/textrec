/**
 * @format
 */
import * as React from "react";

import { MasterView as MasterViewFactory } from "./MasterView";

function getAppInt(config) {
  // if (config === "gcap") {
  //   return require("./GatedCapTask");
  // }
  // if (config === "cue") {
  //   return require("./CueTasks");
  // }
  if (config === "idea") {
    return require("./BrainstormTask");
  }
  if (config === "act") {
    return require("./ActionableTask");
  }
}

function getApp(config) {
  let app = getAppInt(config);
  let screenToView =
    app.screenToView || (screenDesc => React.createElement(screenDesc.view));
  app.MasterView = MasterViewFactory(screenToView);
  return app;
}

export default getApp;
