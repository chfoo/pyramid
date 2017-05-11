import React, { PureComponent } from "react";
import PropTypes from "prop-types";

import ChannelLink from "./ChannelLink.jsx";
import TimedItem from "./TimedItem.jsx";
import UserLink from "./UserLink.jsx";

class TimedChannelItem extends PureComponent {
	render() {
		const {
			channel,
			displayName,
			displayServer = false,
			lastSeenData = {},
			skipOld = false
		} = this.props;

		const prefix = <ChannelLink
			strong
			channel={channel}
			displayServer={displayServer}
			displayName={displayName}
			key={channel}
			/>;

		var suffix = null;

		if (lastSeenData && lastSeenData.username) {
			let { username, userDisplayName } = lastSeenData;

			suffix = (
				<span className="msg">
					by <UserLink
						userName={username}
						displayName={userDisplayName}
						className="invisible"
						key={username}
						/>
				</span>
			);
		}

		return <TimedItem
				time={lastSeenData.time}
				skipOld={skipOld}
				prefix={prefix}
				suffix={suffix}
				key="main"
				/>;
	}
}

TimedChannelItem.propTypes = {
	channel: PropTypes.string,
	displayName: PropTypes.string,
	displayServer: PropTypes.bool,
	lastSeenData: PropTypes.object,
	skipOld: PropTypes.bool
};

export default TimedChannelItem;
