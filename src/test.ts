import test from 'ava';
import * as OTEL from '@opentelemetry/api';
import { Channel } from './channel.ts';
import { LogEvent, type LogEventTarget } from './log-events.ts';
import { Level, envlevels, prompt } from './presets.ts';
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

test('presets.prompt includes channel, level and message', (t) => {
    const result = prompt('hello', 'Chan', Level.info, false);

    t.true(result.startsWith('['));
    t.true(result.includes('Chan'));
    t.true(result.includes('info'));
    t.true(result.includes('hello'));
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

test('Stage.forked creates threads with increasing ids', (t) => {
    const [a, masterA] = Stage.forked('a');
    const [b, masterB] = Stage.forked('b');

    t.is(masterA, undefined);
    t.is(masterB, undefined);
    t.is(a.name, 'a');
    t.is(b.name, 'b');
    t.true(b.threadId > a.threadId);
});

test('Stage.fork returns Stage.Promise and exposes spawned thread', async (t) => {
    const listeners: Stage.Thread[] = [];
    const p = Stage.fork(
        'job',
        async () => 'ok',
        (slave, master) => {
            t.is(master, undefined);
            listeners.push(slave);
        },
    );

    t.true(p instanceof Stage.Promise);
    t.is(p.thread.name, 'job');
    t.is(await p, 'ok');
    t.is(listeners.length, 1);
    t.is(listeners[0], p.thread);
});

test('Stage.forked and Stage.joined inherit current master thread', async (t) => {
    let seenForkMaster: Stage.Thread | undefined;
    let seenJoinMaster: Stage.Thread | undefined;
    let outerThread: Stage.Thread | undefined;

    await Stage.fork(
        'outer',
        async () => {
            const [child, forkMaster] = Stage.forked('child');
            const [, joinMaster] = Stage.joined(child);
            seenForkMaster = forkMaster;
            seenJoinMaster = joinMaster;
            return 1;
        },
        (slave) => {
            outerThread = slave;
        },
    );

    t.truthy(outerThread);
    t.is(seenForkMaster, outerThread);
    t.is(seenJoinMaster, outerThread);
});

test('Stage.join resolves original value and runs listener on finally', async (t) => {
    const order: string[] = [];
    let seenSlave: Stage.Thread | undefined;
    let seenMaster: Stage.Thread | undefined;

    const p = Stage.fork(
        'join-job',
        async () => {
            order.push('run');
            return 7;
        },
        () => {
            order.push('fork');
        },
    );
    const result = await Stage.join(p, (slave, master) => {
        order.push('join');
        seenSlave = slave;
        seenMaster = master;
    });

    t.is(result, 7);
    t.deepEqual(order, ['fork', 'run', 'join']);
    t.is(seenSlave, p.thread);
    t.is(seenMaster, undefined);
});

test('Stage.sync composes fork and join listeners', async (t) => {
    const marks: string[] = [];
    const result = await Stage.sync(
        'sync-job',
        async () => {
            marks.push('run');
            return 'done';
        },
        (slave, master) => {
            marks.push(`fork:${slave.name}:${master ? master.name : 'none'}`);
        },
        (slave, master) => {
            marks.push(`join:${slave.name}:${master ? master.name : 'none'}`);
        },
    );

    t.is(result, 'done');
    t.deepEqual(marks, [
        'fork:sync-job:none',
        'run',
        'join:sync-job:none',
    ]);
});
