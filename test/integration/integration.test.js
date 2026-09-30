const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const Docker = require('dockerode');
const mqtt = require('mqtt');
const dockermonMqtt = require('../../mqtt/hadockermon_mqtt');
const { app, configure } = require('../../index');

const docker = new Docker({ host: process.env.TEST_DOCKER_HOST || '127.0.0.1', port: 2375 });
const baseTopic = `ha_dockermon/integration_${process.pid}`;
const containerName = `hadockermon-test-${process.pid}`;
const configValues = {
    debug: false,
    'http.username': undefined,
    'mqtt.base_topic': baseTopic,
    'mqtt.whitelist_containers': [containerName],
    'mqtt.hass_discovery.enabled': false,
    'mqtt.scan_interval': 3600
};
const config = { get(key) { return configValues[key]; } };

let server;
let callbackServer;
let callbackBody;
let callbackUrl;
let client;
let container;
let apiUrl;

async function waitForState(expected) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const details = await container.inspect();
        if (details.State.Status === expected) return details;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Container did not reach ${expected}`);
}

function publishCommand(command) {
    return new Promise((resolve, reject) => {
        client.publish(`${baseTopic}/${containerName}/set`, command, error => error ? reject(error) : resolve());
    });
}

before(async () => {
    await new Promise((resolve, reject) => docker.ping(error => error ? reject(error) : resolve()));
    configure({ config, docker });
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    apiUrl = `http://127.0.0.1:${server.address().port}`;

    callbackServer = http.createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            callbackBody = JSON.parse(Buffer.concat(chunks).toString());
            response.end('ok');
        });
    });
    await new Promise(resolve => callbackServer.listen(0, '127.0.0.1', resolve));
    callbackUrl = `http://127.0.0.1:${callbackServer.address().port}/pull-complete`;

    client = mqtt.connect(process.env.TEST_MQTT_URL || 'mqtt://127.0.0.1:1883');
    await new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('error', reject);
    });
    dockermonMqtt.init(config, client, docker);
    dockermonMqtt.startMqtt();
});

after(async () => {
    if (dockermonMqtt.mqttPublisher) clearInterval(dockermonMqtt.mqttPublisher);
    if (client) await new Promise(resolve => client.end(true, {}, resolve));
    if (container) {
        await container.remove({ force: true }).catch(() => {});
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (callbackServer) await new Promise(resolve => callbackServer.close(resolve));
});

test('HTTP image pull succeeds and reports through the callback endpoint', async () => {
    const response = await fetch(`${apiUrl}/pull/busybox:1.36`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callback_uri: callbackUrl })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, true);

    for (let attempt = 0; attempt < 300 && !callbackBody; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(callbackBody.status, true);
    assert.equal(callbackBody.image.image, 'busybox');
    assert.equal(callbackBody.image.tag, '1.36');
    container = await docker.createContainer({
        Image: 'busybox:1.36',
        name: containerName,
        Cmd: ['sleep', '3600'],
        StopTimeout: 1,
        HostConfig: { AutoRemove: false }
    });
});

test('HTTP lifecycle endpoints start and stop a real test container', async () => {
    const start = await fetch(`${apiUrl}/container/${containerName}/start`);
    assert.equal(start.status, 200);
    await waitForState('running');

    const stop = await fetch(`${apiUrl}/container/${containerName}/stop`);
    assert.equal(stop.status, 200);
    await waitForState('exited');
});

test('MQTT commands start and stop a real test container', async () => {
    await publishCommand('start');
    await waitForState('running');
    await publishCommand('stop');
    await waitForState('exited');
});
