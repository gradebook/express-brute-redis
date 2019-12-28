const _ = require('underscore');
const queue = require('async/queue');

const RedisClientMock = function () {
	this.data = {};
	_.bindAll(this, 'set', 'get', 'expire', 'del', 'multi');
};
RedisClientMock.prototype.set = async function (key, value) {
	if (!this.data[key]) {
		this.data[key] = {};
	}
	this.data[key].value = value;

	return null;
};
RedisClientMock.prototype.expire =  async function (key, lifetime) {
	if (this.data[key] && this.data[key].timeout) {
		clearTimeout(this.data[key].timeout);
	}
	this.data[key].timeout = setTimeout(_.bind(function () {
		delete this.data[key];
	}, this), 1000*lifetime);
	return null
};
RedisClientMock.prototype.get = async function (key) {
	return this.data[key] && this.data[key].value;
};
RedisClientMock.prototype.del = async function (key) {
	if (this.data[key] && this.data[key].timeout) {
		clearTimeout(this.data[key].timeout);
	}
	delete this.data[key];
	return null;
};
RedisClientMock.prototype.multi = function () {
	return new RedisMultiMock(this);
};

const RedisMultiMock = function (client) {
	_.bindAll(this, 'set', 'get', 'expire', 'del', 'exec', '_handlePromise');
	this.client = client;
	this.responses = [];
	this.err = false;
	this.queue = queue(function (task, callback) {
		task(callback);
	}, 1);
	const pause = callback => {
		this.runQueue = callback;
	};
	this.queue.push(pause);
};

RedisMultiMock.prototype = {
	set(key, value) {
		this.queue.push(cb => this._handlePromise(this.client.set.call(this.client, key, value), cb));
	},
	get(key) {
		this.queue.push(cb => this._handlePromise(this.client.get.call(this.client, key), cb));
	},
	del(key) {
		this.queue.push(cb => this._handlePromise(this.client.del.call(this.client, key), cb));
	},
	expire(key, lifetime) {
		this.queue.push(cb => this._handlePromise(this.client.expire.call(this.client, key, lifetime), cb));
	},
	exec() {
		return new Promise((resolve, reject) => {
			this.queue.drain(() => {
				if (this.err) {
					return reject(this.err);
				}

				resolve(this.responses);
			});

			setTimeout(() => this.runQueue());
		});
	},
	async _handlePromise(promise, callback) {
		try {
			const response = await promise;
			this.responses.push(response);
			callback(null, response);
		} catch (error) {
			this.responses.push(undefined);
			callback(error);
		};
	}
};


module.exports = RedisClientMock;