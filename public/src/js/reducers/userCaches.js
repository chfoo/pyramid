import clone from "lodash/clone";

import * as actionTypes from "../actionTypes";
import { cacheMessage } from "../lib/io";

const userCaches = {};

export default function (state = userCaches, action) {

	switch (action.type) {
		case actionTypes.userCaches.UPDATE:
			return {
				...state,
				...action.data
			};
		case actionTypes.userCaches.APPEND:
			var s = clone(state), d = action.data;
			if (!s[d.username]) {
				s[d.username] = [];
			}
			cacheMessage(s[d.username], d.message);
			return s;
	}

	return state;
}
