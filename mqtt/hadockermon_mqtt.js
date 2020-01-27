module.exports = {
    config: null,
    mqtt_client: null,
    docker: null,

    init: function(config, mqtt_client, docker)
    {
        this.config = config;
        this.mqtt_client = mqtt_client;
        this.docker = docker;
    },

    checkDeletedContainers: function(pushedContainers)
    {
        if (hadockermon.config.get("debug")) {
            console.log("Checking for deleted containers");
        }
        for (i in hadockermon.mqttContainers) {
            if (pushedContainers.indexOf(i) < 0) {
                //Was not pushed? Increment errors
                hadockermon.mqttContainers[i].errors++;

                if (hadockermon.config.get("debug")) {
                    console.log("Cannot find container " + i + " in pushed containers");
                    console.log("Error rate for " + i + " is not " + hadockermon.mqttContainers[i].errors);
                }

                //If we have three strikes, you're out!
                if (hadockermon.mqttContainers[i].errors === 3) {
                    hadockermon.mqttRemove(i);
                }
            } else {
                hadockermon.mqttContainers[i].errors = 0;
            }
        }
    },

    getContainer: function(name, cb, error)
    {
        this.docker.listContainers({ limit:100, filters: { "name": [name] } }, function (err, containers) {
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
            this.docker.listContainers({ filters: { "id": [name] } }, function (err, containers) {
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
    },

    handleMessage: function(topic, message, packet){
        //Extract the topic we were sent on
        if (topic.indexOf("state") >= 0) {
            if (hadockermon.config.get("debug")) {
                console.log("Received state message on topic " + topic);
            }

            //We are receiving the state topic, add this to published containers
            var container_name = topic.replace(hadockermon.config.get("mqtt.base_topic") + "/", "").replace("/state", "");
            if (!hadockermon.mqttContainers[container_name]) {
                hadockermon.mqttContainers[container_name] = {
                    errors: 0
                }
            }
            return;
        } else if (topic.indexOf("set") < 0) {
            //Don't do anything with this message
            return;
        }

        var container_name = topic.replace(hadockermon.config.get("mqtt.base_topic") + "/", "").replace("/set", "");
    
        //Switch based on the type of message
        if (message == "stop" || (hadockermon.config.get("mqtt.hass_discovery.enabled") && message == "off")) {
            if (!hadockermon.isWhitelisted(container_name)) {
                //This container is not whitelisted
                return;
            }

            if (hadockermon.config.get("debug")) {
                console.log("Stopping container " + container_name);
            }
            
            hadockermon.getContainer(container_name, function (container) {
                hadockermon.docker.getContainer(container.Id).stop(function (err, data) {
                    if (err) {
                        return;
                    }
                    setTimeout(function(){
                        hadockermon.publishMqtt(mqtt_client);
                    }, 200);
                });
            }, function (status, message) {
                console.log("Something went wrong? " + status + " " + message);
                res.status(status);
                if (message) {
                    res.send(message);
                }
            })
        } else if (message == "start" || (hadockermon.config.get("mqtt.hass_discovery.enabled") && message == "on")) {
            if (!hadockermon.isWhitelisted(container_name)) {
                //This container is not whitelisted
                return;
            }
            hadockermon.getContainer(container_name, function (container) {
                hadockermon.docker.getContainer(container.Id).start(function (err, data) {
                    if (err) {
                        return;
                    }
                    setTimeout(function(){
                        hadockermon.publishMqtt(mqtt_client);
                    }, 200);
                });
            }, function (status, message) {
                console.log("Something went wrong? " + status + " " + message);
                res.status(status);
                if (message) {
                    res.send(message);
                }
            })
        }
        
    },

    initializeEntities: function (name, containerInfo)
    {
        if (this.config.get("debug")) {
            console.log("Setting up entity via HASS discovery for " + name);
        }

        //Publish to the Home Assistant topic with a switch
        var jsonConfig = {
            name: name,
            state_topic: this.config.get("mqtt.base_topic") + "/" + name + "/state",
            command_topic: this.config.get("mqtt.base_topic") + "/" + name + "/set",
            availability_topic: this.config.get("mqtt.base_topic") + "/status",
            payload_on: "on",
            payload_off: "off",
            payload_available: "online",
            payload_not_available: "offline",
            unique_id: this.config.get("mqtt.base_topic").replace("/","_") + name.replace("-", "_"),
            json_attributes_topic: this.config.get("mqtt.base_topic") + "/" + name + "/attributes"
        }

        this.mqtt_client.publish(this.config.get("mqtt.hass_discovery.base_topic") + "/switch/" + this.config.get("mqtt.base_topic").replace("/", "_") + "/" + name.replace("-", "_") + "/config", JSON.stringify(jsonConfig), {
            retain: true
        });
    },

    isWhitelisted: function(name){
        if (this.config.get('mqtt.whitelist_containers') !== undefined) {
            //Is the name of this container on the whitelist?
            return this.config.get('mqtt.whitelist_containers').includes(name);
        }

        return true;
    },

    hassDiscoveryPublish: function(name, containerInfo)
    {
        if (this.config.get("debug")) {
            console.log("Sending discovery state message for " + name);
        }
        var state = "off";
        var containerState = containerInfo.SynoStatus || containerInfo.State;
        if (containerState == "running") {
            state = "on";
        }
        this.mqtt_client.publish(this.config.get("mqtt.base_topic") + "/" + name + "/state", state , {
            retain: true
        });

        //Now publish some attributes

        //Container name, status, image name, running since
        var jsonAttributes = {
            name: name,
            icon: "mdi:docker",
            status: containerInfo.Status,
            state:  containerState
        }
        if (containerInfo.Image) {
            jsonAttributes.image = containerInfo.Image;
        }

        //Customise the icon based on the image
        if (jsonAttributes.image) {
            if (jsonAttributes.image.indexOf("homeassistant") > -1) {
                jsonAttributes.icon = "mdi:home-assistant";
            } else if (jsonAttributes.image.indexOf("zigbee2mqtt") > -1) {
                jsonAttributes.icon = "mdi:zigbee";
            } else if (jsonAttributes.image.indexOf("plex") > -1 || jsonAttributes.image.indexOf("tautulli") > -1) {
                jsonAttributes.icon = "mdi:plex";
            } else if (jsonAttributes.image.indexOf("zwave") > -1 || jsonAttributes.image.indexOf("z-wave") > -1) {
                jsonAttributes.icon = "mdi:z-wave";
            } else if (jsonAttributes.image.indexOf("mysql") > -1 || jsonAttributes.image.indexOf("mariadb") > -1  || jsonAttributes.image.indexOf("influx") > -1) {
                jsonAttributes.icon = "mdi:database";
            } else if (jsonAttributes.image.indexOf("transmission") > -1 || jsonAttributes.image.indexOf("nzbget") > -1) {
                jsonAttributes.icon = "mdi:download-multiple";
            } else if (jsonAttributes.image.indexOf("radarr") > -1 || jsonAttributes.image.indexOf("sonarr") > -1) {
                jsonAttributes.icon = "mdi:radar";
            } else if (jsonAttributes.image.indexOf("vpn") > -1) {
                jsonAttributes.icon = "mdi:vpn";
            } else if (jsonAttributes.image.indexOf("traccar") > -1) {
                jsonAttributes.icon = "mdi:crosshairs-gps";
            } else if (jsonAttributes.image.indexOf("alexa") > -1) {
                jsonAttributes.icon = "mdi:amazon-alexa";
            } else if (jsonAttributes.image.indexOf("homekit") > -1 || jsonAttributes.image.indexOf("homebridge") > -1) {
                jsonAttributes.icon = "mdi:apple";
            } else if (jsonAttributes.image.indexOf("nodered") > -1 || jsonAttributes.image.indexOf("node-red") > -1) {
                jsonAttributes.icon = "mdi:nodejs";
            }

        }

        this.mqtt_client.publish(this.config.get("mqtt.base_topic") + "/" + name + "/attributes", JSON.stringify(jsonAttributes), {
            retain: false
        });
    },

    mqttRemove: function(name)
    {
        if (hadockermon.config.get("debug")) {
            console.log("Publishing remove state for " + name);
        }
        //Publish a remove topic
        if (this.config.get("mqtt.hass_discovery.enabled")) {
            this.mqtt_client.publish(this.config.get("mqtt.hass_discovery.base_topic") + "/switch/" + this.config.get("mqtt.base_topic").replace("/","_") + name.replace("-", "_") + "/config", "", {
                retain: false
            });
        } else {
            //Just publish the state as destroyed
            this.mqtt_client.publish(this.config.get("mqtt.base_topic") + "/" + name + "/state", "destroyed", {
                retain: false
            });
        }
    },

    publishMqtt: function()
    {
        //Store the containers we published to in an array for tracking later
        this.pushedContainers = [];

        //Get all containers
        hadockermon = this;
        this.docker.listContainers( {
            all: true
        }, function (err, containers) {
            containers.forEach(function (containerInfo, idx, all_containers) {
                //Use the first name index as the name for this container
                var name = hadockermon.topicName(containerInfo.Names);

                if (!hadockermon.isWhitelisted(name)) {
                    //This container is not whitelisted so don't publish it
                    return;
                }

                //Are we already tracking this container?
                if (!hadockermon.mqttContainers[name]) {
                    //No, set the home assistant variables if required
                    if (hadockermon.config.get("mqtt.hass_discovery.enabled")) {
                        hadockermon.initializeEntities(name, containerInfo);
                    }
                }

                if (hadockermon.config.get("mqtt.hass_discovery.enabled")) {
                    hadockermon.hassDiscoveryPublish(name, containerInfo);
                } else {
                    //Just publish the state
                    hadockermon.mqtt_client.publish(hadockermon.config.get("mqtt.base_topic") + "/" + name + "/state", containerInfo.State , {
                        retain: false
                    });
                }

                hadockermon.pushedContainers.push(name);

                //If this is the last item, we need to check for any deleted items
                if (idx === all_containers.length - 1){ 
                    hadockermon.checkDeletedContainers(hadockermon.pushedContainers);
                }
            });
        });
    },

    startMqtt: function() {    
        var loop_interval = this.config.get("mqtt.scan_interval");
    
        //Store an array of containers we have tracked
        //If we can't detect this container, we'll assume it has been deleted
        //and remove the entity from Home Assistant if applicable
    
        this.mqttContainers = {};
    
        this.publishMqtt();

        hadockermon = this;

        this.mqtt_client.on('message', hadockermon.handleMessage)

        this.mqtt_client.subscribe(this.config.get("mqtt.base_topic") + "/#");
    
        this.mqttPublisher = setInterval(function(){
            hadockermon.publishMqtt(mqtt_client);
        }, loop_interval * 1000);

        var topic = this.config.get("mqtt.base_topic") + "/status";
        this.mqtt_client.publish(topic, "online", {
            retain: true
        });
    
        this.mqtt_client.on('disconnect', function(){
            console.log("MQTT disconnected");
            clearInterval(this.mqttPublisher);
        });
    
        // process.exit();
    },

    subscribe: function(name)
    {
        this.mqttContainers[name] = {
            errors: 0
        }

        if (this.config.get("debug")) {
            console.log("Subscribing to " + this.config.get("mqtt.base_topic") + "/" + name + "/set");
        }

        this.mqtt_client.subscribe(this.config.get("mqtt.base_topic") + "/" + name + "/set");
    },

    topicName: function(names)
    {
        if (names[0]) {
            name = names[0];
            if (name[0] == "/") {
                name = name.substr(1);
            }
        }
        
        return name;
    }
}