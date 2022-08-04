const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');

// Get the homepage
app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});

// Get a file
app.get('/:file', (req, res) => {
	res.sendFile(__dirname + '/' + req.params.file);
});

// Get a file in the lib folder
app.get('/lib/:file', (req, res) => {
	res.sendFile(__dirname + '/lib/' + req.params.file);
});




// Returns an array of usernames in a room
function getUserList(room) {
	let list = [];
	if(io.sockets.adapter.rooms[room] === undefined) return list;
	let sockets = io.sockets.adapter.rooms[room].sockets;  
	for(let socketId in sockets) {
		let socket = io.sockets.connected[socketId];
		list.push(socket.user.name);
	}
	return list;
}

// Returns a list of room and how many users are in each room
function getRoomList() {
	let list = [];
	let rooms = io.sockets.adapter.rooms;
	for(let room in rooms) {
		if(room == 'undefined') continue;
		if (!rooms[room].sockets.hasOwnProperty(room)) {
			list.push([room, rooms[room].length]);
		}
	}
	for(let i = 0; i < 5; i++) {
		let room = 'Lobby ' + (i + 1);
		let exists = false;
		for(let item of list) {
			if(room == item[0]) {
				exists = true;
				break;
			}
		}
		if(!exists) {
			list.push([room, 0]);
		}
	}
	return list;
}

let roomMessages = {
//	'Lobby': ['Bob', 'Hello']
};
// Called when a user connects
io.on('connection', (socket) => {
	socket.user = {
		'name': '',
		'room': '',
		'ipaddress': socket.handshake.address,

	}

	console.log(socket.user.ipaddress + ' connected.');

	socket.on('initialize', (name, room) => {

		if(socket.initialized) return; // Already initialized
		socket.initialized = true;
		name = sanitizeHtml(name).replace(/[^A-Za-z0-9_]/g, '').substring(0, 32);
		room = sanitizeHtml(room).replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().substring(0, 32);
		room = room.charAt(0).toUpperCase() + room.slice(1).toLowerCase();

		// Don't allow blank names
		if(name == '') {
			socket.emit('initializeResponse', room, 'Invalid name.');
			return;
		}

		// Don't allow any duplicate names
		users = getUserList(room);
		if(name != 'Guest' && users.includes(name)) {
			socket.emit('initializeResponse', room, 'Name already exists.');
			return;
		}

		socket.user.name = name;
		socket.user.room = room;

		socket.join(room);
		socket.emit('initializeResponse', room, '');
		if(roomMessages[room] !== undefined){
			for(let i = 0; i < roomMessages[room].length; i++){
				let messageName = roomMessages[room][i][0];
				let messageMessage = roomMessages[room][i][1];

				socket.emit('chat', messageName, messageMessage);
			}
		}


		io.in(room).emit('chat', '', name + ' joined ' + room + '.<br>Users online: [' + getUserList(socket.user.room).join(', ') + ']');
	});

	socket.on('disconnect', () => {
		if(socket.user.name == '') return; // Haven't initialized yet
		console.log(socket.user.ipaddress + ' disconnected.');
		
		socket.emit('disconnectedUser', socket.user.name);
		io.in(socket.user.room).emit('chat', '', socket.user.name + ' left ' + socket.user.room + '.<br>Users online: [' + getUserList(socket.user.room).join(', ') + ']');
		socket.removeAllListeners();
	});

	socket.on('listRooms', (callback) => {
		//socket.emit('roomsList', getRoomList());
		callback(getRoomList());
	});

	socket.on('listUsers', (callback) => {
		callback(getUserList(socket.user.room));
	});

	socket.on('broadcastMessage', (message) => {
		console.log(socket.user.ipaddress + ' (' + socket.user.name + ')' + ' sent "' + message + '"');
		if(socket.user.name == '') return;
		message = sanitizeHtml(message).trim().substring(0, 256);
		if(message == '') return;

        //if the room does not exist inside the server, set it
		if(roomMessages[socket.user.room] == undefined){
			roomMessages[socket.user.room] = [];
			// Sybil/DoS resistance
			let servers = Object.keys(roomMessages);
			while(servers.length > 100){
				delete roomMessages[servers[0]];
				servers = Object.keys (roomMessages);
			}

		}
		roomMessages[socket.user.room].push([socket.user.name, message]);
        while(roomMessages[socket.user.room].length > 100){
        	roomMessages[socket.user.room].shift(); // Remove the oldest messages until the length is achieved
        }
		io.in(socket.user.room).emit('chat', socket.user.name, message);
	});

});

// Start the server
const port = process.env.PORT || 8000;
http.listen(port, () => {
	console.log('App is running on port ' + port);
});



