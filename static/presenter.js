var Presenter = (function() {

   window.RTCPeerConnection = window.RTCPeerConnection || webkitRTCPeerConnection;
   window.RTCIceCandidate = window.RTCIceCandidate || webkitRTCIceCandidate;
   window.RTCSessionDescription = window.RTCSessionDescription || webkitRTCSessionDescription;
   navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

   function nop() {}

   function establishRTC(pc, ws, isCaller) {

      function negotiate() {
         pc.createOffer(function (offer) {
            pc.setLocalDescription(offer);
            ws.send({ type: 'sdp', 'sdp': pc.localDescription });
         }, function(e){
            _raiseError(new Error('createOffer error: ' + e));
         });
      }

      ws.onmessage = function(msg) {
         var m = JSON.parse(msg.data);
         if (m.type == 'ice') {
            if (m.ice) {
               pc.addIceCandidate(new RTCIceCandidate(m.ice));
            }
         } else if (m.type == 'sdp') {
            var desc = new RTCSessionDescription(m.sdp);
            // if we get an offer, we need to reply with an answer
            if (desc.type == "offer") {
               pc.setRemoteDescription(desc, function () {
                  pc.createAnswer(function(ans){
                     pc.setLocalDescription(ans);
                     ws.send({ type: 'sdp', 'sdp': pc.localDescription });
                  }, function(err){
                     _raiseError(new Error('createAnswer error: ' + err));
                  });
               }, function(err){
                  _raiseError(new Error('setRemoteDescription error: ' + err));
               });
            } else {
               pc.setRemoteDescription(desc, null, alert);
            }
         } else if (m.type == 'error') {
            _raiseError(new Error(e.message));
         }
      };

      pc.onicecandidate = function (evt) {
         if (evt.candidate) {
            ws.send({type: 'ice', ice: evt.candidate});
         }
      };

      pc.onaddstream = function (evt) {
         Presenter.onremotestream(evt.stream);
      };

      navigator.getUserMedia({ video: true, audio: true }, function gumSuccess(stream){
         Presenter.onlocalstream(stream);
         pc.addStream(stream);
         if (isCaller) {
            negotiate();
         }

      }, function gumError(e){
         _raiseError(new Error('getUserMedia error: ' + e));
      })
   }

   function beginAs(mode, remoteId) {

      if (mode == 'presenter' && !remoteId) {
         _raiseError(new Error('Remote ID required for "presenter" mode'));
      }

      var pc = new RTCPeerConnection({
         iceServers: [{
            'url': 'stun:stun.l.google.com:19302'
         }]
      });

      var ws = new WebSocket('wss://presenter-signaling.herokuapp.com/');

      var dataChannel;

      ws.send = (function(o) {
         return function (data) {
            if (typeof data == 'object') {
               return o.call(this, JSON.stringify(data))
            } else {
               return o.apply(this, arguments);
            }
         }
      })(ws.send);

      ws.onopen = function() {

         if (mode == 'presenter') {
            ws.send({ type: mode, id: remoteId });
         } else {
            ws.send({type: mode});
         }
         ws.onmessage = function(msg) {
            var m = JSON.parse(msg.data);
            if (m.type == 'id') {
               Presenter.onidreceived(m.id);
            } else if (m.type == 'startSession') {
               establishRTC(pc, this, mode == 'controller');
            } else if (m.type == 'error') {
               _raiseError(new Error(m.message));
            }
         }
      };

      var commandBuffer = [];

      if (mode == 'controller') {

         dataChannel = pc.createDataChannel('command', { ordered: true });

         dataChannel.onopen = function() {
            if (commandBuffer.length > 0) {
               while(commandBuffer.length) {
                  dataChannel.send(commandBuffer.shift());
               }
            }
         };

         dataChannel.onerror = _raiseError;

         return function transmit(cmd) {

            cmd = JSON.stringify(cmd);

            if (dataChannel.readyState == 'connecting') {
               commandBuffer.push(cmd);
            } else if (dataChannel.readyState == 'open') {
               dataChannel.send(cmd);
            }

         }
      } else {

         pc.ondatachannel = function(event) {
            event.channel.onmessage = function(msg) {
               Presenter.onremotecommand(JSON.parse(msg.data));
            };
         }
      }
   }

   var Presenter = {
      control: beginAs.bind(null, 'controller'),
      present: beginAs.bind(null, 'presenter'),
      onidreceived: nop,
      onerror: null,
      onlocalstream: nop,
      onremotestream: nop,
      onremotecommand: nop
   };

   var _raiseError = function(e) {
      if (this.onerror) {
         this.onerror(e);
      } else {
         throw e;
      }
   }.bind(Presenter);

   return Presenter;

})();
