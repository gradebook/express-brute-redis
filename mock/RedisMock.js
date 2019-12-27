const _ = require('underscore');
const queue = require('async/queue');

const RedisClientMock = function () {
	this.data = {};
	_.bindAll(this, '__ensureExists', 'hgetall', 'hincrby', 'hmset', 'expire', 'del', 'multi');
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
RedisClientMock.prototype.__ensureExists = function(key) {
	if (!this.data[key]) {
		this.data[key] = {
			value: {}
		};
	}

	return null;
};
RedisClientMock.prototype.hgetall = async function (key) {
	return this.data[key] && Object.assign({}, this.data[key].value);
};
RedisClientMock.prototype.hincrby = async function (map, key, amount) {
	this.__ensureExists(map);
	const initial = this.data[map].value[key] || 0;
	const final = initial + amount;
	this.data[map].value[key] = final;
	return final;
};
RedisClientMock.prototype.hmset = async function (map, kvs) {
	this.__ensureExists(map);
	const t = this.data[map].value;

	for (const [key, value] of kvs) {
		t[key] = value;
	}

	return Object.assign({}, t);
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
	_.bindAll(this, 'get', 'hincrby', 'hmset', 'del', 'expire', 'exec', '_handlePromise');
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
	get(key) {
		this.queue.push(cb => this._handlePromise(this.client.get.call(this.client, key), cb));
	},
	hincrby(map, key, num) {
		this.queue.push(cb => this._handlePromise(this.client.hincrby.call(this.client, map, key, num), cb));
	},
	hmset(key, entries) {
		this.queue.push(cb => this._handlePromise(this.client.hmset.call(this.client, key, entries), cb));
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