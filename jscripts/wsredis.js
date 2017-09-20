function wsredisClientManager(broadcastChannelName)
{
    this.useWorker = true;

    this.attributes = [];
    this.launchPromise = null;
    this.clientInitialized = false;
    this.clientInitializeCallbacks = [];
    this.connected = false;
    this.connectCallbacks = [];

    this.apiBroadcastChannel = new BroadcastChannel(broadcastChannelName);

    this.apiBroadcastChannel.onmessage = (event) => {
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
                            .then(this.initializeWorker).
                            then(resolve);
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
                    broadcastChannelName: broadcastChannelName,
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

                worker.onerror = (error) => {
                    console.log(error.message);
                    worker.port.close();
                }

                worker.port.start();

                console.log('wsredis: sharedWorker & control active');

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
                        console.log('wsredis: serviceWorker & control active');

                        resolve((message) => {
                            return navigator.serviceWorker.controller.postMessage(message);
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
                console.log('wsredis: virtual worker active');

                resolve((message) => {
                    return window.postMessage(message, location.origin);
                });
            });
        });
    };
}

var wsredis = new wsredisClientManager('wsredis');
wsredis.launchClient();
