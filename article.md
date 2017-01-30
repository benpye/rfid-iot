# Developing an IoT RFID scanner

RFID (radio frequency identification) is a simple, inexpensive technology that can be used for a variety of purposes, from the security barriers in shops, to ID cards used to open doors, some version of RFID is being employed. This article will discuss the use of EM4100 type RFID tags, a short range, passive, RFID technology. The EM4100 type tags are passive, this means that they do not require any power themselves, only the readers need to be powered, resulting in very low cost tags, but also meaning they require no maintainance. This type of tag would be suitable for a range of applications, one example might be wristbands for an admissions system.

There are a variety of readers for the EM4100 tags, some are network connected though these normally come with a very high price tag, others have a USB connection and some host software, again these are generally quite expensive (£100s), and due to the bundled software, are somewhat limited in application to whatever the manafacturer intends. There are however very inexpensive readers (<£10) available, these just act as a USB keyboard. Due to the keyboard interface the devices are limited in use, using them with an Android or iOS device is challenging, and with a device without a USB interface is impossible. This article focuses on turning these cheap RFID scanners into IoT devices.

The article assumes the use of an EM4100 scanner, with a HID interface, and a Raspberry Pi 3 B SBC, however it could be applied to scanners and Linux platforms with little to no changes. The code given is in Node.js due to the avaliability of libraries, and the portability to different platforms. The full source code is linked at the end.

As the devices act as a keyboard, you could read the input just by listening for keyboard input through the standard input stream. This has the issue however that it cannot be filtered by device. To circumvent this issue, a Linux specific device API is used.

~~~javascript
const LinuxInputListener = require('linux-input-device');

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
~~~

The code above listens for keyboard input from a specific keyboard device (here `event0` specified by the string '`/dev/input/event0`'), and upon a full 10 digit string being input, followed by a newline, the rfidScanned method is called, this will be defined later.

Now that our application can listen for the RFID scan, this needs to be communicated somehow. A useful method for this is WebSockets. WebSockets allow almost any application to access the RFID scanner, from browser JS, to a server written in C++. This versatility suits our goal of making this scanner easily accessible by any device. The simplest way to send each scan over WebSockets is simply to broadcast the RFID, when read, to all clients. An example of receiving each scan in the browser is also given, raising a alert box when the tag is scanned.

### Server:
~~~javascript
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

### Client:
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

Another useful function is to log each scan, so that a client that is not constantly connected can still poll for a scan. This adds some way to compensate for an unreliable network too, as a momentary disconnection does not have to result in a missed scan. Another alternative would be to push all the RFID scans to some server, whilst this would be a better solution as it would remove the need to store the scans on the device, due to the additional complexity it will not be covered here.

An ORM (object-relational mapping) library is used to abstract the database, in this case Sequelize is used. Sequelize allows for the use of PostreSQL, MSSQL, MySQL, MariaDB and SQLite. In this example SQLite is used for it's simplicity, it only requires a file for the database. The `Scan` table is defined, with a single field, `rfid` as Sequelize will store a timestamp for creation and update by default, the latter is of no interest in this example. The `rfidScanned` method is modified to add a call to `Scan.create`, adding a new row to the table, with the new RFID scan.

~~~javascript
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

Just storing the data is of limited use, especially with a SQLite database, to allow the data to be consumed by another device an API must be provided. REST is the modern standard for HTTP APIs, by using Sequlize providing a REST API from the table is easy. The library Epilogue provides a REST endpoint for the `Scan` table, with features such as pagination and sorting. Express is used to route HTTP requests to Epilogue.

~~~javascript
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

With this API the device should be easily interfaces from almost any networked device, from smartphones and tablets, to servers, to other embedded devices. Decoupling the RFID technology and the interface also allows for the reader or even the type of tag to be changed, whilst keeping a constant API so that any client application does not need to be modified. All code presented is available on GitHub at [https://github.com/benpye/rfid-iot](https://github.com/benpye/rfid-iot).

## References

* EM4100 datasheet - [http://www.smartstripe.com/wp-content/uploads/2012/10/EM4100.pdf](http://www.smartstripe.com/wp-content/uploads/2012/10/EM4100.pdf)
* EM4100 reader - [http://www.xfpga.com/html_products/EM4100-reader-001-35.html](http://www.xfpga.com/html_products/EM4100-reader-001-35.html)
* linux-input-device - [https://github.com/athombv/node-linux-input-device](https://github.com/athombv/node-linux-input-device)
* Node.js WebSockets - [http://websockets.github.io/ws/](http://websockets.github.io/ws/)
* HTML5 WebSockets - [https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
* Sequlize - [http://docs.sequelizejs.com/en/v3/](http://docs.sequelizejs.com/en/v3/)
* Express - [https://expressjs.com/](https://expressjs.com/)
* REST specification - [https://www.w3.org/2001/sw/wiki/REST](https://www.w3.org/2001/sw/wiki/REST)
* Epilogue - [https://github.com/dchester/epilogue](https://github.com/dchester/epilogue)
