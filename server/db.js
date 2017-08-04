// PYRAMID
// Database logic

const fs = require("fs");
const path = require("path");

const _ = require("lodash");
const async = require("async");
const mkdirp = require("mkdirp");
const sqlite = require("sqlite3");

const constants = require("./constants");
const channelUtils = require("./util/channels");
const fileUtils = require("./util/files");
const timeUtils = require("./util/time");

const ASC = 0, DESC = 1;

const DB_FILENAME = constants.DB_FILENAME;

const excludeEventLinesQuery =
	"lines.type NOT IN ('join', 'part', 'quit', 'kick', 'kill', 'mode')";

// Create db

const createDatabaseFromEmpty = function(callback) {
	const source = path.join(constants.PROJECT_ROOT, "pyramid-empty.db");
	const target = DB_FILENAME;

	fs.access(target, (err) => {
		if (err) {
			// If the file did not exist, let's copy
			mkdirp(path.dirname(target), (err) => {
				if (err) {
					callback(err);
				}
				else {
					console.log("Created a new database from empty template");
					fileUtils.copyFile(source, target, callback);
				}
			});
		} else {
			// If the file already exists, abort silently
			return callback();
		}
	});
};

// Callback utility

const dbCallback = function(callback) {
	return function(err, data) {
		if (err) {
			console.error("SQL error occurred:", err);
		}
		if (typeof callback === "function") {
			callback(err, data);
		}
	};
};

// Query utility

const getTimestamp = function(t) {

	if (t && t instanceof Date) {
		return t.toISOString();
	}

	return t;
};

const nameValueRowsToObject = function(rows) {
	var output = {};
	if (rows && rows.length) {
		rows.forEach((row) => {
			if (row && row.name) {
				output[row.name] = row.value;
			}
		});
	}

	return output;
};

const formatIn = function(list) {
	if (list && list instanceof Array) {
		const json = JSON.stringify(list);
		if (json) {
			return "(" + json.substr(1, json.length-2) + ")";
		}
	}

	return "()";
};

const dollarize = function(data) {
	const out = {};
	_.forOwn(data, (value, key) => {
		out["$" + key] = value;
	});
	return out;
};

const onlyParamsInQuery = function(params, query) {
	const out = {};

	if (params && query) {
		_.forOwn(params, (value, key) => {
			if (query.indexOf(key) >= 0) {
				out[key] = value;
			}
		});
	}

	return out;
};

const oq = function(col, isDesc = false) {
	const dir = isDesc ? "DESC" : "ASC";
	return `ORDER BY ${col} ${dir}`;
};

const sq = function(table, selectCols, whereCols = [], joins = "") {
	const select = selectCols.join(", ");
	const where = whereCols.map((w) => `${w} = \$${w}`).join(" AND ");
	return `SELECT ${select} FROM ${table}` +
		(joins ? " " + joins : "") +
		(where ? ` WHERE ${where}` : "");
};

const uq = function(table, setCols, whereCols) {
	const set = setCols.map((s) => `${s} = \$${s}`).join(", ");
	const where = whereCols.map((w) => `${w} = \$${w}`).join(" AND ");
	return `UPDATE ${table} SET ${set} WHERE ${where}`;
};

const iq = function(table, colNames) {
	const cols = colNames.join(", ");
	const vals = colNames.map((c) => "$" + c).join(", ");
	return `INSERT INTO ${table} (${cols}) VALUES (${vals})`;
};

const dq = function(table, whereCols) {
	const where = whereCols.map((w) => `${w} = \$${w}`).join(" AND ");
	return `DELETE FROM ${table} WHERE ${where}`;
};

const initializeDb = function(db) {
	// Set up SQLite settings
	db.run("PRAGMA journal_mode=WAL");
	db.run("PRAGMA synchronous=NORMAL");
};

const mainMethods = function(main, db) {

	const getLocalDatestampFromTime = function(time) {
		return timeUtils.ymd(main.logs().localMoment(time));
	};

	const close = () => { db.close(); };

	const upsert = function(updateQuery, insertQuery, params, callback) {
		db.run(
			updateQuery,
			onlyParamsInQuery(params, updateQuery),
			function(err, data) {
				if (err || !this.changes) {
					db.run(
						insertQuery,
						onlyParamsInQuery(params, insertQuery),
						dbCallback(callback)
					);
				}
				else {
					callback(err, data);
				}
			}
		);
	};

	const getIrcServers = function(callback) {
		db.all(
			sq("ircServers", ["*"], ["isEnabled"]) + " " + oq("name"),
			dollarize({ isEnabled: 1 }),
			dbCallback(callback)
		);
	};

	const getIrcChannels = function(callback) {
		db.all(
			sq("ircChannels", ["*"], ["isEnabled"]) + " " + oq("name"),
			dollarize({ isEnabled: 1 }),
			dbCallback(callback)
		);
	};

	const getIrcServer = function(serverId, callback) {
		db.get(
			sq("ircServers", ["*"], ["serverId"]),
			dollarize({ serverId }),
			dbCallback(callback)
		);
	};

	const getIrcChannel = function(channelId, callback) {
		db.get(
			sq("ircChannels", ["*"], ["channelId"]),
			dollarize({ channelId }),
			dbCallback(callback)
		);
	};

	const getIrcConfig = function(callback) {
		var servers;

		async.waterfall([
			// Load servers
			getIrcServers,

			// Load channels
			(_servers, callback) => {
				servers = _servers;
				getIrcChannels(callback);
			},

			// Combine and serve
			(channels, callback) => {
				servers.forEach((server) => {
					if (server) {
						server.channels = [];
					}
				});

				channels.forEach((channel) => {
					if (channel && channel.serverId) {

						if (channel.channelConfig) {
							channel.channelConfig = JSON.parse(channel.channelConfig);
						}

						const s = servers.filter(
							(s) => s && s.serverId === channel.serverId
						);

						if (s && s.length) {
							s[0].channels.push(channel);
						}
					}
				});

				callback(null, servers);
			}
		], dbCallback(callback));
	};

	const getFriends = function(callback) {
		db.all(
			sq("friends", ["*"], ["isEnabled"]) + " " + oq("username", ASC),
			{ $isEnabled: 1 },
			dbCallback(callback)
		);
	};

	const getFriendsWithChannelInfo = function(callback) {
		db.all(
			sq(
				"friends",
				[
					"friends.*",
					"ircChannels.name AS channelName",
					"ircChannels.channelType",
					"ircServers.name AS serverName"
				]
			) +
			" " +
			"INNER JOIN ircChannels ON " +
				"friends.lastSeenChannelId = ircChannels.channelId " +
			"INNER JOIN ircServers ON " +
				"ircChannels.serverId = ircServers.serverId " +
			"WHERE friends.isEnabled = $isEnabled " +
			oq("username", ASC),
			{ $isEnabled: 1 },
			dbCallback(callback)
		);
	};

	const getFriend = function(serverId, username, callback) {
		db.get(
			sq("friends", ["*"], ["isEnabled", "serverId", "username"]),
			dollarize({ isEnabled: 1, serverId, username }),
			dbCallback(callback)
		);
	};

	const addToFriends = function(serverId, username, isBestFriend, callback) {
		upsert(
			uq("friends", ["isBestFriend", "isEnabled"], ["serverId", "username"]),
			iq("friends", ["serverId", "username", "isBestFriend"]),
			dollarize({ serverId, username, isBestFriend: +isBestFriend, isEnabled: 1 }),
			callback
		);
	};

	const modifyFriend = function(friendId, data, callback) {
		if (data.lastSeenTime) {
			data.lastSeenTime = getTimestamp(data.lastSeenTime);
		}

		db.run(
			uq("friends", Object.keys(data), ["friendId"]),
			dollarize(_.assign({ friendId }, data)),
			dbCallback(callback)
		);
	};

	const removeFromFriends = function(friendId, callback) {
		db.run(
			dq("friends", ["friendId"]),
			dollarize({ friendId }),
			dbCallback(callback)
		);
	};

	const getServerId = function(name, callback) {
		db.get(
			sq("ircServers", ["serverId"], ["name"]),
			dollarize({ name }),
			dbCallback(callback)
		);
	};

	const getServerName = function(serverId, callback) {
		db.get(
			sq("ircServers", ["name"], ["serverId"]),
			dollarize({ serverId }),
			dbCallback(callback)
		);
	};

	const getChannelId = function(serverName, channelName, channelType, callback) {
		getServerId(
			serverName,
			function(err, row) {
				if (err) {
					callback(err);
				}
				else {
					if (row) {
						const serverId = row.serverId;
						db.get(
							sq(
								"ircChannels",
								["channelId"],
								["serverId", "channelType", "name"]
							),
							dollarize({ channelType, name: channelName, serverId }),
							dbCallback(callback)
						);
					}
					else {
						callback(null, null);
					}
				}
			}
		);
	};

	const getConfigValue = function(name, callback) {
		db.get(
			sq("config", ["value"], ["name"]),
			dollarize({ name }),
			dbCallback(function(err, row) {
				if (err) {
					callback(err);
				}
				else {
					callback(null, row && JSON.parse(row.value));
				}
			})
		);
	};

	const getAllConfigValues = function(callback) {
		db.all(
			sq("config", ["name", "value"]),
			dbCallback(function(err, rows) {
				if (err) {
					callback(err);
				}
				else {
					var obj = nameValueRowsToObject(rows);
					_.forOwn(obj, (value, key) => {
						obj[key] = JSON.parse(value);
					});
					callback(null, obj);
				}
			})
		);
	};

	const storeConfigValue = function(name, value, callback) {
		upsert(
			uq("config", ["value"], ["name"]),
			iq("config", ["name", "value"]),
			dollarize({ name, value: JSON.stringify(value) }),
			callback
		);
	};

	const getNicknames = function(callback) {
		const prepareNicknameListValue = function(list) {
			if (list) {
				return list.split("\n");
			}

			return list;
		};

		const prepareNicknameValues = function(err, data) {
			if (data && data.length) {
				data.forEach((item) => {
					[
						"channelBlacklist", "channelWhitelist",
						"serverBlacklist", "serverWhitelist"
					].forEach((key) => {
						if (item[key]) {
							item[key] = prepareNicknameListValue(item[key]);
						}
					});
				});
			}

			callback(err, data);
		};

		db.all(
			sq("nicknames", ["*"]) + " " + oq("nickname", ASC),
			prepareNicknameValues
		);
	};

	const addNickname = function(nickname, callback) {
		db.run(
			iq("nicknames", ["nickname"]),
			dollarize({ nickname }),
			dbCallback(callback)
		);
	};

	const modifyNickname = function(nickname, data, callback) {
		const keys = Object.keys(data);

		keys.forEach((key) => {
			if (data[key] && data[key] instanceof Array) {
				data[key] = data[key].join("\n").toLowerCase() || null;
			}
		});

		db.run(
			uq("nicknames", keys, ["nickname"]),
			dollarize(_.assign({ nickname }, data)),
			dbCallback(callback)
		);
	};

	const removeNickname = function(nickname, callback) {
		db.run(
			dq("nicknames", ["nickname"]),
			dollarize({ nickname }),
			dbCallback(callback)
		);
	};

	const addServerToIrcConfig = function(data, callback) {
		upsert(
			uq(
				"ircServers",
				[
					"hostname", "port", "secure", "username",
					"password", "nickname", "isEnabled"
				],
				["name"]
			),
			iq(
				"ircServers",
				[
					"name", "hostname", "port", "secure",
					"username", "password", "nickname", "isEnabled"
				]
			),
			{
				$name: data.name,
				$hostname: data.hostname,
				$port: data.port || 6667,
				$secure: +(data.secure || false),
				$username: data.username,
				$password: data.password,
				$nickname: data.nickname,
				$isEnabled: 1
			},
			dbCallback(callback)
		);
	};

	const modifyServerInIrcConfig = function(serverId, data, callback) {
		db.run(
			uq("ircServers", Object.keys(data), ["serverId"]),
			dollarize(_.assign({ serverId }, data)),
			dbCallback(callback)
		);
	};

	const removeServerFromIrcConfig = function(serverId, callback) {
		db.run(
			uq("ircServers", ["isEnabled"], ["serverId"]),
			dollarize({ isEnabled: 0, serverId }),
			dbCallback(callback)
		);
	};

	const addChannelToIrcConfig = function(serverId, name, channelType, data, callback) {
		data = data || {};
		let dataKeys = Object.keys(data);
		upsert(
			uq(
				"ircChannels",
				["isEnabled"].concat(dataKeys),
				["serverId", "channelType", "name"]
			),
			iq(
				"ircChannels",
				["serverId", "channelType", "name", "isEnabled"].concat(dataKeys)
			),
			dollarize(_.assign({ serverId, channelType, name, isEnabled: 1 }, data)),
			dbCallback(callback)
		);
	};

	const modifyChannelInIrcConfig = function(channelId, data, callback) {
		if (data.lastSeenTime) {
			data.lastSeenTime = getTimestamp(data.lastSeenTime);
		}

		if (data.channelConfig) {
			data.channelConfig = JSON.stringify(data.channelConfig);

			if (data.channelConfig === "{}") {
				data.channelConfig = null;
			}
		}

		db.run(
			uq("ircChannels", Object.keys(data), ["channelId"]),
			dollarize(_.assign({ channelId }, data)),
			dbCallback(callback)
		);
	};

	const removeChannelFromIrcConfig = function(channelId, callback) {
		db.run(
			uq("ircChannels", ["isEnabled"], ["channelId"]),
			dollarize({ isEnabled: 0, channelId }),
			dbCallback(callback)
		);
	};

	const getLastSeenChannels = function(callback) {
		getIrcChannels((err, channels) => {
			if (err) {
				callback(err);
			}
			else {
				// Resolve server names
				let serverIds = _.uniq(channels.map((channel) => channel.serverId));
				let calls = serverIds.map((s) => {
					return (callback) => getServerName(s, (err, data) => {
						callback(err, { id: s, data });
					});
				});

				async.parallel(calls, (err, serverNames) => {
					let output = {};
					channels.forEach((channel) => {
						let {
							lastSeenTime,
							lastSeenUsername,
							lastSeenDisplayName,
							name,
							channelType,
							serverId
						} = channel;

						// Find server name

						var serverName;

						if (serverId) {
							serverNames.forEach((s) => {
								if (s.id === serverId) {
									serverName = s.data && s.data.name;
								}
							});
						}

						// Get URI and add to list

						if (
							serverName &&
							lastSeenTime &&
							lastSeenUsername &&
							channelType === constants.CHANNEL_TYPES.PUBLIC
						) {
							let channelUri = channelUtils.getChannelUri(
								serverName,
								name,
								channelType
							);

							output[channelUri] = {
								time: lastSeenTime,
								userDisplayName: lastSeenDisplayName,
								username: lastSeenUsername
							};
						}
					});

					callback(null, output);
				});
			}
		});
	};

	// TODO: Add server name to usernames

	const getLastSeenUsers = function(callback) {
		getFriendsWithChannelInfo((err, friends) => {
			if (err) {
				callback(err);
			}
			else {
				const output = {};
				friends.forEach((friend) => {
					const {
						displayName,
						lastSeenTime,
						lastSeenChannelId,
						username
					} = friend;

					if (lastSeenTime && lastSeenChannelId) {
						output[username] = {
							displayName,
							time: lastSeenTime,
							channel: channelUtils.getChannelUri(
								friend.serverName,
								friend.channelName,
								friend.channelType
							)
						};
					}
				});

				callback(null, output);
			}
		});
	};

	const getFriendsList = function(callback) {
		getFriends((err, friends) => {
			if (err) {
				callback(err);
			}
			else {
				const friendsList = {
					[constants.RELATIONSHIP_FRIEND]: [],
					[constants.RELATIONSHIP_BEST_FRIEND]: []
				};

				friends.forEach((friend) => {
					const { isBestFriend, username } = friend;
					if (isBestFriend) {
						friendsList[constants.RELATIONSHIP_BEST_FRIEND].push(username);
					}
					else {
						friendsList[constants.RELATIONSHIP_FRIEND].push(username);
					}
				});

				callback(null, friendsList);
			}
		});
	};

	const getLines = function(where, direction, limit, args, callback) {
		db.all(
			sq(
				"lines",
				[
					"lines.*",
					"ircChannels.name AS channelName",
					"ircChannels.channelType",
					"ircServers.name AS serverName"
				]
			) +
			" " +
			"INNER JOIN ircChannels ON " +
				"lines.channelId = ircChannels.channelId " +
			"INNER JOIN ircServers ON " +
				"ircChannels.serverId = ircServers.serverId " +
			where + " " +
			oq("lines.time", direction) + " " +
			"LIMIT " + limit,
			args,
			dbCallback(callback)
		);
	};

	const getDateLines = function(where, args, options, callback) {
		options = options || {};
		const limit = options.pageNumber
			? ((options.pageNumber-1) * constants.LOG_PAGE_SIZE) +
				", " + constants.LOG_PAGE_SIZE
			: constants.LOG_PAGE_SIZE;

		var whereSince = "";

		if (options.sinceTime instanceof Date) {
			whereSince = "AND lines.time >= $sinceTime ";
			args.$sinceTime = options.sinceTime.toISOString();
		}

		getLines(
			where + " " + whereSince,
			ASC,
			limit,
			args,
			callback
		);
	};

	const getDateLinesForChannel = function(channelId, date, options, callback) {
		getDateLines(
			"WHERE lines.channelId = $channelId " +
			"AND lines.date = $date",
			dollarize({ channelId, date }),
			options,
			callback
		);
	};

	const getDateLinesForUsername = function(username, date, options, callback) {
		getDateLines(
			"WHERE lines.username = $username " +
			"AND lines.date = $date " +
			"AND " + excludeEventLinesQuery,
			dollarize({ username, date }),
			options,
			callback
		);
	};

	const getMostRecentLines = function(where, limit, args, beforeTime, callback) {
		args = args || {};
		let beforeTimeLine = "";

		if (beforeTime) {
			beforeTimeLine = (where ? " AND " : "WHERE ") +
				"lines.time < $beforeTime";
			args["$beforeTime"] = getTimestamp(beforeTime);
		}

		getLines(
			where + beforeTimeLine,
			DESC,
			limit,
			args,
			callback
		);
	};

	const getMostRecentChannelLines = function(channelId, limit, beforeTime, callback) {
		getMostRecentLines(
			"WHERE lines.channelId = $channelId",
			limit,
			dollarize({ channelId }),
			beforeTime,
			callback
		);
	};

	const getMostRecentUserLines = function(username, limit, beforeTime, callback) {
		// TODO: Somehow include connection event lines
		getMostRecentLines(
			"WHERE lines.username = $username " +
			"AND " + excludeEventLinesQuery,
			limit,
			dollarize({ username }),
			beforeTime,
			callback
		);
	};

	const getMostRecentAllFriendsLines = function(limit, beforeTime, callback) {
		// TODO: Somehow include connection event lines
		getMostRecentLines(
			"WHERE lines.username IN (SELECT username FROM friends) " +
			"AND " + excludeEventLinesQuery,
			limit,
			{},
			beforeTime,
			callback
		);
	};

	const getMostRecentHighlightsLines = function(limit, beforeTime, callback) {
		// TODO: Somehow include connection event lines
		getMostRecentLines(
			"WHERE lines.isHighlight = 1",
			limit,
			{},
			beforeTime,
			callback
		);
	};

	const getSurroundingLines = function(
		channelId, lineTime, distanceMins, limit, callback
	) {
		let d = lineTime;

		if (typeof lineType !== "object") {
			d = new Date(lineTime);
		}

		let timeString = d.toISOString();

		let minTime = new Date(+d - distanceMins * 60000).toISOString();
		let maxTime = new Date(+d + distanceMins * 60000).toISOString();

		let before = (callback) => {
			getLines(
				"WHERE lines.channelId = $channelId " +
				"AND lines.time >= $minTime " +
				"AND lines.time <= $timeString",
				DESC,
				limit,
				dollarize({ channelId, minTime, timeString }),
				callback
			);
		};

		let after = (callback) => {
			getLines(
				"WHERE lines.channelId = $channelId " +
				"AND lines.time >= $timeString " +
				"AND lines.time <= $maxTime",
				ASC,
				limit,
				dollarize({ channelId, maxTime, timeString }),
				callback
			);
		};

		async.parallel({ before, after }, callback);
	};

	const getDateLineCountForChannel = function(channelId, date, callback) {
		db.get(
			sq("lines", ["COUNT(*) AS count"], ["channelId", "date"]),
			dollarize({ channelId, date }),
			dbCallback(callback)
		);
	};

	const getDateLineCountForUsername = function(username, date, callback) {
		// TODO: Exclude event lines, because they are not reliable in user logs
		db.get(
			sq("lines", ["COUNT(*) AS count"], ["username", "date"]),
			dollarize({ username, date }),
			dbCallback(callback)
		);
	};

	const storeLine = function(channelId, line, callback) {
		const { argument, by, events, highlight, mode, prevIds, reason, status } = line;
		var eventData = null;

		// Bunched events
		if (
			(events && events.length) ||
			(prevIds && prevIds.length)
		) {
			eventData = { events, prevIds };
		}

		// Connection events
		else if (status) {
			eventData = { status };
		}

		// Part/quit/kick/kill events
		else if (reason) {
			eventData = { reason };

			if (by) {
				eventData.by = by;
			}
		}

		// Mode events
		else if (mode) {
			eventData = { mode };

			if (argument) {
				eventData.argument = argument;
			}
		}

		let isHighlight = null;

		if (highlight && highlight.length) {
			eventData = _.assign(eventData || {}, { highlight });
			isHighlight = 1;
		}

		db.run(
			iq("lines", [
				"lineId",
				"channelId",
				"type",
				"time",
				"date",
				"username",
				"message",
				"symbol",
				"tags",
				"eventData",
				"isHighlight"
			]),
			{
				$lineId: line.lineId,
				$channelId: channelId,
				$type: line.type,
				$time: getTimestamp(line.time),
				$date: getLocalDatestampFromTime(line.time),
				$username: line.username,
				$message: line.message,
				$symbol: line.symbol,
				$tags: line.tags && JSON.stringify(line.tags),
				$eventData: eventData && JSON.stringify(eventData),
				$isHighlight: isHighlight
			},
			dbCallback(callback)
		);
	};

	const deleteLinesWithLineIds = function(lineIds, callback) {
		db.run(
			"DELETE FROM lines WHERE lineId IN " + formatIn(lineIds),
			dbCallback(callback)
		);
	};

	const getLineByLineId = function(lineId, callback) {
		db.get(
			sq("lines", ["*"], ["lineId"]),
			dollarize({ lineId }),
			dbCallback(callback)
		);
	};

	const deleteLinesBeforeTime = function(time, callback) {
		time = getTimestamp(time);

		db.run(
			"DELETE FROM lines WHERE lines.time <= $time",
			dollarize({ time }),
			dbCallback(callback)
		);
	};

	const deleteLinesBeforeRetentionPoint = function(
		retainDbValue, retainDbType, callback
	) {
		if (retainDbValue <= 0) {
			return;
		}

		if (retainDbType === constants.RETAIN_DB_TYPES.LINES) {
			// Figure out the timestamp for the Nth line

			// Sane lower bound for amount of lines
			retainDbValue = Math.max(5000, retainDbValue);

			db.get(
				sq("lines", ["lines.time"]) + " " +
				oq("lines.time", DESC) +
				` LIMIT 1 OFFSET ${retainDbValue}`,
				{},
				dbCallback(function(err, data) {
					if (!err && data && data.time) {
						deleteLinesBeforeTime(data.time, callback);
					}
				})
			);
		}

		else if (retainDbType === constants.RETAIN_DB_TYPES.DAYS) {

			// Sane upper bound for amount of days
			if (retainDbValue < 15000) {
				let time = timeUtils.offsetDate(new Date(), -1 * retainDbValue).toISOString();

				if (time[0] !== "-") {
					// If not weird negative values
					deleteLinesBeforeTime(time, callback);
				}
			}
		}

		else {
			console.warn(`Weird retain db type: ${retainDbType}`);
		}
	};

	/*

	API:

	addChannelToIrcConfig(serverId, name, channelType, data, callback)
	addNickname(nickname, callback)
	addServerToIrcConfig(data, callback)
	addToFriends(serverId, username, isBestFriend, callback)
	close()
	deleteLinesBeforeRetentionPoint(retainDbValue, retainDbType, callback)
	deleteLinesBeforeTime(time, callback)
	deleteLinesWithLineIds(lineIds, callback)
	getAllConfigValues(callback)
	getChannelId(serverName, channelName, channelType, callback)
	getConfigValue(name, callback)
	getDateLineCountForChannel(channelId, date, callback)
	getDateLineCountForUsername(username, date, callback)
	getDateLinesForChannel(channelId, date, options, callback)
	getDateLinesForUsername(username, date, options, callback)
	getFriend(serverId, username, callback)
	getFriends(callback)
	getFriendsList(callback)
	getIrcChannel(channelId, callback)
	getIrcChannels(callback)
	getIrcConfig(callback)
	getIrcServer(serverId, callback)
	getIrcServers(callback)
	getLastSeenChannels(callback)
	getLastSeenUsers(callback)
	getLineByLineId(lineId, callback)
	getMostRecentAllFriendsLines(limit, beforeTime, callback)
	getMostRecentChannelLines(channelId, limit, beforeTime, callback)
	getMostRecentHighlightsLines(limit, beforeTime, callback)
	getMostRecentUserLines(username, limit, beforeTime, callback)
	getNicknames(callback)
	getServerId(name, callback)
	getServerName(serverId, callback)
	getSurroundingLines(channelId, lineTime, distanceMins, limit, callback)
	modifyChannelInIrcConfig(channelId, data, callback)
	modifyFriend(friendId, data, callback)
	modifyNickname(nickname, data, callback)
	modifyServerInIrcConfig(serverId, data, callback)
	removeChannelFromIrcConfig(channelId, callback)
	removeFromFriends(friendId, callback)
	removeNickname(nickname, callback)
	removeServerFromIrcConfig(serverId, callback)
	storeConfigValue(name, value, callback)
	storeLine(channelId, line, callback)

	*/

	const output = {
		_db: db,
		addChannelToIrcConfig,
		addNickname,
		addServerToIrcConfig,
		addToFriends,
		close,
		deleteLinesBeforeRetentionPoint,
		deleteLinesBeforeTime,
		deleteLinesWithLineIds,
		getAllConfigValues,
		getChannelId,
		getConfigValue,
		getDateLineCountForChannel,
		getDateLineCountForUsername,
		getDateLinesForChannel,
		getDateLinesForUsername,
		getFriend,
		getFriends,
		getFriendsList,
		getIrcChannel,
		getIrcChannels,
		getIrcConfig,
		getIrcServer,
		getIrcServers,
		getLastSeenChannels,
		getLastSeenUsers,
		getLineByLineId,
		getMostRecentAllFriendsLines,
		getMostRecentChannelLines,
		getMostRecentHighlightsLines,
		getMostRecentUserLines,
		getNicknames,
		getServerId,
		getServerName,
		getSurroundingLines,
		modifyChannelInIrcConfig,
		modifyFriend,
		modifyNickname,
		modifyServerInIrcConfig,
		removeChannelFromIrcConfig,
		removeFromFriends,
		removeNickname,
		removeServerFromIrcConfig,
		storeConfigValue,
		storeLine
	};

	main.setDb(output);
};

module.exports = function(main, callback) {
	// Create database if needed
	createDatabaseFromEmpty((err) => {
		if (err) {
			throw err;
		}
		else {
			// Open database
			var db = new sqlite.Database(DB_FILENAME);
			initializeDb(db);
			mainMethods(main, db);

			if (typeof callback === "function") {
				callback();
			}
		}
	});
};
