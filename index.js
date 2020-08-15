var express = require("express");
var basicAuth = require('express-basic-auth')
var bodyParser = require('body-parser');
var Docker = require('dockerode');
var fs = require('fs');
var http = require('http');
var https = require('https');
var config = require('./default_settings.js');
var docker = false;
var dockermonMqtt = require("./mqtt/hadockermon_mqtt.js");
var mqtt = require('mqtt');

//If we are set to use MQTT, start the MQTT connection
if (config.get("mqtt.enabled")) {
    if (config.get("debug")) {
        console.log("MQTT is enabled");
    }
    
    options = {
        clientId: 'hadockermon_' + Math.random().toString(16).substr(2, 8),
        will: {
            topic: config.get("mqtt.base_topic") + "/status",
            payload: "offline",
            retain: true
        }
    }

    //If we have a username and password set, use them
    if (config.get("mqtt.username") && config.get("mqtt.password")) {
        options.username = config.get("mqtt.username");
        options.password = config.get("mqtt.password");
    }
    mqtt_client = mqtt.connect('mqtt://' + config.get("mqtt.host") + ":" + config.get("mqtt.port"), options);
    mqtt_client.on('connect', function(){
        //Send the states for each running container
        dockermonMqtt.init(config, mqtt_client, docker);
        dockermonMqtt.startMqtt();
    });
} else {
    if (config.get("debug")) {
        console.log("MQTT not enabled");
    }
}

//Setup express
var app = express();
app.use(bodyParser.json({
    type: ['application/octet-stream', 'application/json']
}));

var pull_lock = [];

//If we have set a username and password, require it
if (config.get("http.username")) {
    var authUsers = {
        users: {}
    }
    authUsers.users[config.get("http.username")] = config.get("http.password");
    app.use(basicAuth(authUsers));
}

//Set the container route
app.all('/container/:containerId', function (req, res) {

    if (!req.params.containerId) {
        //This paramater is required
        res.status(400);
        res.send("Container ID is required");
        return;
    }

    var containerId = req.params.containerId;
    //Does this container exist in Docker? If not respond with 404 not found and body of off

    if (req.method == "POST") {
        //First get the container
        if (config.get("debug"))
            console.log("Updating container " + containerId);

        getContainer(containerId, function (container) {
            if (req.body.state == "start") {
                if (config.get("debug"))
                    console.log("Attempting to start container " + container.Id);

                docker.getContainer(container.Id).start(function (err, data) {
                    if (err) {
                        if (config.get("debug")) {
                            console.log("Failed to start container " + container.Id);
                            console.log(err);
                        }

                        res.status(500);
                        res.send(err);
                        return;
                    }
                    if (config.get("debug"))
                        console.log("Container started");

                    res.status(200);
                    res.send({
                        state: "running"
                    });
                });
            } else if (req.body.state == "stop") {
                if (config.get("debug"))
                    console.log("Attempting to stop container " + container.Id);

                docker.getContainer(container.Id).stop(function (err, data) {
                    if (err) {
                        if (config.get("debug")) {
                            console.log("Failed to stop container " + container.Id);
                            console.log(err);
                        }

                        res.status(500);
                        res.send(err);
                        return;
                    }
                    if (config.get("debug"))
                        console.log("Container stopped");

                    res.status(200); //We found the container! This reponse can be trusted
                    res.send({
                        state: "stopped"
                    });
                });
            } else if (req.body.state == "pause") {
                if (config.get("debug"))
                    console.log("Attempting to pause container " + container.Id);

                docker.getContainer(container.Id).pause(function (err, data) {
                    if (err) {
                        if (config.get("debug")) {
                            console.log("Failed to pause container " + container.Id);
                            console.log(err);
                        }

                        res.status(500);
                        res.send(err);
                        return;
                    }
                    if (config.get("debug"))
                        console.log("Container paused");

                    res.status(200); //We found the container! This reponse can be trusted
                    res.send({
                        state: "paused"
                    });
                });
             } else if (req.body.state == "unpause") {
                if (config.get("debug"))
                    console.log("Attempting to unpause container " + container.Id);

                docker.getContainer(container.Id).unpause(function (err, data) {
                    if (err) {
                        if (config.get("debug")) {
                            console.log("Failed to unpause container " + container.Id);
                            console.log(err);
                        }

                        res.status(500);
                        res.send(err);
                        return;
                    }
                    if (config.get("debug"))
                        console.log("Container unpaused");

                    res.status(200); //We found the container! This reponse can be trusted
                    res.send({
                        state: "running"
                    });
                });
             }
        }, function (status, message) {
            if (config.get("debug"))
                console.log("Failed to get status of Docker container");

            res.status(status);
            if (message) {
                res.send(message);
                if (config.get("debug"))
                    console.log(message);
            }
        })

    } else {
        //We are getting the status of the container
        if (config.get("debug"))
            console.log("Getting status of container " + containerId);
        getContainer(containerId, function(container){
            res.status(200); //We found the container! This response can be trusted
            if (config.get("debug")) {
                console.log("Response received");
                console.log(container);
            }
            res.send({
                state: container.SynoStatus || container.State,
                status: container.Status,
                image: container.Image
            });
        }, function(status, message){
            res.status(status);
            if (config.get("debug"))
                console.log("Failed to get status of Docker container");
            if (message) {
                res.send(message);
                if (config.get("debug"))
                    console.log(message);
            }
        });
    }
});

/**
 * List all of the containers
 */
app.get('/containers', function (req, res) {
    docker.listContainers({ all: true }, function (err, containers) {
        if (err) {
            res.status(500);
            res.send(err);
            return;
        }
        res.status(200);
        res.send(containers);
    });
});


/**
 * Restart the container by the ID specified
 */
app.get('/container/:containerId/restart', function (req, res) {
    var containerId = req.params.containerId;
    console.log("Restart " + containerId);

    getContainer(containerId, function (container) {
        docker.getContainer(container.Id).restart(function (err, data) {
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            res.status(200); //We found the container! This reponse can be trusted
            res.send(data);
        });
    }, function (status, message) {
        res.status(status);
        if (message) {
            res.send(message);
        }
    })
});


/**
 * Start the container by the ID specified
 */
app.get('/container/:containerId/start', function (req, res) {
    var containerId = req.params.containerId;
    console.log("Start " + containerId);

    getContainer(containerId, function (container) {
        docker.getContainer(container.Id).start(function (err, data) {
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            res.status(200); //We found the container! This reponse can be trusted
            res.send(data);
        });
    }, function (status, message) {
        res.status(status);
        if (message) {
            res.send(message);
        }
    })
});

/**
 * Pause the container by the ID specified
 */
app.get('/container/:containerId/pause', function (req, res) {
    var containerId = req.params.containerId;
    console.log("Pause " + containerId);

    getContainer(containerId, function (container) {
        docker.getContainer(container.Id).pause(function (err, data) {
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            res.status(200); //We found the container! This reponse can be trusted
            res.send(data);
        });
    }, function (status, message) {
        res.status(status);
        if (message) {
            res.send(message);
        }
    })
});

/**
 * Unpause the container by the ID specified
 */
app.get('/container/:containerId/unpause', function (req, res) {
    var containerId = req.params.containerId;
    console.log("Unpause " + containerId);

    getContainer(containerId, function (container) {
        docker.getContainer(container.Id).unpause(function (err, data) {
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            res.status(200); //We found the container! This reponse can be trusted
            res.send(data);
        });
    }, function (status, message) {
        res.status(status);
        if (message) {
            res.send(message);
        }
    })
});

/**
 * Stats the container by the ID specified
 */
app.get('/container/:containerId/stats', function (req, res) {
    var containerId = req.params.containerId;
    console.log("Getting Stats for " + containerId);
    var opts= new Object();
    opts.stream = false
    getContainer(containerId, function (container) {
        docker.getContainer(container.Id).stats(opts, function (err, data) {
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            res.status(200); //We found the container! This reponse can be trusted
            res.send(data);
        });
    }, function (status, message) {
        res.status(status);
        if (message) {
            res.send(message);
        }
    })
});


/**
 * Stop the container by the ID specified
 */
app.get('/container/:containerId/stop', function (req, res) {
    var containerId = req.params.containerId;
    console.log("Stop " + containerId);

    getContainer(containerId, function (container) {
        docker.getContainer(container.Id).stop(function (err, data) {
            if (err) {
                res.status(500);
                res.send(err);
                return;
            }
            res.status(200); //We found the container! This reponse can be trusted
            res.send(data);
        });
    }, function (status, message) {
        res.status(status);
        if (message) {
            res.send(message);
        }
    })
});

app.post('/container/:containerId/exec', function(req, res) {
    var containerId = req.params.containerId;
    console.log("Exec " + containerId);

    var command = req.body.command ? req.body.command : false;
    if (command == "" || !command) {
        res.send({
            status: false,
            error: "No command specified"
        });
        res.status(400);
        return;
    }

    getContainer(containerId, function (container) {
        if (config.get("debug"))
            console.log("Attempting to execute command in container " + container.Id);
        var options = {
            Cmd: command.split(" "),
            AttachStdout: true,
            AttachStderr: true
        };
        if (config.get('debug'))
            console.log(options);

        var container = docker.getContainer(container.Id);
        container.exec(options, function (err, exec) {
            if (err) {
                if (config.get("debug")) {
                    console.log("Failed to get container " + container.Id);
                    console.log(err);
                }

                res.status(500);
                res.send(err);
                return;
            }

            exec.start(function (err, stream) {
                if (err) {
                    if (config.get("debug")) {
                        console.log("Failed to execute in container " + container.Id);
                        console.log(err);
                    }

                    res.status(500);
                    res.send(err);
                    return;
                }
                console.log("executed query");
                const chunks = [];
                stream.on("data", function (chunk) {
                    chunks.push(chunk.toString());
                });

                // Send the buffer or you can put it into a var
                stream.on("end", function () {
                    // We remove the first 8 chars as the contain a unicode START OF HEADING followed by ENQUIRY.
                    res.send({
                        status: true,
                        result: chunks.join('').substr(8)
                    });
                });
            });
            return;
        });
    }, function (status, message) {
        res.status(status);
        if (message) {
            res.send(message);
        }
    });
});

/**
 * Pull the latest image for the given repository/tag.
 * When the pull is complete, notify the provided callback_uri of success or failure.
 */
app.post('/pull/*', function (req, res) {
    var repoTag = req.params[0];
    console.log("Pull" + repoTag + "asynchronously");
    var callback = req.body.callback_uri ? req.body.callback_uri : false;
    if (callback == "" || !callback) {
        res.send({
            status: false,
            error: "No callback_uri specified. Use GET /pull/* to pull without a callback."
        });
        res.status(400);
        return;
    } else {
        if (pull_lock.includes(repoTag)) {
            res.send({
                status: false,
                result: "Container is currently being pulled by another process"
            });
            res.status(400);
            return;
        }
        pull_lock.push(repoTag);
        res.send({
            status: true,
            result: "Started pulling " + repoTag
        })
    }
    docker.pull(repoTag, function (err, stream) {
        if (err) {
            if (config.get("debug")) {
                console.log("Failed to pull docker image " + repoTag);
                console.log(err);
            }
            var data = { status: false, error: `Failed to pull docker image ${repoTag}` };
            postCallbackRequest(callback, data);
            return;
        }
        console.log("Pulling image " + repoTag);
        const chunks = [];
        stream.on("data", function (chunk) {
            chunks.push(chunk.toString());
        });

        stream.on("end", function () {
            var data = { status: true, result: `Finished pulling docker image ${repoTag}` }
            postCallbackRequest(callback, data);

            //Clear the pull lock
            const index = pull_lock.indexOf(repoTag);
            if (index > -1) {
                pull_lock.splice(index, 1);
            }
        });
    });
});

//Attempt to connect to the Docker daemon
switch (config.get("docker_connection.type")) {
    case "http":
        var docker = new Docker({ host: config.get("docker_connection.host"), port: config.get("docker_connection.port") });
    break;

    case "socket":
        //Check if the socket is okay
        try{
            let stats = fs.statSync(config.get("docker_connection.path"));

            if (!stats.isSocket()) {
                throw new Error('Unable to connect to Docker socket at ' + config.get("docker_connection.path") + ". Is Docker running?");
            }
        } catch (e) {
            console.error('Unable to connect to Docker socket at ' + config.get("docker_connection.path") + ". Is Docker running?");
            if (config.get("debug"))
                console.log(e);
            process.exit(1);
        }
        //Socket is okay, connect to it
        docker = new Docker({ socketPath: config.get("docker_connection.path") });
    break;

    default:
        throw new Error("Docker connection type " + config.get("docker_connection.type") + " is invalid");
    break;
}

startServer(docker);

function startServer(docker)
{
    var server = app.listen(config.get("http.port"), function () {
        console.log("HA-Dockermon server listening on port " + server.address().port);
    });
}

function getContainer(name, cb, error)
{
    docker.listContainers({ limit:100, filters: { "name": [name] } }, function (err, containers) {
        if (err) {
            if (typeof error == "function")
                return error(500, err);

            return;
        }

        if (containers.length > 0) {
            //What is the ID of this container?
            //We need to only return the ID as it matches exactly
            for(id in containers) {
                //Does this container have names set?
                if (containers[id].Names.length) {
                    //Yes it does, loop over all names to see if we get one
                    for(i in containers[id].Names) {
                        if (containers[id].Names[i] == "/" + name) {
                            //Found it by name!
                            return cb(containers[id]);
                        }
                    }
                }
            }
        }

        //Hmm lets try get the container by ID instead
        docker.listContainers({ filters: { "id": [name] } }, function (err, containers) {
            if (err) {
                if (typeof error == "function")
                    return error(500, err);
    
                return;
            }
    
            if (containers.length < 1) {
                if (typeof error == "function")
                    return error(404, "container not found");
                
                return;
            }
    
            //What is the ID of this container?
            //We need to only return the ID as it matches exactly
            for(id in containers) {
                //Does this container have names set?
                if (containers[id].Names.length) {
                    //Yes it does, check the first name
                    if (containers[id].Id == name) {
                        //Found it by name!
                        return cb(containers[id]);
                    }
                }
            }

            //Could not find that container - sad face
            if (typeof error == "function")
                return error(404, "container not found");
            
            return false;
        });
    });
}

function postCallbackRequest(url, data)
{
    var reqOpts = { method: 'POST', headers: { 'content-type': 'application/json' } };
    if (url.indexOf("https") > -1) {
        var req = https.request(url, reqOpts, function (res) {
            res.on('end', function () { console.log(`Message sent to callback uri: ${data}`) });
        });
    } else {
        var req = http.request(url, reqOpts, function (res) {
            res.on('end', function () { console.log(`Message sent to callback uri: ${data}`) });
        });
    }
    
    req.on('error', function (err) {
        console.error(`Error sending POST request to callback URI: ${err.message}`);
    });
    req.write(JSON.stringify(data));
    req.end();
}

process.on('SIGINT', function() {
    console.log("Caught interrupt signal");
    if (config.get('mqtt.enabled')) {
        if (typeof intervalObj != 'undefined')
            clearInterval(intervalObj);
        mqtt_client.end(function(){
            process.exit();
        });
    } else {
        process.exit();
    }
});
process.on('SIGTERM', function() {
    console.log("Caught terminate signal");
    if (config.get('mqtt.enabled')) {
        if (typeof intervalObj != 'undefined')
            clearInterval(intervalObj);
    }
    
    process.exit();
});
