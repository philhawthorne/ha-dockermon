const { test } = require('node:test');
const assert = require('node:assert/strict');
const dockermon = require('../mqtt/hadockermon_mqtt');

function setup(whitelist = ['sample']) {
    const calls = [];
    const config = {
        get(key) {
            return ({
                debug: false,
                'mqtt.base_topic': 'ha_dockermon/test',
                'mqtt.whitelist_containers': whitelist,
                'mqtt.hass_discovery.enabled': false
            })[key];
        }
    };
    const docker = {
        listContainers(options, callback) {
            const name = options.filters.name && options.filters.name[0];
            const id = options.filters.id && options.filters.id[0];
            callback(null, name === 'sample' || id === 'abc123'
                ? [{ Id: 'abc123', Names: ['/sample'] }]
                : []);
        },
        getContainer() {
            return {
                start(callback) { calls.push('start'); callback(null); },
                stop(callback) { calls.push('stop'); callback(null); }
            };
        }
    };
    const client = { publish() {}, subscribe() {}, on() {} };
    dockermon.init(config, client, docker);
    dockermon.publishMqtt = () => {};
    return calls;
}

test('MQTT start and stop commands invoke Docker only for whitelisted containers', () => {
    const calls = setup();
    dockermon.handleMessage('ha_dockermon/test/sample/set', 'start');
    dockermon.handleMessage('ha_dockermon/test/sample/set', 'stop');
    dockermon.handleMessage('ha_dockermon/test/other/set', 'start');
    assert.deepEqual(calls, ['start', 'stop']);
});

test('MQTT container lookup reports missing containers without HTTP response dependencies', () => {
    setup();
    let failure;
    dockermon.getContainer('missing', () => assert.fail('unexpected container'), (status, message) => {
        failure = { status, message };
    });
    assert.deepEqual(failure, { status: 404, message: 'container not found' });
});
