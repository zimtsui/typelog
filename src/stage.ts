import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage<Thread>();
let count = 0;


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

export interface Thread {
    name: string;
    threadId: number;
}

export function fork<T>(
    name: string,
    fn: () => globalThis.Promise<T>,
    listener: (slave: Thread, master?: Thread) => void,
): Promise<T> {
    const [slave, master] = forked(name);
    listener(slave, master);
    return Promise.transform(als.run(slave, fn), slave);
}
export function forked(name: string): [slave: Thread, master?: Thread] {
    const slave: Thread = {
        name,
        threadId: ++count,
    };
    const master = als.getStore();
    return [slave, master];
}

export function join<T>(
    promise: Promise<T>,
    listener: (slave: Thread, master?: Thread) => void,
): globalThis.Promise<T> {
    const [slave, master] = joined(promise.thread);
    return promise.finally(() => listener(slave, master));
}
export function joined(slave: Thread): [slave: Thread, master?: Thread] {
    const master = als.getStore();
    return [slave, master];
}

export function sync<T>(
    name: string,
    fn: () => globalThis.Promise<T>,
    forkListener: (slave: Thread, master?: Thread) => void,
    joinListener: (slave: Thread, master?: Thread) => void,
): globalThis.Promise<T> {
    return join(fork(name, fn, forkListener), joinListener);
}

export function getThread(): Thread | undefined {
    return als.getStore();
}
