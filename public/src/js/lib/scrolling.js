export function scrollToTheTop(container) {
	container.scrollTop = 0;
}

export function areWeScrolledToTheBottom(container, content) {
	if (!content) {
		content = container.children[0];
	}

	let contentHeight = content && content.clientHeight || 0;
	let containerHeight = container.clientHeight;
	let scrollTop = container.scrollTop || 0;

	return (contentHeight - (scrollTop + containerHeight)) <= 100 ||
		containerHeight >= contentHeight;
}

export function scrollToTheBottom(container, content) {
	if (!content) {
		content = container.children[0];
	}

	container.scrollTop = content && content.clientHeight || 0;
}

export function stickToTheBottom(container) {
	if (areWeScrolledToTheBottom(container)) {
		scrollToTheBottom(container);
	}
	else {
		// TODO: If you're *not* scrolled to the bottom, scroll UP
		// by a specific amount, so it looks like the content is
		// not moving

		// Plus, add a notice that there's new content?
	}
}
