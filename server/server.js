const WebSocket = require('ws');
const Sequelize = require('sequelize');
const epilogue = require('epilogue');
const express = require('express');
const bodyParser = require('body-parser');
const LinuxInputListener = require('linux-input-device');

const wss = new WebSocket.Server({ port: 8080 });

// Broadcast to all.
wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

wss.on('connection', function connection(ws) {
    console.log('client connected');
});

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

var sequelize = new Sequelize('database', null, null, {
  dialect: 'sqlite',

  // SQLite only
  storage: 'database.sqlite'
});

var Scan = sequelize.define('scan', {
  rfid: {
    type: Sequelize.STRING
  }
});

epilogue.initialize({
  app: app,
  sequelize: sequelize
});

// Create REST resource
var scanResource = epilogue.resource({
  model: Scan,
  endpoints: ['/scans', '/scans/:id']
});

Scan.sync().then(databaseReady);

function databaseReady() {    
  function rfidScanned(rfid) {
    console.log('RFID: ' + rfid + ' scanned');
    wss.broadcast(rfid);
    Scan.create({rfid: rfid});
  }

  var input = new LinuxInputListener('/dev/input/event0');

  var rfidString = '';

  input.on('state',(value, key, kind) => {
      if(value == true && kind == 'EV_KEY') {
          if(key == 28) { // Newline
              console.log('Read rfid: ' + rfidString);
              rfidScanned(rfidString);
              rfidString = '';
          } else { // Add to existing string
              rfidString = rfidString + '1234567890'[key - 2];
          }
      }
  });

  input.on('error', console.error);

  app.listen(8081, function() {
    console.log('REST server listening');
  });
}
