import React, { PureComponent } from "react";
import PropTypes from "prop-types";

const block = "password-input";
const PASSWORD_DEFAULT = "%DEFAULT%";

class SettingsPasswordInput extends PureComponent {

	constructor(props) {
		super(props);

		this.empty = this.empty.bind(this);
		this.onBlur = this.onBlur.bind(this);
		this.onChange = this.onChange.bind(this);
		this.onFocus = this.onFocus.bind(this);
		this.onKeyPress = this.onKeyPress.bind(this);

		this.state = {
			dirty: false,
			focus: false
		};
	}

	empty() {
		const { onChange } = this.props;
		const { input } = this.refs;

		input.value = "";

		this.setState({ dirty: true });

		if (typeof onChange === "function") {
			onChange({ target: input });
		}
	}

	onBlur(evt) {
		const { input } = this.refs;
		const { dirty } = this.state;

		if (input.value === "" && !dirty) {
			input.value = PASSWORD_DEFAULT;
		}

		this.setState({ focus: false });

		if (typeof this.props.onBlur === "function") {
			this.props.onBlur(evt);
		}
	}

	onChange(evt) {
		const { onChange } = this.props;
		const value = evt.target && evt.target.value;

		// Do not allow any value with PASSWORD_DEFAULT in it
		if (value && value.match(PASSWORD_DEFAULT)) {
			this.refs.input.value = "";
		}
		else if (typeof onChange === "function") {
			onChange(evt);
		}
	}

	onFocus(evt) {
		const { input } = this.refs;

		if (input && input.value === PASSWORD_DEFAULT) {
			input.value = "";
		}

		this.setState({ focus: true });

		if (typeof this.props.onFocus === "function") {
			this.props.onFocus(evt);
		}
	}

	onKeyPress(evt) {
		this.setState({ dirty: true });

		if (typeof this.props.onKeyPress === "function") {
			this.props.onKeyPress(evt);
		}
	}

	render() {
		const { defaultValue, emptiable, ...inputProps } = this.props;
		const { focus } = this.state;
		var displayValue = defaultValue;

		if (displayValue === true) {
			displayValue = PASSWORD_DEFAULT;
		}

		const className = block +
			(focus ? ` ${block}--focus` : "");

		return (
			<span className={className}>
				<input
					ref="input"
					{...inputProps}
					defaultValue={displayValue}
					onBlur={this.onBlur}
					onFocus={this.onFocus}
					onChange={this.onChange}
					onKeyPress={this.onKeyPress}
					/>
				{ emptiable && defaultValue
					? <button
						className={`${block}__empty`}
						onClick={this.empty}>Empty</button>
					: null
				}
			</span>
		);
	}
}

SettingsPasswordInput.propTypes = {
	defaultValue: PropTypes.any,
	emptiable: PropTypes.bool,
	onBlur: PropTypes.func,
	onFocus: PropTypes.func,
	onChange: PropTypes.func,
	onKeyPress: PropTypes.func
};

export default SettingsPasswordInput;
