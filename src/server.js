import http from "http";
import {instrument} from "@socket.io/admin-ui";
import {Server} from "socket.io";
import express from "express";
import { parse } from "path";

const app = express();

app.set('view engine', "pug");
app.set("views", __dirname+"/views");
app.use("/public", express.static(__dirname+"/public"));
app.get("/", (req, res) => res.render("home"));
app.get("/*", (req, res) => res.redirect("/"));

const httpServer = http.createServer(app);
const wsServer = new Server(httpServer,{
    cors: {
        origin : ["https://admin.socket.io"],
        credentials : true,
    },
});

instrument(wsServer, {
    auth : false
});

// room을 추가하면 sockets 에 map에 key 값으로 room이름이 저장되는데 이때 
// value값이 undefined인 경우 브라우저에서 user가 만든 public room으로 간주한다.
// 이에 publicRoomList에 value가 undefined인 key 값들을 push하여 반환하는 함수이다.
function publicRooms(){
    // const sids = weServer.sockets.adapter.sids;
    // const rooms = weServer.sockets.adapter.rooms;
    const { //위 코드 두 줄과 동일
        sockets: {
            adapter: {sids, rooms},
        },
    } = wsServer;
    const publicRoomList = [];
    rooms.forEach((_, key) =>{
        if(sids.get(key)===undefined){
            publicRoomList.push(key);
        }
    });
    return publicRoomList;
}

//현재 roomName이라는 방의 size == 방에 들어와있는 사람의 수
function countRoom(roomName){
    // if(wsServer.sockets.adapter.rooms.get(roomName))
    //     return wsServer.sockets.adapter.rooms.get(roomName).size   
    // else return undefined;
    //위 코드와 아래 코드 동일한 역할
    return wsServer.sockets.adapter.rooms.get(roomName)?.size;
}

wsServer.on("connection", (socket) =>{
    socket["nickname"] = "Anonymous";

    socket.onAny((event)=>{
        console.log(`Socket Event : ${event}`);
    });

    socket.on("enter_room", (roomName)=>{
        socket.join(roomName);
        //하나의 socket에만 message 전송
        socket.to(roomName).emit("welcome",socket.nickname, countRoom(roomName));
        //연결된 모든 socket에 새로운 방이 만들어졌다고 알려준다.
        wsServer.sockets.emit("room_change", publicRooms());
    });

    socket.on("offer", (offer, roomName)=>{
        socket.to(roomName).emit("offer", offer);
    });

    socket.on("answer", (answer, roomName)=>{
        socket.to(roomName).emit("answer", answer);
    });

    socket.on("ice", (ice, roomName)=>{
        socket.to(roomName).emit("ice", ice);
    });


    socket.on("disconnecting",()=>{
        //disconnecting으로 아직 방을 떠나지 않았으므로 countRoom 함수의 반환 값에
        //나간 사람의 수가 포함 되어있다. 따라서 1을 뺀 값을 emit 한다.
        socket.rooms.forEach((room) => socket.to(room).emit("bye",socket.nickname, countRoom(room)-1));
    });

    socket.on("disconnect",()=>{
        wsServer.sockets.emit("room_change", publicRooms());
    });

    socket.on("new_message", (msg, room, done)=>{
        socket.to(room).emit("new_message", `${socket.nickname} : ${msg}`);
        done();
    });

    socket.on("nickname", nickname => socket["nickname"] = nickname);
});

const handleListen = () => console.log(`Listening on http://localhost:3000`);
httpServer.listen(3000,handleListen);