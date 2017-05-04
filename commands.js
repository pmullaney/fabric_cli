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

var program = require('commander');
var fabricApi = require('./lib/fabricApi.js');

program
    .version('0.0.1');

program
    .command('install')
    .description('install a chaincode')
    .option("-p, --path <path>", "Path to chaincode")
    .option("-i, --id <path>", "ID of chaincode")
    .option("-v, --version <version>", "Version of chaincode to install")
    .action((options) => {
	var cc = { path: options.path,
		   id: options.id,
		   version: options.version
		 };
	fabricApi.initFabric();
	fabricApi.installChaincode(cc);
	fabricApi.exitFabric();
    });

program
    .command('create-channel')
    .description('create a channel')
    .option("-n, --name <name>", "channel name")
    .action((options) => {
	fabricApi.initFabric();
	fabricApi.createChannel(options.name);
	fabricApi.exitFabric();
    });

program.parse(process.argv);

