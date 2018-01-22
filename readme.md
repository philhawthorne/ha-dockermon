HA Dockermon
============

[![Docker Pulls](https://img.shields.io/docker/pulls/philhawthorne/ha-dockermon.svg)](https://dockerhub.com/philhawthorne/ha-dockermon) [![Docker Automated build](https://img.shields.io/docker/automated/philhawthorne/ha-dockermon.svg)](https://dockerhub.com/philhawthorne/ha-dockermon) [![license](https://img.shields.io/github/license/philhawthorne/ha-dockermon.svg)](https://dockerhub.com/philhawthorne/ha-dockermon)

This is a simple Node service which checks the status of a Docker Container and returns a RESTful response. It can also be used to issue `start` `stop` and `restart` commands. The primary purpose of this service is to interface with [Home Assistant](https://home-assistant.io) on a [Synology NAS](http://amzn.to/2FAC28A).

## Supported Features
As of this release, you can:

* Get the status of a container (running, stopped).
* Start or stop a container by issuing a `POST` request.
* Restart a container by making a `GET` request to a URL for the container (details below).

## Getting Started

### Configuration Options
You can change some configuration options for this service by editing config/configuration.yaml.

| Option                 | Description                                                                                                      | Default Value        |
|------------------------|------------------------------------------------------------------------------------------------------------------|----------------------|
| debug                  | If set to true, will output some helpful debug messages to the console.                                          | false                |
| http.port              | The HTTP port the service listens on.                                                                            | 8126                 |
| http.username          | If set all calls to this service must use HTTP basic authentication with this username.                          | None                 |
| http.password          | If set all calls to this service must use HTTP basic authentication with this password.                          | None                 |
| docker_connection.type | How the service connects to docker. Valid options are socket or http                                             | socket               |
| docker_connection.path | The path to the Docker socket. Useful when running this service on the host directly (not in a Docker container) | /var/run/docker.sock |
| docker_connection.host | The host IP/Domain of the host Docker to connect to. Only used when docker_connection.type is set to http        | None                 |
| docker_connection.port | The port of the host Docker to connect to. Only used when docker_connection.type is set to http                  | None                 |

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
-v /var/run/docker.sock:/var/run/docker.sock
-v /path/to/config:/config
-p 8126:8126
philhawthorne/ha-dockermon
```

#### NodeJS
You can run this service directly from a host that has NPM and NodeJS installed. Just checkout this repository and then run:

    npm start


## Using this service

### HTTP Endpoints
This service exposes two HTTP endpoints

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

Valid options for `state` are `start` and `stop` to start or stop a container respectively.

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

The response will be a json object with a `result` key containing the output from the command executed.

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
```

# Further Reading
For more in-depth Home Assistant examples and some ideas for use, please check out [this article on my blog](https://philhawthorne.com/ha-dockermon-use-home-assistant-to-monitor-start-or-stop-docker-containers).