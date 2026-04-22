import * as OTEL from '@opentelemetry/api';
import { SpanFrame, SpanStack } from './span-stack.ts';
import { Injection } from './error-injection.ts';



const spanStack = SpanStack.getInstance();
const errorInjection = Injection.getInstance();

export class Tracer {
    protected tracer: OTEL.Tracer;

    public constructor(scope: string) {
        this.tracer = OTEL.trace.getTracer(scope);
    }

    public static setSpanAttribute(key: string, value: OTEL.AttributeValue): void {
        const span = OTEL.trace.getActiveSpan();
        if (span) span.setAttribute(key, value);
        const frame = spanStack.getFrame();
        if (frame) frame.attrs[key] = value;
    }

    public static extractErrorSpanFrames(e: Error): SpanFrame[] {
        return errorInjection.read(e);
    }

    public static getSpanFrames(): SpanFrame[] {
        return spanStack.getFrames();
    }

    /**
     * @param generator Ownership transferred.
     */
    public *hookSync<TYield, TReturn, TNext>(
        name: string,
        generator: Generator<TYield, TReturn, TNext>,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): Generator<TYield, TReturn, TNext> {
        try {
            let r = this.forkSync(name, () => generator.next(), attrs);
            while (!r.done) try {
                const input = yield r.value;
                r = this.forkSync(name, () => generator.next(input), attrs);
            } catch (e) {
                r = this.forkSync(name, () => generator.throw(e), attrs);
            }
            return r.value;
        } finally {
            generator[Symbol.dispose]();
        }
    }

    /**
     * @param generator Ownership transferred.
     */
    public async *hookAsync<TYield, TReturn, TNext>(
        name: string,
        generator: AsyncGenerator<TYield, TReturn, TNext>,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): AsyncGenerator<TYield, TReturn, TNext> {
        try {
            let r = await this.forkAsync(name, () => generator.next(), attrs);
            while (!r.done) try {
                const input = yield r.value;
                r = await this.forkAsync(name, () => generator.next(input), attrs);
            } catch (e) {
                r = await this.forkAsync(name, () => generator.throw(e), attrs);
            }
            return r.value;
        } finally {
            await generator[Symbol.asyncDispose]();
        }
    }

    protected createSync<R>(
        name: string, f: () => R, masterContext: OTEL.Context,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): R {
        const slaveSpan = this.tracer.startSpan(name, { attributes: attrs }, masterContext);
        const slaveContext = OTEL.trace.setSpan(masterContext, slaveSpan);
        return spanStack.run(
            name,
            () => {
                const frame = spanStack.getFrame();
                if (frame) frame.attrs = { ...attrs };
                try {
                    return OTEL.context.with(slaveContext, f);
                } catch (e) {
                    if (e instanceof Error) {
                        errorInjection.prepend(e);
                        slaveSpan.recordException(e);
                    }
                    slaveSpan.setStatus({ code: OTEL.SpanStatusCode.ERROR });
                    throw e;
                } finally {
                    slaveSpan.end();
                }
            },
        );
    }
    /**
     * @param f is allowed to throw synchronously.
     */
    protected async createAsync<R>(
        name: string, f: () => PromiseLike<R>, masterContext: OTEL.Context,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): Promise<Awaited<R>> {
        const slaveSpan = this.tracer.startSpan(name, { attributes: attrs }, masterContext);
        const slaveContext = OTEL.trace.setSpan(masterContext, slaveSpan);
        return await spanStack.run(
            name,
            async () => {
                const frame = spanStack.getFrame();
                if (frame) frame.attrs = { ...attrs };
                try {
                    return await OTEL.context.with(slaveContext, f);
                } catch (e) {
                    if (e instanceof Error) {
                        errorInjection.prepend(e);
                        slaveSpan.recordException(e);
                    }
                    slaveSpan.setStatus({ code: OTEL.SpanStatusCode.ERROR });
                    throw e;
                } finally {
                    slaveSpan.end();
                }
            },
        );
    }

    public spawnSync<R>(
        name: string, f: () => R,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): R {
        return this.createSync(name, f, OTEL.ROOT_CONTEXT, attrs);
    }
    /**
     * @param f is allowed to throw synchronously.
     */
    public spawnAsync<R>(
        name: string, f: () => PromiseLike<R>,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): Promise<Awaited<R>> {
        return this.createAsync(name, f, OTEL.ROOT_CONTEXT, attrs);
    }

    public forkSync<R>(
        name: string, f: () => R,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): R {
        return this.createSync(name, f, OTEL.context.active(), attrs);
    }
    /**
     * @param f is allowed to throw synchronously.
     */
    public forkAsync<R>(
        name: string, f: () => PromiseLike<R>,
        attrs: Record<string, OTEL.AttributeValue> = {},
    ): Promise<Awaited<R>> {
        return this.createAsync(name, f, OTEL.context.active(), attrs);
    }

    public forkedSync<R>(name?: string) {
        return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(this: any, ...args: any[]) => R>) => {
            const that = this;
            const originalMethod = descriptor.value!;
            const spanName = name || originalMethod.name;
            function activeMethod(this: any, ...args: any[]): R {
                return that.forkSync(spanName, () => originalMethod.call(this, ...args));
            }
            Reflect.defineProperty(activeMethod, 'name', { value: originalMethod.name, configurable: true, writable: false, enumerable: false });
            descriptor.value = activeMethod;
        }
    }
    public forkedAsync<R>(name?: string) {
        return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(this: any, ...args: any[]) => Promise<R>>) => {
            const that = this;
            const originalMethod = descriptor.value!;
            const spanName = name || originalMethod.name;
            function activeMethod(this: any, ...args: any[]): Promise<Awaited<R>> {
                return that.forkAsync(spanName, () => originalMethod.call(this, ...args));
            }
            Reflect.defineProperty(activeMethod, 'name', { value: originalMethod.name, configurable: true, writable: false, enumerable: false });
            descriptor.value = activeMethod;
        }
    }
    public spawnedSync<R>(name?: string) {
        return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(this: any, ...args: any[]) => R>) => {
            const that = this;
            const originalMethod = descriptor.value!;
            const spanName = name || originalMethod.name;
            function activeMethod(this: any, ...args: any[]): R {
                return that.spawnSync(spanName, () => originalMethod.call(this, ...args));
            }
            Reflect.defineProperty(activeMethod, 'name', { value: originalMethod.name, configurable: true, writable: false, enumerable: false });
            descriptor.value = activeMethod;
        }
    }
    public spawnedAsync<R>(name?: string) {
        return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(this: any, ...args: any[]) => Promise<R>>) => {
            const that = this;
            const originalMethod = descriptor.value!;
            const spanName = name || originalMethod.name;
            function activeMethod(this: any, ...args: any[]): Promise<Awaited<R>> {
                return that.spawnAsync(spanName, () => originalMethod.call(this, ...args));
            }
            Reflect.defineProperty(activeMethod, 'name', { value: originalMethod.name, configurable: true, writable: false, enumerable: false });
            descriptor.value = activeMethod;
        }
    }
}
