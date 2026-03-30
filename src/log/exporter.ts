

export type Message = Message.Unicode | Message.Binary;
export namespace Message {
    export interface Binary {
        scope: string;
        channel: string;
        payload: ArrayBuffer;
        level: string;
    }
    export interface Unicode {
        scope: string;
        channel: string;
        payload: string;
        level: string;
    }
}

export interface Exporter {
    monolith(message: Message): void;
    stream(message: Message): void;
}

export namespace Exporter {
    export class Noop implements Exporter {
        public monolith() {}
        public stream() {}
    }
    let globalExporter: Exporter = new Noop();

    export function setGlobalExporter(exporter: Exporter) {
        globalExporter = exporter;
    }

    export function getGlobalExporter(): Exporter {
        return globalExporter;
    }
}
