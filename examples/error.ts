import { Tracer } from '@zimtsui/typelemetry/trace';
const tracer = Tracer.create('example', '0.0.1');

function f(): void {
    try {
        return tracer.forkSync('g', g);
    } catch (e) {
        console.error(tracer.extract(e));
        console.error(e);
    }
}

function g(): never {
    throw new Error('oops');
}

tracer.forkSync('f', f);
