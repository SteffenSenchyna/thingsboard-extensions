///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

// Generated from the connector default configurations of
// thingsboard/gateway-management-extensions (assets/connector-default-configs/*.json).
// A connector type maps either to one configuration or to one per gateway
// version ("legacy", "3.6", "3.6.2", "3.7", "3.7.2", "3.8.5"); see
// `defaultConnectorConfig()` in gateway-management.models.ts.

export const CONNECTOR_DEFAULT_CONFIGS: Record<string, any> = {
  "bacnet": {
    "3.6.2": {
      "application": {
        "objectName": "TB_gateway",
        "host": "0.0.0.0",
        "port": 47808,
        "objectIdentifier": 599,
        "maxApduLengthAccepted": 1476,
        "segmentationSupported": "segmentedBoth",
        "vendorIdentifier": 15
      },
      "devices": [
        {
          "deviceInfo": {
            "deviceNameExpression": "BACnet Device ${objectName}",
            "deviceProfileExpression": "default",
            "deviceNameExpressionSource": "expression",
            "deviceProfileExpressionSource": "constant"
          },
          "host": "192.168.2.110",
          "port": "47808",
          "pollPeriod": 10000,
          "attributes": [
            {
              "key": "temperature",
              "objectType": "analogOutput",
              "objectId": 1,
              "propertyId": "presentValue"
            }
          ],
          "timeseries": [
            {
              "key": "state",
              "objectType": "binaryValue",
              "objectId": 1,
              "propertyId": "presentValue"
            }
          ],
          "attributeUpdates": [
            {
              "key": "brightness",
              "objectType": "analogOutput",
              "objectId": 1,
              "propertyId": "presentValue"
            }
          ],
          "serverSideRpc": [
            {
              "method": "set_state",
              "requestType": "writeProperty",
              "requestTimeout": 10000,
              "objectType": "binaryOutput",
              "objectId": 1,
              "propertyId": "presentValue"
            },
            {
              "method": "get_state",
              "requestType": "readProperty",
              "requestTimeout": 10000,
              "objectType": "binaryOutput",
              "objectId": 1,
              "propertyId": "presentValue"
            }
          ]
        }
      ]
    },
    "legacy": {
      "general": {
        "objectName": "TB_gateway",
        "address": "0.0.0.0:47808",
        "objectIdentifier": 599,
        "maxApduLengthAccepted": 1476,
        "segmentationSupported": "segmentedBoth",
        "vendorIdentifier": 15
      },
      "devices": [
        {
          "deviceName": "BACnet Device ${objectName}",
          "deviceType": "default",
          "address": "192.168.2.110:47808",
          "pollPeriod": 10000,
          "attributes": [
            {
              "key": "temperature",
              "type": "string",
              "objectId": "analogOutput:1",
              "propertyId": "presentValue"
            }
          ],
          "timeseries": [
            {
              "key": "state",
              "type": "bool",
              "objectId": "binaryValue:1",
              "propertyId": "presentValue"
            }
          ],
          "attributeUpdates": [
            {
              "key": "brightness",
              "requestType": "writeProperty",
              "objectId": "analogOutput:1",
              "propertyId": "presentValue"
            }
          ],
          "serverSideRpc": [
            {
              "method": "set_state",
              "requestType": "writeProperty",
              "requestTimeout": 10000,
              "objectId": "binaryOutput:1",
              "propertyId": "presentValue"
            },
            {
              "method": "get_state",
              "requestType": "readProperty",
              "requestTimeout": 10000,
              "objectId": "binaryOutput:1",
              "propertyId": "presentValue"
            }
          ]
        }
      ]
    }
  },
  "ble": {
    "passiveScanMode": true,
    "showMap": false,
    "scanner": {
      "timeout": 10000,
      "deviceName": "Device name"
    },
    "devices": [
      {
        "name": "Temperature and humidity sensor",
        "MACAddress": "4C:65:A8:DF:85:C0",
        "pollPeriod": 500000,
        "showMap": false,
        "timeout": 10000,
        "connectRetry": 5,
        "connectRetryInSeconds": 0,
        "waitAfterConnectRetries": 10,
        "telemetry": [
          {
            "key": "temperature",
            "method": "notify",
            "characteristicUUID": "226CAA55-6476-4566-7562-66734470666D",
            "valueExpression": "[2]"
          },
          {
            "key": "humidity",
            "method": "notify",
            "characteristicUUID": "226CAA55-6476-4566-7562-66734470666D",
            "valueExpression": "[0]"
          }
        ],
        "attributes": [
          {
            "key": "name",
            "method": "read",
            "characteristicUUID": "00002A00-0000-1000-8000-00805F9B34FB",
            "valueExpression": "[0:2]cm [2:]A"
          },
          {
            "key": "values",
            "method": "read",
            "characteristicUUID": "00002A00-0000-1000-8000-00805F9B34FB",
            "valueExpression": "All values: [:]"
          }
        ],
        "attributeUpdates": [
          {
            "attributeOnThingsBoard": "sharedName",
            "characteristicUUID": "00002A00-0000-1000-8000-00805F9B34FB"
          }
        ],
        "serverSideRpc": [
          {
            "methodRPC": "rpcMethod1",
            "withResponse": true,
            "characteristicUUID": "00002A00-0000-1000-8000-00805F9B34FB",
            "methodProcessing": "read"
          },
          {
            "methodRPC": "rpcMethod2",
            "withResponse": true,
            "characteristicUUID": "00002A00-0000-1000-8000-00805F9B34FB",
            "methodProcessing": "write"
          },
          {
            "methodRPC": "rpcMethod3",
            "withResponse": true,
            "methodProcessing": "scan"
          }
        ]
      }
    ]
  },
  "can": {
    "interface": "socketcan",
    "channel": "vcan0",
    "backend": {
      "fd": true
    },
    "reconnectPeriod": 5,
    "devices": [
      {
        "name": "Car",
        "sendDataOnlyOnChange": false,
        "enableUnknownRpc": true,
        "strictEval": false,
        "attributes": [
          {
            "key": "isDriverDoorOpened",
            "nodeId": 41,
            "command": "2:2:big:8717",
            "value": "4:1:int",
            "expression": "bool(value & 0b00000100)",
            "polling": {
              "type": "once",
              "dataInHex": "AB CD AB CD"
            }
          }
        ],
        "timeseries": [
          {
            "key": "rpm",
            "nodeId": 1918,
            "isExtendedId": true,
            "command": "2:2:big:48059",
            "value": "4:2:big:int",
            "expression": "value / 4",
            "polling": {
              "type": "always",
              "period": 5,
              "dataInHex": "aaaa bbbb aaaa bbbb"
            }
          },
          {
            "key": "milliage",
            "nodeId": 1918,
            "isExtendedId": true,
            "value": "4:2:little:int",
            "expression": "value * 10",
            "polling": {
              "type": "always",
              "period": 30,
              "dataInHex": "aa bb cc dd ee ff aa bb"
            }
          }
        ],
        "attributeUpdates": [
          {
            "attributeOnThingsBoard": "softwareVersion",
            "nodeId": 64,
            "isExtendedId": true,
            "dataLength": 4,
            "dataExpression": "value + 5",
            "dataByteorder": "little"
          }
        ],
        "serverSideRpc": [
          {
            "method": "sendSameData",
            "nodeId": 4,
            "isExtendedId": true,
            "isFd": true,
            "bitrateSwitch": true,
            "dataInHex": "aa bb cc dd ee ff    aa bb aa bb cc d ee ff"
          },
          {
            "method": "setLightLevel",
            "nodeId": 5,
            "dataLength": 2,
            "dataByteorder": "little",
            "dataBefore": "00AA"
          },
          {
            "method": "setSpeed",
            "nodeId": 16,
            "dataAfter": "0102",
            "dataExpression": "userSpeed if maxAllowedSpeed > userSpeed else maxAllowedSpeed"
          }
        ]
      }
    ]
  },
  "ftp": {
    "host": "0.0.0.0",
    "port": 21,
    "TLSSupport": false,
    "security": {
      "type": "basic",
      "username": "admin",
      "password": "admin"
    },
    "paths": [
      {
        "devicePatternName": "asd",
        "devicePatternType": "Device",
        "delimiter": ",",
        "path": "fol/*_hello*.txt",
        "readMode": "FULL",
        "maxFileSize": 5,
        "pollPeriod": 500,
        "txtFileDataView": "SLICED",
        "withSortingFiles": true,
        "attributes": [
          {
            "key": "temp",
            "value": "[1:]"
          },
          {
            "key": "tmp",
            "value": "[0:1]"
          }
        ],
        "timeseries": [
          {
            "type": "int",
            "key": "[0:1]",
            "value": "[0:1]"
          },
          {
            "type": "int",
            "key": "temp",
            "value": "[1:]"
          }
        ]
      }
    ],
    "attributeUpdates": [
      {
        "path": "fol/hello.json",
        "deviceNameFilter": ".*",
        "writingMode": "WRITE",
        "valueExpression": "{'${attributeKey}':'${attributeValue}'}"
      }
    ],
    "serverSideRpc": [
      {
        "deviceNameFilter": ".*",
        "methodFilter": "read",
        "valueExpression": "${params}"
      },
      {
        "deviceNameFilter": ".*",
        "methodFilter": "write",
        "valueExpression": "${params}"
      }
    ]
  },
  "knx": {
    "3.7": {
      "logLevel": "INFO",
      "client": {
        "type": "AUTOMATIC",
        "addressFormat": "LONG",
        "gatewayIP": "127.0.0.1",
        "gatewayPort": 3671,
        "autoReconnect": true,
        "autoReconnectWait": 3,
        "gatewaysScanner": {
          "enabled": true,
          "scanPeriod": 3,
          "stopOnFound": false
        }
      },
      "devices": [
        {
          "deviceInfo": {
            "deviceNameDataType": "string",
            "deviceNameExpressionSource": "expression",
            "deviceNameExpression": "Device ${1/0/5}",
            "deviceProfileDataType": "none",
            "deviceProfileExpressionSource": "constant",
            "deviceProfileNameExpression": "default"
          },
          "pollPeriod": 5000,
          "attributes": [
            {
              "type": "temperature",
              "key": "temperature",
              "groupAddress": "1/0/6"
            }
          ],
          "timeseries": [
            {
              "type": "humidity",
              "key": "humidity",
              "groupAddress": "1/0/7"
            }
          ]
        }
      ],
      "attributeUpdates": [
        {
          "deviceNameFilter": ".*",
          "dataType": "precent_U8",
          "groupAddress": "1/0/9",
          "key": "brightness"
        }
      ],
      "serverSideRpc": [
        {
          "requestType": "read",
          "deviceNameFilter": ".*",
          "method": "get_name",
          "dataType": "string",
          "groupAddress": "1/0/5"
        },
        {
          "requestType": "write",
          "deviceNameFilter": ".*",
          "method": "set_name",
          "dataType": "string",
          "groupAddress": "1/0/5"
        }
      ]
    }
  },
  "modbus": {
    "master": {
      "slaves": [
        {
          "host": "127.0.0.1",
          "port": 5021,
          "method": "socket",
          "unitId": 1,
          "deviceName": "Demo Device",
          "deviceType": "default",
          "timeout": 35,
          "byteOrder": "BIG",
          "wordOrder": "LITTLE",
          "retries": 3,
          "retryOnEmpty": true,
          "retryOnInvalid": true,
          "pollPeriod": 1000,
          "connectAttemptTimeMs": 5000,
          "connectAttemptCount": 5,
          "waitAfterFailedAttemptsMs": 300000,
          "type": "tcp",
          "attributes": [
            {
              "tag": "power",
              "type": "16int",
              "functionCode": 3,
              "objectsCount": 1,
              "address": 2,
              "divider": 10
            },
            {
              "tag": "frequency",
              "type": "16int",
              "functionCode": 3,
              "objectsCount": 1,
              "address": 3,
              "divider": 10
            }
          ],
          "timeseries": [
            {
              "tag": "temperature",
              "type": "16int",
              "address": 0,
              "objectsCount": 1,
              "functionCode": 3,
              "divider": 10
            },
            {
              "tag": "humidity",
              "type": "16int",
              "address": 1,
              "objectsCount": 1,
              "functionCode": 3,
              "divider": 10
            },
            {
              "tag": "relay",
              "type": "bits",
              "address": 1,
              "objectsCount": 1,
              "functionCode": 1,
              "bitTargetType": "bool"
            }
          ],
          "attributeUpdates": [
            {
              "tag": "relay",
              "type": "bits",
              "address": 1,
              "objectsCount": 1,
              "functionCode": 5,
              "bitTargetType": "bool"
            }
          ],
          "rpc": [
            {
              "tag": "setRelay",
              "type": "bits",
              "address": 1,
              "objectsCount": 1,
              "functionCode": 5,
              "bitTargetType": "bool"
            },
            {
              "tag": "getRelay",
              "type": "bits",
              "address": 1,
              "objectsCount": 1,
              "functionCode": 1,
              "bitTargetType": "bool"
            }
          ]
        }
      ]
    },
    "slave": {
      "type": "tcp",
      "host": "127.0.0.1",
      "port": 5026,
      "method": "socket",
      "unitId": 0,
      "deviceName": "Modbus Slave Example",
      "deviceType": "default",
      "pollPeriod": 5000,
      "sendDataToThingsBoard": false,
      "byteOrder": "LITTLE",
      "wordOrder": "LITTLE",
      "identity": {},
      "values": {
        "holding_registers": {
          "attributes": [
            {
              "address": 1,
              "type": "string",
              "tag": "sm",
              "objectsCount": 1,
              "value": "ON"
            }
          ],
          "timeseries": [
            {
              "address": 2,
              "type": "16int",
              "tag": "smm",
              "objectsCount": 1,
              "value": 12334
            }
          ],
          "attributeUpdates": [
            {
              "tag": "shared_attribute_write",
              "type": "32int",
              "functionCode": 6,
              "objectsCount": 2,
              "address": 29,
              "value": 1243
            }
          ],
          "rpc": [
            {
              "tag": "setValue",
              "value": 22,
              "type": "16int",
              "address": 31,
              "objectsCount": 1,
              "functionCode": 6
            }
          ]
        },
        "coils_initializer": {
          "attributes": [
            {
              "address": 5,
              "type": "8int",
              "tag": "coil",
              "objectsCount": 1,
              "value": 0
            }
          ],
          "timeseries": [],
          "attributeUpdates": [],
          "rpc": []
        },
        "input_registers": {
          "attributes": [],
          "timeseries": [],
          "attributeUpdates": [],
          "rpc": []
        },
        "discrete_inputs": {
          "attributes": [],
          "timeseries": [],
          "attributeUpdates": [],
          "rpc": []
        }
      }
    }
  },
  "mqtt": {
    "broker": {
      "host": "127.0.0.1",
      "port": 1883,
      "clientId": "ThingsBoard_gateway",
      "version": 5,
      "maxMessageNumberPerWorker": 10,
      "maxNumberOfWorkers": 100,
      "cleanSession": true,
      "cleanStart": true,
      "sessionExpiryInterval": 0,
      "security": {
        "type": "anonymous"
      }
    },
    "mapping": [
      {
        "topicFilter": "data/",
        "subscriptionQos": 1,
        "converter": {
          "type": "json",
          "deviceInfo": {
            "deviceNameExpressionSource": "constant",
            "deviceNameExpression": "Demo Device",
            "deviceProfileExpressionSource": "constant",
            "deviceProfileExpression": "default"
          },
          "sendDataOnlyOnChange": false,
          "timeout": 60000,
          "attributes": [
            {
              "type": "double",
              "key": "power",
              "value": "${power}"
            },
            {
              "type": "integer",
              "key": "frequency",
              "value": "${frequency}"
            }
          ],
          "timeseries": [
            {
              "type": "double",
              "key": "temperature",
              "value": "${temperature}"
            },
            {
              "type": "double",
              "key": "humidity",
              "value": "${humidity}"
            },
            {
              "type": "boolean",
              "key": "relay",
              "value": "${relay}"
            }
          ]
        }
      },
      {
        "topicFilter": "sensor/+/data",
        "subscriptionQos": 1,
        "converter": {
          "type": "json",
          "deviceInfo": {
            "deviceNameExpressionSource": "topic",
            "deviceNameExpression": "(?<=sensor/)(.*?)(?=/data)",
            "deviceProfileExpressionSource": "constant",
            "deviceProfileExpression": "Thermometer"
          },
          "timeout": 60000,
          "attributes": [
            {
              "type": "string",
              "key": "model",
              "value": "${sensorModel}"
            }
          ],
          "timeseries": [
            {
              "type": "double",
              "key": "temperature",
              "value": "${temp}"
            },
            {
              "type": "string",
              "key": "humidity",
              "value": "${hum}"
            }
          ]
        }
      },
      {
        "topicFilter": "sensor/raw_data",
        "subscriptionQos": 1,
        "converter": {
          "type": "bytes",
          "deviceInfo": {
            "deviceNameExpressionSource": "message",
            "deviceNameExpression": "[0:4]",
            "deviceProfileExpressionSource": "constant",
            "deviceProfileExpression": "default"
          },
          "timeout": 60000,
          "attributes": [
            {
              "type": "raw",
              "key": "rawData",
              "value": "[:]"
            }
          ],
          "timeseries": [
            {
              "type": "raw",
              "key": "temp",
              "value": "[4:]"
            }
          ]
        }
      },
      {
        "topicFilter": "custom/sensors/+",
        "subscriptionQos": 1,
        "converter": {
          "type": "custom",
          "extension": "CustomMqttUplinkConverter",
          "cached": true,
          "extensionConfig": {
            "temperature": 2,
            "humidity": 2,
            "batteryLevel": 1
          }
        }
      }
    ],
    "requestsMapping": {
      "connectRequests": [
        {
          "topicFilter": "sensor/connect",
          "deviceInfo": {
            "deviceNameExpressionSource": "constant",
            "deviceNameExpression": "Demo Device",
            "deviceProfileExpressionSource": "constant",
            "deviceProfileExpression": "default"
          }
        },
        {
          "topicFilter": "sensor/+/connect",
          "deviceInfo": {
            "deviceNameExpressionSource": "topic",
            "deviceNameExpression": "(?<=sensor/)(.*?)(?=/connect)",
            "deviceProfileExpressionSource": "constant",
            "deviceProfileExpression": "default"
          }
        }
      ],
      "disconnectRequests": [
        {
          "topicFilter": "sensor/disconnect",
          "deviceInfo": {
            "deviceNameExpressionSource": "constant",
            "deviceNameExpression": "Demo Device"
          }
        },
        {
          "topicFilter": "sensor/+/disconnect",
          "deviceInfo": {
            "deviceNameExpressionSource": "topic",
            "deviceNameExpression": "(?<=sensor/)(.*?)(?=/connect)"
          }
        }
      ],
      "attributeRequests": [
        {
          "retain": false,
          "topicFilter": "v1/devices/me/attributes/request",
          "deviceInfo": {
            "deviceNameExpressionSource": "constant",
            "deviceNameExpression": "Demo Device"
          },
          "attributeNameExpressionSource": "message",
          "attributeNameExpression": "${relay}",
          "topicExpression": "devices/${deviceName}/attrs",
          "valueExpression": "${attributeValue}"
        }
      ],
      "attributeUpdates": [
        {
          "deviceNameFilter": ".*",
          "attributeFilter": "relay",
          "topicExpression": "sensor/request/setRelay",
          "valueExpression": "${attributeValue}"
        }
      ],
      "serverSideRpc": [
        {
          "type": "twoWay",
          "deviceNameFilter": ".*",
          "methodFilter": "getRelay",
          "requestTopicExpression": "sensor/${deviceName}/request/${methodName}/${requestId}",
          "responseTopicExpression": "sensor/${deviceName}/response/${methodName}/${requestId}",
          "responseTopicQoS": 1,
          "responseTimeout": 10000,
          "valueExpression": "${params}"
        },
        {
          "type": "oneWay",
          "deviceNameFilter": ".*",
          "methodFilter": "setRelay",
          "requestTopicExpression": "sensor/request/${methodName}",
          "valueExpression": "${params}"
        }
      ]
    }
  },
  "ocpp": {
    "centralSystem": {
      "name": "Central System",
      "host": "127.0.0.1",
      "port": 9000,
      "connection": {
        "type": "insecure"
      },
      "security": [
        {
          "type": "token",
          "tokens": [
            "Bearer ACCESS_TOKEN"
          ]
        },
        {
          "type": "basic",
          "credentials": [
            {
              "username": "admin",
              "password": "admin"
            }
          ]
        }
      ]
    },
    "chargePoints": [
      {
        "idRegexpPattern": "bidon/hello/CP_1",
        "deviceNameExpression": "${Vendor} ${Model}",
        "deviceTypeExpression": "default",
        "attributes": [
          {
            "messageTypeFilter": "MeterValues,",
            "key": "temp1",
            "value": "${meter_value[:].sampled_value[:].value}"
          },
          {
            "messageTypeFilter": "MeterValues,",
            "key": "vendorId",
            "value": "${connector_id}"
          }
        ],
        "timeseries": [
          {
            "messageTypeFilter": "DataTransfer,",
            "key": "temp",
            "value": "${data.temp}"
          }
        ],
        "attributeUpdates": [
          {
            "attributeOnThingsBoard": "shared",
            "valueExpression": "{\"${attributeKey}\":\"${attributeValue}\"}"
          }
        ],
        "serverSideRpc": [
          {
            "methodRPC": "rpc1",
            "withResponse": true,
            "valueExpression": "${params}"
          }
        ]
      }
    ]
  },
  "odbc": {
    "connection": {
      "str": "Driver={PostgreSQL};Server=localhost;Port=5432;Database=thingsboard;Uid=postgres;Pwd=postgres;",
      "attributes": {
        "autocommit": true,
        "timeout": 0
      },
      "encoding": "utf-8",
      "decoding": {
        "char": "utf-8",
        "wchar": "utf-8",
        "metadata": "utf-16le"
      },
      "reconnect": true,
      "reconnectPeriod": 60
    },
    "pyodbc": {
      "pooling": false
    },
    "polling": {
      "query": "SELECT bool_v, str_v, dbl_v, long_v, entity_id, ts FROM ts_kv WHERE ts > ? ORDER BY ts ASC LIMIT 10",
      "period": 10,
      "iterator": {
        "column": "ts",
        "query": "SELECT MIN(ts) - 1 FROM ts_kv",
        "persistent": false
      }
    },
    "mapping": {
      "device": {
        "type": "postgres",
        "name": "'ODBC ' + entity_id"
      },
      "sendDataOnlyOnChange": false,
      "attributes": "*",
      "timeseries": [
        {
          "name": "value",
          "value": "[i for i in [str_v, long_v, dbl_v,bool_v] if i is not None][0]"
        }
      ]
    },
    "serverSideRpc": {
      "enableUnknownRpc": false,
      "overrideRpcConfig": true,
      "methods": [
        "procedureOne",
        {
          "name": "procedureTwo",
          "args": [
            "One",
            2,
            3.0
          ]
        }
      ]
    }
  },
  "opcua": {
    "server": {
      "url": "opc.tcp://127.0.0.1:4840/freeopcua/server/",
      "timeoutInMillis": 5000,
      "scanPeriodInMillis": 3600000,
      "pollPeriodInMillis": 5000,
      "enableSubscriptions": false,
      "subCheckPeriodInMillis": 100,
      "subDataMaxBatchSize": 1000,
      "subDataMinBatchCreationTimeMs": 200,
      "subscriptionProcessBatchSize": 2000,
      "sessionTimeoutInMillis": 120000,
      "showMap": false,
      "security": "Basic128Rsa15",
      "identity": {
        "type": "anonymous"
      }
    },
    "mapping": [
      {
        "deviceNodeSource": "path",
        "deviceNodePattern": "Root\\.Objects\\.MyObject",
        "deviceInfo": {
          "deviceNameExpression": "Demo Device",
          "deviceNameExpressionSource": "constant",
          "deviceProfileExpression": "default",
          "deviceProfileExpressionSource": "constant"
        },
        "attributes": [
          {
            "key": "frequency",
            "type": "path",
            "value": "${Frequency}"
          },
          {
            "key": "power",
            "type": "path",
            "value": "${Power}"
          }
        ],
        "timeseries": [
          {
            "key": "temperature",
            "type": "path",
            "value": "${Temperature}"
          },
          {
            "key": "humidity",
            "type": "path",
            "value": "${Humidity}"
          },
          {
            "key": "relay",
            "type": "path",
            "value": "${Relay}"
          }
        ],
        "rpc_methods": [
          {
            "method": "multiply",
            "arguments": [
              {
                "type": "integer",
                "value": 2
              },
              {
                "type": "integer",
                "value": 4
              }
            ]
          },
          {
            "method": "get_relay",
            "arguments": []
          },
          {
            "method": "set_relay",
            "arguments": []
          }
        ],
        "attributes_updates": [
          {
            "key": "relay",
            "type": "path",
            "value": "Root\\.Objects\\.MyObject\\.Relay"
          }
        ]
      }
    ]
  },
  "opcua_asyncio": {
    "server": {
      "name": "OPC-UA Default Server",
      "url": "localhost:4840/freeopcua/server/",
      "timeoutInMillis": 5000,
      "scanPeriodInMillis": 3600000,
      "pollPeriodInMillis": 5000,
      "disableSubscriptions": false,
      "subCheckPeriodInMillis": 100,
      "showMap": false,
      "security": "Basic128Rsa15",
      "identity": {
        "type": "anonymous"
      },
      "mapping": [
        {
          "deviceNodePattern": "Root\\.Objects\\.Device1",
          "deviceNamePattern": "Device ${Root\\.Objects\\.Device1\\.serialNumber}",
          "attributes": [
            {
              "key": "temperature \u00b0C",
              "path": "${ns=2;i=5}"
            }
          ],
          "timeseries": [
            {
              "key": "humidity",
              "path": "${Root\\.Objects\\.Device1\\.TemperatureAndHumiditySensor\\.Humidity}"
            },
            {
              "key": "batteryLevel",
              "path": "${Battery\\.batteryLevel}"
            }
          ],
          "rpc_methods": [
            {
              "method": "multiply",
              "arguments": [
                2,
                4
              ]
            }
          ],
          "attributes_updates": [
            {
              "attributeOnThingsBoard": "deviceName",
              "attributeOnDevice": "Root\\.Objects\\.Device1\\.serialNumber"
            }
          ]
        }
      ]
    }
  },
  "request": {
    "host": "http://127.0.0.1:5000",
    "SSLVerify": true,
    "security": {
      "type": "basic",
      "username": "user",
      "password": "password"
    },
    "mapping": [
      {
        "url": "getdata",
        "httpMethod": "GET",
        "httpHeaders": {
          "ACCEPT": "application/json"
        },
        "content": {
          "name": "morpheus",
          "job": "leader"
        },
        "allowRedirects": true,
        "timeout": 0.5,
        "scanPeriod": 5,
        "dataUnpackExpression": "",
        "converter": {
          "type": "json",
          "deviceNameJsonExpression": "SD8500",
          "deviceTypeJsonExpression": "SD",
          "attributes": [
            {
              "key": "serialNumber",
              "type": "string",
              "value": "${serial}"
            }
          ],
          "telemetry": [
            {
              "key": "Maintainer",
              "type": "string",
              "value": "${Developer}"
            },
            {
              "key": "combine",
              "type": "string",
              "value": "${Developer}:${hum}"
            }
          ]
        }
      },
      {
        "url": "get_info",
        "httpMethod": "GET",
        "httpHeaders": {
          "ACCEPT": "application/json"
        },
        "allowRedirects": true,
        "timeout": 0.5,
        "scanPeriod": 100,
        "dataUnpackExpression": "",
        "converter": {
          "type": "custom",
          "deviceNameJsonExpression": "SD8500",
          "deviceTypeJsonExpression": "SD",
          "extension": "CustomRequestUplinkConverter",
          "extension-config": [
            {
              "key": "Totaliser",
              "type": "float",
              "fromByte": 0,
              "toByte": 4,
              "byteorder": "big",
              "signed": true,
              "multiplier": 1
            },
            {
              "key": "Flow",
              "type": "int",
              "fromByte": 4,
              "toByte": 6,
              "byteorder": "big",
              "signed": true,
              "multiplier": 0.01
            },
            {
              "key": "Temperature",
              "type": "int",
              "fromByte": 8,
              "toByte": 10,
              "byteorder": "big",
              "signed": true,
              "multiplier": 0.01
            },
            {
              "key": "Pressure",
              "type": "int",
              "fromByte": 12,
              "toByte": 14,
              "byteorder": "big",
              "signed": true,
              "multiplier": 0.01
            },
            {
              "key": "deviceStatus",
              "type": "int",
              "byteAddress": 15,
              "fromBit": 4,
              "toBit": 8,
              "byteorder": "big",
              "signed": false
            },
            {
              "key": "OUT2",
              "type": "int",
              "byteAddress": 15,
              "fromBit": 1,
              "toBit": 2,
              "byteorder": "big"
            },
            {
              "key": "OUT1",
              "type": "int",
              "byteAddress": 15,
              "fromBit": 0,
              "toBit": 1,
              "byteorder": "big"
            }
          ]
        }
      },
      {
        "url": "/devices",
        "httpMethod": "GET",
        "httpHeaders": {
          "ACCEPT": "application/json"
        },
        "allowRedirects": true,
        "timeout": 3.0,
        "scanPeriod": 1800,
        "subRequests": {
          "cumPwr": {
            "url": "/${id}/hist/values/ActiveEnergy/SUM13/3600?start=RELATIVE_-1HOUR&end=RELATIVE_-1HOUR&online=false&aggregate=false",
            "processingFunction": "def process_data(data, key): return {key: float(data[\"values\"][0][\"avg\"])/1000.0}"
          }
        },
        "converter": {
          "type": "json",
          "deviceNameJsonExpression": "${id}-${type}",
          "deviceTypeJsonExpression": "GridVis",
          "attributes": [
            {
              "key": "id",
              "type": "int",
              "value": "${id}"
            },
            {
              "key": "type",
              "type": "string",
              "value": "${type}"
            },
            {
              "key": "serialNr",
              "type": "string",
              "value": "${serialNr}"
            },
            {
              "key": "name",
              "type": "string",
              "value": "${name}"
            },
            {
              "key": "description",
              "type": "string",
              "value": "${description}"
            }
          ],
          "telemetry": [
            {
              "key": "cumPwr",
              "type": "float",
              "value": "${cumPwr}"
            }
          ]
        }
      }
    ],
    "attributeUpdates": [
      {
        "httpMethod": "POST",
        "httpHeaders": {
          "Content-Type": "application/json"
        },
        "timeout": 0.5,
        "tries": 3,
        "allowRedirects": true,
        "deviceNameFilter": "SD.*",
        "attributeFilter": "send_data",
        "requestUrlExpression": "sensor/${deviceName}/${attributeKey}",
        "requestValueExpression": "{\"${attributeKey}\":\"${attributeValue}\"}"
      }
    ],
    "serverSideRpc": [
      {
        "deviceNameFilter": ".*",
        "methodFilter": "echo",
        "requestUrlExpression": "sensor/${deviceName}/request/${methodName}/${requestId}",
        "responseTimeout": 1,
        "httpMethod": "GET",
        "responseValueExpression": "${temp}",
        "timeout": 0.5,
        "tries": 3,
        "httpHeaders": {
          "Content-Type": "application/json"
        }
      },
      {
        "deviceNameFilter": ".*",
        "methodFilter": "no-reply",
        "requestUrlExpression": "sensor/${deviceName}/request/${methodName}/${requestId}",
        "httpMethod": "POST",
        "requestValueExpression": "${params}",
        "httpHeaders": {
          "Content-Type": "application/json"
        }
      }
    ]
  },
  "rest": {
    "3.7.2": {
      "server": {
        "host": "127.0.0.1",
        "port": "5000",
        "SSL": false,
        "security": {
          "cert": "~/ssl/cert.pem",
          "key": "~/ssl/key.pem"
        }
      },
      "mapping": [
        {
          "endpoint": "/my_devices",
          "HTTPMethods": [
            "POST"
          ],
          "security": {
            "type": "anonymous"
          },
          "converter": {
            "type": "json",
            "deviceInfo": {
              "deviceNameExpressionSource": "request",
              "deviceNameExpression": "${sensorName}",
              "deviceProfileExpressionSource": "request",
              "deviceProfileExpression": "${sensorType}"
            },
            "attributes": [
              {
                "type": "string",
                "key": "model",
                "value": "${sensorModel}"
              },
              {
                "type": "string",
                "key": "certificateNumber",
                "value": "${certificateNumber}"
              }
            ],
            "timeseries": [
              {
                "type": "double",
                "key": "temperature",
                "value": "${temp}"
              },
              {
                "type": "double",
                "key": "humidity",
                "value": "${hum}"
              }
            ]
          }
        },
        {
          "endpoint": "/anon1",
          "HTTPMethods": [
            "GET",
            "POST"
          ],
          "security": {
            "type": "anonymous"
          },
          "converter": {
            "type": "json",
            "deviceInfo": {
              "deviceNameExpressionSource": "constant",
              "deviceNameExpression": "Device 2",
              "deviceProfileExpressionSource": "constant",
              "deviceProfileExpression": "default"
            },
            "attributes": [
              {
                "type": "string",
                "key": "model",
                "value": "Model2"
              }
            ],
            "timeseries": [
              {
                "type": "double",
                "key": "temperature",
                "value": "${temp}"
              },
              {
                "type": "double",
                "key": "humidity",
                "value": "${hum}"
              }
            ]
          }
        },
        {
          "endpoint": "/anon2",
          "HTTPMethods": [
            "POST"
          ],
          "security": {
            "type": "anonymous"
          },
          "converter": {
            "type": "custom",
            "deviceInfo": {
              "deviceNameExpressionSource": "constant",
              "deviceNameExpression": "SuperAnonDevice",
              "deviceProfileExpressionSource": "constant",
              "deviceProfileExpression": "default"
            },
            "extension": "CustomRestUplinkConverter",
            "extensionConfig": {
              "key": "Totaliser",
              "datatype": "float",
              "fromByte": 0,
              "toByte": 4,
              "byteorder": "big",
              "signed": true,
              "multiplier": 1
            }
          }
        }
      ],
      "requestsMapping": {
        "attributeRequests": [
          {
            "endpoint": "/sharedAttributes",
            "type": "shared",
            "HTTPMethods": [
              "POST"
            ],
            "security": {
              "type": "anonymous"
            },
            "timeout": 10.0,
            "deviceNameExpression": "${deviceName}",
            "attributeNameExpression": "${attribute}${attribute1}"
          }
        ],
        "attributeUpdates": [
          {
            "HTTPMethod": "POST",
            "SSLVerify": false,
            "httpHeaders": {
              "CONTENT-TYPE": "application/json"
            },
            "security": {
              "type": "anonymous"
            },
            "timeout": 0.5,
            "tries": 3,
            "allowRedirects": true,
            "deviceNameFilter": "SN.*",
            "attributeFilter": ".*",
            "requestUrlExpression": "http://127.0.0.1:5001/",
            "valueExpression": "{\"deviceName\":\"${deviceName}\",\"${attributeKey}\":\"${attributeValue}\"}"
          }
        ],
        "serverSideRpc": [
          {
            "deviceNameFilter": ".*",
            "methodFilter": "echo",
            "requestUrlExpression": "http://127.0.0.1:5001/${deviceName}",
            "responseTimeout": 1,
            "HTTPMethod": "GET",
            "valueExpression": "${params}",
            "timeout": 10.0,
            "tries": 3,
            "httpHeaders": {
              "Content-Type": "application/json"
            },
            "security": {
              "type": "anonymous"
            }
          },
          {
            "deviceNameFilter": "SN.*",
            "methodFilter": "post_attributes",
            "requestUrlExpression": "http://127.0.0.1:5000/my_devices",
            "responseTimeout": 1,
            "HTTPMethod": "POST",
            "valueExpression": "{\"sensorName\":\"${deviceName}\", \"sensorModel\":\"${params.sensorModel}\", \"certificateNumber\":\"${params.certificateNumber}\", \"temp\":\"${params.temp}\", \"hum\":\"${params.hum}\"}",
            "timeout": 10.0,
            "tries": 3,
            "httpHeaders": {
              "Content-Type": "application/json"
            },
            "security": {
              "type": "anonymous"
            }
          },
          {
            "deviceNameFilter": ".*",
            "methodFilter": "no-reply",
            "requestUrlExpression": "sensor/${deviceName}/request/${methodName}/${requestId}",
            "HTTPMethod": "POST",
            "valueExpression": "${params}",
            "httpHeaders": {
              "Content-Type": "application/json"
            },
            "security": {
              "type": "anonymous"
            }
          }
        ]
      }
    },
    "legacy": {
      "host": "127.0.0.1",
      "port": "5000",
      "SSL": false,
      "security": {
        "cert": "~/ssl/cert.pem",
        "key": "~/ssl/key.pem"
      },
      "mapping": [
        {
          "endpoint": "/my_devices",
          "HTTPMethods": [
            "POST"
          ],
          "security": {
            "type": "anonymous"
          },
          "converter": {
            "type": "json",
            "deviceNameExpression": "${sensorName}",
            "deviceTypeExpression": "${sensorType}",
            "attributes": [
              {
                "type": "string",
                "key": "model",
                "value": "${sensorModel}"
              },
              {
                "type": "string",
                "key": "certificateNumber",
                "value": "${certificateNumber}"
              }
            ],
            "timeseries": [
              {
                "type": "double",
                "key": "temperature",
                "value": "${temp}"
              },
              {
                "type": "double",
                "key": "humidity",
                "value": "${hum}"
              }
            ]
          }
        },
        {
          "endpoint": "/anon1",
          "HTTPMethods": [
            "GET",
            "POST"
          ],
          "security": {
            "type": "anonymous"
          },
          "converter": {
            "type": "json",
            "deviceNameExpression": "Device 2",
            "deviceTypeExpression": "default",
            "attributes": [
              {
                "type": "string",
                "key": "model",
                "value": "Model2"
              }
            ],
            "timeseries": [
              {
                "type": "double",
                "key": "temperature",
                "value": "${temp}"
              },
              {
                "type": "double",
                "key": "humidity",
                "value": "${hum}"
              }
            ]
          }
        },
        {
          "endpoint": "/anon2",
          "HTTPMethods": [
            "POST"
          ],
          "security": {
            "type": "anonymous"
          },
          "converter": {
            "type": "custom",
            "deviceNameExpression": "SuperAnonDevice",
            "deviceTypeExpression": "default",
            "extension": "CustomRestUplinkConverter",
            "extension-config": {
              "key": "Totaliser",
              "datatype": "float",
              "fromByte": 0,
              "toByte": 4,
              "byteorder": "big",
              "signed": true,
              "multiplier": 1
            }
          }
        }
      ],
      "attributeRequests": [
        {
          "endpoint": "/sharedAttributes",
          "type": "shared",
          "HTTPMethods": [
            "POST"
          ],
          "security": {
            "type": "anonymous"
          },
          "timeout": 10.0,
          "deviceNameExpression": "${deviceName}",
          "attributeNameExpression": "${attribute}${attribute1}"
        }
      ],
      "attributeUpdates": [
        {
          "HTTPMethod": "POST",
          "SSLVerify": false,
          "httpHeaders": {
            "CONTENT-TYPE": "application/json"
          },
          "security": {
            "type": "anonymous"
          },
          "timeout": 0.5,
          "tries": 3,
          "allowRedirects": true,
          "deviceNameFilter": "SN.*",
          "attributeFilter": ".*",
          "requestUrlExpression": "http://127.0.0.1:5001/",
          "valueExpression": "{\"deviceName\":\"${deviceName}\",\"${attributeKey}\":\"${attributeValue}\"}"
        }
      ],
      "serverSideRpc": [
        {
          "deviceNameFilter": ".*",
          "methodFilter": "echo",
          "requestUrlExpression": "http://127.0.0.1:5001/${deviceName}",
          "responseTimeout": 1,
          "HTTPMethod": "GET",
          "valueExpression": "${params}",
          "timeout": 10.0,
          "tries": 3,
          "httpHeaders": {
            "Content-Type": "application/json"
          },
          "security": {
            "type": "anonymous"
          }
        },
        {
          "deviceNameFilter": "SN.*",
          "methodFilter": "post_attributes",
          "requestUrlExpression": "http://127.0.0.1:5000/my_devices",
          "responseTimeout": 1,
          "HTTPMethod": "POST",
          "valueExpression": "{\"sensorName\":\"${deviceName}\", \"sensorModel\":\"${params.sensorModel}\", \"certificateNumber\":\"${params.certificateNumber}\", \"temp\":\"${params.temp}\", \"hum\":\"${params.hum}\"}",
          "timeout": 10.0,
          "tries": 3,
          "httpHeaders": {
            "Content-Type": "application/json"
          },
          "security": {
            "type": "anonymous"
          }
        },
        {
          "deviceNameFilter": ".*",
          "methodFilter": "no-reply",
          "requestUrlExpression": "sensor/${deviceName}/request/${methodName}/${requestId}",
          "HTTPMethod": "POST",
          "valueExpression": "${params}",
          "httpHeaders": {
            "Content-Type": "application/json"
          },
          "security": {
            "type": "anonymous"
          }
        }
      ]
    }
  },
  "s7": {
    "3.8.5": {
      "devices": [
        {
          "type": "PLC",
          "address": "127.0.0.1",
          "port": 1102,
          "rack": 0,
          "slot": 1,
          "deviceName": "S7 PLC",
          "deviceProfileName": "default",
          "autoReconnect": true,
          "maxRetries": 3,
          "retryDelay": 1.0,
          "maxDelay": 30.0,
          "heartbeatInterval": 5,
          "pollPeriod": 10000,
          "attributes": [
            {
              "type": "tag",
              "key": "power",
              "tag": "DB1.DBD204:REAL"
            },
            {
              "type": "tag",
              "key": "frequency",
              "tag": "DB1.DBD200:REAL"
            }
          ],
          "timeseries": [
            {
              "type": "data",
              "key": "temperature",
              "dataType": "real",
              "dbNumber": 1,
              "start": 50,
              "size": 4
            },
            {
              "type": "data",
              "key": "humidity",
              "dataType": "lreal",
              "dbNumber": 1,
              "start": 54,
              "size": 8
            },
            {
              "type": "data",
              "key": "relay",
              "dataType": "bool",
              "dbNumber": 1,
              "start": 0,
              "size": 1,
              "bit": 0
            }
          ],
          "attributeUpdates": [
            {
              "type": "tag",
              "key": "relay",
              "tag": "DB1.DBX0.0:BOOL"
            }
          ],
          "serverSideRpc": [
            {
              "method": "getRelay",
              "requestType": "read",
              "type": "data",
              "dataType": "bool",
              "dbNumber": 1,
              "start": 0,
              "size": 1,
              "bit": 0
            },
            {
              "method": "setRelay",
              "requestType": "write",
              "type": "data",
              "dataType": "bool",
              "dbNumber": 1,
              "start": 0,
              "size": 1,
              "bit": 0
            }
          ]
        },
        {
          "type": "LOGO",
          "address": "127.0.0.1",
          "port": 102,
          "tsapSnap7": 20,
          "tsapLogo": 30,
          "deviceName": "LOGO",
          "deviceProfileName": "default",
          "autoReconnect": true,
          "maxRetries": 3,
          "retryDelay": 1.0,
          "maxDelay": 30.0,
          "heartbeatInterval": 5,
          "pollPeriod": 10000,
          "attributes": [],
          "timeseries": [
            {
              "type": "vm",
              "key": "temperature",
              "vmAddress": "VW30"
            },
            {
              "type": "vm",
              "key": "humidity",
              "vmAddress": "VW0"
            }
          ],
          "attributeUpdates": [
            {
              "type": "vm",
              "key": "lightLevel",
              "vmAddress": "VW30"
            }
          ],
          "serverSideRpc": [
            {
              "method": "setLight",
              "requestType": "write",
              "type": "vm",
              "vmAddress": "VW30"
            },
            {
              "method": "getLight",
              "requestType": "read",
              "type": "vm",
              "vmAddress": "VW30"
            }
          ]
        }
      ]
    }
  },
  "snmp": {
    "devices": [
      {
        "deviceName": "SNMP router",
        "deviceType": "snmp",
        "ip": "snmp.live.gambitcommunications.com",
        "port": 161,
        "pollPeriod": 5000,
        "community": "public",
        "attributes": [
          {
            "key": "ReceivedFromGet",
            "method": "get",
            "oid": "1.3.6.1.2.1.1.1.0",
            "timeout": 6
          },
          {
            "key": "ReceivedFromMultiGet",
            "method": "multiget",
            "oid": [
              "1.3.6.1.2.1.1.1.0",
              "1.3.6.1.2.1.1.2.0"
            ],
            "timeout": 6
          },
          {
            "key": "ReceivedFromGetNext",
            "method": "getnext",
            "oid": "1.3.6.1.2.1.1.1.0",
            "timeout": 6
          },
          {
            "key": "ReceivedFromMultiWalk",
            "method": "multiwalk",
            "oid": [
              "1.3.6.1.2.1.1.1.0",
              "1.3.6.0.1.2.1"
            ]
          },
          {
            "key": "ReceivedFromBulkWalk",
            "method": "bulkwalk",
            "oid": [
              "1.3.6.1.2.1.1.1.0",
              "1.3.6.1.2.1.1.2.0"
            ]
          },
          {
            "key": "ReceivedFromBulkGet",
            "method": "bulkget",
            "scalarOid": [
              "1.3.6.1.2.1.1.1.0",
              "1.3.6.1.2.1.1.2.0"
            ],
            "repeatingOid": [
              "1.3.6.1.2.1.1.1.0",
              "1.3.6.1.2.1.1.2.0"
            ],
            "maxListSize": 10
          }
        ],
        "telemetry": [
          {
            "key": "ReceivedFromWalk",
            "community": "private",
            "method": "walk",
            "oid": "1.3.6.1.2.1.1.1.0"
          },
          {
            "key": "ReceivedFromTable",
            "method": "table",
            "oid": "1.3.6.1.2.1.1"
          }
        ],
        "attributeUpdateRequests": [
          {
            "attributeFilter": "dataToSet",
            "method": "set",
            "oid": "1.3.6.1.2.1.1.1.0"
          },
          {
            "attributeFilter": "dataToMultiSet",
            "method": "multiset",
            "mappings": {
              "1.2.3": "10",
              "2.3.4": "${attribute}"
            }
          }
        ],
        "serverSideRpcRequests": [
          {
            "requestFilter": "setData",
            "method": "set",
            "oid": "1.3.6.1.2.1.1.1.0"
          },
          {
            "requestFilter": "multiSetData",
            "method": "multiset"
          },
          {
            "requestFilter": "getData",
            "method": "get",
            "oid": "1.3.6.1.2.1.1.1.0"
          },
          {
            "requestFilter": "runBulkWalk",
            "method": "bulkwalk",
            "oid": [
              "1.3.6.1.2.1.1.1.0",
              "1.3.6.1.2.1.1.2.0"
            ]
          }
        ]
      },
      {
        "deviceName": "SNMP router",
        "deviceType": "snmp",
        "ip": "127.0.0.1",
        "pollPeriod": 5000,
        "community": "public",
        "converter": "CustomSNMPConverter",
        "attributes": [
          {
            "key": "ReceivedFromGetWithCustomConverter",
            "method": "get",
            "oid": "1.3.6.1.2.1.1.1.0"
          }
        ],
        "telemetry": [
          {
            "key": "ReceivedFromTableWithCustomConverter",
            "method": "table",
            "oid": "1.3.6.1.2.1.1.1.0"
          }
        ]
      }
    ]
  },
  "socket": {
    "3.6": {
      "socket": {
        "type": "TCP",
        "address": "127.0.0.1",
        "port": 50000,
        "bufferSize": 1024
      },
      "devices": [
        {
          "address": "*:*",
          "deviceName": "Device Example",
          "deviceType": "default",
          "encoding": "utf-8",
          "telemetry": [
            {
              "key": "temp",
              "byteFrom": 0,
              "byteTo": -1
            },
            {
              "key": "hum",
              "byteFrom": 0,
              "byteTo": 2
            }
          ],
          "attributes": [
            {
              "key": "name",
              "byteFrom": 0,
              "byteTo": -1
            },
            {
              "key": "num",
              "byteFrom": 2,
              "byteTo": 4
            }
          ],
          "attributeRequests": [
            {
              "type": "shared",
              "requestExpressionSource": "constant",
              "attributeNameExpressionSource": "constant",
              "requestExpression": "${[0:3]==atr}",
              "attributeNameExpression": "[3:]"
            }
          ],
          "attributeUpdates": [
            {
              "encoding": "utf-16",
              "attributeOnThingsBoard": "sharedName"
            }
          ],
          "serverSideRpc": [
            {
              "methodRPC": "rpcMethod1",
              "withResponse": true,
              "encoding": "utf-8"
            }
          ]
        }
      ]
    },
    "legacy": {
      "type": "TCP",
      "address": "127.0.0.1",
      "port": 50000,
      "bufferSize": 1024,
      "devices": [
        {
          "address": "*:*",
          "deviceName": "Device Example",
          "deviceType": "default",
          "encoding": "utf-8",
          "telemetry": [
            {
              "key": "temp",
              "byteFrom": 0,
              "byteTo": -1
            },
            {
              "key": "hum",
              "byteFrom": 0,
              "byteTo": 2
            }
          ],
          "attributes": [
            {
              "key": "name",
              "byteFrom": 0,
              "byteTo": -1
            },
            {
              "key": "num",
              "byteFrom": 2,
              "byteTo": 4
            }
          ],
          "attributeRequests": [
            {
              "type": "shared",
              "requestExpression": "${[0:3]==atr}",
              "attributeNameExpression": "[3:]"
            }
          ],
          "attributeUpdates": [
            {
              "encoding": "utf-16",
              "attributeOnThingsBoard": "sharedName"
            }
          ],
          "serverSideRpc": [
            {
              "methodRPC": "rpcMethod1",
              "withResponse": true,
              "methodProcessing": "write",
              "encoding": "utf-8"
            }
          ]
        }
      ]
    }
  },
  "xmpp": {
    "server": {
      "jid": "gateway@localhost",
      "password": "password",
      "host": "localhost",
      "port": 5222,
      "use_ssl": false,
      "disable_starttls": false,
      "force_starttls": true,
      "timeout": 10000,
      "plugins": [
        "xep_0030",
        "xep_0323",
        "xep_0325"
      ]
    },
    "devices": [
      {
        "jid": "device@localhost/TMP_1101",
        "deviceNameExpression": "${serialNumber}",
        "deviceTypeExpression": "default",
        "attributes": [
          {
            "key": "temperature",
            "value": "${temp}"
          }
        ],
        "timeseries": [
          {
            "key": "humidity",
            "value": "${hum}"
          },
          {
            "key": "combination",
            "value": "${temp}:${hum}"
          }
        ],
        "attributeUpdates": [
          {
            "attributeOnThingsBoard": "shared",
            "valueExpression": "{\"${attributeKey}\":\"${attributeValue}\"}"
          }
        ],
        "serverSideRpc": [
          {
            "methodRPC": "rpc1",
            "withResponse": true,
            "valueExpression": "${params}"
          }
        ]
      }
    ]
  },
};
