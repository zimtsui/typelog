import { AsyncLocalStorage } from 'node:async_hooks';
import * as OTEL from '@opentelemetry/api';



export interface Frame {
    name: string;
    attrs: Record<string, OTEL.AttributeValue>;
}

export class Stack {
    protected als = new AsyncLocalStorage<Frame[]>();

    public getFrames(): Frame[] {
        return this.als.getStore() ?? [];
    }

    public getFrame(): Frame | undefined {
        const frames = this.getFrames();
        return frames.at(-1);
    }

    public run<T>(name: string, f: () => T): T {
        return this.als.run([...this.getFrames(), { name, attrs: {} }], f);
    }
}
