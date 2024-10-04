import { Socket, Server } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { ClientToServerEvents, ServerToClientEvents, Songfest, ClientSong, Player, Song, Score } from "../songfest-common"


export default function registerHandler(socket: Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, any>, songfest: Songfest, io: Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, any>) {
    socket.on("getState", () => {
        console.log("sending state", songfest.toClientState())
        socket.emit("updateState", songfest.toClientState())
    })
    socket.on("startSongfest", (settings: { 
        songsPerPerson: number; 
        theme: string; 
        host: string; 
    }) => {
        songfest.startSongfest(settings)
        io.emit("updateState", songfest.toClientState())
    })
    socket.on("startGame", () => {
        songfest.startGame()
        io.emit("updateState", songfest.toClientState())
    })
    socket.on("getPlayerByName", (name: string | null) => {
        let player = songfest.getPlayerByName(name)
        // if the player does not exist, and the name is not null
        if (!player && name) {
            player = songfest.addPlayer(name)
            // update the state for everyone
            io.emit("updateState", songfest.toClientState())
        }
        // give the client the player they're looking for
        socket.emit("updateState", {myPlayer: player})
    })
    socket.on("submitSongs", async (data: Player) => {
        // find the player in songfest.players
        const player = songfest.getPlayerByName(data.name)
        // initialize the songs in player using the given data
        const songPromises: Promise<void>[] = player.songs.map((song: Song, index: number) => {
            return song.init(data.songs[index].url, data.songs[index].startSeconds, data.songs[index].endSeconds)
        })
        await Promise.all(songPromises).then((_) => {
            console.dir(player.songs)
            socket.emit("endProcessingSongs")
        })
    })
    socket.on("updateSocket", (name: string) => {
        // get the player corresponding to the playerName
        const playerTheyWantToSwitchTo = songfest.getPlayerByName(name)
        // get the player corresponding to the socket id
        const playerTheyAreCurrently = songfest.getPlayerBySocketId(socket.id)
        // deregister the currently selected player
        playerTheyAreCurrently.setOwnership(null)
    
        if (playerTheyWantToSwitchTo != playerTheyAreCurrently) {
            socket.emit("updateState", {myPlayer: playerTheyWantToSwitchTo})
        }
        else {
            socket.emit("updateState", {myPlayer: null})
        }
        // update all other clients on the change
        io.emit("updateState", songfest.toClientState())
    })
    socket.on("disconnect", () => {
        // if there's no game active, you don't need to do anything
        if (!songfest.gameInProgress) {
            return
        }
        // on disconnect, remove socket from the player who disconnected
        const player = songfest.getPlayerBySocketId(socket.id)
        if (player) {
            player.setOwnership(null)
        }
    })
    socket.on("isThisMySong", () => {
        // find the player corresponding to the socketId
        const player = songfest.getPlayerBySocketId(socket.id)
        // check if the player exists
        if (!player) {
            return
        }
        // tell client if the current song submitter matches this player
        socket.emit("isThisYourSong", songfest.currentSongSubmitter.name == player.name)
    })
    socket.on("rateSong", (score: { 
        liked: Score; 
        theme: Score; 
    }) => {
        // check if the player who scored exists
        const player = songfest.getPlayerBySocketId(socket.id)
        if (songfest.rateSong(player, score)) {
            console.log("everyone has submitted their ratings")
            io.emit("updateState", songfest.toClientState())
        }
    })
    socket.on("getDistributions", (type: "rating" | "guessing") => {
        if (type == "rating") {
            socket.emit("updateDistributions", {
                theme: songfest?.currentSong?.themeScore,
                liked: songfest?.currentSong?.likedScore
            })
        }
        else if (type == "guessing") {
            socket.emit("updateDistributions", songfest?.currentSong?.guessDistribution)
            console.log("guess distribution: ", songfest.currentSong.guessDistribution)
        }
    })
    socket.on("guessSongSubmitter", (guess: {playerName: string, time: number}) => {
        // check if the player who guessed exists
        const player = songfest.players.find((entry) => entry.socketId == socket.id)
        console.log(`${player.name} guessed ${guess.playerName} with ${guess.time / 1000}s remaining`, songfest.currentSong.guessDistribution)
        if (songfest.guessSong(player, guess)) {
            console.log("everyone has submitted a guess")
            io.emit("updateState", songfest.toClientState())
        }
    })
    socket.on("getGameSummaryData", () => {
        socket.emit("updateGameSummaryData", {
            songs: songfest.songs,
            players: songfest.players
        })
    })
    socket.on("reset", () => {
        songfest.reset()
        io.emit("updateState", songfest.toClientState())
    })
    socket.on("nextPhase", () => {
        songfest.nextPhase()
        socket.emit("updateState", songfest.toClientState())
    })
}