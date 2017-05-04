/**
 * Copyright 2017 London Stock Exchange All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
'use strict';

var path = require('path');
var fs = require('fs');
var util = require('util');
var fabricUtil = require('./fabricUtil.js');
var grpc = require('grpc');

var hfc = require('fabric-client');
var CA = require('fabric-ca-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var logger = utils.getLogger('install-chaincode');
hfc.addConfigFile(path.join(__dirname, '../config.json'));
var ORGS = hfc.getConfigSetting('test-network');
var tx_id = null;
var nonce = null;
var client = new hfc();
var orderer = null;
var targets = [];
var endorsers = [];
var eventhubs = [];

var _commonProto = grpc.load(path.join(__dirname, '../../fabric-client/lib/protos/common/common.proto')).common;
var _configtxProto = grpc.load(path.join(__dirname, '../../fabric-client/lib/protos/common/configtx.proto')).common;

process.env.GOPATH = path.join(__dirname, '../examples');

function loadMSPConfig(name, mspdir) {
        var msp = {};
        msp.id = name;
	// TODO: right now using absolute paths in config.json, add relative
        //msp.rootCerts = readAllFiles(path.join(__dirname, mspdir, 'cacerts'));
        msp.rootCerts = readAllFiles(path.join(mspdir, 'cacerts'));
        msp.admins = readAllFiles(path.join(mspdir, 'admincerts'));
        return msp;
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

module.exports.initFabric = function(channel) {
	//console.log("ORGS=", ORGS);
	if( channel == undefined )
		var chain = client.newChain('mychannel');
	else
		var chain = client.newChain(channel);

	// TODO: right now using absolute paths in config.json, add relative
	var caRootsPath = ORGS.orderer.tls_cacerts;

	//let data = fs.readFileSync(path.join(rootdirname, caRootsPath));
	let data = fs.readFileSync(caRootsPath);
	let caroots = Buffer.from(data).toString();

	orderer = new Orderer(
			ORGS.orderer.url,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS.orderer['server-hostname']
			}
		);
	chain.addOrderer(orderer);

	for(let org in ORGS) {
	if ( org.substring(0, 3) != 'org')
		continue;

	targets[org] = new Array();
	for (let key in ORGS[org]) {
		if (ORGS[org].hasOwnProperty(key)) {
			if (key.indexOf('peer') === 0) {
				let data = fs.readFileSync(ORGS[org][key]['tls_cacerts']);
				//let data = fs.readFileSync(path.join(__dirname, ORGS[org][key]['tls_cacerts']));
				let peer = new Peer(
					ORGS[org][key].requests,
					{
						pem: Buffer.from(data).toString(),
						'ssl-target-name-override': ORGS[org][key]['server-hostname']
					}
				);

				targets[org].push(peer);
				if (typeof ORGS[org].peer1 !== 'undefined') {
					endorsers.push(peer);
					/*getAdmin(org).then((user) => {
					let eh = new EventHub(client);
					eh.setPeerAddr(
						ORGS[org].peer1.events,
						{
							pem: Buffer.from(data).toString(),
							'ssl-target-name-override': ORGS[org].peer1['server-hostname']
						}
					);
					eh.connect();
					eventhubs.push(eh);
					});*/
				}
				chain.addPeer(peer);
			}
		}
	}
	}

	for(let org in ORGS) {
	        client.addMSP(loadMSPConfig(ORGS[org].mspid, ORGS[org].mspdir));
	}
}

// directory for file based KeyValueStore
var KVS = '/tmp/hfc-test-kvs';
var storePathForOrg = function(org) {
        return KVS + '_' + org;
};

//function getMember(org) {
	//return fabricUtil.setStateStore(client, storePathForOrg(ORGS[org].name))
	//.then(() => {
		//var caUrl = ORGS[org].ca.url;
		//console.log("caUrl=", caUrl);
		//var ca = new CA(caUrl);
		//return fabricUtil.getUser(client, ca, 'admin', 'adminpw',  ORGS[org].mspid);
        //});
//}

function getAdmin(org) {
	return fabricUtil.setStateStore(client, storePathForOrg(ORGS[org].name))
	.then(() => {
		return fabricUtil.getAdmin(client, org, ORGS['orderer'].domain, ORGS['orderer'].cryptorootdir, ORGS[org].mspid);
	});
}

function getOrdererAdmin() {
	return fabricUtil.getOrdererAdmin(client, ORGS['orderer'].domain, ORGS['orderer'].cryptorootdir);
}

module.exports.exitFabric = function(){
	for(var key in eventhubs) {
		var eventhub = eventhubs[key];
		if (eventhub && eventhub.isconnected()) {
			logger.info('Disconnecting the event hub');
			eventhub.disconnect();
		}
	}
}

module.exports.installChaincode = function(cc) {
	var promise = Promise.resolve("ready");;
	for(let org in ORGS) {
		if ( org.substring(0, 3) != 'org')
			continue;
		promise = promise.then((result) => {
			return getAdmin(org);
		}).then((admin) => {
			nonce = utils.getNonce();
			tx_id = hfc.buildTransactionID(nonce, admin);

			// send proposal to endorser
			var request = {
				targets: targets[org],
				user: admin,
				chaincodePath: cc.path,
				chaincodeId: cc.id,
				chaincodeVersion: cc.version,
				txId: tx_id,
				nonce: nonce
			};

			return client.installChaincode(request);
		})
		.then((results) => {
			if (fabricUtil.checkProposal(results)) {
				logger.info('install proposal was good');
				return Promise.resolve('install proposal was good');
			} else {
				return Promise.reject('install proposal was bad');
			}
		}).catch((err) => {
			logger.error("error:" + err);
		})
	}
}

module.exports.createChannel = function(channel_name) {
        var config = null;
        var signatures = [];
        var padmins = [];

	utils.setConfigSetting('key-value-store', 'fabric-client/lib/impl/FileKeyValueStore.js');
	// use this when the config comes from the configtx tool
	var data = fs.readFileSync(ORGS['orderer'].configtx);
	var envelope = _commonProto.Envelope.decode(data);
	var payload = _commonProto.Payload.decode(envelope.getPayload().toBuffer());
	var configtx = _configtxProto.ConfigUpdateEnvelope.decode(payload.getData().toBuffer());
	config = configtx.getConfigUpdate().toBuffer();
	
	var sequence = Promise.resolve();
	for(let org in ORGS) {
		if ( org.substring(0, 3) != 'org')
			continue;
		sequence = sequence.then(() => {
			return getAdmin(org);
		}).then((admin) => {
			client.setUserContext(admin);
			var signature = client.signChannelConfig(config);
			// collect signature from org1 admin
			// TODO: signature counting against policies on the orderer
			// at the moment is being investigated, but it requires this
			// weird double-signature from each org admin
			signatures.push(signature);
			signatures.push(signature);
			return Promise.resolve(admin);
		});
	}

	sequence.then((admin) => {
		return getOrdererAdmin();
	}).then((admin) => {
		client.setUserContext(admin);
		var signature = client.signChannelConfig(config);
		// collect signature from org1 admin
		// TODO: signature counting against policies on the orderer
		// at the moment is being investigated, but it requires this
		// weird double-signature from each org admin
		signatures.push(signature);
		signatures.push(signature);
		return Promise.resolve(admin);
	}).then((admin) => {
                // build up the create request
                let nonce = utils.getNonce();
                let tx_id = hfc.buildTransactionID(nonce, admin);
                var request = {
                        config: config,
                        signatures : signatures,
                        name : channel_name,
                        orderer : orderer,
                        txId  : tx_id,
                        nonce : nonce
                };

                // send to create request to orderer
                return client.createChannel(request);
        }).then((result) => {
                logger.info('\n***\n completed the create \n***\n');
                logger.info(' response ::%j',result);
                if(result.status && result.status === 'SUCCESS') {
			// this is where they sleep 5 secs
                        return sleep(5000);
                } else {
                        logger.error('Failed to create the channel. ');
                }
	}).catch((err) => {
		logger.error("channel creation error:" + err.stack ? err.stack : err);
	})
}

function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
}
