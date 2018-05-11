function getApp(config) {
  if (config === "sum") {
    // Configure for summarization.
    return require("./SumTask");
  } else if (config === "cap") {
    return require("./CapTask");
  } else if (config === "xs") {
    return require("./TranscribeTask");
  }
}

export default getApp;
