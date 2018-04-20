import mean from "lodash/mean";

export function doPing(url, times, callback) {
  let rtts = [];
  let lastSendTime = null;
  let ws = new WebSocket(url);
  const sendPing = () => {
    lastSendTime = +new Date();
    ws.send(`ping`);
  };

  ws.onopen = () => {
    setTimeout(sendPing, 50);
  };

  ws.onmessage = msg => {
    rtts.push(+new Date() - lastSendTime);
    if (rtts.length === times) {
      callback({ rtts, mean: mean(rtts) });
    } else {
      sendPing();
    }
  };
}
