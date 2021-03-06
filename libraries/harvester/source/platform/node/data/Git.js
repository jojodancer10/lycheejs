
lychee.define('harvester.data.Git').tags({
	platform: 'node'
}).requires([
	'harvester.data.Filesystem'
]).supports(function(lychee, global) {

	try {

		require('child_process');
		require('path');

		return true;

	} catch (err) {
	}


	return false;

}).exports(function(lychee, global, attachments) {

	const _ROOT          = lychee.ROOT.lychee;
	const _Filesystem    = lychee.import('harvester.data.Filesystem');
	const _child_process = require('child_process');
	const _path          = require('path');



	/*
	 * HELPERS
	 */

	const _parse_remotes = function(content) {

		let remotes = {};
		let pointer = null;

		content.split('\n').map(function(line) {

			if (line.startsWith('[remote')) {

				let tmp = line.split('"')[1] || null;
				if (tmp !== null) {

					pointer = remotes[tmp] = {
						url:   null,
						fetch: null
					};

				} else {

					pointer = null;

				}

			} else if (pointer !== null) {

				let tmp = line.trim().split('=').map(function(val) {
					return val.trim();
				});

				if (tmp[0] === 'url') {
					pointer.url = tmp[1];
				} else if (tmp[0] === 'fetch') {
					pointer.fetch = tmp[1];
				}

			}

		});


		return remotes;

	};

	const _parse_log = function(content) {

		return content.split('\n').map(function(line) {
			return line.substr(line.indexOf(' ') + 1).trim();
		}).filter(function(line) {
			return line !== '';
		}).map(function(line) {

			let hash = line.substr(0, line.indexOf(' '));
			line = line.substr(hash.length + 1);

			let name = line.substr(0, line.indexOf('<') - 1);
			line = line.substr(name.length + 1);

			let email = line.substr(1, line.indexOf('>') - 1);
			line = line.substr(email.length + 3);

			let timestamp = line.substr(0, line.indexOf('\t'));
			line = line.substr(timestamp.length + 1);

			let message = line.trim();


			return {
				hash:      hash,
				name:      name,
				email:     email,
				timestamp: timestamp,
				message:   message
			};

		});

	};

	const _get_log = function() {

		let development = _parse_log((this.filesystem.read('/logs/refs/remotes/origin/development') || '').toString('utf8'));
		let master      = _parse_log((this.filesystem.read('/logs/refs/remotes/origin/master')      || '').toString('utf8'));
		let branch      = _parse_log((this.filesystem.read('/logs/HEAD')                            || '').toString('utf8'));
		let diff        = branch.filter(function(commit) {

			let is_master = master.find(function(other) {
				return other.hash === commit.hash;
			});
			let is_development = development.find(function(other) {
				return other.hash === commit.hash;
			});

			if (is_master === false && is_development === false) {
				return true;
			}

			return false;

		});


		return {
			master:      master,
			development: development,
			branch:      branch,
			diff:        diff
		};

	};



	/*
	 * IMPLEMENTATION
	 */

	let Composite = function(identifier) {

		identifier = typeof identifier === 'string' ? identifier : '';


		this.identifier = identifier;
		this.filesystem = new _Filesystem(identifier + '/.git');

	};


	Composite.STATUS = {
		ignore: 0,
		update: 1,
		manual: 2
	};


	Composite.prototype = {

		/*
		 * ENTITY API
		 */

		// deserialize: function(blob) {},

		serialize: function() {

			let blob = {};


			if (this.filesystem !== null) blob.filesystem = lychee.serialize(this.filesystem);


			return {
				'constructor': 'harvester.data.Git',
				'arguments':   [ this.identifier ],
				'blob':        Object.keys(blob).length > 0 ? blob : null
			};

		},



		/*
		 * CUSTOM API
		 */

		checkout: function(branch, path) {

			branch = typeof branch === 'string' ? branch : null;
			path   = typeof path === 'string'   ? path   : null;


			if (branch !== null && path !== null) {

				let filesystem = this.filesystem;
				let result     = null;

				try {

					let cwd  = _ROOT;
					let root = _ROOT + path;

					let tmp = filesystem.root.split('/');
					if (tmp.pop() === '.git') {
						cwd = tmp.join('/');
					}

					let real = _path.relative(cwd, root);
					if (real.substr(0, 2) !== '..') {

						let handle = _child_process.spawnSync('git', [
							'checkout',
							'--quiet',
							'origin/' + branch,
							'./' + real
						], {
							cwd: cwd
						});

						let stdout = (handle.stdout || '').toString().trim();
						let stderr = (handle.stderr || '').toString().trim();
						if (stderr !== '') {
							result = null;
						} else {
							result = stdout;
						}

					}

				} catch (err) {

					console.error(err.message);

					result = null;

				}

				return result !== null;

			}


			return false;

		},

		diff: function(path) {

			path = typeof path === 'string' ? path : null;


			if (path !== null) {

				let filesystem = this.filesystem;
				let result     = null;

				try {

					let root = _ROOT;
					let tmp  = filesystem.root.split('/');
					if (tmp.pop() === '.git') {
						root = tmp.join('/');
					}

					result = _child_process.execSync('git diff HEAD .' + path, {
						cwd: root
					}).toString() || null;

				} catch (err) {

					result = null;

				}

				return result;

			}


			return null;

		},

		fetch: function(branch) {

			branch = typeof branch === 'string' ? branch : null;


			if (branch !== null) {

				let filesystem = this.filesystem;
				let result     = null;

				try {

					let cwd = _ROOT;
					let tmp = filesystem.root.split('/');
					if (tmp.pop() === '.git') {
						cwd = tmp.join('/');
					}

					result = _child_process.execSync('git fetch --quiet origin "' + branch + '"', {
						cwd: cwd
					}).toString();

				} catch (err) {

					result = null;

				}

				return result !== null;

			}


			return false;

		},

		config: function() {

			let config  = (this.filesystem.read('/config') || '').toString().trim();
			let remotes = _parse_remotes(config);


			return {
				remotes: remotes
			};

		},

		report: function(path) {

			path = typeof path === 'string' ? path : null;


			let head       = (this.filesystem.read('/HEAD')       || '').toString().trim();
			let fetch_head = (this.filesystem.read('/FETCH_HEAD') || '').toString().trim();
			let orig_head  = (this.filesystem.read('/ORIG_HEAD')  || '').toString().trim();
			let branch     = 'master';


			if (head.startsWith('ref: ')) {

				if (head.startsWith('ref: refs/heads/')) {
					branch = head.substr(16).trim();
				}

				let ref = this.filesystem.read('/' + head.substr(5));
				if (ref !== null) {
					head = ref.toString().trim();
				}

			}

			if (fetch_head.includes('\t')) {
				fetch_head = fetch_head.split('\t')[0];
			}


			let log    = _get_log.call(this);
			let status = Composite.STATUS.manual;

			if (log.diff.length === 0) {

				if (head === fetch_head) {

					status = Composite.STATUS.ignore;

				} else {

					let check = log.development.find(function(other) {
						return other.hash === head;
					});

					if (check !== undefined) {
						status = Composite.STATUS.update;
					} else {
						status = Composite.STATUS.manual;
					}

				}


				// XXX: Verify that user did not break their git history
				if (fetch_head !== orig_head) {

					let check = log.development.find(function(other) {
						return other.hash === orig_head;
					});

					if (check !== undefined) {
						status = Composite.STATUS.update;
					} else {
						status = Composite.STATUS.manual;
					}

				}

			} else {

				status = Composite.STATUS.manual;

			}


			if (path !== null) {

				let diff = this.diff(path);
				if (diff !== null) {
					status = Composite.STATUS.manual;
				}

			}


			return {
				branch: branch,
				status: status,
				head: {
					branch: head,
					fetch:  fetch_head,
					origin: orig_head
				},
				log: log
			};

		}

	};


	return Composite;

});

