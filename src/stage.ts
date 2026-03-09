import { AsyncLocalStorage } from 'node:async_hooks';

interface Context {
    thread: Thread;
}
const als = new AsyncLocalStorage<Context>();
let count = 0;

export interface Thread {
    name: string;
    threadId: number;
    master: Thread | null;
    slaves: Set<Thread>;
    running: boolean;
}
const rootThread: Thread = {
    name: 'root',
    threadId: ++count,
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
    listener?: (slave: Thread) => void,
): Thread {
    const master = getThread();
    const slave: Thread = {
        name,
        threadId: ++count,
        master,
        slaves: new Set<Thread>(),
        running: false,
    };
    master.slaves.add(slave);
    listener?.(slave);
    return slave;
}
export function fork<T>(
    name: string,
    fn: () => globalThis.Promise<T>,
    listener?: (slave: Thread) => void,
): Promise<T> {
    const slave = forkSync(name, listener);
    slave.running = true;
    return Promise.transform(
        als.run({ thread: slave }, fn)
            .finally(() => void (slave.running = false)),
        slave,
    );
}


export function switchThread(thread: Thread): Thread {
    if (thread.running) throw new Error(`Thread ${thread.name} is already occupied.`);
    const current = getThread();
    current.running = false;
    setThread(thread);
    thread.running = true;
    return current;
}

export function joinSync(
    slave: Thread,
    listener?: (slave: Thread) => void,
): void {
    if (slave.slaves.size) throw new Error(`Thread ${slave.name} has its own slave threads.`);
    if (slave.running) throw new Error(`Thread ${slave.name} is still running.`);
    const master = getThread();
    if (slave.master !== master) throw new Error(`Thread ${slave.name} is not a slave of the current thread ${master.name}.`);
    listener?.(slave);
    master.slaves.delete(slave);
}
export function join<T>(
    promise: Promise<T>,
    listener?: (slave: Thread) => void,
): globalThis.Promise<T> {
    return promise.finally(() => joinSync(promise.thread, listener));
}

export function forkjoin<T>(
    name: string,
    fn: () => globalThis.Promise<T>,
    forkListener?: (slave: Thread) => void,
    joinListener?: (slave: Thread) => void,
): globalThis.Promise<T> {
    return join(fork(name, fn, forkListener), joinListener);
}
