const RoomService = require("../services/roomService/room.service");
const asyncHandler = require("../middlewares/asyncHandler");
const logger = require("../utils/logger");


// ================= CREATE ROOM =================
exports.createRoom = asyncHandler(async (req, res) => {
  const { name, description, radius, maxMembers, longitude, latitude, expiresAt } = req.body;
  const userId = req.user?._id; // assuming auth middleware sets req.user
  if (!name || !longitude || !latitude) {
    return res.status(400).json({
      success: false,
      message: "Name and location are required",
    });
  }

  const result = await RoomService.createRoom({
    name,
    description,
    radius,
    maxMembers,
    userId,
    longitude,
    latitude,
    expiresAt,
  });

  return res.status(result.statusCode).json({
    success: true,
    ...result,
  });
});


// ================= GET ROOM BY ID =================
exports.getRoomById = asyncHandler(async (req, res) => {
  const { roomId } = req.params;

  const result = await RoomService.getRoomById(roomId);

  return res.status(result.statusCode).json({
    success: true,
    ...result,
  });
});


// ================= GET NEARBY ROOMS =================
exports.getNearbyRooms = asyncHandler(async (req, res) => {
  const { longitude, latitude, lastDistance } = req.query;

  if (!longitude || !latitude) {
    return res.status(400).json({
      success: false,
      message: "Longitude and latitude are required",
    });
  }

  try {



    const data = await RoomService.getNearbyRooms({
      longitude: Number(longitude),
      latitude: Number(latitude),
      maxDistance: 5000,
      limit: 5,
      lastDistance: Number(lastDistance) || 0
    });

    res.json(data);

  } catch (error) {
    logger.error(`[Room Controller] Get nearby rooms: ${error.message}`)
    res.status(500).json({
      statusCode: 500,
      message: error.message || "Something went wrong"
    });

  }
});

exports.getMyRooms = asyncHandler(async (req, res) => {
  const { _id } = req?.user
  const response = await RoomService.getRoomsByCreatedBy({ createdBy: _id })
  return res.status(200).json(response)
})


// ================= JOIN ROOM =================
exports.joinRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user?._id;

  const result = await RoomService.joinRoom({
    roomId,
    userId,
  });

  return res.status(result.statusCode).json({
    success: true,
    message: result.message,
  });
});


// ================= LEAVE ROOM =================
exports.leaveRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user?._id;

  const result = await RoomService.leaveRoom({
    roomId,
    userId,
  });

  return res.status(result.statusCode).json({
    success: true,
    message: result.message,
  });
});

exports.getUsersByRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.query
  const response = await RoomService.getAllUserByRoom({ roomId });
  return res.status(response.statusCode).json(response)
});

exports.removeUserFromRoom = asyncHandler(async (req, res) => {
  const { roomId, targetId } = req.body
  const { _id } = req.user
  console.log("ro", roomId, targetId,_id)
  const response = await RoomService.removeUserFromRoom({ roomId, targetId, userId: _id })
  return res.status(response.statusCode).json(response)
})


// ================= DELETE ROOM =================
exports.deleteRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user?.id;

  const result = await RoomService.deleteRoom({
    roomId,
    userId,
  });

  return res.status(result.statusCode).json({
    success: true,
    message: result.message,
  });
});