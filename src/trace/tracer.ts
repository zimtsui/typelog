import * as OTEL from '@opentelemetry/api';
import { Frame, Stack } from './stack.ts';
import { Injection } from './injection.ts';



export type Tracer = Tracer.Instance;
export namespace Tracer {
    export function create(scope: string, version?: string): Instance {
        return new Instance(scope, version);
    }
    export class Instance {
        protected tracer: OTEL.Tracer;
        protected stack = new Stack();
        protected injection = new Injection(this.stack);

        public constructor(
            scope: string,
            version?: string,
        ) {
            this.tracer = OTEL.trace.getTracer(scope, version);
        }

        public setAttr(key: string, value: OTEL.AttributeValue): void {
            const span = OTEL.trace.getActiveSpan();
            if (span) span.setAttribute(key, value);
            const frame = this.stack.getFrame();
            if (frame) frame.attrs[key] = value;
        }

        public extract(e: Error): Frame[] {
            return this.injection.read(e);
        }

        public now(): Frame[] {
            return this.stack.getFrames();
        }

        protected createSync<R>(name: string, f: () => R, masterContext: OTEL.Context): R {
            const slaveSpan = this.tracer.startSpan(name, {}, masterContext);
            const slaveContext = OTEL.trace.setSpan(masterContext, slaveSpan);
            return this.stack.run(
                name,
                () => {
                    try {
                        return OTEL.context.with(slaveContext, f);
                    } catch (e) {
                        if (e instanceof Error) {
                            this.injection.prepend(e);
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
        protected async createAsync<R>(name: string, f: () => PromiseLike<R>, masterContext: OTEL.Context): Promise<Awaited<R>> {
            const slaveSpan = this.tracer.startSpan(name, {}, masterContext);
            const slaveContext = OTEL.trace.setSpan(masterContext, slaveSpan);
            return await this.stack.run(
                name,
                async () => {
                    try {
                        return await OTEL.context.with(slaveContext, f);
                    } catch (e) {
                        if (e instanceof Error) {
                            this.injection.prepend(e);
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

        public spawnSync<R>(name: string, f: () => R): R {
            return this.createSync(name, f, OTEL.ROOT_CONTEXT);
        }
        /**
         * @param f is allowed to throw synchronously.
         */
        public spawnAsync<R>(name: string, f: () => PromiseLike<R>): Promise<Awaited<R>> {
            return this.createAsync(name, f, OTEL.ROOT_CONTEXT);
        }

        public forkSync<R>(name: string, f: () => R): R {
            return this.createSync(name, f, OTEL.context.active());
        }
        /**
         * @param f is allowed to throw synchronously.
         */
        public forkAsync<R>(name: string, f: () => PromiseLike<R>): Promise<Awaited<R>> {
            return this.createAsync(name, f, OTEL.context.active());
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
}
