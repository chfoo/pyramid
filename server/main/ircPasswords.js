const _ = require("lodash");
const async = require("async");

const passwordUtils = require("../util/passwords");

module.exports = function(db, appConfig, ircConfig) {

	var ircPasswords = {};
	var decryptionKey = null;

	function isStrongEncryption() {
		return appConfig.configValue("strongIrcPasswordEncryption");
	}

	function getSoftDecryptionKey() {
		return appConfig.configValue("webPassword");
	}

	function setUpIrcPasswords() {

		let strongEncryption = isStrongEncryption();

		appConfig.addConfigValueChangeHandler("webPassword", function(){
			// TODO: Re-encrypt all IRC passwords
		});

		if (strongEncryption) {
			// stuff
		}
	}

	function onDecryptionKey(key) {
		if (isStrongEncryption()) {
			// Store
			decryptionKey = key;
			let config = ircConfig.currentIrcConfig();
			_.forOwn(config, (c) => {
				if (c && c.name && c.password) {
					ircPasswords[c.name] = passwordUtils.decryptSecret(
						JSON.parse(c.password), decryptionKey
					);
				}
			});

			// TODO: Let IRC know that passwords are now available
		}
	}

	function getDecryptedPasswordForServer(serverName) {
		if (ircPasswords[serverName]) {
			return ircPasswords[serverName];
		}

		else if (!isStrongEncryption()) {
			let config = ircConfig.currentIrcConfig()[serverName];

			if (config && config.password) {
				return passwordUtils.decryptSecret(
					JSON.parse(config.password),
					getSoftDecryptionKey()
				);
			}
		}

		return false;
	}

	return {
		getDecryptedPasswordForServer,
		isStrongEncryption,
		onDecryptionKey,
		setUpIrcPasswords
	};
};
