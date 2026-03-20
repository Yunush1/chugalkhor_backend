const { Server } = require('socket.io');
const socketAuthMiddleware = require('../middlewares/socket.auth');
const logger = require('../utils/logger');
const Enums = require('../utils/constants');
const handleChatMessageEvents = require('../socketService/events/handleChatMessageEvents');
const handleCallEvents = require('../socketService/events/handleCallEvents');
const wavecall = require('wavecall-server');
const WaveCallSignaling = wavecall.WaveCallSignaling || wavecall.default?.WaveCallSignaling;

class SocketManager {
    constructor() {
        this.io = null,
        this.userSockets = new Map();
        this.onlineUsers = new Set();
        this.onlineAdmins = new Set();

        this.roomOnlineUsers = new Map();       // roomId → Set<userId>

        this.activeSessions = new Map();
        this.sessionTimeouts = new Map();
        this.disconnectTimeouts = new Map();

        this.signaling = null;
    }

    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.CLIENTS_URLS?.split(',') || ['http://localhost:3000'],
                methods: ['GET', 'POST'],
                credentials: true,
            },
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true
            }
        })

        this.signaling = new WaveCallSignaling({
            secret: process.env.WAVECALL_SECRET,
            onCallStarted: ({ callId, roomId, callType, initiatorId }) => {
                logger.info(`[WaveCall] Call started callId=${callId} roomId=${roomId} type=${callType} by=${initiatorId}`);
            },
            onCallEnded: ({ callId, roomId, reason }) => {
                logger.info(`[WaveCall] Call ended callId=${callId} roomId=${roomId} reason=${reason}`);
            },
        });

        this.io.use(socketAuthMiddleware)

        this.io.on('connection', (socket) => {
            const { userId, role } = socket.user || {}
            logger.info('Socket connected: userId=' + userId + ', role=' + role);
            this.trackConnection(userId, socket.id, role);
            socket.join(`user_${userId}`);

            if (role === Enums.USER.ROLE.USER) {
                socket.join('users');
            } else if (role === Enums.USER.ROLE.ADMIN) {
                socket.join('admins');
            }
            handleChatMessageEvents(this, socket);
            handleCallEvents(this, socket)
            this.broadcastOnlineLists();
            socket.on('disconnect', () => {
                this.cleanup(userId, socket.id, role);
                logger.info('Socket disconnected: userId=' + userId + ', role=' + role);
            })
        })
    }

    trackConnection(userId, socketId, role) {
        userId = userId.toString();
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());

            if (role === Enums.USER.ROLE.USER) {
                this.onlineUsers.add(userId);
            } else if (role === Enums.USER.ROLE.ADMIN) {
                this.onlineAdmins.add(userId);
            }
        }

        for (const [key, timeout] of this.disconnectTimeouts.entries()) {
            if (key.endsWith(`_${userId}`)) {
                clearTimeout(timeout);
                this.disconnectTimeouts.delete(key);
            }
        }

        this.userSockets.get(userId).add(socketId);
    }

    cleanup(userId, socketId, role) {
        userId = userId.toString();
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            sockets.delete(socketId);
            if (sockets.size === 0) {
                this.userSockets.delete(userId);

                if (role === Enums.USER.ROLE.ASTROLOGER) {
                    this.onlineAstrologers.delete(userId);
                } else if (role === Enums.USER.ROLE.USER) {
                    this.onlineUsers.delete(userId);
                } else if (role === Enums.USER.ROLE.ADMIN) {
                    this.onlineAdmins.delete(userId);
                }
            }
        }
    }

    broadcastOnlineLists() {
        this.io.to('users').emit('online_users', Array.from(this.onlineUsers));
    }

    getActiveSession(userId) {
        return this.activeSessions.get(userId.toString());
    }

    setActiveSession(userId, astrologerId, sessionId) {
        this.activeSessions.set(userId.toString(), { astrologerId: astrologerId.toString(), sessionId });
        this.activeSessions.set(astrologerId.toString(), { userId: userId.toString(), sessionId });
    }

    clearActiveSession(userId, astrologerId) {
        this.activeSessions.delete(userId.toString());
        this.activeSessions.delete(astrologerId.toString());
    }



    /**
     * Add user to room's online set (call when user joins room)
     * @param {string} userId
     * @param {string} roomId
     */
    addUserToRoomOnline(userId, roomId) {
        const roomKey = roomId.toString();
        if (!this.roomOnlineUsers.has(roomKey)) {
            this.roomOnlineUsers.set(roomKey, new Set());
        }
        this.roomOnlineUsers.get(roomKey).add(userId.toString());
        this._broadcastRoomOnlineUsers(roomKey);
    }

    /**
     * Remove user from room's online set
     * @param {string} userId
     * @param {string} roomId
     */
    removeUserFromRoomOnline(userId, roomId) {
        const roomKey = roomId.toString();
        const users = this.roomOnlineUsers.get(roomKey);
        if (users) {
            users.delete(userId.toString());
            if (users.size === 0) {
                this.roomOnlineUsers.delete(roomKey);
            }
            this._broadcastRoomOnlineUsers(roomKey);
        }
    }

    /**
     * Get currently online user IDs in a specific room
     * @param {string} roomId
     * @returns {string[]} array of user IDs (strings)
     */
    getOnlineUsersInRoom(roomId) {
        const roomKey = roomId.toString();
        const usersSet = this.roomOnlineUsers.get(roomKey);
        return usersSet ? Array.from(usersSet) : [];
    }

    // Internal helper – notify everyone in the room about current online list
    _broadcastRoomOnlineUsers(roomId) {
        const roomKey = roomId.toString();
        const onlineList = this.getOnlineUsersInRoom(roomKey);

        // Emit to everyone currently in the socket.io room
        this.io.to(`room_${roomKey}`).emit('room_online_users', {
            roomId: roomKey,
            onlineUsers: onlineList,
            count: onlineList.length,
            timestamp: new Date().toISOString()
        });
    }

}


module.exports = new SocketManager();