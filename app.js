const http = require("http")
const express = require('express')
const { v4: uuidv4 } = require('uuid');
var constants = require('./constant');
const { CREATE_GAME, JOIN_GAME } = require("./constant");

var WebSocketServer = require('websocket').server

const app = express()
app.get('/', (requset, response) => {
    response.sendFile(__dirname+'/public/index.html');
})

const STATIC_FILE_PORT = 9091;
app.listen(STATIC_FILE_PORT, () => {
    console.log("Static file serving port: "+STATIC_FILE_PORT);
})
const DEFAULT_PORT = 9090
const httpServer = http.createServer((request, response) => {
    console.log("receive a request");
});

const webSocketServer = new WebSocketServer({
    httpServer: httpServer
});

const clients = {}; // hashmap to store all clients
const games = {};
const decisionMap = {};
let playerColor = {'purple': 0,'yellow': 0,'green': 0};
const colorClientIDMap = {}; // key-> clientId, value -> color

//'request' event will be emitted by the server whenever 
        //  a new WebSocket request is made.
webSocketServer.on('request', (webSocketRequest) => {
    
    const connection = webSocketRequest.accept(null, webSocketRequest.origin);
    connection.on('open', () => {
        console.log("a new client open websocket connection: "+uuidv4());

    });
    // Emitted whenever a new WebSocket connection is accepted.
    connection.on('connect', () => {
        console.log("a new client connect websocket connection: ");        
    });

    connection.on('close', () => {
        console.log("client close websocket connection");
    });
    //'message' event is fired when data is received through a WebSocket.
    connection.on('message', (message) => {
        console.log("a client sents message to server!");

        const clientMessage = JSON.parse(message.utf8Data);
        
        if(clientMessage.payload.messageType == constants.CREATE_GAME) {
            const gameId = uuidv4();
            games[gameId] = {
                "id": gameId,
                "balls": 20,
                "clients": [],
                state: {} // state of each cell
            }
            // message to be sent back to client
            let responseMessage = {
                payload: {
                    messageType: constants.CREATE_GAME,
                    gameId: gameId
                }
            };
            clients[clientMessage.payload.clientId].connection.send(JSON.stringify(responseMessage));
        }

        if(clientMessage.payload.messageType == constants.JOIN_GAME) {
            const gameId = clientMessage.payload.gameId;
            let game = games[gameId];
            if(game) {
                game.gameId = gameId;
                if(game.clients.length >= 3) {
                    return;// currently only allow 3 ppl to play
                }
                    
                game.clients.push({
                    clientId: clientMessage.payload.clientId
                });
                
                // notify all other clients in this game that a new user has joined
                game.clients.forEach((part, index, theArray) => {
                    var c = theArray[index];
                    const pickedColor = pickColor(c.clientId);
                    console.log("pickedColor result:"+pickedColor)
                    theArray[index].clientColor = pickedColor;
                    console.log("c.clientId："+c.clientId+" Game object clientColor: "+theArray[index].clientColor);
                });
                game.clients.forEach((part, index, theArray) => {
                    var c = theArray[index];
                    let messageToSend = {
                        payload: {
                            messageType: JOIN_GAME,
                            game: game
                        }
                    }
                    clients[c.clientId].connection.send(JSON.stringify(messageToSend));
                });
                // once there are 3 ppl in the game, we start the game
                if(game.clients.length === 3) updateState();
            } else {
                return;
            }
        }
        // broad cast out the state of each client's message
        if(clientMessage.payload.messageType == constants.PLAY_GAME) {
            
            const clientId = clientMessage.payload.clientId;
            const gameId = clientMessage.payload.gameId;
            const ballId = clientMessage.payload.ballId;
            const playerColor = clientMessage.payload.playerColor;
            const game = games[gameId];
            if(game) {
                
                const state = game.state;
                if(!state) state = {}

                // check whether there is a winner
                if(!decisionMap[game.gameId]) {
                    decisionMap[game.gameId] = {}
                    
                }
                if(!decisionMap[game.gameId][playerColor]) {
                    decisionMap[game.gameId][playerColor] = 0;
                }
                decisionMap[game.gameId][playerColor]++;
                if(decisionMap[game.gameId][playerColor] === 5) {
                    games[gameId].winner = playerColor;
                    updateState(true);
                    return;
                }
                state[ballId] = playerColor;
                games[gameId].state = state;
            }
        }

    })

    let generatedID = uuidv4();
    const data = {
            payload: {
                "messageType": constants.INIT_CONNECTION,
                "clientId": generatedID
            }
    }
    // keep the newly connected client's connection into a hashmap
    clients[generatedID] = {
        "connection": connection
    }
    connection.send(JSON.stringify(data));
})

// force each client to update the game state in every 0.5 second
function updateState(terminate = false) {
    var timer;
    if(!terminate) {
        for (const gameId of Object.keys(games)) {
            const game = games[gameId]
            const payLoad = {
                    payload: {
                        "messageType": constants.UPDATE_GAME,
                        "game": game
                }
            };
            game.clients.forEach(c=> {
                clients[c.clientId].connection.send(JSON.stringify(payLoad))
            })
        }
    
        timer = setTimeout(updateState, 500);
    } else {
        clearTimeout(timer);
    }
    
}

function pickColor(clientID) {
    if(colorClientIDMap[clientID]) return colorClientIDMap[clientID];

    for (var property in playerColor) {
        if(playerColor[property] === 0) {
            colorClientIDMap[clientID] = property;
            playerColor[property] = clientID;
            return property;
        } else
            continue
    }

}

httpServer.listen(DEFAULT_PORT,'0.0.0.0', () => {
    console.log('Listening on port ' + DEFAULT_PORT);
})

