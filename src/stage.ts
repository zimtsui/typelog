import { AsyncLocalStorage } from 'node:async_hooks';

interface Context {
    thread: Thread;
}
const als = new AsyncLocalStorage<Context>();
let count = 0;

export interface Thread {
    name: string;
    id: number;
    master: Thread | null;
    slaves: Set<Thread>;
    running: boolean;
}
const rootThread: Thread = {
    name: 'root',
    id: ++count,
    master: null,
    slaves: new Set<Thread>(),
    running: true,
}
const rootContext: Context = {
    thread: rootThread,
}

function getContext(): Context {
    return als.getStore() ?? rootContext;
}
export function getThread(): Thread {
    return getContext().thread;
}
function setThread(thread: Thread): void {
    const context = getContext();
    context.thread = thread;
}


export class Promise<T> extends globalThis.Promise<T> {
    protected constructor(
        executor: ConstructorParameters<typeof globalThis.Promise<T>>[0],
        public thread: Thread,
    ) {
        super(executor);
    }

    public static transform<T>(promise: globalThis.Promise<T>, thread: Thread): Promise<T> {
        return new Promise<T>((resolve, reject) => promise.then(resolve, reject), thread);
    }
}


export function forkSync(
    name: string,
    forked: (slave: Thread) => void,
): Thread {
    const master = getThread();
    const slave: Thread = {
        name,
        id: ++count,
        master,
        slaves: new Set<Thread>(),
        running: false,
    };
    master.slaves.add(slave);
    forked(slave);
    return slave;
}
export function fork<T>(
    name: string,
    fn: () => globalThis.Promise<T>,
    forked: (slave: Thread) => void,
): Promise<T> {
    const slave = forkSync(name, forked);
    slave.running = true;
    return Promise.transform(
        als.run({ thread: slave }, async () => await fn())
            .finally(() => void (slave.running = false)),
        slave,
    );
}


export function sw1tch(thread: Thread): void {
    if (thread.running) throw new Error(`Thread ${thread.name} is already occupied.`);
    const current = getThread();
    current.running = false;
    setThread(thread);
    thread.running = true;
}

export function joinSync(
    slave: Thread,
    joined: (slave: Thread, e?: unknown) => void,
    e?: unknown,
): void {
    if (slave.slaves.size) throw new Error(`Thread ${slave.name} has its own slave threads.`);
    if (slave.running) throw new Error(`Thread ${slave.name} is still running.`);
    const master = getThread();
    if (!master.slaves.has(slave)) throw new Error(`Thread ${slave.name} is not a slave of the current thread ${master.name}.`);
    joined(slave, e);
    master.slaves.delete(slave);
}
export async function join<T>(
    promise: Promise<T>,
    joined: (slave: Thread, e?: unknown) => void,
): globalThis.Promise<T> {
    return promise.finally(() => joinSync(promise.thread, joined));
}

export function forkjoin<T>(
    name: string,
    fn: () => globalThis.Promise<T>,
    forked: (slave: Thread) => void,
    joined: (slave: Thread, e?: unknown) => void,
): globalThis.Promise<T> {
    return join(fork(name, fn, forked), joined);
}
