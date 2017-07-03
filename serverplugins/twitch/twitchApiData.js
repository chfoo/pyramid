const _ = require("lodash");

const emoteParsing = require("./emoteParsing");
const twitchApi = require("./twitchApi");
const util = require("./util");

const USER_STATE_MESSAGE_FIELDS = [
	"badges", "color", "display-name", "mod", "subscriber", "turbo",
	"user-id", "user-type"
];

var emoticonImages = {};
var roomStates = {};
var userStates = {};
var globalUserStates = {};

const getUserState = function(channel) {
	return userStates[channel];
};

const getRoomState = function(channel) {
	return roomStates[channel];
};

const getGlobalUserState = function(serverName) {
	return globalUserStates[serverName];
};

const setUserState = function(channel, state) {
	userStates[channel] = state;
};

const setRoomState = function(channel, state) {
	roomStates[channel] = state;
};

const setGlobalUserState = function(serverName, state) {
	globalUserStates[serverName] = state;
};

const getEmoticonImages = function(emoteSetsString) {
	return emoticonImages[emoteSetsString];
};

const requestEmoticonImages = function(emotesets) {
	util.log(`Requesting emoticon images for ${emotesets}`);
	twitchApi.krakenGetRequest(
		"chat/emoticon_images",
		{ emotesets },
		util.acceptRequest((error, data) => {
			if (!error) {
				emoticonImages[emotesets] =
					twitchApi.flattenEmoticonImagesData(data);

				util.log(`There are now ${emoticonImages[emotesets].length} emoticon images for ${emotesets}`);
			}

			else {
				util.warn(
					"Error occurred trying to request emoticon images from the Twitch API\n",
					error
				);
			}
		})
	);
};

const requestEmoticonImagesIfNeeded = function(emotesets) {
	if (!emoticonImages[emotesets]) {
		// Prevent further simultaneous requests
		emoticonImages[emotesets] = true;

		// Request
		requestEmoticonImages(emotesets);
	}
};

const reloadEmoticonImages = function() {
	util.log("Reloading emoticon images...");
	const queries = Object.keys(emoticonImages);
	queries.forEach((emotesets) => {
		requestEmoticonImages(emotesets);
	});
};

const populateLocallyPostedTags = function(tags, serverName, channel, message) {
	if (tags) {
		_.assign(
			tags,
			_.pick(globalUserStates[serverName], USER_STATE_MESSAGE_FIELDS),
			_.pick(userStates[channel], USER_STATE_MESSAGE_FIELDS),
			{
				emotes: emoteParsing.generateEmoticonIndices(
						message,
						emoticonImages[
							userStates[channel]["emote-sets"] ||
							globalUserStates[serverName]["emote-sets"]
						]
					)
			}
		);
	}
};

module.exports = {
	getEmoticonImages,
	getGlobalUserState,
	getRoomState,
	getUserState,
	populateLocallyPostedTags,
	reloadEmoticonImages,
	requestEmoticonImages,
	requestEmoticonImagesIfNeeded,
	setGlobalUserState,
	setRoomState,
	setUserState
};
