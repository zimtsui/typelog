import { AsyncLocalStorage } from 'node:async_hooks';

const map = new WeakMap<Error, string[]>();

export function prepend(e: Error, name: string): void {
    const stack = map.get(e) ?? [];
    map.set(e, [name, ...stack]);
}

export function read(e: Error): string[] {
    return map.get(e) ?? [];
}

const stack = new AsyncLocalStorage<string[]>();

export function run<T>(f: () => T, name: string): T {
    return stack.run([...now(), name], f);
}

export function now(): string[] {
    return stack.getStore() ?? [];
}
