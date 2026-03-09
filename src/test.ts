import test from 'ava';
import * as OTEL from '@opentelemetry/api';
import { formatWithOptions } from 'node:util';
import { stderr } from 'node:process';
import { Channel } from './channel.ts';
import * as Fallback from './fallback.ts';
import { LogEvent, type LogEventTarget } from './log-events.ts';
import { Level, envlevels } from './presets.ts';
import * as Stage from './stage.ts';
import { Tracer } from './tracer.ts';

test('Channel.create forwards message and level', (t) => {
    enum LevelLocal {
        trace,
        info,
    }
    const seen: Array<[string, LevelLocal]> = [];
    const channel = Channel.create<typeof LevelLocal, string>(
        LevelLocal,
        (message, level) => {
            seen.push([message, level]);
        },
    );

    channel.trace('hello');
    channel.info('world');

    t.deepEqual(seen, [
        ['hello', LevelLocal.trace],
        ['world', LevelLocal.info],
    ]);
});

test('Channel.create throws on unknown level access', (t) => {
    enum LevelLocal {
        trace,
        info,
    }
    const channel = Channel.create<typeof LevelLocal, string>(LevelLocal, () => {});

    t.throws(() => (channel as any).oops('x'), { instanceOf: Error });
});

test('Channel.attach dispatches LogEvent with level and detail', (t) => {
    type MyMap = {
        log: [typeof Level, number];
    };
    const eventTarget = new EventTarget() as LogEventTarget<MyMap>;
    const channel = Channel.attach(eventTarget, 'log', Level);

    let received: LogEvent<'log', typeof Level, number> | undefined;
    eventTarget.addEventListener('log', (evt) => {
        received = evt;
    });

    channel.warn(42);

    t.truthy(received);
    t.is(received?.type, 'log');
    t.is(received?.level, Level.warn);
    t.is(received?.detail, 42);
});

test('LogEvent stores type, level and detail', (t) => {
    const payload = { value: 123 };
    const evt = new LogEvent('evt', Level.info, payload);

    t.is(evt.type, 'evt');
    t.is(evt.level, Level.info);
    t.deepEqual(evt.detail, payload);
});

test('presets.envlevels maps environments to expected levels', (t) => {
    t.is(envlevels.debug, Level.trace);
    t.is(envlevels.development, Level.debug);
    t.is(envlevels.production, Level.warn);
});

test('fallback.exporter defaults to Exporter.defau1t', (t) => {
    t.is(Fallback.exporter, Fallback.Exporter.defau1t);
});

test('fallback default stream writes formatted payload when level passes threshold', (t) => {
    const originalWrite = stderr.write;
    const writes: string[] = [];
    (stderr as any).write = (chunk: unknown) => {
        writes.push(String(chunk));
        return true;
    };
    t.teardown(() => {
        (stderr as any).write = originalWrite;
    });

    const payload = { answer: 42 };
    Fallback.Exporter.defau1t.stream({ scope: 'svc.auth', channel: 'main', payload, level: Level.info });

    t.is(writes.length, 1);
    t.is(writes[0], formatWithOptions({ depth: null, colors: !!stderr.isTTY }, payload));
});

test('fallback default stream skips output when level is below threshold', (t) => {
    const originalWrite = stderr.write;
    let writes = 0;
    (stderr as any).write = () => {
        writes += 1;
        return true;
    };
    t.teardown(() => {
        (stderr as any).write = originalWrite;
    });

    Fallback.Exporter.defau1t.stream({ scope: 'svc.auth', channel: 'main', payload: 'trace-data', level: Level.trace });

    t.is(writes, 0);
});

test('fallback default monolith writes scope and channel in header', (t) => {
    const originalWrite = stderr.write;
    const originalGetActiveSpan = OTEL.trace.getActiveSpan;
    const writes: string[] = [];
    (stderr as any).write = (chunk: unknown) => {
        writes.push(String(chunk));
        return true;
    };
    (OTEL.trace as any).getActiveSpan = () => undefined;
    t.teardown(() => {
        (stderr as any).write = originalWrite;
        (OTEL.trace as any).getActiveSpan = originalGetActiveSpan;
    });

    Fallback.Exporter.defau1t.monolith({
        scope: 'svc.billing',
        channel: 'orders',
        payload: { id: 7 },
        level: Level.info,
    });

    t.is(writes.length, 1);
    const output = writes[0];
    if (output === undefined) {
        t.fail('expected monolith output');
        return;
    }
    t.true(output.includes('svc.billing'));
    t.true(output.includes('orders'));
    t.true(output.includes('{ id: 7 }'));
});

test('Tracer.create forwards scope and version to OTEL.trace.getTracer', (t) => {
    const originalGetTracer = OTEL.trace.getTracer;
    t.teardown(() => {
        (OTEL.trace as any).getTracer = originalGetTracer;
    });

    const fakeTracer = {
        startActiveSpan: () => {
            throw new Error('not expected in this test');
        },
    };
    const calls: Array<[string, string | undefined]> = [];
    (OTEL.trace as any).getTracer = (scope: string, version?: string) => {
        calls.push([scope, version]);
        return fakeTracer;
    };

    Tracer.create('my-scope', '1.2.3');

    t.deepEqual(calls, [['my-scope', '1.2.3']]);
});

test('Tracer.activateSync returns result and ends span', (t) => {
    const originalGetTracer = OTEL.trace.getTracer;
    t.teardown(() => {
        (OTEL.trace as any).getTracer = originalGetTracer;
    });

    let spanEnded = 0;
    const span = {
        recordException: () => {},
        setStatus: () => {},
        end: () => {
            spanEnded += 1;
        },
    };
    const names: string[] = [];
    (OTEL.trace as any).getTracer = () => ({
        startActiveSpan: (name: string, fn: (span: any) => number) => {
            names.push(name);
            return fn(span);
        },
    });

    const tracer = Tracer.create('scope');
    const result = tracer.activateSync('sync-op', () => 42);

    t.is(result, 42);
    t.deepEqual(names, ['sync-op']);
    t.is(spanEnded, 1);
});

test('Tracer.activateSync records Error, sets status and rethrows', (t) => {
    const originalGetTracer = OTEL.trace.getTracer;
    t.teardown(() => {
        (OTEL.trace as any).getTracer = originalGetTracer;
    });

    const statuses: Array<{ code: OTEL.SpanStatusCode }> = [];
    const errors: Error[] = [];
    let spanEnded = 0;
    const span = {
        recordException: (error: Error) => {
            errors.push(error);
        },
        setStatus: (status: { code: OTEL.SpanStatusCode }) => {
            statuses.push(status);
        },
        end: () => {
            spanEnded += 1;
        },
    };
    (OTEL.trace as any).getTracer = () => ({
        startActiveSpan: (_name: string, fn: (span: any) => unknown) => fn(span),
    });

    const tracer = Tracer.create('scope');
    const boom = new Error('boom');
    const thrown = t.throws(() => tracer.activateSync('sync-op', () => {
        throw boom;
    }));

    t.is(thrown, boom);
    t.is(errors[0], boom);
    t.deepEqual(statuses, [{ code: OTEL.SpanStatusCode.ERROR }]);
    t.is(spanEnded, 1);
});

test('Tracer.activateAsync records Error, sets status and rethrows', async (t) => {
    const originalGetTracer = OTEL.trace.getTracer;
    t.teardown(() => {
        (OTEL.trace as any).getTracer = originalGetTracer;
    });

    const statuses: Array<{ code: OTEL.SpanStatusCode }> = [];
    const errors: Error[] = [];
    let spanEnded = 0;
    const span = {
        recordException: (error: Error) => {
            errors.push(error);
        },
        setStatus: (status: { code: OTEL.SpanStatusCode }) => {
            statuses.push(status);
        },
        end: () => {
            spanEnded += 1;
        },
    };
    (OTEL.trace as any).getTracer = () => ({
        startActiveSpan: (_name: string, fn: (span: any) => Promise<unknown>) => fn(span),
    });

    const tracer = Tracer.create('scope');
    const boom = new Error('boom-async');
    const thrown = await t.throwsAsync(async () => tracer.activateAsync('async-op', async () => {
        throw boom;
    }));

    t.is(thrown, boom);
    t.is(errors[0], boom);
    t.deepEqual(statuses, [{ code: OTEL.SpanStatusCode.ERROR }]);
    t.is(spanEnded, 1);
});

test('Tracer decorators use names and preserve this binding', async (t) => {
    const originalGetTracer = OTEL.trace.getTracer;
    t.teardown(() => {
        (OTEL.trace as any).getTracer = originalGetTracer;
    });

    const spanNames: string[] = [];
    const span = {
        recordException: () => {},
        setStatus: () => {},
        end: () => {},
    };
    (OTEL.trace as any).getTracer = () => ({
        startActiveSpan: (name: string, fn: (span: any) => unknown) => {
            spanNames.push(name);
            return fn(span);
        },
    });

    const tracer = Tracer.create('scope');
    class Demo {
        public constructor(private readonly base: number) {}
        @tracer.activeSync()
        public add(n: number) {
            return this.base + n;
        }
        @tracer.activeAsync('custom-async')
        public async addAsync(n: number) {
            return this.base + n;
        }
    }
    const demo = new Demo(10);

    t.is(demo.add(2), 12);
    t.is(await demo.addAsync(5), 15);
    t.deepEqual(spanNames, ['add', 'custom-async']);
});

test('Stage.getThread starts from a running root thread', (t) => {
    const root = Stage.getThread();

    t.is(root.name, 'root');
    t.is(root.master, null);
    t.true(root.running);
});

test('Stage.forkSync creates non-running slave under current thread', (t) => {
    const master = Stage.getThread();
    let seen: Stage.Thread | undefined;
    const slave = Stage.forkSync('sync-child', (thread) => {
        seen = thread;
    });

    t.is(seen, slave);
    t.is(slave.name, 'sync-child');
    t.is(slave.master, master);
    t.false(slave.running);
    t.true(master.slaves.has(slave));

    Stage.joinSync(slave);
    t.false(master.slaves.has(slave));
});

test('Stage.fork returns Stage.Promise and runs callback in spawned thread', async (t) => {
    const master = Stage.getThread();
    let inside: Stage.Thread | undefined;
    const p = Stage.fork('job', async () => {
        inside = Stage.getThread();
        return 'ok';
    });

    t.true(p instanceof Stage.Promise);
    t.is(p.thread.name, 'job');
    t.is(await p, 'ok');
    t.is(inside, p.thread);
    t.false(p.thread.running);

    await Stage.join(p);
    t.false(master.slaves.has(p.thread));
});

test('Stage.join resolves original value and detaches slave from master', async (t) => {
    const master = Stage.getThread();
    let seenSlave: Stage.Thread | undefined;

    const p = Stage.fork('join-job', async () => 7);
    const result = await Stage.join(p, (slave) => {
        seenSlave = slave;
    });

    t.is(result, 7);
    t.is(seenSlave, p.thread);
    t.false(master.slaves.has(p.thread));
});

test('Stage.switchThread swaps running states and rejects occupied target', (t) => {
    const current = Stage.getThread();
    t.throws(() => Stage.switchThread(current), { message: /already occupied/ });

    const slave = Stage.forkSync('switch-target');
    const previous = Stage.switchThread(slave);
    t.is(previous, current);
    t.is(Stage.getThread(), slave);
    t.true(slave.running);
    t.false(previous.running);

    Stage.switchThread(previous);
    Stage.joinSync(slave);
});

test('Stage.joinSync rejects joining from non-master thread', (t) => {
    const root = Stage.getThread();
    const a = Stage.forkSync('a');
    const b = Stage.forkSync('b');
    Stage.switchThread(b);

    t.throws(() => Stage.joinSync(a), { message: /not a slave of the current thread/ });

    Stage.switchThread(root);
    Stage.joinSync(b);
    Stage.joinSync(a);
});

test('Stage.joinSync rejects running slave thread', async (t) => {
    const p = Stage.fork('busy', async () => {
        await new globalThis.Promise<void>((resolve) => setTimeout(resolve, 20));
        return 1;
    });

    t.throws(() => Stage.joinSync(p.thread), { message: /still running/ });
    await p;
    await Stage.join(p);
});

test('Stage.fork clears running state when callback throws synchronously', async (t) => {
    const master = Stage.getThread();
    const boom = new Error('boom-sync');
    const p = Stage.fork('sync-throw', () => {
        throw boom;
    });

    const thrown = await t.throwsAsync(async () => await p);
    t.is(thrown, boom);
    t.false(p.thread.running);
    t.true(master.slaves.has(p.thread));

    const joinThrown = await t.throwsAsync(async () => await Stage.join(p));
    t.is(joinThrown, boom);
    t.false(master.slaves.has(p.thread));
});

test('Stage.joinSync rejects slave that still has child threads', (t) => {
    const root = Stage.getThread();
    const parent = Stage.forkSync('parent');
    Stage.switchThread(parent);
    const child = Stage.forkSync('child');
    Stage.switchThread(root);

    t.throws(() => Stage.joinSync(parent), { message: /has its own slave threads/ });

    Stage.switchThread(parent);
    Stage.joinSync(child);
    Stage.switchThread(root);
    Stage.joinSync(parent);
});

test('Stage.joinSync rejects repeated joins after detachment', (t) => {
    const slave = Stage.forkSync('once-only');
    Stage.joinSync(slave);

    t.throws(() => Stage.joinSync(slave), { message: /not a slave of the current thread/ });
});

test('Stage.forkjoin composes fork and join listeners', async (t) => {
    const marks: string[] = [];
    const result = await Stage.forkjoin(
        'forkjoin-job',
        async () => {
            marks.push('run');
            return 'done';
        },
        (slave) => {
            marks.push(`fork:${slave.name}`);
        },
        (slave) => {
            marks.push(`join:${slave.name}`);
        },
    );

    t.is(result, 'done');
    t.deepEqual(marks, [
        'fork:forkjoin-job',
        'run',
        'join:forkjoin-job',
    ]);
});
