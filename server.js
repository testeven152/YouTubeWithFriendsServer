

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

function convertMillisecondstoSeconds(milliseconds) {
    return milliseconds / 1000;
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


    // helper functions ----------------------------------------------------------------------------------

    var createSession = function(newUserId, videoId, controlLock = false, currentTime = 0, playingState = true, playbackRate = 0) {
        var sessionId = makeId();
        // console.log('Attempting to create session with id: ' + sessionId + '...');

        let master_user = (controlLock) ? newUserId : null;

        var session = {
            id: sessionId,
            videoId: videoId,
            userIds: [newUserId],
            masterUser: master_user,
            recentUpdatedTime: currentTime, 
            recentPlayingState: playingState,
            recentPlaybackRate: playbackRate,
            lastTimeUpdated: convertMillisecondstoSeconds(Date.now()),
            videoQueue: []
        };
        sessions[sessionId] = session;
        users[newUserId].sessionId = sessionId;
        users[newUserId].socket.emit('update-message', { type: 'created', avatar: users[newUserId].avatar })
        console.log('User ' + users[newUserId].id + ' has created session: ' + sessions[sessionId].id + '.');
        return true;
    }

    var removeUserFromSession = function(newUserId) {

        var tempSessionId = null;

        if (newUserId in users) {
            tempSessionId = users[newUserId].sessionId;
        }

        if (tempSessionId != null) {
            lodash.pull(sessions[tempSessionId].userIds, newUserId);
            users[newUserId].sessionId = null;
            if (sessions[tempSessionId].userIds.length == 0) {
                delete sessions[tempSessionId];
                console.log('Disconnected user %s from session %s. Session deleted since there are no users left.', newUserId, tempSessionId);
            } 
            else {
                // message other users this user has left.
                console.log('Disconnected user %s from session %s. Currently %s user(s) in session.', newUserId, tempSessionId, sessions[tempSessionId].userIds.length)
                lodash.forEach(sessions[tempSessionId].userIds, function(id) {
                    if (id in users) {
                        users[id].socket.emit('update-message', { type: 'left', avatar: users[newUserId].avatar }); // problem here where socket is undefined at times..
                    }
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
                if (id in users) {
                    users[id].socket.emit('update-message', { type: 'joined', avatar: users[newUserId].avatar });
                }
            })

            console.log("Added user %s to session %s. Currently %s user(s) in session.", newUserId, sessionIdFromClient, sessions[sessionIdFromClient].userIds.length)
            return true;
        } else {
            console.log("User %s tried to join invalid session", newUserId);
            return false;
        }

    }

    var updateSessionVideoDetails = function(sessionId, time, playing, playbackRate) {

        if (sessionId in sessions) {
            sessions[sessionId].recentUpdatedTime = time
            sessions[sessionId].recentPlayingState = playing
            sessions[sessionId].recentPlaybackRate = playbackRate
            sessions[sessionId].lastTimeUpdated = convertMillisecondstoSeconds(Date.now())
        }

    }

    var updateAvatar = function(newUserId, newAvatar) {

        // TODO: 
        // - check if avatar name is taken already in the session. if so, callback error message

        if (newUserId in users) {
            let oldAvatar = users[newUserId].avatar
            users[newUserId].avatar = newAvatar

            if (users[newUserId].sessionId in sessions) {

                lodash.forEach(sessions[users[newUserId].sessionId].userIds, function(id) {
                    if (id in users) {
                        users[id].socket.emit('updateAvatar-Message', { oldAvatar: oldAvatar, newAvatar: newAvatar })
                    }
                })

            }
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
        if (userId in users) {
            createSession(userId, data.videoId, data.controlLock, data.currentTime, data.playing, data.playbackRate);
            callback({ 
                sessionId: users[userId].sessionId,
                avatar: users[userId].avatar, 
                masterUser: sessions[users[userId].sessionId].masterUser 
            });
        } else {
            callback({ errorMessage: "Could not create session" });
        }
    });

    //set sessionid to sessionid provided by user in client. 
    socket.on('joinSession', function(data, callback) {
        if (data.sessionId in sessions && addUserToSession(userId, data.sessionId)) {
            callback({ 
                sessionId: data.sessionId, 
                videoId: sessions[data.sessionId].videoId,
                avatar: users[userId].avatar,
                masterUser: sessions[data.sessionId].masterUser, 
                recentUpdatedTime: sessions[data.sessionId].recentUpdatedTime, 
                recentPlayingState: sessions[data.sessionId].recentPlayingState, 
                recentPlaybackRate: sessions[data.sessionId].recentPlaybackRate, 
                lastTimeUpdated: sessions[data.sessionId].lastTimeUpdated 
            });
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
        if(userId in users && users[userId].sessionId in sessions) { // if user has session and is a valid session...

            if (sessions[users[userId].sessionId].masterUser == userId || sessions[users[userId].sessionId].masterUser == null) {
                console.log("Update Information - Session ID: %s - Owner userId: %s - currentTime: %f - playing: %s - playbackrate: %s", users[userId].sessionId, userId, data.currentTime, data.playing, data.playbackRate);
                lodash.forEach(sessions[users[userId].sessionId].userIds, function(id) {
                    if (id != userId && id in users) {
                        users[id].socket.emit('update', data);
                    }
                })
                updateSessionVideoDetails(users[userId].sessionId, data.currentTime, data.playing, data.playbackRate)
            } else {
                console.log("non-masterUser %s tried to sync in session %s", userId, users[userId].sessionId)
                callback({ 
                    revert: true, 
                    currentTime: sessions[users[userId].sessionId].recentUpdatedTime,
                    playing: sessions[users[userId].sessionId].recentPlayingState, 
                    playbackRate: sessions[users[userId].sessionId].recentPlaybackRate, 
                    lastTimeUpdated: sessions[users[userId].sessionId].lastTimeUpdated
                })
            }

            

            callback({});
            
        } else {
            console.log("Error: Invalid or NULL Session ID")
            callback({ errorMessage: "Invalid or NULL Session ID" })
        }

    });

    socket.on('mouseupdate', function(data, callback) {
        if(userId in users && users[userId].sessionId in sessions) { // if user has session and is a valid session...

            if (sessions[users[userId].sessionId].masterUser == userId || sessions[users[userId].sessionId].masterUser == null) {
                console.log("Update Information - Session ID: %s - Owner userId: %s - currentTime: %f - playing: %s - playbackrate: %s", users[userId].sessionId, userId, data.currentTime, data.playing, data.playbackRate);
                lodash.forEach(sessions[users[userId].sessionId].userIds, function(id) {
                    if (id != userId && id in users) {
                        users[id].socket.emit('mouseupdate', data);
                    }
                })
                updateSessionVideoDetails(users[userId].sessionId, data.currentTime, data.playing, data.playbackRate)
            } else {
                console.log("non-masterUser %s tried to sync in session %s", userId, users[userId].sessionId)
                callback({ 
                    revert: true, 
                    currentTime: sessions[users[userId].sessionId].recentUpdatedTime,
                    playing: sessions[users[userId].sessionId].recentPlayingState, 
                    playbackRate: sessions[users[userId].sessionId].recentPlaybackRate, 
                    lastTimeUpdated: sessions[users[userId].sessionId].lastTimeUpdated
                })
            }

            callback({});
            
        } else {
            console.log("Error: Invalid or NULL Session ID")
            callback({ errorMessage: "Invalid or NULL Session ID" })
        }
    })

    socket.on('chatMessage', function(data, callback) { // passes chat message to other users
        if(userId in users && users[userId].sessionId in sessions) {
            lodash.forEach(sessions[users[userId].sessionId].userIds, function(id) {
                if (id in users) {
                    users[id].socket.emit('chat-message', data)
                }
            })

            callback({});
        } else {
            callback({ errorMessage: "Invalid or NULL Session ID" })
        }

    })

    socket.on('updateAvatar', function(data, callback) {
        updateAvatar(userId, data.avatar)
        console.log('User %s changed avatar to %s', userId, data.avatar)
        callback({})
    })

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
