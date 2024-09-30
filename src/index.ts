import express from "express"
import {Server} from "socket.io"
import http from "http"
import registerHandler from "./handler";
import { ClientToServerEvents, ServerToClientEvents, Songfest } from "../songfest-common";

// setup server
const app = express()
const server = http.createServer(app)
const io = new Server<
    ClientToServerEvents, 
    ServerToClientEvents
>(server, {
    cors: {
        origin: "http://localhost:5173"
    }
})

const songfest = new Songfest()
console.log(songfest)

io.on('connection', (socket) => { 
    console.log(socket.id); 
    registerHandler(socket, songfest, io) 
})

server.listen(3000, () => {
    console.log("server is up on http://localhost:3000")
})