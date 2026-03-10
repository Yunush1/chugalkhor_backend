const Room = require("../models/room");
const mongoose = require("mongoose");


const isUserInRoom = async (roomId, userId) => {
  try {
    if (!roomId || !userId) {
      return false;
    }

    const roomObjectId = mongoose.Types.ObjectId.isValid(roomId)
      ? new mongoose.Types.ObjectId(roomId)
      : null;

    const userObjectId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;

    if (!roomObjectId || !userObjectId) {
      return false;
    }

    const room = await Room.findOne(
      {
        _id: roomObjectId,
        isActive: true,
        members: userObjectId
      },
      { _id: 1 }
    ).lean();

    return !!room;

  } catch (error) {
    logger.error("isUserInRoom failed", { roomId, userId, error });
    return false;
  }
};



module.exports = { isUserInRoom, };