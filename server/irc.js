// PYRAMID
// IRC module

// Prerequisites
const irc    = require("irc");
const fs     = require("fs");
const path   = require("path");
const lodash = require("lodash");

const constants = require("./constants");
const log = require("./log");
const util = require("./util");

module.exports = function(main) {

	var clients = [], i, multiServerChannels = [];

	// "Multi server channels" are channel names that exist on more than one connection,
	// and thus connection needs to be specified upon mention of this channel name,
	// in order to disambiguate.

	// This is usually only performed on startup, however, it is stored as a function,
	// in case it needs to be done later.

	var calibrateMultiServerChannels = function() {
		multiServerChannels = [];

		var namesSeen = [];
		for (var i = 0; i < clients.length; i++) {
			var c = clients[i];

			for (var j = 0; j < c.opt.channels.length; j++) {
				var ch = c.opt.channels[j];

				if (namesSeen.indexOf(ch) >= 0) {
					multiServerChannels.push(ch);
				}

				namesSeen.push(ch);
			}
		}
	}

	// Channel objects (chobj); helping easily identify sources of events

	const clientServerName = function(client) {
		if (client && client.extConfig) {
			return client.extConfig.name;
		}

		return null;
	};

	const channelObject = function(client, channel) {
		// "server" idenfitier is not actually server address;
		// merely the identifying name given in its config section
		return {
			server: clientServerName(client),
			channel: channel,
			client: client
		}
	};

	const getChannelUri = function(chobj) {
		return util.getChannelUri(chobj.channel, chobj.server);
	};

	const getChannelFullName = function(chobj) {

		if (multiServerChannels.indexOf(chobj.channel) >= 0) {
			return chobj.server + " " + chobj.channel;
		}

		return chobj.channel;
	};

	const findClientByServerName = function(serverName) {
		for(var i = 0; i < clients.length; i++){
			var c = clients[i]
			if (clientServerName(c) === serverName) {
				return c;
			}
		}
		return null;
	};

	const parseMessageTags = function(data) {
		if (data && data.tags) {
			main.plugins().handleEvent("messageTags", data);
			return data.tags;
		}

		return null;
	};

	const formatChannelName = function(channelName) {
		return "#" + channelName.replace(/^#/, "");
	};

	// Send message

	const sendOutgoingMessage = function(channelUri, message, isAction = false) {
		const serverName  = util.channelServerNameFromUrl(channelUri);
		const channelName = util.channelNameFromUrl(channelUri, "#");
		if (serverName && channelName) {
			const client = findClientByServerName(serverName);
			if (client) {

				const meRegex = /^\/me\s+/;
				if (!isAction && meRegex.test(message)) {
					isAction = true;
					message = message.replace(meRegex, "");
				}

				const type = isAction ? "action" : "msg";

				if (isAction) {
					client.action(channelName, message);
				} else {
					client.say(channelName, message);
				}

				// Handle our own message as if it's incoming
				handleIncomingMessage(
					client, client.nick,
					channelName, type, message, {},
					true
				);
				return true;
			}
		}

		return false;
	};

	// Handle incoming events

	const handleIncomingMessage = function(
		client, username, channel, type, message, tags = {}, postedLocally = false
	) {

		// Context
		const chobj = channelObject(client, channel);
		const channelUri = getChannelUri(chobj);
		const channelName = getChannelFullName(chobj);
		const serverName = chobj.server;
		const meUsername = client.nick;

		// Time
		const time = new Date();

		// Parse tags, if any
		const parsedTags = parseMessageTags({
			client, channel: channelUri, message, meUsername,
			postedLocally, serverName, tags, type, username
		});

		main.handleIncomingMessage(
			channelUri, channelName, serverName, username,
			time, type, message, parsedTags, meUsername
		);
	};

	const handleIncomingEvent = function(client, channel, type, data) {
		const chobj = channelObject(client, channel);
		const time = new Date();

		main.handleIncomingEvent(
			getChannelUri(chobj), getChannelFullName(chobj), chobj.server,
			type, data, time, client.chans[channel].users
		);
	};

	const handleIncomingUnhandledMessage = function(client, message) {
		const username = message.nick;
		const channel = message.args[0];
		const chobj = channelObject(client, channel);
		const channelUri = getChannelUri(chobj);
		const serverName = chobj.server;

		main.plugins().handleEvent("customMessage", {
			channel: channelUri,
			client,
			message,
			serverName,
			username
		});
	};

	const handleConnectionStateChange = function(client, state) {
		const server = clientServerName(client);

		if (client._pyramidAborted) {
			state = constants.CONNECTION_STATUS.ABORTED;
		}

		if (server) {
			main.handleIrcConnectionStateChange(server, state);
		}
	};

	const handleSystemLog = function(client, text, level) {
		const serverName = clientServerName(client);
		main.handleSystemLog(serverName, text, level);
	};

	const setChannelUserList = function(client, channel, userList) {
		const chobj = channelObject(client, channel);
		main.setChannelUserList(getChannelUri(chobj), userList);
	};

	const abortClient = function(client, status = constants.CONNECTION_STATUS.ABORTED) {
		client._pyramidAborted = true;
		handleConnectionStateChange(client, status);
	};

	const setUpClient = function(client) {

		client.addListener("connect", function() {
			client._pyramidAborted = false;
			handleConnectionStateChange(
				client, constants.CONNECTION_STATUS.CONNECTED
			);
			main.plugins().handleEvent("connect", { client });
		});

		client.addListener("registered", function() {
			main.plugins().handleEvent("registered", { client });
		});

		client.addListener("close", function() {
			handleConnectionStateChange(
				client, constants.CONNECTION_STATUS.DISCONNECTED
			);
		});

		client.addListener("end", function() {
			handleConnectionStateChange(
				client, constants.CONNECTION_STATUS.DISCONNECTED
			);
		});

		client.addListener("abort", function() {
			// IRC library gave up reconnecting
			handleConnectionStateChange(
				client, constants.CONNECTION_STATUS.FAILED
			);
		});

		client.addListener("netError", function(error) {
			handleSystemLog(client, `Net error: ${error.message}`, "error");
		});

		client.addListener("unhandled", function(message) {
			handleIncomingUnhandledMessage(client, message);
		});

		client.addListener("motd", function (message) {
			// In a standard IRC network, prefix info should be non-empty by now
			// Try to insert some very basic standrd info iff it's empty
			try {
				if (
					client.prefixForMode && client.modeForPrefix
				) {
					const pfmKeys = Object.keys(client.prefixForMode);
					const mfpKeys = Object.keys(client.modeForPrefix);

					if (pfmKeys && mfpKeys && !pfmKeys.length && !mfpKeys.length) {
						client.prefixForMode["o"] = "@";
						client.modeForPrefix["@"] = "o";
					}
				}
			}
			catch(e) {}
		});

		client.addListener("message", function (username, channel, message, rawData) {
			if (!username || !channel) { return; }
			handleIncomingMessage(
				client, username, channel, "msg", message, rawData.tags || {}
			);
		});

		client.addListener("action", function (username, channel, message, rawData) {
			if (!username || !channel) { return; }
			handleIncomingMessage(
				client, username, channel, "action", message, rawData.tags || {}
			);
		});

		client.addListener("notice", function (username, channel, message, rawData) {
			if (!channel) { return; }
			handleIncomingMessage(
				client, username, channel, "notice", message, rawData.tags || {}
			);
		});

		client.addListener("error", function(message) {
			const errString = message.commandType + ": " +
				message.args.join(" ") +
				` (${message.command})`;
			handleSystemLog(client, errString, message.commandType);
		});

		client.addListener("names", (channel, nicks) => {
			setChannelUserList(client, channel, nicks);
		});

		client.addListener("join", (channel, username) => {
			handleIncomingEvent(client, channel, "join", { username });

			const channelUri = getChannelUri(channelObject(client, channel));
			main.plugins().handleEvent("join", { client, channel: channelUri, username });
		});

		client.addListener("part", (channel, username, reason) => {
			handleIncomingEvent(client, channel, "part", { username, reason });

			const channelUri = getChannelUri(channelObject(client, channel));
			main.plugins().handleEvent("part", { client, channel: channelUri, username });
		});

		client.addListener("quit", (username, reason, channels) => {
			channels.forEach((channel) => {
				handleIncomingEvent(
					client, channel, "quit", { username, reason }
				);
			});
		});

		client.addListener("kick", (channel, username, by, reason) => {
			handleIncomingEvent(client, channel, "kick", { username, by, reason });
		});

		client.addListener("+mode", (channel, username, mode, argument) => {
			handleIncomingEvent(
				client, channel, "+mode", { username, mode, argument }
			);
		});

		client.addListener("-mode", (channel, username, mode, argument) => {
			handleIncomingEvent(
				client, channel, "-mode", { username, mode, argument }
			);
		});

		client.addListener("kill", (username, reason, channels) => {
			channels.forEach((channel) => {
				handleIncomingEvent(
					client, channel, "kill", { username, reason }
				);
			});
		});
	};

	const convertChannelObjects = (channels) => {
		return channels.map((channel) => {
			return "#" + channel.name;
		});
	}

	// Set up clients

	const initiateClient = (cf) => {
		if (cf && cf.hostname) {
			main.log("Connecting to " + cf.hostname + " as " + cf.nickname);
			cf.username = cf.username || cf.nickname;

			var c = new irc.Client(
				cf.hostname, cf.nickname,
				{
					channels:    convertChannelObjects(cf.channels),
					port:        cf.port || 6667,
					userName:    cf.username,
					realName:    cf.realname || cf.nickname || cf.username,
					password:    cf.password || "",
					secure:      cf.secure || false,
					selfSigned:  cf.selfSigned || false,
					certExpired: cf.certExpired || false,
					debug:       main.configValue("debug") || false,
					showErrors:  main.configValue("debug") || false,
					retryCount:  999
				}
			);
			c.extConfig = cf;
			clients.push(c);
		}
	}

	const go = () => {
		const ircConfig = main.currentIrcConfig();
		ircConfig.forEach((config) => {
			if (config) {
				initiateClient(config);
			}
		});

		calibrateMultiServerChannels();

		clients.forEach((client) => {
			if (client) {
				setUpClient(client);
			}
		});
	};

	const connectUnconnectedClients = () => {
		const newNames = [];
		const ircConfig = main.currentIrcConfig();
		ircConfig.forEach((config) => {
			if (
				config &&
				config.name &&
				config.hostname &&
				!findClientByServerName(config.name)
			) {
				initiateClient(config);
				newNames.push(config.name);
			}
		});

		calibrateMultiServerChannels();

		clients.forEach((client) => {
			if (
				client &&
				newNames.indexOf(clientServerName(client)) >= 0
			) {
				setUpClient(client);
			}
		});
	};

	const joinChannel = function(serverName, channelName) {
		const c = findClientByServerName(serverName);
		if (c) {
			c.join(formatChannelName(channelName));
		}
	};

	const partChannel = function(serverName, channelName) {
		const c = findClientByServerName(serverName);
		if (c) {
			c.part(formatChannelName(channelName));
		}
	};

	const reconnectServer = function(serverName) {
		const c = findClientByServerName(serverName);
		if (c && c._pyramidAborted) {
			c.connect();
		}
		else {
			main.warn(
				"Disregarded " + serverName +
				" IRC reconnect request, because client isn't aborted"
			);
		}
	};

	const disconnectServer = function(serverName) {
		const c = findClientByServerName(serverName);
		if (c) {
			abortClient(c);
			c.disconnect();
		}
	};

	const removeServer = function(serverName) {
		const c = findClientByServerName(serverName);
		if (c) {
			disconnectServer(serverName);
			clients = lodash.without(clients, c);
		}
	};

	// Exported objects and methods
	const output = {
		calibrateMultiServerChannels,
		clients: () => clients,
		connectUnconnectedClients,
		disconnectServer,
		go,
		joinChannel,
		partChannel,
		reconnectServer,
		removeServer,
		sendOutgoingMessage
	};

	main.setIrc(output);
	return output;
}
