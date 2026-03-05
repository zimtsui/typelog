import { Tracer } from '@zimtsui/typelog/tracer';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const sdk = new NodeSDK({
    traceExporter: new ConsoleSpanExporter(),
});
sdk.start();
const tracer = Tracer.create('example', '0.0.1');

class A {
    @tracer.activeAsync()
    public async f2(x: number): Promise<string> {
        return f3(x);
    }
    @tracer.activeSync()
    public f4(x: number): string  {
        return String(x);
    }
}
const a = new A();

namespace F3 {
    export function create() {
        function f3(x: number): string {
            return a.f4(x);
        }
        return (x: number) => tracer.activateSync(f3.name, () => f3(x));
    }
}
const f3 = F3.create();

namespace F1 {
    export function create() {
        async function f1(x: number): Promise<string> {
            return await a.f2(x);
        }
        return (x: number) => tracer.activateAsync(f1.name, () => f1(x));
    }
}
const f1 = F1.create();

console.log(await f1(100));
await sdk.shutdown();
