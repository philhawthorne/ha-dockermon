const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { app, configure } = require('../index');

const config = {
    get(key) {
        return ({ debug: false, 'http.username': undefined })[key];
    }
};

function createDocker() {
    const calls = [];
    const container = { Id: 'abc123', Names: ['/sample'], State: 'running', Status: 'Up', Image: 'busybox' };
    const methods = {};
    for (const method of ['start', 'stop', 'pause', 'unpause', 'restart']) {
        methods[method] = callback => {
            calls.push(method);
            callback(docker.failure === method ? new Error('docker boom') : null, { status: method });
        };
    }
    return {
        calls,
        failure: null,
        listContainers(options, callback) {
            const name = options.filters.name && options.filters.name[0];
            const id = options.filters.id && options.filters.id[0];
            callback(null, (name === 'sample' || id === 'abc123') ? [container] : []);
        },
        getContainer() { return methods; },
        pull(image, callback) {
            calls.push(`pull:${image}`);
            const stream = new EventEmitter();
            callback(null, stream);
            setImmediate(() => stream.emit('end'));
        }
    };
}

let server;
let baseUrl;
let docker;

before(async () => {
    docker = createDocker();
    configure({ config, docker });
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('POST /container/:id starts and stops a resolved container', async () => {
    for (const [state, expected] of [['start', 'running'], ['stop', 'stopped']]) {
        const response = await fetch(`${baseUrl}/container/sample`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ state })
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { state: expected });
    }
    assert.deepEqual(docker.calls, ['start', 'stop']);
});

test('unknown containers return 404', async () => {
    const response = await fetch(`${baseUrl}/container/missing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: 'start' })
    });
    assert.equal(response.status, 404);
    assert.equal(await response.text(), 'container not found');
});

test('Docker lifecycle errors are returned as HTTP 500', async () => {
    docker.failure = 'start';
    try {
        const response = await fetch(`${baseUrl}/container/sample`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ state: 'start' })
        });
        assert.equal(response.status, 500);
    } finally {
        docker.failure = null;
    }
});

test('POST /pull reports completion to its callback URL', async () => {
    let callbackBody;
    const callbackServer = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            callbackBody = JSON.parse(Buffer.concat(chunks).toString());
            response.end('ok');
        });
    });
    await new Promise(resolve => callbackServer.listen(0, '127.0.0.1', resolve));
    try {
        const callbackUrl = `http://127.0.0.1:${callbackServer.address().port}/done`;
        const response = await fetch(`${baseUrl}/pull/busybox`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ callback_uri: callbackUrl })
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).status, true);
        for (let attempt = 0; attempt < 30 && !callbackBody; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.deepEqual(callbackBody, {
            status: true,
            result: 'Finished pulling docker image busybox:latest',
            image: { image: 'busybox', tag: 'latest' }
        });
        assert.ok(docker.calls.includes('pull:busybox:latest'));
    } finally {
        await new Promise(resolve => callbackServer.close(resolve));
    }
});

test('POST /pull without a callback URL returns 400', async () => {
    const response = await fetch(`${baseUrl}/pull/busybox`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
    });
    assert.equal(response.status, 400);
});
