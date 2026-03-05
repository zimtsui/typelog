import * as OTEL from '@opentelemetry/api';



export type Tracer = Tracer.Instance;
export namespace Tracer {
    export function create(scope: string, version?: string): Instance {
        return new Instance(scope, version);
    }
    export class Instance {
        protected otelTracer: OTEL.Tracer;

        public constructor(
            scope: string,
            version?: string,
        ) {
            this.otelTracer = OTEL.trace.getTracer(scope, version);
        }

        public activateSync<R>(name: string, fn: () => R): R {
            return this.otelTracer.startActiveSpan(
                name,
                slave => {
                    try {
                        return fn();
                    } catch (e) {
                        if (e instanceof Error) slave.recordException(e);
                        slave.setStatus({ code: OTEL.SpanStatusCode.ERROR });
                        throw e;
                    } finally {
                        slave.end();
                    }
                },
            );
        }
        public activateAsync<R>(name: string, fn: () => Promise<R>): Promise<R> {
            return this.otelTracer.startActiveSpan(
                name,
                async slave => {
                    try {
                        return await fn();
                    } catch (e) {
                        if (e instanceof Error) slave.recordException(e);
                        slave.setStatus({ code: OTEL.SpanStatusCode.ERROR });
                        throw e;
                    } finally {
                        slave.end();
                    }
                },
            );
        }

        public activeSync<R>(name?: string) {
            return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(this: any, ...args: any[]) => R>) => {
                const that = this;
                const originalMethod = descriptor.value!;
                const spanName = name || originalMethod.name;
                function activeMethod(this: any, ...args: any[]): R {
                    return that.activateSync(spanName, () => originalMethod.call(this, ...args));
                }
                Reflect.defineProperty(activeMethod, 'name', { value: originalMethod.name, configurable: true, writable: false, enumerable: false });
                descriptor.value = activeMethod;
            }
        }
        public activeAsync<R>(name?: string) {
            return (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(this: any, ...args: any[]) => Promise<R>>) => {
                const that = this;
                const originalMethod = descriptor.value!;
                const spanName = name || originalMethod.name;
                function activeMethod(this: any, ...args: any[]): Promise<R> {
                    return that.activateAsync(spanName, () => originalMethod.call(this, ...args));
                }
                Reflect.defineProperty(activeMethod, 'name', { value: originalMethod.name, configurable: true, writable: false, enumerable: false });
                descriptor.value = activeMethod;
            }
        }
    }
}
