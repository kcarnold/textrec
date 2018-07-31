#!/usr/bin/env python

import time
import datetime
import glob
import zlib
import json
import random

from tornado import websocket, ioloop, queues

oldest_timestamp = datetime.datetime(2018, 6, 1).timestamp()
lines = (json.loads(line.strip()) for logfile in glob.glob('logs/*.jsonl') for line in open(logfile))
requests = [
    line['request'] for line in lines
    if line['type'] == 'rpc' and line.get('pyTimestamp', 0) > oldest_timestamp]
requests.sort(key=lambda x: x['timestamp'])
random.Random(0).shuffle(requests)
    # (
    # x['rpc']['request_id'],
    # x['rpc']['sofar'],
    # ''.join([ent['letter'] for ent in x['rpc']['cur_word']])))
print(len(requests), 'requests')
requests = requests[:1000]#[-10:]

with open(f'requests', 'w') as f:
    f.write('\n'.join(json.dumps(request) for request in requests))

ws_url = "ws://localhost:5000/ws"
concurrency = 10

class ZWSConnection:
    def __init__(self):
        self.connection = None
        self.inflater = self.deflater = None

    async def connect(self, ws_url):
        self.connection = await websocket.websocket_connect(ws_url)
        self.inflater = zlib.decompressobj()
        self.deflater = zlib.compressobj()

    def send_json(self, **kw):
        message = json.dumps(kw)
        message = self.deflater.compress(message.encode('utf-8'))
        message += self.deflater.flush(zlib.Z_SYNC_FLUSH)
        return self.connection.write_message(message.decode('latin1'))

    async def read_message(self):
        zreply = await self.connection.read_message()
        if zreply is None:
            print("CONNECTION CLOSED?!")
            return
        reply = self.inflater.decompress(zreply.encode('latin1'))
        reply += self.inflater.flush()
        return json.loads(reply.decode('utf-8'))




async def main():
    q = queues.Queue()

    for i, request in enumerate(requests):
        q.put((i, request))
    # print(q._unfinished_tasks)
    start = time.time()

    results = []

    async def worker():
        conn = ZWSConnection()
        await conn.connect(ws_url)
        await conn.send_json(
            type='init',
            kind='p',
            participantId="demobench")
        print(await conn.read_message())

        async for i, request in q:
            # print('consumer', q._unfinished_tasks)
            try:
                # Send a request
                request = dict(request)
                await conn.send_json(**request)

                # Get the response.
                reply = await conn.read_message()
                # print(reply)
                results.append((i, reply['result']))
            finally:
                q.task_done()

    # Start workers, then wait for the work queue to be empty.
    for _ in range(concurrency):
        ioloop.IOLoop.current().spawn_callback(worker)
    await q.join()
    # print('joined', q._unfinished_tasks)

    print('Done in %.2f seconds' % (
        time.time() - start))
    with open(f'results_{concurrency}', 'w') as f:
        for i, result in sorted(results):
            json.dump(result, f)
            f.write('\n')



if __name__ == '__main__':
    io_loop = ioloop.IOLoop.current()
    io_loop.run_sync(main)
