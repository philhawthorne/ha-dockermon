HA Dockermon
============

[![Docker Pulls](https://img.shields.io/docker/pulls/philhawthorne/ha-dockermon.svg)](https://dockerhub.com/philhawthorne/ha-dockermon) [![Build Status](https://travis-ci.org/philhawthorne/ha-dockermon.svg?branch=master)](https://travis-ci.org/philhawthorne/ha-dockermon) [![license](https://img.shields.io/github/license/philhawthorne/ha-dockermon.svg)](https://dockerhub.com/philhawthorne/ha-dockermon)

[![Buy me a coffee][buymeacoffee-icon]][buymeacoffee]


This is a simple Node service which checks the status of a Docker Container and returns a RESTful response. It can also be used to issue `start` `stop` `pause` `unpause` and `restart` commands. The primary purpose of this service is to interface with [Home Assistant](https://home-assistant.io) on a [Synology NAS](http://amzn.to/2FAC28A).

## Supported Features
As of this release, you can:

* Get the status of a container (running, stopped, paused).
* Start, stop, pause, or unpause a container by issuing a `POST` request.
* Start, stop, pause, or unpause a container by issuing a `GET` requst.
* Restart a container by making a `GET` request to a URL for the container (details below).
* Execute commands inside a container using the `/exec` endpoint of a container.

## Getting Started

### Configuration Options
You can change some configuration options for this service by editing config/configuration.yaml.

| Option                 | Description                                                                                                      | Default Value        |
|------------------------|------------------------------------------------------------------------------------------------------------------|----------------------|
| debug                  | If set to true, will output some helpful debug messages to the console.                                          | false                |
| http.port              | The HTTP port the service listens on. Must be a valid HTTP port or windows socket.                                                                          | 8126                 |
| http.username          | If set all calls to this service must use HTTP basic authentication with this username. **If set, must not be an empty value.**                         | None                 |
| http.password          | If set all calls to this service must use HTTP basic authentication with this password. **If set, must not be an empty value.**                         | None                 |
| docker_connection.type | How the service connects to docker. Valid options are socket or http                                             | socket               |
| docker_connection.path | The path to the Docker socket. Useful when running this service on the host directly (not in a Docker container) | /var/run/docker.sock |
| docker_connection.host | The host IP/Domain of the host Docker to connect to. Only used when `docker_connection.type` is set to `http`. If `docker_connection.type` is set to `http` do not add this to your configuration YAML.         | None                 |
| docker_connection.port | The port of the host Docker to connect to. Only used when `docker_connection.type` is set to `http`.  If `docker_connection.type` is set to `http` do not add this to your configuration YAML.                  | None                 |

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
A Raspberry Pi image is available if you wish to use this on a pi. Simply use the `arm` tag, for example:

```bash
docker run -d \
--name=ha-dockermon --restart=always \
-v /var/run/docker.sock:/var/run/docker.sock \
-v /path/to/config:/config \
-p 8126:8126 \
philhawthorne/ha-dockermon:arm
```

You may also use an older version. Check [Docker Hub](https://hub.docker.com/r/philhawthorne/ha-dockermon/tags/) for the list of tags you may use.

## Using this service

### HTTP Endpoints
This service exposes the following HTTP endpoints

#### GET /container/{container name}

Use this endpoint to get the status of a container, for example, you may make a call to `http://127.0.0.1:8126/container/home-assistant`. The response will be a JSON object in the format below.

```json
{
    "state":"running",
    "status":"Up About a minute",
    "image":"homeassistant/home-assistant:latest"
}
```

#### POST /container/{container name}

Use the same endpoint with `POST` to start or stop a container. When making a call to this endpoint you must send the correct `Content-Type` headers and JSON as the body. An example request with cURL is below.

Valid options for `state` are `start`, `stop`, `pause`, and `unpause` to start, stop, pause, or unpause a container respectively.

```bash
curl --request POST \
--url http://127.0.0.1:8126/container/grafana \
--header 'content-type: application/octet-stream' \
--data '{"state": "start"}'
```

The response will be the same format as the `GET` call above.

#### GET /container/{container name}/restart

Calls to this URL will issue a `docker restart <container name>` on the host machine. There is currently no response from the API to this request.

Useful in a Home Assistant script to restart containers (including Home Assistant itself).

#### POST /container/{container name}/exec

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

### Home Assistant RESTful Switch

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
### Home Assistant Custom Component

Thanks to [Joakim Sørensen (@ludeeus)](https://github.com/ludeeus) you can use a custom Home Assistant Component, which can automatically add switches to your Home Assistant instance from Dockermon.

You can get the custom component [here](https://gitlab.com/custom_components/hadockermon).

# Further Reading
For more in-depth Home Assistant examples and some ideas for use, please check out [this article on my blog](https://philhawthorne.com/ha-dockermon-use-home-assistant-to-monitor-start-or-stop-docker-containers).

[buymeacoffee-icon]: https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-2.svg
[buymeacoffee]: https://www.buymeacoffee.com/philhawthorne