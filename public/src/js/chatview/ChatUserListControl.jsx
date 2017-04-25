import React, { PureComponent } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { RELATIONSHIP_FRIEND, RELATIONSHIP_BEST_FRIEND } from "../constants";
import { storeViewState } from "../lib/io";
import store from "../store";
import actions from "../actions";

class ChannelUserList extends PureComponent {
	constructor(props) {
		super(props);
		this.toggleUserList = this.toggleUserList.bind(this);
	}

	toggleUserList() {
		const { userListOpen } = this.props;
		const update = { userListOpen: !userListOpen };
		store.dispatch(actions.viewState.update(update));
		storeViewState(update);
	}

	render() {
		const { friendsList, userList } = this.props;

		var numUsers = 0, numFriends = 0;

		if (userList) {
			const userNames = Object.keys(userList);
			if (userNames && userNames.length) {
				numUsers = userNames.length;

				if (friendsList && friendsList[RELATIONSHIP_FRIEND]) {
					var allFriends = friendsList[RELATIONSHIP_FRIEND];
					if (friendsList[RELATIONSHIP_BEST_FRIEND]) {
						allFriends = allFriends.concat(
							friendsList[RELATIONSHIP_BEST_FRIEND]
						);
					}

					userNames.forEach((userName) => {
						if (allFriends.indexOf(userName.toLowerCase()) >= 0) {
							numFriends++;
						}
					});
				}
			}
		}

		if (!numUsers) {
			return null;
		}

		const usersEl = numUsers + " user" + (numUsers === 1 ? "" : "s");

		var friendsEl = null;

		if (numFriends > 0) {
			friendsEl = (
				<em>{ " (" +
					numFriends + " friend" +
					(numFriends === 1 ? "" : "s") +
					")"
				}</em>
			);
		}

		return (
			<a onClick={this.toggleUserList} href="javascript://">
				{ usersEl }
				{ friendsEl }
			</a>
		);
	}
}

ChannelUserList.propTypes = {
	channel: PropTypes.string,
	friendsList: PropTypes.object,
	userList: PropTypes.object,
	userListOpen: PropTypes.bool
};

export default connect(({
	channelUserLists,
	friendsList,
	viewState: { userListOpen }
}, ownProps) => ({
	friendsList,
	userList: channelUserLists[ownProps.channel],
	userListOpen
}))(ChannelUserList);
