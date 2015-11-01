var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');

server.listen(process.env.PORT);

app.get('/', function (req, res) {
   res.sendfile(path.join(__dirname, 'static/index.html'));
});

io.on('connection', function (socket) {
   socket.emit('news', { hello: 'world' });
   socket.on('my other event', function (data) {
      console.log(data);
   });
});