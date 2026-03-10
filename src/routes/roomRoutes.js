const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

// Create Room
router.post('/', roomController.createRoom);

// Get Nearby Rooms
router.get('/', roomController.getNearbyRooms);

// Get Room By CREATED BY
router.get('/created-by', roomController.getMyRooms);

// Get users by ID
router.get('/users', roomController.getUsersByRoom)

router.post('/users', roomController.removeUserFromRoom)

// Get Room By ID
router.get('/:roomId', roomController.getRoomById);

// Join Room
router.post('/:roomId/join', roomController.joinRoom);

// Leave Room
router.post('/:roomId/leave', roomController.leaveRoom);

// Delete Room
router.delete('/:roomId', roomController.deleteRoom);

module.exports = router;