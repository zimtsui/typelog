import { Exporter as GenericExporter } from '../exporter.ts';
import { Level } from './level.ts';


export namespace Exporter {
    export const noop: GenericExporter<typeof Level> = () => {};
    let globalExporter: GenericExporter<typeof Level> = noop;

    export function setGlobalExporter(exporter: GenericExporter<typeof Level>): void {
        globalExporter = exporter;
    }

    export function getGlobalExporter(): GenericExporter<typeof Level> {
        return globalExporter;
    }
}
