"""Private length-framed stdin bridge; stdout is reserved for NDJSON events."""
import json
import sys
import threading
from python_core import Engine, FRAME_BYTES, aggregate

output_lock = threading.Lock()

def send(data):
    with output_lock:
        sys.stdout.write(json.dumps(data, allow_nan=False, separators=(',', ':')) + '\n')
        sys.stdout.flush()


def main():
    engine = None
    try:
        while header := sys.stdin.buffer.readline(16_000_000):
            message = json.loads(header)
            kind = message['type']
            if kind == 'init':
                if engine is not None:
                    raise ValueError('Duplicate initialization')
                engine = Engine(message['model'], message['sha256'], message['policy'], message['capabilities'])
                send(dict(type='ready'))
            elif kind == 'infer':
                length = message['length']
                if not isinstance(length, int) or not 0 < length <= 48*FRAME_BYTES or length % FRAME_BYTES:
                    raise ValueError('Invalid frame payload')
                payload = sys.stdin.buffer.read(length)
                if len(payload) != length:
                    raise ValueError('Truncated frame payload')
                job_id = message['id']
                def progress(current, total, job_id=job_id):
                    send(dict(id=job_id, type='progress', current=current, total=total))
                def finished(future, job_id=job_id, exclusions=message.get('excludedTags')):
                    try:
                        result = future.result()
                        result['analysis'] = aggregate(result['scores'], engine.policy, excluded_tags=exclusions)
                        send(dict(id=job_id, result=result))
                    except Exception as error:
                        key = str(error)
                        send(dict(id=job_id, error=key if key.startswith('error.') or key == 'analysis.cancelled' else 'error.nativeInference'))
                try:
                    future = engine.submit(job_id, payload, message['parallelism'], progress)
                    future.add_done_callback(finished)
                except ValueError as error:
                    send(dict(id=job_id, error=str(error)))
            elif kind == 'cancel':
                engine.cancel(message['id'])
            elif kind == 'shutdown':
                break
            else:
                raise ValueError('Invalid command')
    finally:
        if engine:
            engine.stop()

if __name__ == '__main__':
    main()
