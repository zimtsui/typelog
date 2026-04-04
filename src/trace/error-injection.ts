import { SpanFrame, SpanStack } from "./span-stack.ts";

const spanStack = SpanStack.getInstance();

export class Injection {
    protected constructor() {}
    protected map = new WeakMap<Error, SpanFrame[]>();

    public prepend(e: Error): void {
        const frame = spanStack.getFrame();
        if (frame) {} else throw new Error();
        const frames = this.map.get(e) ?? [];
        this.map.set(e, [frame, ...frames]);
    }

    public read(e: Error): SpanFrame[] {
        return this.map.get(e) ?? [];
    }

    protected static instance = new Injection();
    public static getInstance(): Injection {
        return Injection.instance;
    }
}
