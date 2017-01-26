* RFID is useful for tracking people or things (wristbands, tags on items)
* RFID is simple, and can be cheap
  * Cheap readers are USB only
  * Cheap readers are normally EM4100 or similar
* USB means local to the host, has to be a "proper" PC, Linux, Windows, macOS
  * Android and iOS can't easily be used
* Solution - Bridge a cheap reader(s) to the network, allow them to be used by other devices
  * PoC - Raspberry Pi, but could concievably be any SBC
  * Exposes the RFID reader output on a websocket - anyone can connect (clientside JS included!) and get the scans in realtime
  * Could be extended - eg. logging to a database vs being read by a client
  * NodeJS - lots of libraries, quick to get ging

* Selection of cheap reader
  * Uses HID to communicate RFID, keyboard emulation
  * Nessecitates the use of linux-input-device so only the correct input device is "listened" for
  * TODO: Test on R-Pi with the code below

~~~js
var LinuxInputListener = require('linux-input-device');

var input = new LinuxInputListener(config.rfid_device);

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
~~~

* Websockets
  * Allows the reader to be read by any device through clientside JS (in a browser)
  * Just sends the RFID to all clients connected, simple and allows all to be notified
  * TODO: Client should display RFID on the page, not alert

## Server
~~~js
const WebSocket = require('ws');

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

function rfidScanned(rfid) {
  console.log('RFID: ' + rfid + ' scanned');
  wss.broadcast(rfid);
}
~~~

## Client
~~~html
<!doctype html>

<html lang="en">
<head>
  <script type="text/javascript">
    var ws = new WebSocket("ws://localhost:8080/");

    ws.onmessage = function(e) {
        // Receives a message.
        alert(e.data);
    };
  </script>
</head>

<body>
</body>
</html>
~~~

* Database
  * Useful to store scans in case a client isn't connected when a scan is done
  * Somewhat compensates for a not 100% reliable network
    * Alternative would be to push to some server but another server is out of scope
  * Use an ORM (Sequelize) to deal with the database, sqlite is chosen for the example because it can just be a file

~~~js
const Sequelize = require('sequelize');

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

function rfidScanned(rfid) {
  console.log('RFID: ' + rfid + ' scanned');
  wss.broadcast(rfid);
+ Scan.create({rfid: rfid});
}
~~~

* REST API
  * Standard way of accessing data over HTTP
  * Nice library, epilogue, exists to provide an API from Sequilize
    * Gives pagination, sorting, etc, all done for you!
    * TODO: Sample of output
  * Uses Express to provide routing etc.
  * TODO: Combine REST + WebSocket servers

~~~js
const epilogue = require('epilogue');
const express = require('express');
const bodyParser = require('body-parser');

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

epilogue.initialize({
  app: app,
  sequelize: sequelize
});

// Create REST resource
var scanResource = epilogue.resource({
  model: Scan,
  endpoints: ['/scans', '/scans/:id']
});

app.listen(8081, function() {
  console.log('REST server listening');
});
~~~

* Link to code repo
* References
  * Epilogue
  * Express
  * WebSocket
  * Sequilize
  * linux-input-device
  * REST spec
