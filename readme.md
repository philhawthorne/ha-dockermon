HA Dockermon
============

[![Docker Pulls](https://img.shields.io/docker/pulls/philhawthorne/ha-dockermon.svg)](https://dockerhub.com/philhawthorne/ha-dockermon) [![Build Status](https://travis-ci.org/philhawthorne/ha-dockermon.svg?branch=master)](https://travis-ci.org/philhawthorne/ha-dockermon) [![license](https://img.shields.io/github/license/philhawthorne/ha-dockermon.svg)](https://dockerhub.com/philhawthorne/ha-dockermon)

[![Buy me a coffee][buymeacoffee-icon]][buymeacoffee]


This is a simple Node service which checks the status of a Docker Container and returns a RESTful response. It can also be used to issue `start` `stop` `pause` `unpause` and `restart` commands. The primary purpose of this service is to interface with [Home Assistant](https://home-assistant.io) on a [Synology NAS](http://amzn.to/2FAC28A).

This service can optionally be used to expose Docker containers over an MQTT broker, and supports [Home Assistant's MQTT Discovery](https://www.home-assistant.io/docs/mqtt/discovery/) feature.

## Supported Docker Features

* Get the status of a container (running, stopped, paused).
* Start, stop, pause, or unpause a container by issuing a `POST` request.
* Start, stop, pause, or unpause a container by issuing a `GET` requst.
* Restart a container by making a `GET` request to a URL for the container (details below).
* Execute commands inside a container using the `/exec` endpoint of a container.
* Pull a docker image for the latest version from the remote repository

## Getting Started

### Configuration Options
You can change some configuration options for this service by editing config/configuration.yaml.

| Option                        | Description                                                                                                                                            | Default Value        |
|-------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------|
| debug                         | If set to true, will output some helpful debug messages to the console.                                                                                | false                |
| http.port                     | The HTTP port the service listens on. Must be a valid HTTP port or windows socket.                                                                     | 8126                 |
| http.username                 | If set all calls to this service must use HTTP basic authentication with this username. **If set, must not be an empty value.**                        | None                 |
| http.password                 | If set all calls to this service must use HTTP basic authentication with this password. **If set, must not be an empty value.**                        | None                 |
| docker_connection.type        | How the service connects to docker. Valid options are socket or http                                                                                   | socket               |
| docker_connection.path        | The path to the Docker socket. Useful when running this service on the host directly (not in a Docker container)                                       | /var/run/docker.sock |
| docker_connection.host        | The host IP/Domain of the host Docker to connect to. Only used when `docker_connection.type` is set to `http`. **If set, must not be an empty value.** | None                 |
| docker_connection.port        | The port of the host Docker to connect to. Only used when `docker_connection.type` is set to `http`.  **If set, must not be an empty value.**          | None                 |
| mqtt.enabled                  | Whether MQTT should be enabled or not                                                                                                                  | false                |
| mqtt.host                     | MQTT broker host                                                                                                                                       | 127.0.0.1            |
| mqtt.port                     | MQTT broker port                                                                                                                                       |                      |
| mqtt.username                 | Optional. MQTT username to connect to the MQTT broker                                                                                                  |                      |
| mqtt.password                 | Optional. MQTT password to connect to the MQTT broker                                                                                                  |                      |
| mqtt.base_topic               | MQTT base topic to send updates. Should be unique per HA-Dockermon instance, ie ha_dockermon/hostname                                                  | ha_dockermon         |
| mqtt.scan_interval            | Number of seconds HA-Dockermon will scan the docker host for updates                                                                                   | 30                   |
| mqtt.whitelist_containers            | If set, only container names in this list will be published via MQTT discovery                                                                                  |                    |
| mqtt.hass_discovery.enabled   | Whether HA-Dockermon should send Home Assistant Discovery entities                                                                                     | true                 |
| mqtt.hass_discovery.base_topic | The base topic Home Assistant listens for new devices                                                                                                  | homeassistant        |

### Connecting to Docker

#### Docker Socket (Recommended)
The most secure and reliable way to connect to the Docker service is by connecting to the Docker socket. Generally this is `/var/run/docker.sock`. It may be in a different location on your host, so you may need to mount the correct location with `-v` when using `docker run`. If running directly on the host with NodeJS, be sure to set the correct file path in config/configuration.yaml.

#### HTTP
You can expose the Docker Remote API over a HTTP port. This could allow other systems or parties to control the Docker containers on your host and is not recommended.

Enabling an external HTTP port for Docker is beyond the scope of this readme.


### Running

#### Docker (Recommended)
The easiest way to get started is to run this service inside its own Docker container. You don't need to give any elevated permissions for this service to work however, you must mount the Docker socket to the container from the host (or specify a HTTP connection in the configuration.yaml file).

```bash
docker run -d \
--name=ha-dockermon --restart=always \
-v /var/run/docker.sock:/var/run/docker.sock \
-v /path/to/config:/config \
-p 8126:8126 \
philhawthorne/ha-dockermon
```

#### Docker Compose
If you prefer to use Docker Compose, here is a sample entry you can add to your Docker compose file.
```yaml
  docker_mon:
    image: philhawthorne/ha-dockermon
    container_name: ha_dockermon
    restart: always
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /path/to/config:/config
    ports:
      - 8126:8126
```

#### NodeJS
You can run this service directly from a host that has NPM and NodeJS installed. Just checkout this repository and then run:

    npm start

## Raspberry Pi and other versions
HA-Dockermon use Docker Manifests to automatically download the correct version for your operating system. If this doesn't work on your system, please open an issue.

Alternatively you may use the `arm` tag to specifically use a Raspberry Pi friendly image.

```bash
docker run -d \
--name=ha-dockermon --restart=always \
-v /var/run/docker.sock:/var/run/docker.sock \
-v /path/to/config:/config \
-p 8126:8126 \
philhawthorne/ha-dockermon:arm
```

You may also use an older version. Check [Docker Hub](https://hub.docker.com/r/philhawthorne/ha-dockermon/tags/) for the list of tags you may use.

# Using this service

## HTTP / REST API

This service exposes the following HTTP endpoints

### GET /container/{container name}

Use this endpoint to get the status of a container, for example, you may make a call to `http://127.0.0.1:8126/container/home-assistant`. The response will be a JSON object in the format below.

```json
{
    "state":"running",
    "status":"Up About a minute",
    "image":"homeassistant/home-assistant:latest"
}
```

### POST /container/{container name}

Use the same endpoint with `POST` to start or stop a container. When making a call to this endpoint you must send the correct `Content-Type` headers and JSON as the body. An example request with cURL is below.

Valid options for `state` are `start`, `stop`, `pause`, and `unpause` to start, stop, pause, or unpause a container respectively.

```bash
curl --request POST \
--url http://127.0.0.1:8126/container/grafana \
--header 'content-type: application/octet-stream' \
--data '{"state": "start"}'
```

The response will be the same format as the `GET` call above.

### GET /container/{container name}/restart

Calls to this URL will issue a `docker restart <container name>` on the host machine. There is currently no response from the API to this request.

Useful in a Home Assistant script to restart containers (including Home Assistant itself).

### POST /container/{container name}/exec

Allows you to execute commands inside a running container. When making a call to this endpoint you must send the correct `Content-Type` headers and JSON as the body. An example request with cURL is below.

You must also send a `command` variable which contains the command you would like to run in the container.

```bash
curl --request POST \
--url http://127.0.0.1:8126/container/grafana/exec \
--header 'content-type: application/octet-stream' \
--data '{"command": "ls -a"}'
```

### GET /container/{container name}/start

Allows you to send a simple HTTP request to start a Docker container.

The response will be a json object with a `result` key containing the output from the command executed.

*Warning:* There is no confirmation for the command to be executed. Going to the URL in your browser will start the container.

### GET /container/{container name}/stats

Allows you to read various statistics of a running Docker container, including CPU usage and memory usage.

The response will be a json object with various keys including `precpu_stats` `cpu_stats` and `memory_stats`. The information returned may vary on the version of Docker your host machine is running.

*Heads Up:* There's a known issue where some host systems (like Synology NAS) may not return a response when calling this endpoint.

Thanks to [@thelittlefireman](https://github.com/thelittlefireman) for contributing this endpoint.

### GET /container/{container name}/stop

Allows you to send a simple HTTP request to stop a Docker container.

The response will be a json object with a `result` key containing the output from the command executed.

*Warning:* There is no confirmation for the command to be executed. Going to the URL in your browser will stop the container.

### GET /container/{container name}/pause

Allows you to send a simple HTTP request to pause a Docker container.

The response will be a json object with a `result` key containing the output from the command executed.

*Warning:* There is no confirmation for the command to be executed. Going to the URL in your browser will pause the container.

### GET /container/{container name}/unpause

Allows you to send a simple HTTP request to unpause a Docker container.

The response will be a json object with a `result` key containing the output from the command executed.

*Warning:* There is no confirmation for the command to be executed. Going to the URL in your browser will unpause the container.

### GET /containers

Outputs a list of all stopped, started, and paused containers on the host.

This is the same as performing a `docker ps -a` command on the host machine.

The response will be a json object, with each container in its own key. An example response is below.

```json
[{
	"Id": "2096eaf1a58f1730234d2e30c982021c196192eae9f41c6abf8fa26aad348477",
	"Names": ["/hadockermon"],
	"Image": "hadockermon",
	"ImageID": "sha256:e7352295ec274a441f691a8c83f8823137654f5d4df5fb187d9f1cee1f4711d6",
	"Command": "/bin/sh -c 'npm start'",
	"Created": 1523522864,
	"Ports": [{
		"IP": "0.0.0.0",
		"PrivatePort": 8126,
		"PublicPort": 8126,
		"Type": "tcp"
	}],
	"Labels": {},
	"State": "running",
	"Status": "Up 19 seconds",
	"HostConfig": {
		"NetworkMode": "default"
	},
	"NetworkSettings": {
		"Networks": {
			"bridge": {
				"IPAMConfig": null,
				"Links": null,
				"Aliases": null,
				"NetworkID": "ed342d9b95ab77f57172ca3fdd2dc87682ee7e0c3f94db7bb3a83ba81a5f2135",
				"EndpointID": "bfdec2f98a2521093e1210c1cc5135e3a788be5b80b8409d8652915a5ee38224",
				"Gateway": "172.17.0.1",
				"IPAddress": "172.17.0.2",
				"IPPrefixLen": 16,
				"IPv6Gateway": "",
				"GlobalIPv6Address": "",
				"GlobalIPv6PrefixLen": 0,
				"MacAddress": "02:42:ac:11:00:02"
			}
		}
	},
	"Mounts": [{
		"Source": "/var/run/docker.sock",
		"Destination": "/var/run/docker.sock",
		"Mode": "",
		"RW": true,
		"Propagation": "rprivate"
	}]
}]
```

## Home Assistant RESTful Switch

You can use this service as a [RESTful switch](https://home-assistant.io/components/switch.rest/) inside Home Assistant.

```yaml
switch:
  - platform: rest
    resource: http://127.0.0.1:8126/container/grafana
    name: Grafana
    body_on: '{"state": "start"}'
    body_off: '{"state": "stop"}'
    is_on_template: '{{ value_json is not none and value_json.state == "running" }}'
    
switch:
  - platform: rest
    resource: http://127.0.0.1:8126/container/mosquitto
    name: Mosquitto
    body_on: '{"state": "unpause"}'
    body_off: '{"state": "pause"}'
    is_on_template: '{{ value_json is not none and value_json.state == "running" }}'
```

## MQTT Discovery
HA-Dockermon can also be used in combination with [Home Assistant's MQTT Discovery](https://www.home-assistant.io/docs/mqtt/discovery/) feature. When enabled, HA-Dockermon will automatically post updates to an MQTT broker with the states of containers in Home Assistant. You could consider this as a _docker2mqtt_ feature.

HA-Dockermon will automatically create switches on your Home Assistant instance when a new container is started. HA-Dockermon will also automatically remove those entities when a container is destroyed on the host system.

**Warning:** When exposing Home Assistant via MQTT discovery, a switch entity will exist for your Home Assistant instance. Any calls to services such as `switch.turn_off` that specify an entity_id of `all` **will** turn off all of your Docker containers, including Home Assistant and HA-Dockermon (if exposed).

### Base Topic
When using MQTT, you should take care to set a unique base topic name for the configuration `mqtt.base_topic`. When adding entities to Home Assistant, HA-Dockermon will use the `mqtt.base_topic` to determine a unique ID for the container. This is important for container names which may be shared on multiple Docker hosts.

This allows multiple instances of HA-Dockermon to be deployed on each Docker host, and have them report via MQTT to your Home Assistant instances without conflicts. 

Assuming there are two instances of Home Assistant running on two seperate Docker hosts, HA-Dockermon will generate the following unqiue IDs.

| Container Name | Base Topic            | Home Assistant Unique ID            |
|----------------|-----------------------|-------------------------------------|
| home-assistant | ha_dockermon/odyssey  | ha_dockermon_odysseyhome-assistant  |
| home-assistant | ha_dockermon/daedalus | ha_dockermon_daedalushome-assistant |

In Home Assistant, these will be created as `switch.home_assistant` and `switch.home_assistant2`. You can then use the Home Assistant interface to rename these switches to something which denotes which Docker host they are running on.

### Changing Base Topic
Changing the `mqtt.base_topic` setting will cause duplicate entities to be created in Home Assistant. For this reason it is suggested that once you have set your `mqtt.base_topic` setting, you don't change it in the future.

### Whitelisting Containers
If you frequently create one-time containers to execute scripts, these may create un-necessary entities in your Home Assistant entity registry. 

To avoid this, you can set HA-Dockermon to only expose the container names that you specify in the `mqtt.whitelist_containers` setting. Any container which does not have a name in this list will not be exposed by HA-Dockermon to Home Assistant, or be controllable via MQTT command topics.

### Switch Attributes
HA-Dockermon will add information about the container to the switch attributes. Currently the information made available includes:

* State (amount of time in state, status codes)
* Status (running, exited, stopped)
* Image and tag name (if available)

### Use Without MQTT Discovery
When the `mqtt.hass_discovery.enabled` setting is turned off, it is still possible to control docker containers via MQTT. You will need to manually send the correct events to HA-Dockermon to control those containers.

Below is a sample switch for Home Assistant that can use MQTT without MQTT discovery.

```yaml
switch:
  - platform: mqtt
    name: "Home Assistant"
    state_topic: "ha_dockermon/server/home_assistant/state"
    command_topic: "ha_dockermon/server/home_assistant/set"
    payload_on: "on"
    payload_off: "off"
    state_on: "on"
    state_off: "off"
    qos: 0
    retain: true
```


# Further Reading
For more in-depth Home Assistant examples and some ideas for use, please check out [this article on my blog](https://philhawthorne.com/ha-dockermon-use-home-assistant-to-monitor-start-or-stop-docker-containers).

[buymeacoffee-icon]: https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-2.svg
[buymeacoffee]: https://www.buymeacoffee.com/philhawthorne