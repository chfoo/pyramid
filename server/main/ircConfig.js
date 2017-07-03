const _ = require("lodash");
const async = require("async");

const channelUtils = require("../util/channels");
const passwordUtils = require("../util/passwords");
const stringUtils = require("../util/strings");

module.exports = function(db, io) {

	var currentIrcConfig = [];

	var channelIdCache = {};
	var serverIdCache = {};

	var encryptionKey = null;

	const getIrcConfig = function(callback) {
		db.getIrcConfig(callback);
	};

	const loadIrcConfig = function(callback) {
		getIrcConfig((err, data) => {
			if (err) {
				if (typeof callback === "function") {
					callback(err);
				}
			}
			else {
				currentIrcConfig = data;
				generateIrcConfigCaches();
				if (typeof callback === "function") {
					callback(null, data);
				}
			}
		});
	};

	const loadAndEmitIrcConfig = function(callback) {
		// Will call above
		io.emitIrcConfig(null, callback);
	};

	const generateIrcConfigCaches = function(config = currentIrcConfig) {
		var serverIds = {}, channelIds = {};

		if (config && config.length) {
			config.forEach((server) => {
				if (server && server.serverId && server.name) {
					serverIds[server.name] = server.serverId;

					if (server.channels && server.channels.length) {
						server.channels.forEach((channel) => {
							if (channel && channel.channelId && channel.name) {
								const channelUri = channelUtils.getChannelUri(
									server.name, channel.name
								);
								channelIds[channelUri] = channel.channelId;
							}
						});
					}
				}
			});
			serverIdCache = serverIds;
			channelIdCache = channelIds;
		}
	};

	const safeIrcConfigDict = function(ircConfig = currentIrcConfig) {
		var ircConfigDict = {};
		ircConfig.forEach((config) => {
			var outConfig = _.omit(config, ["password", "serverId"]);

			if (config.password) {
				// Signal that a password has been set
				outConfig.password = true;
			}

			let channels = outConfig.channels;
			if (channels) {
				outConfig.channels = {};
				channels.forEach((channel) => {
					let { displayName, name } = channel;
					outConfig.channels[name] = { displayName, name };
				});
			}

			ircConfigDict[config.name] = outConfig;
		});

		return ircConfigDict;
	};

	const getIrcConfigByName = function(name, ircConfig = currentIrcConfig) {
		for (var i = 0; i < ircConfig.length; i++) {
			if (ircConfig[i].name === name) {
				return ircConfig[i];
			}
		}

		return null;
	};

	const getConfigChannelsInServer = function(serverName, ircConfig = currentIrcConfig) {
		const s = getIrcConfigByName(serverName, ircConfig);
		if (s) {
			return s.channels.map(
				(val) => channelUtils.getChannelUri(serverName, val.name)
			);
		}

		return [];
	};

	// Storing

	const addServerToIrcConfig = function(data, callback) {

		if (data && data.name && data.name.charAt(0) === "_") {
			// Not allowed to start a server name with "_"
			callback(new Error("Not allowed to start a server name with an underscore"));
			return;
		}

		if (data.password && encryptionKey) {
			data.password = JSON.stringify(
				passwordUtils.encryptSecret(
					data.password, encryptionKey
				)
			);
		}

		db.addServerToIrcConfig(data, callback);
	};

	const modifyServerInIrcConfig = function(serverName, details, callback) {

		if (details.password && encryptionKey) {
			details.password = JSON.stringify(
				passwordUtils.encryptSecret(
					details.password, encryptionKey
				)
			);
		}

		async.waterfall([
			(callback) => db.getServerId(serverName, callback),
			(data, callback) => {
				if (data) {
					db.modifyServerInIrcConfig(data.serverId, details, callback);
				}
				else {
					callback(new Error("No such server"));
				}
			}
		], callback);
	};

	const removeServerFromIrcConfig = function(serverName, callback) {
		async.waterfall([
			(callback) => db.getServerId(serverName, callback),
			(data, callback) => {
				if (data) {
					db.removeServerFromIrcConfig(data.serverId, callback);
				}
				else {
					callback(new Error("No such server"));
				}
			}
		], callback);
	};

	const addChannelToIrcConfig = function(serverName, name, data, callback) {
		name = name.replace(/^#/, "");
		async.waterfall([
			(callback) => db.getServerId(serverName, callback),
			(data, callback) => {
				if (data) {
					db.addChannelToIrcConfig(data.serverId, name, data, callback);
				}
				else {
					callback(new Error("No such server"));
				}
			}
		], callback);
	};

	const modifyChannelInIrcConfig = function(serverName, name, details, callback) {
		name = name.replace(/^#/, "");
		async.waterfall([
			(callback) => db.getChannelId(serverName, name, callback),
			(data, callback) => {
				if (data) {
					db.modifyChannelInIrcConfig(data.channelId, details, callback);
				}
				else {
					callback(new Error("No such channel"));
				}
			}
		], callback);
	};

	const removeChannelFromIrcConfig = function(serverName, name, callback) {
		name = name.replace(/^#/, "");
		async.waterfall([
			(callback) => db.getChannelId(serverName, name, callback),
			(data, callback) => {
				if (data) {
					db.removeChannelFromIrcConfig(data.channelId, callback);
				}
				else {
					callback(new Error("No such channel"));
				}
			}
		], callback);
	};

	// Composite store functions

	const addIrcServerFromDetails = function(details, callback) {
		if (details && details.name && details.data) {
			const name = stringUtils.formatUriName(details.name);
			const data = _.assign({}, details.data, { name });

			addServerToIrcConfig(
				data,
				(err) => {
					if (err) {
						callback(err);
					}
					else {
						// Add all channels
						if (data.channels) {
							const channelNames = [];
							const channelList = Array.isArray(data.channels)
								? data.channels
								: Object.keys(data.channels);

							channelList.forEach((channel) => {
								const channelName = channel.name || channel;

								if (typeof channelName === "string" && channelName) {
									channelNames.push(stringUtils.formatUriName(channelName));
								}
							});

							if (channelNames.length) {
								async.parallel(
									channelNames.map((channelName) =>
										((callback) => addChannelToIrcConfig(
											name, channelName, {}, callback
										))
									),
									callback
								);
							}
							else {
								callback();
							}
						}
						else {
							callback();
						}
					}
				}
			);
		}
		else {
			callback(new Error("Insufficient data"));
		}
	};

	// API

	return {
		addChannelToIrcConfig,
		addIrcServerFromDetails,
		addServerToIrcConfig,
		channelIdCache: () => channelIdCache,
		currentIrcConfig: () => currentIrcConfig,
		getConfigChannelsInServer,
		getIrcConfig,
		getIrcConfigByName,
		loadIrcConfig,
		loadAndEmitIrcConfig,
		modifyChannelInIrcConfig,
		modifyServerInIrcConfig,
		removeChannelFromIrcConfig,
		removeServerFromIrcConfig,
		safeIrcConfigDict,
		serverIdCache: () => serverIdCache,
		setEncryptionKey: (k) => { encryptionKey = k; }
	};
};
