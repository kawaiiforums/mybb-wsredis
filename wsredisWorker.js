function wsredisClient(initParameters)
{
    this.broadcastChannelName = initParameters.broadcastChannelName;
    this.uri = initParameters.uri;
    this.userToken = initParameters.userToken;
    this.userTokenTimestamp = initParameters.userTokenTimestamp;
    this.tokenExpirationTime = initParameters.tokenExpirationTime * 1000;

    this.handle = null;
    this.tokenTimeout = null;
    this.channels = [];
    this.connectionPromise = null;

    // BroadcastChannel API
    this.broadcastChannel = new BroadcastChannel(this.broadcastChannelName);

    this.broadcastChannel.onmessage = (event) => {
        switch (event.data.action) {
            case 'addChannels':
                this.addChannels(event.data.name);
                break;
            case 'addChannel':
                this.addChannel(event.data.name);
                break;
            case 'removeChannels':
                this.removeChannels(event.data.name);
                break;
            case 'removeChannel':
                this.removeChannel(event.data.name);
                break;
            /*
            case 'send':
                this.send(event.data.data);
                break;
            */
        }
    };

    // WebSocket connection
    this.connect = () => {
        if (!this.connectionPromise) {
            this.connectionPromise = new Promise((resolve, reject) => {
                if (this.isOpen()) {
                    resolve();
                } else {
                    this.prepareUserToken().then(() => {
                        this.handle = new WebSocket(this.uri, [ this.userToken ]);

                        this.handle.addEventListener('open', (event) => {
                            this.announceState('connection_open');
                            this.log('wsredisWorker: connection opened');
                            resolve();
                        });

                        this.handle.addEventListener('close', (event) => {
                            this.announceState('connection_closed');
                            this.log('wsredisWorker: connection closed');
                        });

                        this.handle.addEventListener('message', (event) => {
                            var message = JSON.parse(event.data);

                            if (message.channel !== undefined && message.data !== undefined && message.channel in this.channels) {
                                this.channels[message.channel].postMessage(message.data);
                            }
                        });
                    });

                    this.tokenTimeout = setTimeout(() => { this.refreshToken() }, this.tokenExpirationTime * 0.8);
                }
            });
        }

        return this.connectionPromise;
    };

    this.disconnect = () => {
        if (this.isOpen()) {
            this.handle.close();
        }

        this.tokenTimeout = null;
    };

    this.isOpen = () => {
        return this.handle != null && this.handle.readyState === WebSocket.OPEN;
    };

    this.announceState = (name) => {
        this.broadcastChannel.postMessage({
            action: 'state',
            name: name,
        });
    };

    // WebSocket communication
    this.send = (action, data) => {
        this.connect().then(() => {
            var object = { action: action, data: data };
            this.handle.send(JSON.stringify(object));
        });
    };

    // subscription handling
    this.addChannels = (channels) => {
        var newChannels = [];

        for (var i in channels) {
            if (this.channels[channels[i]] == undefined) {
                newChannels.push(channels[i]);
                this.channels[channels[i]] = new BroadcastChannel(this.broadcastChannelName + '.' + channels[i]);
            }
        }

        if (newChannels.length) {
            this.send('add-channels', {
                channels: newChannels,
            });
        }
    };

    this.addChannel = (name) => {
        return this.addChannels([name]);
    };

    this.removeChannels = (channels) => {
        var existentChannels = [];

        for (var i in channels) {
            if (this.channels[channels[i]] !== undefined) {
                existentChannels.push(channels[i]);
                delete this.channels[channels[i]];
            }
        }

        this.send('remove-channels', {
            channels: existentChannels,
        });
    };

    this.removeChannel = (name) => {
        return this.removeChannels([name]);
    };

    // token handling
    this.fetchUserToken = () => {
        return new Promise((resolve, reject) => {
            fetch('./xmlhttp.php?action=wsredis_get_user_token').then((response) => {
                return response.json();
            }).then((response) => {
                this.userToken = response.userToken;
                this.userTokenTimestamp = response.userTokenTimestamp;

                resolve(response.userToken);
            });
        });
    };

    this.prepareUserToken = (forceFetch) => {
        return new Promise((resolve, reject) => {
            if (forceFetch === true || this.userTokenTimestamp < Math.floor(new Date().getTime() / 1000) - this.tokenExpirationTime) {
                var userToken = this.fetchUserToken();
            }

            resolve(userToken);
        });
    };

    this.refreshToken = () => {
        this.prepareUserToken(true).then(() => {
            this.sendToken();
        });

        clearTimeout(this.tokenTimeout);
        this.tokenTimeout = setTimeout(() => { this.refreshToken() }, this.tokenExpirationTime * 0.8);
    };

    this.sendToken = () => {
        this.send('refresh-token', {
            token: this.userToken,
        });
    };

    // MessageChannel communication
    this.log = (message) => {
        console.log(message);
    };
}

var client = null;

var messageHandler = (event) => {
    if (event.data.action == 'wsredisClient.init') {
        if (!client) {
            client = new wsredisClient(event.data.initParameters);
            client.announceState('client_initialized');
        }

        if (client.isOpen()) {
            client.announceState('connection_open');
        }
    }
};

if (typeof SharedWorkerGlobalScope != 'undefined') {
    self.addEventListener('connect', (event) => {
        event.ports[0].addEventListener('message', messageHandler);
        event.ports[0].start();
    });
} else {
    self.addEventListener('message', messageHandler);
}
