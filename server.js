

var app = require('express')();
var http = require('http').createServer(app);
var cors = require('cors');
var io = require('socket.io')(http);

var lodash = require('lodash');

app.use(cors());

// health check
app.get('/', function(req, res) {
    res.setHeader('Content-Type', 'text/plain');
    res.send('OK');
});

// random avatar string to assign to each user
var randomAvatars = ['Panda', 'Lemur', 'Cow', 'Chicken', 'Pig', 'Giraffe', 'Penguin', 'Goose', 'Turtle', 'Rabbit', 'Lion', 'Cheetah', 'Hyena', 'Elephant', 'Dolphin', 'Koala', 'Dog', 'Cat', 'Mouse', 'Snake', 'Bee',
'Parrot', 'Eagle', 'Zebra', 'Seal', 'Fox', 'Capybara', 'Meerkat', 'Chameleon', 'Goldfish', 'Carp', 'Bass', 'Tuna', 'Salmon', 'Rhino', 'Hippopotamus', 'Bear', 'Falcon', 'Black-Widow', 'Crab', 'Lobster', 'Owl', 'Sloth',
'Hamster', 'Hedgehog', 'Anteater', 'Otter', 'Chinchilla', 'Pony', 'Puffin', 'Crocodile', 'Alligator', 'Duck', 'Deer', 'Octopus', 'Squid', 'Lamb', 'Goat', 'Walrus', 'Skunk', 'Possum', 'Leopard', 'Buffalo', 'Tiger', 'Wizard',
'Pitbull', 'Corgi', 'Maltese', 'Golden Retriever', 'Poodle', 'Chihuahua', 'Kitten', 'Horse', 'Tortoise', 'Hare', 'Scallop', 'Orangutan', 'Ocelot', 'Wolf', 'Maggot', 'Fly', 'Wasp', 'Hornet', 'Honey', 'Teemo', 'Villager',
'Surfer', 'Human', 'BigFoot', 'German Shepherd', 'Bulldog', 'Labrador', 'Beagle', 'Yorkshire Terrier', 'Pug', 'Husky', 'Boxer', 'Rottweiler', 'Pomeranian', 'Shih Tzu', 'Dobermann', 'Shiba Inu', 'Basset Hound', 'Bloodhound'];

// array to store sessions by session id
var sessions = {};

// array to store users by user id
var users = {};

// generate a random ID with 64 bits of entropy
function makeId() {
    var result = '';
    var hexChars = '0123456789abcdef';
    for (var i = 0; i < 16; i += 1) {
      result += hexChars[Math.floor(Math.random() * 16)];
    }
    return result;
  }

function getRandomAvatar() {
    let numAvatars = randomAvatars.length;

    let random = Math.floor(Math.random() * numAvatars);
    
    return randomAvatars[random]
}

io.on('connection', function(socket){

    // create userId and send to client --------------------------

    var userId = makeId();

    users[userId] = {
        id: userId,
        sessionId: null,
        socket: socket,
        avatar: getRandomAvatar()
    };

    socket.emit('userId', userId);
    socket.emit('avatar', users[userId].avatar);

    console.log('User ' + userId + ' connected.');

    // socket.on('getUserId', function(data, callback) {
    //     callback(userId);
    // })

    // -----------------------------------------------------------

    // testing ---------------------------------------------------
    // var testuser = "0dd0";
    // var testsessionid = 0000;
    // var testsession = {
    //     id: testsessionid,
    //     userIds: [],
    //     video: null
    // };
    // users[testuser] = {
    //     id: testuser,
    //     sessionId: testsessionid,
    //     socket: null
    // }
    // sessions[testsessionid] = testsession;
    // sessions[testsessionid].userIds.push(testuser);
    // sessions[testsessionid].userIds.push("00002223d4444");

    // for (var i = 0; i < sessions[testsessionid].userIds.length; i++) {
    //     console.log(sessions[testsessionid].userIds[i]);
    // }

    // sessions[testsessionid].userIds.splice(sessions[testsessionid].userIds.indexOf(testuser), 1);


    // console.log(sessions[testsessionid].userIds.length);
    // testing ---------------------------------------------------

    // helper functions ----------------------------------------------------------------------------------

    var createSession = function(newUserId, videoId) {
        var sessionId = makeId();
        // console.log('Attempting to create session with id: ' + sessionId + '...');
        var session = {
            id: sessionId,
            videoId: videoId,
            userIds: [newUserId]
        };
        sessions[sessionId] = session;
        users[newUserId].sessionId = sessionId;
        users[newUserId].socket.emit('message', { type: 'created', avatar: users[newUserId].avatar })
        console.log('User ' + users[newUserId].id + ' has created session: ' + sessions[sessionId].id + '.');
        return true;
    }

    var removeUserFromSession = function(newUserId) {

        var tempSessionId = null;

        if (newUserId in users) {
            tempSessionId = users[newUserId].sessionId;
        }

        if (tempSessionId != null) {
            console.log('Disconnected user ' + newUserId + ' from session ' + tempSessionId + '...');
            lodash.pull(sessions[tempSessionId].userIds, newUserId);
            users[newUserId].sessionId = null;
            if (sessions[tempSessionId].userIds.length == 0) {
                delete sessions[tempSessionId];
                console.log('session ' + tempSessionId + ' deleted since no users are in session');
            } 
            else {
                // message other users this user has left.
                lodash.forEach(sessions[tempSessionId].userIds, function(id) {
                    users[id].socket.emit('message', { type: 'left', avatar: users[newUserId].avatar });
                })
            }
            return true;
        } else {
            console.log('User ' + newUserId + ' disconnected and had no session.');
            return false;
        }
    }

    var addUserToSession = function(newUserId, sessionIdFromClient) {
        console.log("Attempting to add user " + newUserId + " to session " + sessionIdFromClient + "...");
        if (newUserId in users) {
            users[newUserId].sessionId = sessionIdFromClient;
            sessions[sessionIdFromClient].userIds.push(newUserId);

            // message other users in session the user has joined
            lodash.forEach(sessions[sessionIdFromClient].userIds, function(id) {
                users[id].socket.emit('message', { type: 'joined', avatar: users[newUserId].avatar });
            })

            console.log("Added user %s to session %s.", newUserId, sessionIdFromClient)
            return true;
        } else {
            console.log("User %s tried to join invalid session", newUserId);
            return false;
        }

    }


    // var syncvideo = function(newUserId, time) {
    //     let tempSessionId = users[newUserId].sessionId;
    //     if (tempSessionId != null && tempSessionId in sessions) {
    //         console.log('Attempting to sync session video at ' + time + ' seconds.');
    //         lodash.forEach(sessions[tempSessionId].userIds, function(id) {
    //             if (id != newUserId) {
    //                 users[id].socket.emit('sync', time);
    //             }
    //         });
    //     }
    // }


    // ---------------------------------------------------------------------------------------------------

    // create new sessionid, set user's sessionid to new sessionid
    socket.on('createSession', function(data, callback) {
        if (data.userId in users) {
            createSession(userId, data.videoId);
            callback({ sessionId: users[userId].sessionId });
        } else {
            callback({});
        }
    });

    //set sessionid to sessionid provided by user in client. 
    socket.on('joinSession', function(data, callback) {
        if (data.sessionId in sessions && addUserToSession(userId, data.sessionId)) {
            callback({ sessionId: data.sessionId, videoId: sessions[data.sessionId].videoId });
        } else {
            callback({ errorMessage: "Invalid Session" });
        }
    });

    socket.on('leaveSession', function(data, callback) {
        if (userId in users) {
            removeUserFromSession(userId);
        }
        callback({});
    })


    // socket.on('playpause', function(data, callback) {
    //     let tempSessionId = data.sessionId;
    //     if (tempSessionId != null && tempSessionId in sessions) {
    //         console.log("Attempting to play/pause video in session " + tempSessionId);
    //         lodash.forEach(sessions[tempSessionId].userIds, function(id) {
    //             users[id].socket.emit('playpause', null);
    //         })
    //     }
    //     callback({});
    // })

    // socket.on('sync', function(data, callback) {
    //     let tempSessionId = data.sessionId;
    //     if (tempSessionId in sessions) {
    //         console.log("Attempting to sync video in session " + tempSessionId + " at time: " + data.time);
    //         lodash.forEach(sessions[tempSessionId].userIds, function(id) {
    //             if (id != data.userId) {
    //                 users[id].socket.emit('sync', data.time);
    //             }
    //         })
    //     }
    //     callback({});
    // });

    socket.on('update', function(data, callback) {
        // will be new playpausesync

        var tempSessionId = null;

        if(userId in users) {
            tempSessionId = users[userId].sessionId
        }

        console.log("------Update Information------\nOwner userId: %s\ncurrentTime: %f\nplaying: %s\nvideoId: %s\n------------------------------", userId, data.currentTime, data.playing, data.videoId);

        if(tempSessionId in sessions) { // if user has session and is a valid session...
            lodash.forEach(sessions[users[userId].sessionId].userIds, function(id) {
                if (id != userId) {
                    users[id].socket.emit('update', data);
                }
            })
        }

        callback({});
    });

    // delete user of user list; if there are no users left in session, delete the session
    socket.on('disconnect', function() { 
        removeUserFromSession(userId);
        // console.log('User ' + userId + ' disconnected.');
        delete users[userId];
    });
});

http.listen(process.env.PORT || 3000, function(){
    console.log('Listening on port %d.', http.address().port);
});
