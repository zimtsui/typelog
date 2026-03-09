import * as Stage from '@zimtsui/typelog/stage';

function forkListener(slave: Stage.Thread, master?: Stage.Thread) {
    if (master)
        console.log(`Thread ${slave.name}(${slave.threadId}) forked from ${master.name}(${master.threadId})`);
    else
        console.log(`Thread ${slave.name}(${slave.threadId}) spawned`);
}

function joinListener(slave: Stage.Thread, master?: Stage.Thread) {
    if (master)
        console.log(`Thread ${slave.name}(${slave.threadId}) joined to ${master.name}(${master.threadId})`);
    else
        console.log(`Thread ${slave.name}(${slave.threadId}) terminated`);
}

async function f3(x: number) {
    const a = Stage.fork(f1.name, () => f1(x), forkListener);
    const b = Stage.fork(f1.name, () => f1(x + 1), forkListener);
    const p = await Stage.join(a, joinListener);
    const q = await Stage.join(b, joinListener);
    return p + q;
}

async function f1(x: number) {
    return await Stage.fork(f1.name, () => f2(x), forkListener);
}

async function f2(x: number) {
    return String(x);
}

console.log(await f3(100));
