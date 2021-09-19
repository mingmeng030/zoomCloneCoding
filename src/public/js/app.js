const socket = io(); // frontend를 backend에 연결

const call = document.getElementById("call");
const myace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const cameraSelect = document.getElementById("cameras");

const welcome = document.getElementById("welcome");
const roomForm = welcome.querySelector("#roomname");
const nameForm = welcome.querySelector("#name");
const room = document.getElementById("room");

room.hidden = true;
let roomName;
let myStream;
let muted =false;
let cameraOff =false;
let myPeerConnection;

async function getCameras(){
    try{
        const devices = await navigator.mediaDevices.enumerateDevices();
        /*각각의 devices를 filtering 한다.조건 : kind 항목이 videoinput인 device만 뽑아오기*/
        const cameras = devices.filter(device=> device.kind === "videoinput");
        //현재 사용되고 있는 카메라를 currentCamera에 저장한다.
        const currentCamera = myStream.getVideoTracks()[0];
        
        //각각의 camera에 새로운 option을 생성한다.
        cameras.forEach(camera => {
            const option = document.createElement("option");
            option.value=camera.deviceId;
            option.innerText=camera.label;
            if(currentCamera.label===camera.label)
                option.selected=true;
            cameraSelect.appendChild(option);
        })
    }catch(e) { console.log(e);}

}

async function getMedia(deviceId){
    const initialConstrains ={ 
        audio : true,
        video : { facialMode : "user"},
    };
    const cameraConstrains ={
        audio : true,
        video : { deviceId : {exact : deviceId}},
    };
    try{
        myStream = await navigator.mediaDevices.getUserMedia(
            deviceId? cameraConstrains : initialConstrains
        );
    myFace.srcObject = myStream;
    if(!deviceId) 
        await getCameras();
    }catch(e) { console.log(e);}
}

function handleMuteBtnClick(){
    myStream
        .getAudioTracks()
        .forEach((track) => track.enabled=!track.enabled);

    if(!muted) {
        muteBtn.innerText = "Unmute";
        muted = true;
    }
    else {
        muteBtn.innerText = "Mute";
        muted = false;
    }
}

function handleCameraBtnClick(){
    myStream
        .getVideoTracks()
        .forEach((track) => track.enabled=!track.enabled);
    if(cameraOff) {
        cameraBtn.innerText = "Turn Camera Off";
        cameraOff=false;
    }
    else{
        cameraBtn.innerText = "Turn Camera On";
        cameraOff=true;
    }
}

async function handleCameraChange(){
    await getMedia(cameraSelect.value);
    if(myPeerConnection){
        const videoTrack = myStream.getVideoTracks([0]);
        const videoSender = myPeerConnection
        .getSenders()
        .find(sender=>sender.track.kind==="video");
        videoSender.replaceTrack(videoTrack);
    }
}

muteBtn.addEventListener("click",handleMuteBtnClick);
cameraBtn.addEventListener("click",handleCameraBtnClick);
cameraSelect.addEventListener("input", handleCameraChange);


// async function startMedia(){
//     welcome.hidden=true;
//     room.hidden = false;
//     await getMedia();
//     makeConnection();
// }

// Welcome Form (join a room)

async function showRoom(){
    welcome.hidden=true;
    room.hidden = false;
    await getMedia();
    makeConnection();

    const messageForm = room.querySelector("#message");
    messageForm.addEventListener("submit",handleMessageSubmit);
}

async function handleRoomSubmit(event){
    event.preventDefault();
    const input = roomForm.querySelector("input");
    await showRoom();
    socket.emit("enter_room", input.value);
    roomName = input.value;
    input.value="";
}

function changeRoomTitle(newCount){
    const h3 = room.querySelector("h3");
    h3.innerText=`Room ${roomName} (${newCount})`;
}

function handleMessageSubmit(event){
    event.preventDefault();
    const input = room.querySelector("#message input");
    const value = input.value;
    socket.emit("new_message", input.value, roomName,()=>{
        addMessage(`You : ${value}`);
    });
    input.value="";
}

function handleNicknameSubmit(event){
    event.preventDefault();
    const input = welcome.querySelector("#name input");
    socket.emit("nickname", input.value);
}

function addMessage(message){
    const ul =room.querySelector("ul");
    const li =document.createElement("li");
    li.innerText = message;
    ul.appendChild(li);
}

nameForm.addEventListener("submit",handleNicknameSubmit);
roomForm.addEventListener("submit",handleRoomSubmit);


// Socket code

socket.on("welcome", async(user, newCount)=>{
    const offer = await myPeerConnection.createOffer();
    //offer 로 connection을 구성한다.
    myPeerConnection.setLocalDescription(offer);
    changeRoomTitle(newCount);
    addMessage(`${user} has joined!`);
    socket.emit("offer", offer, roomName);
});


socket.on("offer", async(offer)=>{
    myPeerConnection.setRemoteDescription(offer);
    const answer = await myPeerConnection.createAnswer();
    myPeerConnection.setLocalDescription(answer);
    socket.emit("answer", answer, roomName);
});

socket.on("ice",ice=>{
    console.log("received candidate");
    myPeerConnection.addIceCandidate(ice);
});

socket.on("answer", (answer)=>{
    console.log("received the answer");
    myPeerConnection.setRemoteDescription(answer);
});

socket.on("bye", (left, newCount)=>{
    changeRoomTitle(newCount);
    addMessage(`${left} left :(`);
});

socket.on("new_message", addMessage);

socket.on("room_change", (rooms)=>{
    const roomList = welcome.querySelector("ul");
    roomList.innerHTML=""; //중복 출력을 막기 위해 매번 비워준다.
    if(rooms.length==0) return;
    
    rooms.forEach( room => {
        const li= document.createElement("li");
        li.innerText = room;
        roomList.append(li);
    });
});


// RTC Code

function makeConnection(){
    //양쪽 브라우저 간에 peer to peer 연결을 생성하고
    //양쪽 브라우저에서 카메라와 마이크의 data stream을 받아 Connection에 집어넣는다.
    myPeerConnection = new RTCPeerConnection({
        iceServers: [
            {
                urls : [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302",
                ],
            },
        ],
    });
    myPeerConnection.addEventListener("icecandidate", handleIce);
    myPeerConnection.addEventListener("addstream,", handleAddStream);
    myStream
        .getTracks()
        .forEach(track => myPeerConnection.addTrack(track, myStream));
}

function handleIce(data){
    console.log("sent candidate");
    socket.emit("ice", data.candidate, roomName);
}

function handleAddStream(data){
    const peerFace =document.getElementById("peerFace")
    peerFace.srcObject = data.stream;
}