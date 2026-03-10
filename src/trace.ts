import * as OTEL from '@opentelemetry/api';



export type Tracer = Tracer.Instance;
export namespace Tracer {
    export function create(scope: string, version?: string): Instance {
        return new Instance(scope, version);
    }
    export class Instance {
        protected tracer: OTEL.Tracer;

        public constructor(
            scope: string,
            version?: string,
        ) {
            this.tracer = OTEL.trace.getTracer(scope, version);
        }

        public createSync<R>(name: string, f: () => R, masterContext: OTEL.Context): R {
            const slaveSpan = this.tracer.startSpan(name, {}, masterContext);
            const slaveContext = OTEL.trace.setSpan(masterContext, slaveSpan);
            try {
                return OTEL.context.with(
                    slaveContext,
                    f,
                );
            } catch (e) {
                if (e instanceof Error) slaveSpan.recordException(e);
                slaveSpan.setStatus({ code: OTEL.SpanStatusCode.ERROR });
                throw e;
            } finally {
                slaveSpan.end();
            }
        }
        /**
         * @param f is allowed to throw synchronously.
         */
        public async createAsync<R>(name: string, f: () => PromiseLike<R>, masterContext: OTEL.Context): Promise<Awaited<R>> {
            const slaveSpan = this.tracer.startSpan(name, {}, masterContext);
            const slaveContext = OTEL.trace.setSpan(masterContext, slaveSpan);
            try {
                return await OTEL.context.with(slaveContext, f);
            } catch (e) {
                if (e instanceof Error) slaveSpan.recordException(e);
                slaveSpan.setStatus({ code: OTEL.SpanStatusCode.ERROR });
                throw e;
            } finally {
                slaveSpan.end();
            }
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
