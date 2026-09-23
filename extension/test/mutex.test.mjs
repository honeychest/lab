import test from 'node:test';
import assert from 'node:assert/strict';
import { createMutex, MutexBusyError } from '../src/core/mutex.js';

function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

test('실행 중인 두 번째 작업은 기다리지 않고 거부한다', async () => {
    const mutex = createMutex();
    const gate = deferred();
    const first = mutex.run('place', () => gate.promise);

    assert.equal(mutex.busyLabel(), 'place');
    await assert.rejects(
        mutex.run('chase', async () => '실행되면 안 됨'),
        (error) => error instanceof MutexBusyError && error.label === 'place',
    );
    gate.resolve('done');
    assert.equal(await first, 'done');
});

test('성공 뒤에는 잠금이 풀린다', async () => {
    const mutex = createMutex();
    assert.equal(await mutex.run('place', async () => 1), 1);
    assert.equal(mutex.busyLabel(), null);
    assert.equal(await mutex.run('chase', async () => 2), 2);
});

test('예외 뒤에도 잠금이 풀린다', async () => {
    const mutex = createMutex();
    await assert.rejects(mutex.run('cancel-all', async () => { throw new Error('fail'); }));
    assert.equal(mutex.busyLabel(), null);
});
