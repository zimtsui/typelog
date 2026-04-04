import { AsyncLocalStorage } from 'node:async_hooks';
import * as OTEL from '@opentelemetry/api';




export class SpanStack {
    protected constructor() {}

    protected als = new AsyncLocalStorage<SpanFrame[]>();

    public getFrames(): SpanFrame[] {
        return this.als.getStore() ?? [];
    }

    public getFrame(): SpanFrame | undefined {
        const frames = this.getFrames();
        return frames.at(-1);
    }

    public run<T>(name: string, f: () => T): T {
        return this.als.run([...this.getFrames(), { name, attrs: {} }], f);
    }

    protected static instance = new SpanStack();

    public static getInstance(): SpanStack {
        return SpanStack.instance;
    }
}

export interface SpanFrame {
    name: string;
    attrs: Record<string, OTEL.AttributeValue>;
}
