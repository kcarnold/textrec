import re
import random
import json
import time
import os
import traceback
import io
import zlib
import logging

logger = logging.getLogger(__name__)

import tornado.ioloop
import tornado.gen
import tornado.options
import tornado.web
import tornado.websocket

from .paths import paths
from . import counterbalancing

import subprocess

def get_git_commit():
    return subprocess.check_output(['git', 'describe', '--always']).decode('ascii').strip()

from tornado.options import define, options

define("port", default=5000, help="run on the given port", type=int)

settings = dict(
    template_path=paths.ui,
    static_path=paths.ui / 'static',
    debug=True,
    )

server_settings = dict(
    address='127.0.0.1',
    xheaders=True)

from . import rec_generator

# Convert the normal generator function into a Tornado coroutine.
# We do this here to avoid tornado imports in the core rec_generator.
handle_request_async = tornado.gen.coroutine(rec_generator.handle_request_async)

if not os.path.isdir(paths.logdir):
    os.makedirs(paths.logdir)

from concurrent.futures import ProcessPoolExecutor
process_pool = ProcessPoolExecutor()

import tornado.autoreload
tornado.autoreload.add_reload_hook(process_pool.shutdown)


known_participants = {}


def get_log_file_name(participant_id):
    return os.path.join(paths.logdir, participant_id + '.jsonl')

class Participant:
    @classmethod
    def get_participant(cls, participant_id):
        if participant_id in known_participants:
            return known_participants[participant_id]
        participant = cls(participant_id)
        known_participants[participant_id] = participant
        return participant

    def __init__(self, participant_id):
        self.participant_id = participant_id
        self.connections = []

        self.log_file_name = get_log_file_name(self.participant_id)
        self.log_file = open(self.log_file_name, 'a+')
        self.log_file.seek(0, io.SEEK_END)

    def log(self, event):
        assert self.log_file is not None
        print(
            json.dumps(dict(event, pyTimestamp=time.time(), participant_id=self.participant_id)),
            file=self.log_file, flush=True)

    def get_log_entries(self):
        self.log_file.seek(0)
        log_entries = [json.loads(line) for line in self.log_file]
        self.log_file.seek(0, io.SEEK_END)
        return log_entries

    def broadcast(self, msg, exclude_conn):
        for conn in self.connections:
            if conn is not exclude_conn:
                conn.send_json(**msg)
        Panopticon.spy(msg)

    def connected(self, client):
        self.connections.append(client)
        logger.info(f"Connection opened: {self.participant_id}-{client.kind}")
        self.log(dict(kind='meta', type='connected', rev=get_git_commit()))

    def disconnected(self, client):
        self.connections.remove(client)
        logger.info(f"Connection closed: {self.participant_id}-{client.kind}")


class DemoParticipant:
    def __init__(self, participant_id):
        self.participant_id = participant_id
        self.config = participant_id[4:].split('-', 1)[0]

    def get_log_entries(self):
        return [dict(
            type='login',
            kind='p',
            participant_id=self.participant_id,
            config=self.config,
            assignment=0)]

    def log(self, event):
        logger.info(f"Demo event: {event['type']}")
    def broadcast(self, *a, **kw): return
    def connected(self, *a, **kw): return
    def disconnected(self, *a, **kw): return

class Panopticon:
    is_panopticon = True
    participant_id = 'panopt'
    connections = []

    @classmethod
    def spy(cls, msg):
        for conn in cls.connections:
            conn.send_json(**msg)

    def get_log_entries(self):
        entries = []
        for participant in known_participants.values():
            entries.extend(participant.get_log_entries())
        return entries

    def log(self, event): return
    def broadcast(self, *a, **kw): return
    def connected(self, client):
        Panopticon.connections.append(client)
    def disconnected(self, client):
        Panopticon.connections.remove(client)


def validate_participant_id(participant_id):
    return re.match(r'^[0-9a-zA-Z]+$', participant_id) is not None


class WebsocketHandler(tornado.websocket.WebSocketHandler):
    def get_compression_options(self):
        # Non-None enables compression with default options.
        return None

    def on_close(self):
        if self.participant is not None:
            self.participant.disconnected(self)

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.participant = None
        self.keyRects = {}
        self.wire_bytes_in = self.wire_bytes_out = 0
        self.message_bytes_in = self.msg_bytes_out = 0
        self.connection_id = str(time.time())
        # There will also be a 'kind', which gets set only when the client connects.

    def log(self, event):
        if event.get('type') == 'finalData':
            counterbalancing.mark_completed(self.participant.participant_id)
        self.participant.log(dict(event))

    def open(self):
        is_compressed = self.ws_connection._compressor is not None
        logger.info(f"Websocket opened (compressed={is_compressed}")
        self.inflater = zlib.decompressobj()
        self.deflater = zlib.compressobj()

    def send_json(self, **kw):
        message = json.dumps(kw)
        self.msg_bytes_out += len(message)
        message = self.deflater.compress(message.encode('utf-8'))
        message += self.deflater.flush(zlib.Z_SYNC_FLUSH)
        self.wire_bytes_out += len(message)
        self.write_message(message.decode('latin1'))

    @tornado.gen.coroutine
    def on_message(self, message):
        self.wire_bytes_in += len(message)
        message = self.inflater.decompress(message.encode('latin1'))
        message += self.inflater.flush()
        message = message.decode('utf-8')
        self.message_bytes_in += len(message)
        try:
            request = json.loads(message)
            if request['type'] == 'rpc':
                start = time.time()
                result = dict(type='reply', timestamp=request['timestamp'])
                try:
                    result['result'] = yield handle_request_async(process_pool, request['rpc'])
                except Exception:
                    traceback.print_exc()
                    request_as_string = json.dumps(request)
                    logger.error(f"Request failed: {request_as_string}", exc_info=1)
                    print("Failing request:", request_as_string)
                    result['result'] = None
                dur = time.time() - start
                result['dur'] = dur
                self.send_json(**result)
                self.log(dict(type="rpc", kind="meta", request=request))
                logger.info("Request complete: {participant_id} {type} in {dur:.2f}".format(
                    participant_id=getattr(self.participant, 'participant_id'),
                    type=request['type'], dur=dur))
            elif request['type'] == 'keyRects':
                self.keyRects[request['layer']] = request['keyRects']
            elif request['type'] == 'init':
                participant_id = request['participantId']
                self.kind = request['kind']
                if participant_id.startswith('demo') or participant_id.startswith('test'):
                    self.participant = DemoParticipant(participant_id)
                elif self.kind == 'panopt' and participant_id == '42':
                    self.participant = Panopticon()
                else:
                    validate_participant_id(participant_id)
                    self.participant = Participant.get_participant(participant_id)
                self.participant.connected(self)
                self.log(dict(kind='meta', type='init', request=request))
                messageCount = request.get('messageCount', {})
                logger.info(f"Client {participant_id}-{self.kind} connecting with messages {messageCount}")
                backlog = []
                cur_msg_idx = {}
                for entry in self.participant.get_log_entries():
                    kind = entry['kind']
                    if kind == 'meta':
                        continue
                    idx = cur_msg_idx.get(kind, 0)
                    if idx >= messageCount.get(kind, 0):
                        backlog.append(entry)
                    cur_msg_idx[kind] = idx + 1
                self.send_json(type='backlog', body=backlog)

            elif request['type'] == 'get_logs':
                assert self.participant.is_panopticon
                participant_id = request['participantId']
                validate_participant_id(participant_id)
                participant = Participant.get_participant(participant_id)
                self.send_json(type='logs', participant_id=participant_id, logs=participant.get_log_entries())

            elif request['type'] == 'get_analyzed':
                assert self.participant.is_panopticon
                participant_id = request['participantId']
                validate_participant_id(participant_id)
                from .analysis_util import get_log_analysis
                analysis = get_log_analysis(participant_id)
                self.send_json(type='analyzed', participant_id=participant_id, analysis=analysis)

            elif request['type'] == 'log':
                event = request['event']
                self.log(event)
                self.participant.broadcast(dict(type='otherEvent', event=event), exclude_conn=self)
            elif request['type'] == 'ping':
                pass
            else:
                print("Unknown request type:", request['type'])
            # print(', '.join('{}={}'.format(name, getattr(self.ws_connection, '_'+name)) for name in 'message_bytes_in message_bytes_out wire_bytes_in wire_bytes_out'.split()))
            # print('wire i={wire_bytes_in} o={wire_bytes_out}, msg i={message_bytes_in} o={msg_bytes_out}'.format(**self.__dict__))
        except Exception:
            traceback.print_exc()

    def check_origin(self, origin):
        """Allow any CORS access."""
        return True


class WSPingHandler(tornado.websocket.WebSocketHandler):
    def open(self):
        is_compressed = self.ws_connection._compressor is not None
        logger.debug("pinger open, compressed={is_compressed}")

    def on_message(self, message):
        self.write_message(message)

    def check_origin(self, origin):
        """Allow any CORS access."""
        return True


class MainHandler(tornado.web.RequestHandler):
    def head(self):
        self.finish()

    def get(self):
        self.render("index.html")

class LoginHandler(tornado.web.RequestHandler):
    def post(self):
        data = json.loads(self.request.body.decode('utf-8'))
        params = dict(data['params'])

        # Allocate a condition.
        batch = params.pop('b')
        counterbalancing_flags = counterbalancing.get_conditions_for_new_participant(batch)

        # Allocate a participant id.
        while True:
            participant_id = ''.join(random.choices('23456789cfghjmpqrvwx', k=6))
            if not os.path.exists(get_log_file_name(participant_id)):
                logger.info(f"Allocated {participant_id}, flags: {json.dumps(counterbalancing_flags)}")
                break

        # Login that participant.
        participant = Participant.get_participant(participant_id)
        login_event = dict(kind='p', type='login')
        login_event['batch'] = batch
        login_event['platform_id'] = params.pop('p', None)
        login_event['jsTimestamp'] = data['jsTimestamp']
        login_event.update(params)
        login_event.update(counterbalancing_flags)
        participant.log(login_event)

        # Return participant id.
        self.set_header('Content-Type', 'application/json')
        self.write(json.dumps(dict(participant_id=participant_id)))


class Application(tornado.web.Application):
    def __init__(self):
        handlers = [
            (r'/', MainHandler),
            (r"/ws", WebsocketHandler),
            (r"/login", LoginHandler),
            (r'/ping', WSPingHandler),
            (r"/(style\.css)", tornado.web.StaticFileHandler, dict(path=paths.ui)),
        ]
        tornado.web.Application.__init__(self, handlers, **settings)


def main():
    tornado.options.parse_command_line()
    app = Application()
    print('serving on', options.port)
    logger.info(f"Serving on port {options.port}")
    app.listen(options.port, **server_settings)
    tornado.ioloop.IOLoop.instance().start()

if __name__ == '__main__':
    main()
