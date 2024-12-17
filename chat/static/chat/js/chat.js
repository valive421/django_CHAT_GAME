

let username_label = document.querySelector("#usernamel");
let btnjoin = document.querySelector("#join-btn");
let username = username_label.innerHTML;
let websocket;
let mapPeers = {};
let config = {
    "iceServers": [
        {"urls": "stun:stun.l.google.com:19302"},
        {
            "urls": "turn:global.relay.metered.ca:80",
            "username": "0752578b1e5e4008875932ab",
            "credential": "GbAiImhyBdmMC300"
        }
    ]
}

let btn_sm = document.querySelector("#send_btn");
let message_list = document.querySelector("#message-list");
let msg_input = document.querySelector("#message_input");

btn_sm.addEventListener("click", sendmsgonclick);

function sendmsgonclick() {
    let message = msg_input.value;
    let li = document.createElement("li");
    li.appendChild(document.createTextNode("me: " + message));
    message_list.appendChild(li);
    let dataChannels = getdatachannels();

    message = username + ": " + message;
    for (let index in dataChannels) {
        dataChannels[index].send(message);
    }
    msg_input.value = "";
}

btnjoin.addEventListener("click", () => {
    btnjoin.disabled = true;
    btnjoin.style.visibility = "hidden";

    let loc = window.location;
    let ws = loc.protocol === "https:" ? "wss://" : "ws://";
    let endpoint = ws + loc.host;

    websocket = new WebSocket(endpoint + "/ws/chat/");
    websocket.addEventListener("open", () => {
        console.log("WebSocket connection opened");
        sendSignal("new-peer", {});
    });

    websocket.addEventListener("message", WebSocketonMessage);
    websocket.addEventListener("close", () => console.log("WebSocket connection closed"));
    websocket.addEventListener("error", () => console.error("WebSocket error occurred"));
});

let localStream = new MediaStream();
const constraints = { audio: true, video: true };

let local_video = document.querySelector("#local_video");
let audio_toggle = document.querySelector("#btn_audio_mute");
let video_toggle = document.querySelector("#btn_video_mute");

navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
        localStream = stream;
        local_video.srcObject = localStream;
        local_video.muted = true;

        let audio_tracks = stream.getAudioTracks();
        let video_tracks = stream.getVideoTracks();

        audio_tracks[0].enabled = true;
        video_tracks[0].enabled = true;

        audio_toggle.addEventListener("click", () => {
            let audio_track = audio_tracks[0];
            if (audio_track) {
                audio_track.enabled = !audio_track.enabled;
                audio_toggle.innerHTML = audio_track.enabled ? "audio mute" : "audio unmute";
            }
        });

        video_toggle.addEventListener("click", () => {
            let video_track = video_tracks[0];
            if (video_track) {
                video_track.enabled = !video_track.enabled;
                video_toggle.innerHTML = video_track.enabled ? "video mute" : "video unmute";
            }
        });
    })
    .catch((error) => console.error("Error accessing media devices:", error));

function WebSocketonMessage(event) {
    let parsed_data = JSON.parse(event.data);
    console.log("WebSocket message received:", parsed_data);

    let peername = parsed_data["peer"];
    let action = parsed_data["action"];

    if (peername === username) return;

    let receiver_channel_name = parsed_data["message"]["receiver_channel_name"];

    if (action === "new-peer") {
        createOffer(peername, receiver_channel_name);
    }
    if (action === "new-offer") {
        let offer = parsed_data["message"]["sdp"];
        createAnswer(offer, peername, receiver_channel_name);
    }
    if (action === "new-answer") {
        let answer = parsed_data["message"]["sdp"];
        let peer = mapPeers[peername]?.[0];

        if (!peer) {
            console.error("Peer not found for", peername);
            return;
        }

        if (peer.signalingState !== "have-local-offer") {
            console.warn(`Cannot set remote description. Expected state: "have-local-offer", Found: "${peer.signalingState}"`);
            return;
        }

        peer.setRemoteDescription(new RTCSessionDescription(answer))
            .then(() => console.log("Remote description set successfully"))
            .catch((err) => console.error("Failed to set remote description:", err));
    }
}

function sendSignal(action, message) {
    let jsonstr = JSON.stringify({ peer: username, action, message });
    websocket.send(jsonstr);
}
function createOffer(peerName, receiverChannelName) {
    const peer = new RTCPeerConnection(config);
    const dataChannel = peer.createDataChannel("channel");

    setupPeerEvents(peer, peerName);
    setupDataChannel(dataChannel);

    mapPeers[peerName] = [peer, dataChannel];

    addLocalTracks(peer); // Add this line before generating the offer

    let iceGatheringComplete = false;
    peer.addEventListener("icegatheringstatechange", () => {
        if (peer.iceGatheringState === "complete" && !iceGatheringComplete) {
            iceGatheringComplete = true;
            sendSignal("new-offer", { sdp: peer.localDescription, receiver_channel_name: receiverChannelName });
        }
    });

    peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .catch((error) => console.error("Error creating offer:", error));
}

function createAnswer(offer, peerName, receiverChannelName) {
    const peer = new RTCPeerConnection(config);

    setupPeerEvents(peer, peerName);

    // Listen for incoming data channels
    peer.ondatachannel = (event) => {
        const dataChannel = event.channel; // Access the incoming data channel
        setupDataChannel(dataChannel); // Set up event handlers for the data channel
        mapPeers[peerName] = [peer, dataChannel]; // Store the peer and channel
    };

    addLocalTracks(peer); // Add local media tracks

    peer.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => peer.createAnswer())
        .then((answer) => peer.setLocalDescription(answer))
        .catch((error) => console.error("Error creating answer:", error));

    let iceGatheringComplete = false;
    peer.addEventListener("icegatheringstatechange", () => {
        if (peer.iceGatheringState === "complete" && !iceGatheringComplete) {
            iceGatheringComplete = true;
            sendSignal("new-answer", { sdp: peer.localDescription, receiver_channel_name: receiverChannelName });
        }
    });
}


function setupPeerEvents(peer, peerName) {
    peer.addEventListener("connectionstatechange", () => {
        console.log(`Connection state for ${peerName}:`, peer.connectionState);

        if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
            removePeer(peerName);
        }
    });

    peer.addEventListener("track", (event) => {
        const remoteVideo = document.getElementById(`${peerName}-video`) || createVideo(peerName);
        if (!remoteVideo.srcObject) {
            remoteVideo.srcObject = new MediaStream();
        }
        remoteVideo.srcObject.addTrack(event.track);
    });
}


function setupDataChannel(dataChannel) {
    dataChannel.addEventListener("open", () => console.log("Data channel opened"));
    dataChannel.addEventListener("close", () => console.warn("Data channel closed"));
    dataChannel.addEventListener("message", (event) => {
        let message = event.data;
        let li = document.createElement("li");
        li.appendChild(document.createTextNode(message));
        message_list.appendChild(li);
    });
}

function addLocalTracks(peer) {
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
}


function removePeer(peerName) {
    const video = document.getElementById(`${peerName}-video`);
    if (video) {
        video.parentElement.remove();
        video.remove();
    }

    const peer = mapPeers[peerName]?.[0];
    if (peer) {
        peer.close();
    }

    delete mapPeers[peerName];
    console.log(`Peer ${peerName} removed`);
}

function createVideo(peerName) {
    let videoContainer = document.querySelector("#video_container");
    let remoteVideo = document.createElement("video");
    remoteVideo.id = `${peerName}-video`;
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;

    let videoWrapper = document.createElement("div");
    videoContainer.appendChild(videoWrapper);
    videoWrapper.appendChild(remoteVideo);

    return remoteVideo;
}

function getdatachannels() {
    return Object.values(mapPeers).map(([_, dataChannel]) => dataChannel);
}
