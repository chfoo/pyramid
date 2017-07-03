// THESE ARE DEFAULT SETTINGS, DO NOT CHANGE THIS FILE.
// Change your local settings on your Pyramid settings page.

module.exports = {
	debug: false,

	// Whether or not to store the log lines in a database
	logLinesDb: true,

	// Whether or not to store the log files as text files in a folder
	logLinesFile: true,

	// SSL certificate settings
	sslCertPath: "",
	sslKeyPath: "",

	timeZone: "UTC",
	webPort: 54335,

	// Encryption mode
	strongIrcPasswordEncryption: false,

	// Scrollback ("cache") length
	cacheLines: 150,

	// Appearance
	collapseJoinParts: true,
	enableUsernameColors: true,
	enableDarkMode: false,
	enableEmojiCodes: true,
	enableEmojiImages: true,
	enableDesktopNotifications: true,

	// Twitch
	automaticallyJoinTwitchGroupChats: true,
	enableTwitch: true,
	enableTwitchColors: true,
	enableTwitchChannelDisplayNames: true,
	colorBlindness: 0,
	enableTwitchUserDisplayNames: 1,
	showTwitchDeletedMessages: false,
	showTwitchClearChats: false,
	enableFfzEmoticons: true,
	enableFfzGlobalEmoticons: true,
	enableFfzChannelEmoticons: true,
	enableBttvEmoticons: true,
	enableBttvGlobalEmoticons: true,
	enableBttvChannelEmoticons: true,
	enableBttvAnimatedEmoticons: true,
	enableBttvPersonalEmoticons: true
};
