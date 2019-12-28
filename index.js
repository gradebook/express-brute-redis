// @ts-check
var AbstractClientStore = require('express-brute/lib/AbstractClientStore');

const DEFAULTS = {
	prefix: ''
};

const noop = (_, ___) => null;

/**
 * @typedef RedisClientLike
 * @property {any} multi
 * @property {any} incr
 * @property {any} del
 * @property {any} get
 */

/**
 * @typedef BruteRedisOptions
 * @property {string} prefix
 * @property {RedisClientLike} client
 */

// @ts-ignore
module.exports = class RedisStore extends AbstractClientStore {
	static get DEFAULTS() {
		return DEFAULTS;
	}

	/**
	 * @param {BruteRedisOptions} options
	 */
	constructor(options) {
		super();

		if (!options.client) {
			throw new Error('Redis Client must be passed provided');
		}

		this._options = Object.assign({}, RedisStore.DEFAULTS, options);
		this._client = options.client;
	}

	/**
	 * @param {string} key
	 * @param {number} value
	 * @param {string|number} lifetime
	 */
	async set(key, value, lifetime, callback = noop) {
		// @ts-ignore
		const expiresIn = parseInt(lifetime, 10) || 0;
		const multi = this._client.multi();
		const redisKey = `${this._options.prefix}${key}`;

		multi.set(redisKey, JSON.stringify(value));
		if (expiresIn > 0) {
			multi.expire(redisKey, expiresIn);
		}

		try {
			await multi.exec();
			callback(null);
		} catch(error) {
			callback(error);
		}
	}

	/**
	 * @param {string} key
	 */
	async get(key, callback = noop) {
		try {
			let response = await this._client.get(`${this._options.prefix}${key}`);
			if (!response) {
				return callback(null, response);
			}

			response = JSON.parse(response);
			response.lastRequest = new Date(response.lastRequest);
			response.firstRequest = new Date(response.firstRequest);

			callback(null, response);
		} catch (error) {
			callback(error);
		}
	}

	/**
	 * @param {string} key
	 */
	async reset(key, callback = noop) {
		try {
			const result = await this._client.del(`${this._options.prefix}${key}`);
			callback(result)
		} catch (error) {
			callback(error);
		}
	};
};
