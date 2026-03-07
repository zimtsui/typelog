import * as Presets from './presets.ts';
import { formatWithOptions } from 'node:util';
import { stderr } from 'node:process';
import Chalk from 'chalk';
import { env } from 'node:process';
import * as OTEL from '@opentelemetry/api';
import * as Stage from './stage.ts';


export const envLevel = Presets.envlevels[env.NODE_ENV ?? ''] ?? Presets.Level.info;

export interface Message {
    channel: string;
    payload: unknown;
    level: Presets.Level;
}

export interface Exporter {
    monolith(message: Message): void;
    stream(message: Message): void;
}
export namespace Exporter {
    export const defau1t: Exporter = {
        monolith(message: Message) {
            if (message.level >= envLevel) {} else return;
            const timeString = `[${new Date().toLocaleString('zh-CN')}]`;

            if (!!stderr.isTTY) {

                const levelString = (() => {
                    switch (message.level) {
                        case Presets.Level.warn: return Chalk.bgYellow(Presets.Level[message.level]);
                        case Presets.Level.error: return Chalk.bgRed(Presets.Level[message.level]);
                        case Presets.Level.critical: return Chalk.bgRed(Presets.Level[message.level]);
                        default: return Chalk.bgGray(Presets.Level[message.level]);
                    }
                })();
                const channelString = Chalk.bgBlue(message.channel);
                const payloadString = formatWithOptions({ depth: null, colors: true }, message.payload);
                const thread = Stage.getThread();
                const traceString = thread ? `(${thread.name})` : '';
                if (traceString)
                    stderr.write(`${timeString} ${levelString} ${channelString} ${traceString} ${payloadString}\n`);
                else
                    stderr.write(`${timeString} ${levelString} ${channelString} ${payloadString}\n`);

            } else {

                const levelString = Presets.Level[message.level];
                const channelString = message.channel;
                const payloadString = formatWithOptions({ depth: null, colors: false }, message.payload);
                const span = OTEL.trace.getActiveSpan();
                const traceId = span?.spanContext().traceId;
                const spanId = span?.spanContext().spanId;
                const traceString = traceId && spanId ? `(${traceId}:${spanId})` : '';
                if (traceString)
                    stderr.write(`${timeString} ${levelString} ${channelString} ${traceString} ${payloadString}\n`);
                else
                    stderr.write(`${timeString} ${levelString} ${channelString} ${payloadString}\n`);
            }
        },

        stream(message: Message) {
            const formatted = formatWithOptions({ depth: null, colors: !!stderr.isTTY }, message.payload);
            if (message.level >= envLevel) stderr.write(formatted);
        },
    };
}

export let exporter: Exporter = Exporter.defau1t;
