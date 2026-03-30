const map = new WeakMap<Error, string[]>();

export function append(e: Error, name: string): void {
    const stack = map.get(e) ?? [];
    map.set(e, [...stack, name]);
}

export function read(e: Error): string[] {
    return map.get(e) ?? [];
}
