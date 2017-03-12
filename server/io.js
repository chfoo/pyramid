// PYRAMID
// IO module

// Prerequisites
const socketIo = require("socket.io");

const constants = require("./constants");
const log = require("./log");
const util = require("./util");

module.exports = function(main) {

	var server, io;

	// Pass through
	const emit = () => {
		if (io) {
			return io.emit.apply(io, arguments);
		};

		return null;
	};

	// Direct socket emissions

	const emitChannelCache = function(socket, channelUri) {
		socket.emit("channelCache", {
			channelUri,
			cache: main.getChannelCache(channelUri)
		});
	};

	const emitUserCache = function(socket, username) {
		socket.emit("userCache", {
			username,
			cache: main.getUserCache(username)
		});
	};

	const emitCategoryCache = function(socket, categoryName) {
		socket.emit("categoryCache", {
			categoryName,
			cache: main.getCategoryCache(categoryName)
		});
	};

	const emitChannelLogDetails = function(socket, channelUri) {
		socket.emit("channelLogDetails", {
			channelUri,
			details: log.getChannelLogDetails(channelUri)
		});
	};

	const emitUserLogDetails = function(socket, username) {
		socket.emit("userLogDetails", {
			username,
			details: log.getUserLogDetails(username)
		});
	};

	const emitChannelUserList = function(socket, channelUri) {
		socket.emit("channelUserList", {
			channel: channelUri,
			list: main.getChannelUserList(channelUri)
		});
	};

	const emitChannelLogFile = function(socket, channelUri, time) {
		const ymd = util.ymd(time);
		if (ymd) {
			const [ server, channel ] = channelUri.split("/");
			log.getChatroomLinesForDay(server, channel, time, (err, file) => {
				if (!err) {
					socket.emit("channelLogFile", {
						channelUri,
						file,
						time: ymd
					});
				}
			});
		}
	};

	const emitUserLogFile = function(socket, username, time) {
		const ym = util.ym(time);
		if (ym) {
			log.getUserLinesForMonth(username, time, (err, file) => {
				if (!err) {
					socket.emit("userLogFile", {
						file,
						time: ym,
						username
					});
				}
			});
		}
	};

	const emitFriendsList = function(socket) {
		main.loadFriendsList((err, data) => {
			if (!err) {
				socket.emit("friendsList", { data });
			}
		});
	};

	const emitAppConfig = function(socket) {
		main.loadAppConfig((err, data) => {
			if (!err) {
				socket.emit("appConfig", { data });
			}
		});
	};

	const emitIrcConfig = function(socket) {
		main.loadIrcConfig((err, data) => {
			if (!err) {
				data = main.safeIrcConfigDict(data);
				socket.emit("ircConfig", { data });
			}
		});
	};

	const emitNicknames = function(socket) {
		main.loadNicknames((err, data) => {
			if (!err) {
				const dict = main.nicknamesDict(data);
				socket.emit("nicknames", { data: dict });
			}
		});
	};

	// Overall list emissions

	const emitEventToRecipients = function(list, eventName, eventData) {
		if (list) {
			list.forEach((socket) => {
				if (socket) {
					socket.emit(eventName, eventData);
				}
			});
		}
	};

	const emitMessageToRecipients = function(list, msg) {
		emitEventToRecipients(list, "msg", msg);
	};

	const emitEventToChannel = function(channelUri, eventName, eventData) {
		emitEventToRecipients(
			main.getChannelRecipients(channelUri),
			eventName,
			eventData
		);
	};

	const emitUnseenHighlights = function(socket) {
		if (!socket) {
			socket = io;
		}
		if (socket) {
			socket.emit(
				"unseenHighlights",
				{ list: Array.from(main.unseenHighlightIds()) }
			);
		}
	};

	const emitNewHighlight = function(socket, message) {
		if (!socket) {
			socket = io;
		}
		if (socket) {
			socket.emit(
				"newHighlight",
				{ message }
			);
		}
	};

	const emitChannelUserListToRecipients = function(channelUri) {
		emitEventToChannel(channelUri, "channelUserList", {
			channel: channelUri,
			list: main.getChannelUserList(channelUri),
			type: "userlist"
		});
	};

	// Deferred server availability
	const setServer = (_server) => {
		server = _server;

		io = socketIo(server);

		io.on("connection", (socket) => {
			console.log("Someone connected!");

			var connectionToken = null;

			socket.on("disconnect", () => {
				console.log("Someone disconnected!");
			});

			socket.on("token", (details) => {
				if (details && typeof details.token === "string") {
					connectionToken = details.token;

					if (util.isAnAcceptedToken(connectionToken)) {
						emitUnseenHighlights(socket);
					}
				}
			})

			// Respond to requests for cache

			socket.on("requestChannelCache", (channelUri) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (typeof channelUri === "string") {
					emitChannelCache(socket, channelUri);
				}
			});

			socket.on("requestUserCache", (username) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (typeof username === "string") {
					emitUserCache(socket, username);
				}
			});

			socket.on("requestCategoryCache", (categoryName) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (typeof categoryName === "string") {
					emitCategoryCache(socket, categoryName);
				}
			});

			// Response to subscription requests

			socket.on("subscribe", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.channel) {
					main.addChannelRecipient(details.channel, socket);
					emitChannelCache(socket, details.channel);
					emitChannelUserList(socket, details.channel);
				}
				else if (details && details.username) {
					main.addUserRecipient(details.username, socket);
					emitUserCache(socket, details.username);
				}
				else if (details && details.category) {
					main.addCategoryRecipient(details.category, socket);
					emitCategoryCache(socket, details.category);
				}
			});

			socket.on("unsubscribe", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.channel) {
					main.removeChannelRecipient(details.channel, socket);
				}
				else if (details && details.username) {
					main.removeUserRecipient(details.username, socket);
				}
				else if (details && details.category) {
					main.removeCategoryRecipient(details.category, socket);
				}
			});

			// Response to log requests

			socket.on("requestUserLogDetails", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && typeof details.username === "string") {
					emitUserLogDetails(socket, details.username);
				}
			});

			socket.on("requestChannelLogDetails", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && typeof details.channelUri === "string") {
					emitChannelLogDetails(socket, details.channelUri);
				}
			});

			socket.on("requestUserLogFile", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (
					details &&
					typeof details.username === "string" &&
					typeof details.time === "string"
				) {
					emitUserLogFile(socket, details.username, details.time);
				}
			});

			socket.on("requestChannelLogFile", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (
					details &&
					typeof details.channelUri === "string" &&
					typeof details.time === "string"
				) {
					emitChannelLogFile(socket, details.channelUri, details.time);
				}
			});

			// See an unseen highlight

			socket.on("reportHighlightAsSeen", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && typeof details.messageId === "string") {
					main.reportHighlightAsSeen(details.messageId);
				}
			});

			// Storing view state

			socket.on("storeViewState", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.viewState) {
					main.storeViewState(details.viewState);
				}
			});

			// Sending messages

			socket.on("sendMessage", (data) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (data && data.channel && data.message && data.token) {

					// Only allow this socket to send a message
					// if the command itself includes an accepted token

					if (util.isAnAcceptedToken(data.token)) {
						const message = util.normalise(data.message);
						main.sendOutgoingMessage(data.channel, message);
					}
				}
			});

			// Storing settings

			socket.on("addNewFriend", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.username) {
					const username = util.formatUriName(details.username);

					main.addToFriends(
						0,
						username,
						parseInt(details.level) === 2,
						(err) => {
							if (err) {
								console.warn("Error occurred adding friend", err);
							}
							else {
								emitFriendsList(socket);
							}
						}
					);
				}
			});

			socket.on("changeFriendLevel", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.username && details.level) {
					const username = util.formatUriName(details.username);

					main.modifyFriend(
						0,
						username,
						{
							isBestFriend:
								parseInt(details.level) === 2
						},
						(err) => {
							if (err) {
								console.warn("Error occurred changing friend level", err);
							}
							else {
								emitFriendsList(socket);
							}
						}
					);
				}
			});

			socket.on("removeFriend", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.username) {
					const username = util.formatUriName(details.username);

					main.removeFromFriends(
						0,
						username,
						(err) => {
							if (err) {
								console.warn("Error occurred removing friend", err);
							}
							else {
								emitFriendsList(socket);
							}
						}
					);
				}
			});

			socket.on("setAppConfigValue", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.key) {
					main.storeConfigValue(
						details.key, details.value,
						(err) => {
							if (err) {
								console.warn("Error occurred setting app config value", err);
							}
							else {
								emitAppConfig(socket);
							}
						}
					);
				}
			});

			socket.on("addIrcServer", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.name && details.data) {
					const name = util.formatUriName(details.name);

					main.addServerToIrcConfig(
					lodash.assign({}, details.data, { name }),
					(err, result) => {
						if (err) {
							console.warn("Error occurred adding irc server", err);
						}
						else {

							const done = () => {
								emitIrcConfig(socket);
								main.connectUnconnectedIrcs();
							};

							// Add all channels
							if (result.insertId && details.channel && details.channel.length) {
								const channelNames = [];
								details.channel.forEach((channel) => {
									const channelName = channel.name || channel;

									if (typeof channelName === "string" && channelName) {
										channelNames.push(util.formatUriName(channelName));
									}
								});
								if (channelNames.length) {
									async.parallel(
										channelNames.map((channelName) =>
											((callback) => main.addChannelToIrcConfig(name, channelName, callback))
										), () => {
											done();
										}
									);
								}
								else {
									done();
								}
							}
							else {
								done();
							}
						}
					})
				}
			});

			socket.on("changeIrcServer", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.name && details.data) {
					const name = util.formatUriName(details.name);

					main.modifyServerInIrcConfig(
						name, details.data,
						(err) => {
							if (err) {
								console.warn("Error occurred changing irc server", err);
							}
							else {
								emitIrcConfig(socket);
							}
						}
					);
				}
			});

			socket.on("removeIrcServer", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.name) {
					const name = util.formatUriName(details.name);

					main.removeServerFromIrcConfig(
						name,
						(err) => {
							if (err) {
								console.warn("Error occurred removing irc server", err);
							}
							else {
								main.disconnectIrcServer(details.name);
								emitIrcConfig(socket);
							}
						}
					);
				}
			});

			socket.on("addIrcChannel", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.serverName && details.name) {
					const serverName = util.formatUriName(details.serverName);
					const name = util.formatUriName(details.name);

					main.addChannelToIrcConfig(
						serverName, name,
						(err) => {
							main.joinIrcChannel(serverName, name);
							emitIrcConfig(socket);
						}
					);
				}
			});

			socket.on("removeIrcChannel", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.serverName && details.name) {
					const serverName = util.formatUriName(details.serverName);
					const name = util.formatUriName(details.name);

					main.removeChannelFromIrcConfig(
						serverName, name,
						(err) => {
							main.partIrcChannel(serverName, name);
							emitIrcConfig(socket);
						}
					);
				}
			});

			socket.on("addNickname", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.nickname) {
					const nickname = util.lowerClean(details.nickname);

					main.addNickname(
						nickname,
						(err) => {
							if (err) {
								console.warn("Error occurred adding nickname", err);
							}
							else {
								emitNicknames(socket);
							}
						}
					);
				}
			});

			socket.on("changeNicknameValue", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.nickname && details.key) {
					const nickname = util.lowerClean(details.nickname);

					main.modifyNickname(
						nickname,
						{ [details.key]: details.value },
						(err) => {
							if (err) {
								console.warn(
									"Error occurred changing nickname value",
									err
								);
							}
							else {
								emitNicknames(socket);
							}
						}
					);
				}
			});

			socket.on("removeNickname", (details) => {
				if (!util.isAnAcceptedToken(connectionToken)) { return; }
				if (details && details.nickname) {
					const nickname = util.lowerClean(details.nickname);

					main.removeNickname(
						nickname,
						(err) => {
							if (err) {
								console.warn("Error occurred removing nickname", err);
							}
							else {
								emitNicknames(socket);
							}
						}
					);
				}
			});
		});
	};

	// Send out updates to last seen
	const broadcastLastSeenUpdates = function(){
		if (io) {
			const cachedLastSeens = main.flushCachedLastSeens();
			if (cachedLastSeens) {
				const values = Object.values(cachedLastSeens);
				if (values && values.length) {
					io.emit("lastSeen", values);
				}
			}
		}
	};

	// Am I going to regret this?
	setInterval(broadcastLastSeenUpdates, constants.LAST_SEEN_UPDATE_RATE);

	const output = {
		emit,
		emitChannelUserListToRecipients,
		emitEventToChannel,
		emitMessageToRecipients,
		emitNewHighlight,
		emitUnseenHighlights,
		setServer
	};

	main.setIo(output);
	return output;
};
