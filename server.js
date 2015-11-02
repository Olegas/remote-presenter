'use strict';

var app = require('express')();
var server = require('http').Server(app);
var path = require('path');
var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ server: server });

server.listen(process.env.PORT);

app.get('/', function (req, res) {
   res.sendfile(path.join(__dirname, 'static/index.html'));
});

var counterparty = new WeakMap();
var presentations = new Map();
var ids = new WeakMap();

function msgError(text) {
   return {
      type: 'error',
      message: text
   }
}

function mkId() {
   return Math.random().toString(36).substr(2, 6)
}

function msgId(id) {
   return {
      type: 'id',
      id: id
   }
}

function msgStartSession() {
   return {
      type: 'startSession'
   }
}

wss.on('connection', function connection(ws) {

   ws.send = (function(o) {
      return function (data) {
         if (typeof data == 'object') {
            return o.call(this, JSON.stringify(data))
         } else {
            return o.apply(this, arguments);
         }
      }
   })(ws.send);

   ws.on('close', function(){
      var peer = counterparty.get(this);
      if (peer) {
         peer.close();
      }
      var id = ids.get(this);
      presentations.delete(id);
   });

   ws.on('message', function (data) {
      try {
         var message = JSON.parse(data);
      } catch (e) {
         ws.send(msgError(''+e));
         ws.close();
      }
      switch(message.type) {
         case 'ice':
         case 'sdp':
            let peer = counterparty.get(this);
            if (peer) {
               peer.send(data);
            } else {
               ws.send(msgError('Missing peer'));
               ws.close();
            }
            break;
         case 'controller':
         case 'presenter':
            if (message.type == 'controller') {
               let id = mkId();
               ids.set(this, id);
               presentations.set(id, this);
               ws.send(msgId(id))
            } else {
               let controller = presentations.get(message.id);
               if (controller) {
                  counterparty.set(controller, this);
                  counterparty.set(this, controller);
                  presentations.delete(message.id);
                  controller.send(msgStartSession());
                  this.send(msgStartSession());
               } else {
                  ws.send(msgError('No controller for this presentation'));
                  ws.close();
               }
            }
      }
   });


});
