Client-Server Protocol
----

## Setup and Participant ID allocation

* An experiment starts with a participant opening a URL like `http://server/?new/b=gc1`. The server unconditionally returns the complete create-react-app application to the client, which then dispatches based on the query string. Here, `b` is short for `batch`; we abbreviate here because participants may need to actually type this link on their mobile devices.
* Upon seeing `new`, it makes an HTTP POST to `/login` on the same origin, with the query parameters it was passed, re-encoded to JSON, with the Javascript timestamp also. For example, the above would result in a POST of `{"b": "gc1", "jsTimestamp": 9999999}`.
* The server allocates a condition in the provided batch according to its counterbalancing logic (described elsewhere). It then allocates a participant ID by generating a 6-character string randomly chosen from the characters `23456789cfghjmpqrvwx` with replacement (this is the alphabet used for Google's Open Location Codes), ensuring that no logfile under that id already exists. It then records a single event to that participant's log-file: the "login event". As the result of the POST, it returns a JSON object: `{"participant_id": "participant id"}`.

Note that the Open Location Code letters cannot be used to make any of the special dispatch flags, such as `new`, `showall`, `demo`, and `panopt`.

A login event is:

```
{
    type: "login",
    batch: the provided batch code
    config: the app name to use, looked up based on the batch code
    platform_id: params.pop('p', None)
    jsTimestamp: the provided timestamp
}
```

* The client then redirects itself to `http://server/?{PARTICIPANT_ID}-p`, using the participant id provided by the login handler.
* Upon loading a URL wih a participant ID, the client opens a WebSocket connection to `ws://server/ws` and sends a "hello" message:

```
      {
        type: "init",
        participantId: clientId,
        kind: clientKind,
        browserMeta,
        git_rev: process.env.REACT_APP_GIT_REV,
        messageCount: messageCount,
      },
```

`messageCount` starts at 0. Upon receiving such a message, the server replies with any log entries that the client doesn't already have. With messageCount at 0, that log starts with the login event.

Upon receiving a backlog with a login event, the client boots up the corresponding app.


# Demo handling

A "demo" client works the same way as a normal participant, except that its participant ID encodes the app name and condition: `demo-gcap-

# Compression

Log messages and requests are often verbose, but redundant. So we rely on compression to keep the network traffic reasonable. Ideally, all client browsers would support the `permessage-deflate` extension, but some still don't (apparently including MS Edge, even as of early 2018 -- https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/17731831-support-for-websockets-compression-using-permessag). So we compress all websocket traffic ourselves using basically the same approach as `permessage-deflate`: zlib, with a separate buffer for each direction, flushing after each message. On the server, we use the builtin Python `zlib` module. On the client, we use `pako`.

TODO: We should bypass compression if the connection is already compressed.

# Logging

All client-side events are sent to the server through the master WebSocket. The server logs these events to the participant's log file.

We would like it if, at any moment, the sequence of events in the logfile exactly matched the sequence of events that have been handled on the client. But since it takes time to send stuff over the network (alas), and the network is unreliable, we can't have that. What we can have (the Network Invariant):

    The sequence of messages logged on the server is a prefix of the sequence of messages handled on the client.

TODO: The current implementation assumes that a message is logged on the server once it's added to the socket's output buffer. Bad assumption.
