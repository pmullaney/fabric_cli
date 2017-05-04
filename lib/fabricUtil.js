/*
 Copyright 2017 London Stock Exchange All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the 'License');
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

                http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an 'AS IS' BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
'use strict';

var fs = require('fs-extra');
var path = require('path');
var util = require('util');
var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var User = require('fabric-client/lib/User.js');

module.exports.setStateStore = function(client, path) {
	return hfc.newDefaultKeyValueStore({path: path})
		.then((store) => {
			client.setStateStore(store);
		}).catch((err) => {
			console.log(err);
		});
}

module.exports.getUser = function(client, cop, username, password, mspId) {
	console.log("**********getUser username=" + username);
	console.log("**********getUser mspId=" + mspId);
        return client.getUserContext(username, true)
            .then((user) => {
		console.log("**********getUser user=", user);
                if (user && user.isEnrolled()) {
			console.log("**********getUser is enrolled");
                    return Promise.resolve(user);
                } else {
                    // need to enroll it with COP server
                    console.log("**********enrolling");
                    console.log("**********user=", username);
                    console.log("**********password=", password);
                    return cop.enroll({
                        enrollmentID: username,
                        enrollmentSecret: password
                    }).then((enrollment) => {
                        console.log("**********enrollment mspId=" + mspId);
                        var member = new User(username);
                        return member.setEnrollment(enrollment.key,
                                                    enrollment.certificate, mspId)
                            .then(() => {
                                return client.setUserContext(member);
                            }).catch((err) => {
                                throw new Error('Failed to enroll and persist user. Error: ' + err);
                            });
                    });
                }
	}).catch((err) => {
		throw new Error('Failed to get user context err: ' + err);
		logger.error(err.stack ? err.stack : err);
	});

}

module.exports.getAdmin = function(client, org, domain, cryptorootdir, mspId) {
	var keyPath = path.join(cryptorootdir, util.format('/peerOrganizations/%s.%s/users/Admin@%s.%s/keystore', org, domain, org, domain));
	console.log("keyPath=", keyPath);
	var keyPEM = Buffer.from(readAllFiles(keyPath)[0]).toString();
	var certPath = path.join(cryptorootdir, util.format('/peerOrganizations/%s.%s/users/Admin@%s.%s/signcerts', org, domain, org, domain));
	var certPEM = readAllFiles(certPath)[0];

	return client.createUser({
		username: 'peer'+org+'Admin',
		mspid: mspId,
		cryptoContent: {
			privateKeyPEM: keyPEM.toString(),
			signedCertPEM: certPEM.toString()
		}
	});
}

module.exports.getOrdererAdmin = function(client, domain, cryptorootdir) {
        var keyPath = path.join(cryptorootdir, util.format('/ordererOrganizations/%s/users/Admin@%s/keystore', domain, domain));
        var keyPEM = Buffer.from(readAllFiles(keyPath)[0]).toString();
        var certPath = path.join(cryptorootdir, util.format('/ordererOrganizations/%s/users/Admin@%s/signcerts', domain, domain));
        var certPEM = readAllFiles(certPath)[0];

        return client.createUser({
                username: 'ordererAdmin',
                mspid: 'OrdererMSP',
                cryptoContent: {
                        privateKeyPEM: keyPEM.toString(),
                        signedCertPEM: certPEM.toString()
                }
        });
}

function readAllFiles(dir) {
        var files = fs.readdirSync(dir);
        var certs = [];
        files.forEach((file_name) => {
                let file_path = path.join(dir,file_name);
//                console.log(' looking at file ::'+file_path);
                let data = fs.readFileSync(file_path);
                certs.push(data);
        });
        return certs;
}

module.exports.processResponse = function(chain, eventhub, request, response, tmo) {
        return Promise.all(
            [registerTxEvent(eventhub, request.txId.toString(), tmo),
             sendTransaction(chain, response)]);
}


module.exports.registerTxEvent = function(eh, txid, timeout) {
	return new Promise((resolve, reject) => {
		var handle = setTimeout(() => {
			eh.unregisterTxEvent(txid);
			reject('timeout');
		}, timeout);

		eh.registerTxEvent(txid, (txid, code) => {
			if (code !== 'VALID') {
				reject('invalid');
			} else {
				resolve();
			}
			clearTimeout(handle);
			eh.unregisterTxEvent(txid);
		});
	});
};

module.exports.registerCCEvent = function(eh, ccid, enregex, timeout) {
	return new Promise((resolve, reject) => {
		var regid = null;
		var handle = setTimeout(() => {
			reject();
			if (regid) {
				eh.unregisterChaincodeEvent(regid);
			}
		}, timeout);

		regid = eh.registerChaincodeEvent(ccid, enregex, (event) => {
			resolve();
			clearTimeout(handle);
			eh.unregisterChaincodeEvent(regid);
		});
	});
};

module.exports.createRequest = function(chain, user, chaincode_id, fcn, args) {
	var nonce = utils.getNonce();
	var tx_id = chain.buildTransactionID(nonce, user);
	var request = {
		chaincodeId: chaincode_id,
		chaincodeVersion: '',
		fcn: fcn,
		args: args,
		chainId: chain.getName(),
		txId: tx_id.toString(),
		nonce: nonce
	};
	return request;
};

function checkProposal(results) {
	var proposalResponses = results[0];
	var all_good = true;

	for (var i in proposalResponses) {
		let one_good = false;

		if (proposalResponses &&
			proposalResponses[0].response &&
			proposalResponses[0].response.status === 200) {

			one_good = true;
		}
		all_good = all_good & one_good;
	}
	return all_good;
};

module.exports.checkProposal =  checkProposal;

module.exports.sendTransaction = function(chain, results) {
	if (checkProposal(results)) {
		var proposalResponses = results[0];
		var proposal = results[1];
		var header = results[2];
		var request = {
			proposalResponses: proposalResponses,
			proposal: proposal,
			header: header
		};
		return chain.sendTransaction(request);
	} else {
		return Promise.reject('bad result:' + results);
	}
};
