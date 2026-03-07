import * as Presets from './presets';
import { formatWithOptions } from 'node:util';
import { stderr } from 'node:process';
import Chalk from 'chalk';
import { env } from 'node:process';
import * as OTEL from '@opentelemetry/api';


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
    export namespace Default {
        export const exporter: Exporter = {
            monolith(message: Message) {
                const span = OTEL.trace.getActiveSpan();
                const formatted = formatMessage({
                    ...message,
                    colored: !!stderr.isTTY,
                    timestamp: Date.now(),
                    traceId: span?.spanContext().traceId,
                    spanId: span?.spanContext().spanId,
                });
                if (message.level >= envLevel) stderr.write(formatted);
            },
            stream(message: Message) {
                const formatted = formatWithOptions({ depth: null, colors: !!stderr.isTTY }, message.payload);
                if (message.level >= envLevel) stderr.write(formatted);
            },
        };

        export function formatMessage({ channel, level, payload, colored, timestamp, traceId, spanId }: formatMessage.Args): string {
            const timeString = new Date(timestamp).toLocaleString('zh-CN');
            const levelString = colored ? (() => {
                switch (level) {
                    case Presets.Level.warn: return Chalk.bgYellow(Presets.Level[level]);
                    case Presets.Level.error: return Chalk.bgRed(Presets.Level[level]);
                    case Presets.Level.critical: return Chalk.bgRed(Presets.Level[level]);
                    default: return Chalk.bgGray(Presets.Level[level]);
                }
            })() : Presets.Level[level];
            const channelString = colored ? Chalk.bgBlue(channel) : channel;
            const payloadString = formatWithOptions({ depth: null, colors: !!stderr.isTTY }, payload);
            if (traceId && spanId)
                return `[${timeString}] ${channelString} ${levelString} ${traceId}: ${spanId}\n${payloadString}\n`;
            else
                return `[${timeString}] ${channelString} ${levelString} ${payloadString}`;
        }
        export namespace formatMessage {
            export interface Args extends Message {
                colored: boolean;
                timestamp: number;
                traceId?: string;
                spanId?: string;
            }
        }
    }
}

export let exporter: Exporter = Exporter.Default.exporter;
