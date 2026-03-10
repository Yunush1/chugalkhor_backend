const logger = require("../utils/logger");
const emitSocketError = require("../utils/socketError");
const Message = require("../models/message");
const Room = require("../models/room");
const Enums = require("../utils/constants");
const { getOnlineUsersInRoom, isUserInRoom } = require("../utils/roomUtils");


function handleChatMessageEvents(socketManager, socket) {
  const { userId, name } = socket.user;
  logger.info(`[HandleChatMessageEvents] user ${JSON.stringify(socket.user)}`)

  socket.on("send_message", async (payload, callback) => {
    try {
      const {
        roomId,
        type = Enums.MESSAGE.TYPE.TEXT,
        content,
        media,
        replyTo,
      } = payload;

      logger.info(`[Chat Service] send_message ${JSON.stringify(payload)}`)
      if (!roomId) {
        return callback?.({ success: false, error: "roomId is required" });
      }

      const canSend = await isUserInRoom(roomId, userId);
      if (!canSend) {
        logger.info(`[Chat Service] send_message You are not a member of this room`)
        return callback?.({ success: false, error: "You are not a member of this room" });
      }

      if (!Object.values(Enums.MESSAGE.TYPE).includes(type)) {
        return callback?.({ success: false, error: "Invalid message type" });
      }

      if (type !== Enums.MESSAGE.TYPE.TEXT && !media?.url) {
        return callback?.({ success: false, error: "Media URL is required for non-text messages" });
      }

      

      const messageDoc = new Message({
        roomId,
        sender: userId,
        type,
        content: content?.trim() || undefined,
        media: media ? {
          url: media.url,
          thumbnail: media.thumbnail,
          duration: media.duration,
          size: media.size,
        } : undefined,
        replyTo: replyTo || undefined,
      });

      const messageObj = {
        _id: messageDoc._id,
        roomId: messageDoc.roomId,
        sender: { userId, name },
        type: messageDoc.type,
        content: messageDoc.content,
        media: messageDoc.media,
        replyTo: messageDoc.replyTo,
        isEdited: false,
        createdAt: messageDoc.createdAt,
        timestamp: Date.now(),
        seenBy: [],           // initially empty
        deliveredTo: [],
      };

      const roomName = `room_${roomId.toString()}`;
      socketManager.io.to(roomName).except(socket.id).emit("new_message", {
        message: messageObj,
        senderId: userId.toString(),
      });

      socket.emit("message_delivered", {
        messageId: messageDoc._id,
        deliveredTo: [userId],
        deliveredAt: new Date(),
      });

      await messageDoc.save();

      callback?.({
        success: true,
        messageId: messageDoc._id,
        createdAt: messageDoc.createdAt,
      });

    } catch (err) {
      logger.error(`send_message error - user ${userId}:`, err);
      callback?.({ success: false, error: "Failed to send message" });
      emitSocketError(socket, "message_error", "Server error while sending message");
    }
  });
  socket.on("mark_delivered", async ({ messageIds, roomId }, callback) => {
    try {
      if (!Array.isArray(messageIds) || !roomId) {
        return callback?.({ success: false, error: "Invalid payload" });
      }

      // Only update messages that belong to the room & not already delivered to this user
      await Message.updateMany(
        {
          _id: { $in: messageIds },
          roomId,
          "deliveredTo.user": { $ne: userId },
        },
        {
          $push: {
            deliveredTo: {
              user: userId,
              deliveredAt: new Date(),
            },
          },
        }
      );

      // Notify sender(s) - optional but nice UX
      const roomSockets = await getOnlineUsersInRoom(roomId);
      if (roomSockets.length > 0) {
        socketManager.io.to(roomSockets).emit("messages_delivered", {
          messageIds,
          userId,
          deliveredAt: new Date(),
        });
      }

      callback?.({ success: true });
    } catch (err) {
      logger.error(`mark_delivered error:`, err);
      callback?.({ success: false });
    }
  });

  socket.on("mark_seen", async ({ messageIds, roomId }, callback) => {
    try {
      if (!Array.isArray(messageIds) || !roomId) return;

      await Message.updateMany(
        {
          _id: { $in: messageIds },
          roomId,
          "seenBy.user": { $ne: userId },
          sender: { $ne: userId }, // don't mark own messages as seen by self
        },
        {
          $push: {
            seenBy: {
              user: userId,
              seenAt: new Date(),
            },
          },
        }
      );

      socketManager.io.to(`room_${roomId}`).emit("messages_seen", {
        messageIds,
        userId,
        seenAt: new Date(),
      });

      callback?.({ success: true });
    } catch (err) {
      logger.error(`mark_seen error:`, err);
      callback?.({ success: false });
    }
  });

  socket.on("edit_message", async ({ messageId, newContent }, callback) => {
    try {
      if (!messageId || !newContent?.trim()) {
        return callback?.({ success: false, error: "Invalid payload" });
      }

      const msg = await Message.findOneAndUpdate(
        {
          _id: messageId,
          sender: userId,
          isDeleted: false,
        },
        {
          content: newContent.trim(),
          isEdited: true,
          editedAt: new Date(),
        },
        { new: true }
      );

      if (!msg) {
        return callback?.({ success: false, error: "Message not found or not yours" });
      }

      socketManager.io.to(`room_${msg.roomId}`).emit("message_edited", {
        messageId,
        newContent: msg.content,
        editedAt: msg.editedAt,
      });

      callback?.({ success: true });
    } catch (err) {
      logger.error("edit_message error:", err);
      callback?.({ success: false });
    }
  });

  socket.on('rejoin_room', async ({ roomId }, callback) => {
    if (!roomId) return;
    logger.info(`[Chat Service ] rejoin_room with roomId: ${roomId} and userId: ${userId}`)
    // Optional: still check membership
    if (await isUserInRoom(roomId, userId)) {
      const roomName = `room_${roomId}`;
      socket.join(roomName);
      socketManager.addUserToRoomOnline(userId.toString(), roomId.toString());
      logger.info(`[Chat Service ] User ${userId} rejoined room ${roomId} via client request`);
      callback?.({ success: true, message: 'Rejoin successfully' })
    }
  });
}


module.exports = handleChatMessageEvents;