var convict = require('convict');
    yaml = require('js-yaml');

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
          default: ''
      }, 
      password: {
        doc: 'Optional. The HTTP Password for authentication',
        format: String,
        default: '',
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
      doc: 'URL to remote docker host',
      format: String,
      default: ''
    },
    port: {
      doc: 'Port on remote docker host',
      format: 'port_or_windows_named_pipe'
    }
  }
});

// Load environment dependent configuration
convict.addParser({ extension: ['yml', 'yaml'], parse: yaml.safeLoad });
var config_dir = process.env.config_dir || "./config";
console.log("Loading settings from " + config_dir);
config.loadFile(config_dir + '/configuration.yaml');

// Perform validation
config.validate({allowed: 'warn'});

module.exports = config;