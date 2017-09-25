if (typeof wsredisClientManager === 'undefined') {
    wsredisClientManager = function (apiBroadcastChannelName)
    {
        this.useWorker = true;

        this.attributes = [];
        this.launchPromise = null;
        this.clientInitialized = false;
        this.clientInitializeCallbacks = [];
        this.connected = false;
        this.connectCallbacks = [];
        this.broadcastChannels = [];
        this.apiBroadcastChannelName = apiBroadcastChannelName;

        this.processApiMessage = (event) => {
            if (event.data.action == 'state') {
                switch (event.data.name) {
                    case 'client_initialized':
                        this.clientInitialized = true;

                        if (this.clientInitializeCallbacks.length) {
                            for (var i in this.clientInitializeCallbacks) {
                                this.clientInitializeCallbacks[i]();
                                delete this.clientInitializeCallbacks[i];
                            }
                        }

                        break;
                    case 'connection_open':
                        this.connected = true;

                        if (this.connectCallbacks.length) {
                            for (var i in this.connectCallbacks) {
                                this.connectCallbacks[i]();
                                delete this.connectCallbacks[i];
                            }
                        }

                        break;
                    case 'connection_closed':
                        this.connected = false;
                        break;
                }
            }
        };

        this.launchClient = () => {
            if (!this.launchPromise) {
                this.launchPromise = new Promise((resolve, reject) => {
                    this.loadAttributes().then(() => {
                        if (this.useWorker) {
                            this.setupSharedWorker()
                                .then(this.initializeWorker)
                                .then(resolve)
                                .catch((e) => {
                                    this.setupVirtualWorker()
                                        .then(this.initializeWorker)
                                        .then(resolve);
                                });
                        } else {
                            this.setupVirtualWorker()
                                .then(this.initializeWorker)
                                .then(resolve);
                        }
                    });
                });
            }

            return this.launchPromise;
        };

        this.apiMessage = (message) => {
            this.launchClient().then(() => {
                this.apiBroadcastChannel.postMessage(message);
            });
        };

        this.onceInitialized = (callback) => {
            if (this.clientInitialized) {
                callback();
            } else {
                this.clientInitializeCallbacks.push(callback);
            }
        };

        this.clientInitializePromise = () => {
            return
        };

        this.onceConnected = (callback) => {
            if (this.connected) {
                callback();
            } else {
                this.connectCallbacks.push(callback);
            }
        };

        this.loadAttributes = () => {
            return new Promise((resolve, reject) => {
                if (this.attributes.length) {
                    resolve();
                } else {
                    for (var i in document.currentScript.attributes) {
                        var element = document.currentScript.attributes[i];

                        if (element.specified && element.name.match('^data-')) {
                            this.attributes[element.name.replace('data-', '')] = element.value;
                        }
                    }

                    resolve();
                }
            });
        };

        this.initializeWorker = (messageHandler) => {
            return new Promise((resolve, reject) => {
                messageHandler({
                    action: 'wsredisClient.init',
                    initParameters: {
                        apiBroadcastChannelName: apiBroadcastChannelName,
                        uri: this.attributes['wsredisWebsocketUri'.toLowerCase()],
                        userToken: this.attributes['wsredisEncodedUserToken'.toLowerCase()],
                        userTokenTimestamp: this.attributes['wsredisUserTokenTimestamp'.toLowerCase()],
                        tokenExpirationTime: this.attributes['wsredisTokenExpirationTime'.toLowerCase()],
                    }
                });

                this.onceInitialized(() => {
                    resolve();
                });
            });
        };

        this.setupSharedWorker = () => {
            return new Promise((resolve, reject) => {
                if (typeof SharedWorker != 'undefined') {
                    var worker = new SharedWorker(rootpath + '/wsredisWorker.js');

                    worker.addEventListener('error', (error) => {
                        console.log(error);
                    });

                    worker.port.addEventListener('message', this.tunneledMessageHandler);

                    worker.port.start();

                    console.log('wsredisClientManager: sharedWorker active');

                    resolve((message) => {
                        return worker.port.postMessage(message);
                    });
                } else {
                    reject();
                }
            });
        };

        this.setupServiceWorker = () => {
            return new Promise((resolve, reject) => {
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register(rootpath + '/wsredisWorker.js');

                    navigator.serviceWorker.ready.then(() => {
                        if (navigator.serviceWorker.controller == null) {
                            reject();
                        } else {
                            navigator.serviceWorker.addEventListener('error', (error) => {
                                console.log(error);
                            });

                            console.log('wsredisClientManager: serviceWorker & control active');

                            var messageChannel = new MessageChannel();

                            messageChannel.port1.addEventListener('message', this.tunneledMessageHandler);

                            resolve((message) => {
                                return navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
                            });
                        }
                    });
                } else {
                    reject();
                }
            });
        };

        this.setupVirtualWorker = () => {
            return new Promise((resolve, reject) => {
                $.getScript(rootpath + '/wsredisWorker.js').then(() => {
                    console.log('wsredisClientManager: virtual worker active');

                    window.addEventListener('message', this.tunneledMessageHandler);

                    resolve((message) => {
                        return window.postMessage(message, location.origin);
                    });
                });
            });
        };

        this.tunneledMessageHandler = (event) => {
            if (event.data.action == 'channel-tunneled') {
                if (this.broadcastChannels[event.data.channel] == 'undefined') {
                    this.broadcastChannels[event.data.channel] = new BroadcastChannel('wsredis.' + event.data.channel);
                }

                this.broadcastChannels[event.data.channel].postMessage(event.data.data);
            } else {
                this.processApiMessage(event);
            }
        }

        // set up main API channel
        this.apiBroadcastChannel = new BroadcastChannel(this.apiBroadcastChannelName);
        this.apiBroadcastChannel.addEventListener('message', this.processApiMessage);
    };
}

if (typeof wsredis === 'undefined') {
    var wsredis = new wsredisClientManager('wsredis');
    wsredis.launchClient();
}
