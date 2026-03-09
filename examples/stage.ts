import * as Stage from '@zimtsui/typelog/stage';

function forked(slave: Stage.Thread) {
    const master = Stage.getThread();
    console.log(`Thread ${slave.name}(${slave.threadId}) forked from ${master.name}(${master.threadId})`);
}

function joined(slave: Stage.Thread) {
    const master = Stage.getThread();
    console.log(`Thread ${slave.name}(${slave.threadId}) joined to ${master.name}(${master.threadId})`);
}

async function f4(x: number) {
    const masterThread = Stage.getThread();
    const slaveThread = Stage.forkSync(f1.name, forked);
    Stage.sw1tch(slaveThread);
    try {
        return await f1(x);
    } finally {
        Stage.sw1tch(masterThread);
        Stage.joinSync(slaveThread, joined);
    }
}

async function f3(x: number) {
    const a = Stage.fork(f2.name, () => f2(x), forked);
    const b = Stage.fork(f2.name, () => f2(x + 1), forked);
    const p = await Stage.join(a, joined);
    const q = await Stage.join(b, joined);
    return p + q;
}

async function f2(x: number) {
    return await Stage.fork(f2.name, () => f1(x), forked);
}

async function f1(x: number) {
    return String(x);
}

console.log(await f3(100));
console.log(await f4(200));
