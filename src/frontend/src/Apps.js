function getApp(config) {
  if (config === "sum") {
    // Configure for summarization.
    return require("./SumTask");
  } else if (config === "cap") {
    return require("./CapTask");
  }
}

export default getApp;
