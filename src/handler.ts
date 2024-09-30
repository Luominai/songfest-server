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
        // set the settings
        songfest.songsPerPerson = settings.songsPerPerson
        songfest.theme = settings.theme
        songfest.host = new Player(settings.host, settings.songsPerPerson)
        // open the songfest
        songfest.songfestOpen = true
        // add the host to the list of participants
        songfest.players.push(songfest.host)

        // console.dir(songfest, {depth: null})
        io.emit("updateState", songfest.toClientState())
    })
    socket.on("startGame", () => {
        songfest.startGame()
        // io.emit("startGame")
        io.emit("updateState", songfest.toClientState())
    })
    socket.on("getPlayerByName", (name: string) => {
        let player = songfest.players.find((entry) => entry.name == name)
        if (!player && name) {
            player = new Player(name, songfest.songsPerPerson)
            songfest.players.push(player)
            // update the state for everyone
            io.emit("updateState", songfest.toClientState())
        }
        // give the client the player they're looking for
        socket.emit("updateState", {myPlayer: player})
    })
    socket.on("submitSongs", async (data: Player) => {
        // find the player in songfest.players
        const player = songfest.players.find((entry) => entry.name == data.name)
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
        const player = songfest.players.find((entry) => entry.name == name) 
        // check if the player exists
        if (!player) {
            return
        }
        // toggle off
        if (player.socketId == socket.id) {
            player.socketId = null
            player.taken = false
            socket.emit("updateState", {myPlayer: null})
        }
        // toggle on
        else {
            // free up the previous selected name (if there is one)
            const previous = songfest.players.find((entry) => entry.socketId == socket.id)
            if (previous) {
                previous.socketId = null
                previous.taken = false
            }
            player.socketId = socket.id
            player.taken = true
            socket.emit("updateState", {myPlayer: player})
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
        const player = songfest.players.find((entry) => entry.socketId == socket.id)
        if (player) {
            player.socketId = null
            player.taken = false
        }
    })
    socket.on("isThisMySong", () => {
        // find the player corresponding to the socketId
        const player = songfest.players.find((entry) => entry.socketId == socket.id)
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
        const player = songfest.players.find((entry) => entry.socketId == socket.id)
        if (!player) {
            return
        }
        // check if the player who scored has already scored
        if (songfest.playersLockedIn.includes(player.name)) {
            return
        }
        // lock the player in
        songfest.playersLockedIn.push(player.name)

        // give score to the song and the song's submitter
        player.rateSong(songfest.currentSong, songfest.currentSongSubmitter, score)

        // if everyone has scored, go to next phase
        if (songfest.playersLockedIn.length + 1 == songfest.players.length) {
            console.log("everyone has submitted their ratings")
            songfest.nextPhase()
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
        if (!player) {
            return
        }
        // check if the player who guessed has already guessed
        if (songfest.playersLockedIn.includes(player.name)) {
            return
        }
        // lock the player in
        songfest.playersLockedIn.push(player.name)

        // if the player guessed correctly, give points
        player.guessSong(songfest.currentSong, songfest.currentSongSubmitter, guess)
        console.log(`${player.name} guessed ${guess.playerName} with ${guess.time / 1000}s remaining`, songfest.currentSong.guessDistribution)
        
        // if everyone has guessed, go to next phase
        if (songfest.playersLockedIn.length + 1 == songfest.players.length) {
            console.log("everyone has submitted a guess")
            songfest.nextPhase()
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