const Room = require("../../models/room");

const findRoomById = async (roomId) => {
    return Room.findById(roomId);
};

const addMemberToRoom = async (room, userId) => {
    room.members.push(userId);
    return room.save();
};

const removeMemberFromRoom = async (roomId, targetId) => {
    return Room.updateOne(
        { _id: roomId, isActive: true },
        { $pull: { members: targetId } }
    );
};

module.exports = {
    findRoomById, addMemberToRoom, removeMemberFromRoom
}