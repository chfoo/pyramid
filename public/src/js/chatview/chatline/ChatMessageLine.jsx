import React, { PureComponent } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import ChatUsername from "./ChatUsername.jsx";
import TwitchBadges from "../../twitch/TwitchBadges.jsx";
import TwitchEmoticon from "../../twitch/TwitchEmoticon.jsx";
import { parseChannelUri } from "../../lib/channelNames";
import { TOKEN_TYPES, tokenizeChatLine } from "../../lib/tokenizer";

const block = "msg";

const emojiImageUrl = function(codepoints) {
	return `https://twemoji.maxcdn.com/2/svg/${codepoints}.svg`;
};

class ChatMessageLine extends PureComponent {
	constructor(props) {
		super(props);

		this.unhide = this.unhide.bind(this);

		this.state = {
			unhidden: false
		};
	}

	unhide() {
		this.setState({ unhidden: true });
	}

	renderCleared() {
		return (
			<button
				className="unhide"
				key="unhide"
				onClick={this.unhide}>
				Show deleted message
			</button>
		);
	}

	renderText(token) {
		return token.text;
	}

	renderLink(token, index) {
		return (
			<a
				target="_blank"
				rel="noopener noreferrer"
				href={token.url}
				key={index}>
				{ token.text }
			</a>
		);
	}

	renderMention(token, index) {
		return <mark key={index}>{ token.text }</mark>;
	}

	renderEmoji(token, index) {
		const { enableEmojiImages } = this.props;

		if (enableEmojiImages) {
			return <img
				className="emoji"
				src={emojiImageUrl(token.codepoints)}
				alt={token.text}
				key={index}
				/>;
		}

		return token.text;
	}

	renderTwitchEmoticon(token, index) {
		const { onEmoteLoad } = this.props;
		return <TwitchEmoticon
			{...token.emote}
			text={token.text}
			onLoad={onEmoteLoad}
			key={index} />;
	}

	renderToken(token, index) {
		switch(token.type) {
			case TOKEN_TYPES.TEXT:
				return this.renderText(token, index);
			case TOKEN_TYPES.LINK:
				return this.renderLink(token, index);
			case TOKEN_TYPES.MENTION:
				return this.renderMention(token, index);
			case TOKEN_TYPES.EMOJI:
				return this.renderEmoji(token, index);
			case TOKEN_TYPES.TWITCH_EMOTICON:
				return this.renderTwitchEmoticon(token, index);
		}

		console.warn(
			`Encountered unsupported line token type \`${token.type}\``
		);
		return null;
	}

	render() {
		const {
			channel,
			cleared = false,
			color,
			displayUsername,
			enableTwitchBadges,
			enableTwitchColors,
			enableUsernameColors,
			showTwitchDeletedMessages,
			server,
			symbol = "",
			tags,
			type,
			username,
			useTwitch
		} = this.props;

		const { unhidden } = this.state;

		const className = block +
			(type !== "msg" ? ` ${block}--${type}` : "") +
			(cleared && showTwitchDeletedMessages ? ` ${block}--cleared` : "");

		const tokens = tokenizeChatLine(this.props, useTwitch);

		var messageContent;

		if (useTwitch && cleared && !unhidden && !showTwitchDeletedMessages) {
			messageContent = this.renderCleared();
		}
		else {
			messageContent = tokens.map(
				(token, index) => this.renderToken(token, index)
			);
		}

		var authorClassName = `${block}__author`;
		var authorColor = null;
		var authorDisplayName = null;
		var authorUserId;

		// Number color
		if (enableUsernameColors && typeof color === "number" && color >= 0) {
			authorColor = color;
		}

		var prefix = null;

		if (useTwitch) {

			// Twitch color
			if (enableTwitchColors && tags && tags.color) {
				authorColor = tags.color;
			}

			// Twitch display name
			if (tags && tags["display-name"]) {
				authorDisplayName = tags["display-name"];
			}

			// Twitch user id
			if (tags && tags["user-id"]) {
				authorUserId = tags["user-id"];
			}

			// Twitch badges
			if (enableTwitchBadges && tags && tags.badges && tags.badges.length) {
				prefix = (
					<TwitchBadges
						badges={tags.badges}
						channel={channel}
						server={server}
						key="badges" />
				);
			}
		}

		const content = (
			<span className={className} data-user-id={authorUserId} key="main">
				{ prefix }
				{ username && displayUsername
					? [
						<ChatUsername
							className={authorClassName}
							color={authorColor}
							displayName={authorDisplayName}
							serverName={server}
							symbol={symbol}
							username={username}
							key="username" />,
						" "
					] : null }
				{ messageContent }
			</span>
		);

		return content;
	}
}

ChatMessageLine.propTypes = {
	channel: PropTypes.string,
	channelName: PropTypes.string,
	cleared: PropTypes.bool,
	color: PropTypes.number,
	displayChannel: PropTypes.bool,
	displayUsername: PropTypes.bool,
	enableEmojiImages: PropTypes.bool,
	enableTwitchBadges: PropTypes.bool,
	enableTwitchColors: PropTypes.bool,
	enableUsernameColors: PropTypes.bool,
	highlight: PropTypes.array,
	ircConfigs: PropTypes.object,
	lineId: PropTypes.string,
	message: PropTypes.string.isRequired,
	observer: PropTypes.object,
	onEmoteLoad: PropTypes.func,
	server: PropTypes.string,
	showTwitchDeletedMessages: PropTypes.bool,
	symbol: PropTypes.string,
	tags: PropTypes.object,
	time: PropTypes.string,
	type: PropTypes.string,
	username: PropTypes.string,
	useTwitch: PropTypes.bool
};

const mapStateToProps = function(state, ownProps) {
	let { channel } = ownProps;
	let { appConfig, serverData } = state;

	let {
		enableEmojiImages,
		enableTwitch,
		enableTwitchBadges,
		enableTwitchColors,
		enableUsernameColors,
		showTwitchDeletedMessages
	} = appConfig;

	let uriData = parseChannelUri(channel);
	let server = uriData && uriData.server;
	let thisServerData = server && serverData[server];
	let useTwitch = enableTwitch && thisServerData && thisServerData.isTwitch;

	return {
		enableEmojiImages,
		enableTwitchBadges,
		enableTwitchColors,
		enableUsernameColors,
		showTwitchDeletedMessages,
		useTwitch
	};
};

export default connect(mapStateToProps)(ChatMessageLine);
