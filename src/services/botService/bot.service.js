const Room = require("../../models/room");
const User = require("../../models/user");
const { hashPassword } = require("../../utils/hashedPassword");
const logger = require("../../utils/logger");

class BotService {

    static async getRandomBots(limit = 3) {
        return User.aggregate([
            { $match: { isBot: true, isActive: true } },
            { $sample: { size: limit } }
        ]);
    }

    static async createRooms({ longitude, latitude, maxMembers = 20 }) {
        try {
            const newRoom = await Room.create({
                name: "Nearby Chat",
                description: "People around you are chatting",
                location: {
                    type: "Point",
                    coordinates: [longitude, latitude]
                },
                maxMembers,
                radius: 20,
                isActive: true
            });
            logger.info(`[Bot service ] New room created successfully botId: ${newRoom._id}`)
            return newRoom;
        } catch (error) {
            logger.error(`[Bot service] Bot creation failed ${error.message}`)
            return {
                status: false,
                message: 'Bot creationg failed'
            }
        }
    }

    static async seedBots(roomId) {
        const bots = await BotService.getRandomBots(3);
        logger.info(`[Bot service] Got random bot ${bots?.length}`)
        const botIds = bots.map(b => b._id.toString());
        const updatedRoom = await Room.findByIdAndUpdate(
            roomId,
            { $push: { members: { $each: botIds } } },
            { new: true }
        );
        logger.info(`[Bot service ] Bot seeds to room `)
        return updatedRoom;
    }

}

module.exports = BotService;