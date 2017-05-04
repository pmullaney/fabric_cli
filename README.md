# fabric_cli and fabric service API
## Introduction
These components provide a simplified API for fabric operations(install-chaincode, instantiate-chaincode, create-channel, etc.) and a cli that uses the API that is roughly equivalent to the peer command line.
## Details
Since the fabric and sdk are currently under heavy developement. This component has been developed against a snapshot of the fabric, fabric-ca and fabric-node-sdk. The shas are as follows:

*  fabric 48cd4874a098cefc3697db070a052570d1f665e8
*  fabric-sdk-node 8da372ea7d2b9d49d51f5a28aa9982470fed5fe3
*  fabric-ca 4f8666363c13c48327edd4e75403a56b806d745b

It is intended that we will move to later versions over time.
