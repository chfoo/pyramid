import React, { PureComponent } from "react";
import PropTypes from "prop-types";
import { findDOMNode } from "react-dom";
import remove from "lodash/remove";
import "intersection-observer";

import ChatLines from "./ChatLines.jsx";
import { PAGE_TYPES, PAGE_TYPE_NAMES } from "../constants";
import { reportHighlightAsSeen } from "../lib/io";
import { areWeScrolledToTheBottom, scrollToTheBottom } from "../lib/visualBehavior";

const FLASHING_LINE_CLASS_NAME = "flashing";

class ChatFrame extends PureComponent {
	constructor(props) {
		super(props);

		this.lineObserverCallback = this.lineObserverCallback.bind(this);
		this.onObserve = this.onObserve.bind(this);
		this.onUnobserve = this.onUnobserve.bind(this);

		this.observerHandlers = {
			observe: this.onObserve,
			unobserve: this.onUnobserve
		};

		this.atBottom = true;

		this.clearObserver();
	}

	componentWillReceiveProps(newProps) {
		const {
			lines,
			logDate,
			pageQuery,
			pageType
		} = newProps;

		const {
			lines: oldLines,
			logDate: oldLogDate,
			pageQuery: oldQuery,
			pageType: oldType
		} = this.props;

		// Lines change

		if (
			lines !== oldLines &&
			pageQuery === oldQuery &&
			pageType === oldType &&
			logDate === oldLogDate
		) {
			this.atBottom = areWeScrolledToTheBottom();
		}
	}

	componentDidUpdate(oldProps) {
		const {
			inFocus,
			lines,
			logBrowserOpen,
			logDate,
			pageQuery,
			pageType,
			selectedLine,
			userListOpen
		} = this.props;

		const {
			inFocus: oldInFocus,
			lines: oldLines,
			logDate: oldLogDate,
			logBrowserOpen: oldLogBrowserOpen,
			pageQuery: oldQuery,
			pageType: oldType,
			selectedLine: oldSelectedLine,
			userListOpen: oldUserListOpen
		} = oldProps;

		// Page changed

		if (
			pageQuery !== oldQuery ||
			pageType !== oldType ||
			logDate !== oldLogDate
		) {
			this.clearObserver();
		}

		// Lines changed

		if (lines !== oldLines) {
			if (
				(this.atBottom && !logDate) ||
				(oldLogDate && !logDate)
			) {
				scrollToTheBottom();
			}
			else if (logDate) {
				window.scrollTo(0, 0);
			}
		}

		// User list opened

		if (
			userListOpen &&
			!oldUserListOpen &&
			this.atBottom
		) {
			scrollToTheBottom();
		}

		// Log browser opened

		if (
			logBrowserOpen !== oldLogBrowserOpen
		) {
			this.resetObserver();
		}

		// Are we querying a specific line id

		if (selectedLine && selectedLine !== oldSelectedLine) {
			this.flashLine(selectedLine.lineId);
		}

		// Focus changed
		if (inFocus && !oldInFocus) {
			this.handleBackInFocus();
		}
	}

	isLiveChannel(props = this.props) {
		const { logDate, pageType } = props;
		return pageType === PAGE_TYPES.CHANNEL && !logDate;
	}

	// Observers

	getObserver (props = this.props) {
		const { logBrowserOpen, logDate } = props;
		const isLiveChannel = this.isLiveChannel(props);

		// Acknowledge that there's an overlay when we're viewing a live channel, coming from the input

		var topMargin = -40, bottomMargin = 0;

		if (isLiveChannel) {
			bottomMargin = -80;
		}

		if (logBrowserOpen || logDate) {
			topMargin = -70;
		}

		const rootMargin = topMargin + "px 0px " +
			bottomMargin + "px 0px";

		var intersectionObserverOptions = {
			root: null,
			rootMargin,
			threshold: 1.0
		};

		return new IntersectionObserver(
			this.lineObserverCallback,
			intersectionObserverOptions
		);
	}

	setObserver (props = this.props) {
		this.observer = this.getObserver(props);
	}

	clearObserver(props = this.props) {
		if (this.observer) {
			this.observer.disconnect();
		}

		this.setObserver(props);

		// Do NOT carry old ones over
		this.observed = [];
		this.currentlyVisible = [];
	}

	resetObserver (props = this.props) {
		if (this.observer) {
			this.observer.disconnect();
		}

		this.setObserver(props);

		// Carry old ones over
		this.observed.forEach((el) => {
			this.observer.observe(el);
		});
		this.currentlyVisible = [];
	}

	onObserve(el) {
		if (el && this.observer) {
			this.observer.observe(el);
			this.observed.push(el);
		}
	}

	onUnobserve(el) {
		if (el) {
			if (this.observer) {
				this.observer.unobserve(el);
			}
			remove(this.observed, (item) => item === el);
		}
	}

	reportElementAsSeen(el) {
		reportHighlightAsSeen(el.lineId);
		this.onUnobserve(el);

		if (el.onUnobserve) {
			el.onUnobserve();
		}
	}

	lineObserverCallback(entries) {
		const { inFocus } = this.props;
		entries.forEach((entry) => {
			if (
				entry &&
				entry.target &&
				entry.target.lineId &&
				this.observed.indexOf(entry.target) >= 0
			) {
				const el = entry.target;
				if (entry.intersectionRatio >= 1) {
					// Currently visible
					if (inFocus) {
						this.reportElementAsSeen(el);
					}
					else if (this.currentlyVisible.indexOf(el) < 0) {
						this.currentlyVisible.push(el);
					}
				}
				else {
					// No longer visible
					if (this.currentlyVisible.indexOf(el) >= 0) {
						remove(this.currentlyVisible, (item) => item === el);
					}
				}
			}
		});
	}

	handleBackInFocus() {
		this.currentlyVisible.forEach((el) => {
			this.reportElementAsSeen(el);
		});
		this.currentlyVisible = [];
	}

	// DOM

	flashLine(lineId) {
		const root = findDOMNode(this);
		if (root) {
			const lineEl = root.querySelector(`#line-${lineId}`);
			if (lineEl) {
				// Center the line if possible
				window.scrollTo(0,
					lineEl.offsetTop - window.innerHeight/2
				);

				// Flashing
				lineEl.classList.remove(FLASHING_LINE_CLASS_NAME);

				setTimeout(() => {
					if (lineEl) {
						lineEl.classList.add(FLASHING_LINE_CLASS_NAME);
					}
				}, 1);

				setTimeout(() => {
					if (lineEl) {
						lineEl.classList.remove(FLASHING_LINE_CLASS_NAME);
					}
				}, 3000);
			}
		}
	}

	// Render

	render() {
		const { collapseJoinParts, lines, loading, pageQuery, pageType } = this.props;

		const displayChannel = pageType !== PAGE_TYPES.CHANNEL;
		const displayContextLink =
			pageType === PAGE_TYPES.CATEGORY &&
			pageQuery === "highlights";
		const displayUsername = pageType !== PAGE_TYPES.USER;

		const content = <ChatLines
			collapseJoinParts={collapseJoinParts}
			displayChannel={displayChannel}
			displayContextLink={displayContextLink}
			displayUsername={displayUsername}
			loading={loading}
			messages={lines}
			observer={this.observerHandlers}
			key="main" />;

		return content;
	}
}

ChatFrame.propTypes = {
	collapseJoinParts: PropTypes.bool,
	inFocus: PropTypes.bool,
	lineId: PropTypes.string,
	lines: PropTypes.array,
	loading: PropTypes.bool,
	logBrowserOpen: PropTypes.bool,
	logDate: PropTypes.string,
	pageQuery: PropTypes.string.isRequired,
	pageType: PropTypes.oneOf(PAGE_TYPE_NAMES).isRequired,
	selectedLine: PropTypes.object,
	userListOpen: PropTypes.bool
};

export default ChatFrame;
