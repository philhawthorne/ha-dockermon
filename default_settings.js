var convict = require('convict');
    yaml = require('js-yaml');
    fs = require('fs');

var config = convict({
  debug: {
      doc: 'Set to true to enable debugging',
      format: 'Boolean',
      default: false
  },
  http: {
      port: {
          doc: 'The HTTP Port to listen on',
          format: 'port_or_windows_named_pipe',
          default: '8126'
      },
      username: {
          doc: 'Optional. The HTTP Username for authentication',
          format: String,
          default: undefined
      }, 
      password: {
        doc: 'Optional. The HTTP Password for authentication',
        format: String,
        default: undefined,
        sensitive: true
    }
  },
  docker_connection: {
    type: {
      doc: 'The type of connection to Docker.',
      format: ['socket', 'http'],
      default: 'socket'
    },
    path: {
      doc: 'Path to Docker socket',
      format: String,
      default: '/var/run/docker.sock'
    },
    host: {
      doc: 'Optional. URL to remote docker host',
      format: String,
      default: undefined
    },
    port: {
      doc: 'Optional. Port on remote docker host',
      format: 'port_or_windows_named_pipe',
      default: undefined
    }
  }
});

// Load environment dependent configuration
convict.addParser({ extension: ['yml', 'yaml'], parse: yaml.safeLoad });
var config_dir = process.env.config_dir || "./config";
console.log("Loading settings from " + config_dir);

//Check if the configuration file exists, if it doesn't then skip this
try{
  if (fs.existsSync(config_dir + '/configuration.yaml')) {
    config.loadFile(config_dir + '/configuration.yaml');
  }
} catch(err) {
  console.warn("No configuration file detected. Using default settings");
}

// Perform validation
config.validate({allowed: 'warn'});

module.exports = config;