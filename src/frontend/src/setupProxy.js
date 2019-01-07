/** @format */
const proxy = require("http-proxy-middleware");

module.exports = function(app) {
  app.use(
    proxy("/ws", {
      target: "ws://localhost:5000/",
      ws: true,
    })
  );
  app.use(
    proxy("/ping", {
      target: "ws://localhost:5000/",
      ws: true,
    })
  );
  app.use(
    proxy("/login", {
      target: "ws://localhost:5000/",
    })
  );
};
