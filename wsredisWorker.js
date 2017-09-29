function wsredisClient(initParameters, tunnelingPort)
{
    this.handle = null;
    this.tokenTimeout = null;
    this.channels = [];
    this.connectionPromise = null;
    this.apiBroadcastChannel = null;
    this.tunnelingPort = null;

    // API request handling
    this.processApiMessage = (event) => {
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
        }
    };

    this.broadcastApiMessage = (data) => {
        if (this.apiBroadcastChannel) {
            return this.apiBroadcastChannel.postMessage(data);
        } else if (this.tunnelingPort) {
            return this.tunnelingPort.postMessage(data);
        } else {
            return false;
        }
    };

    this.broadcastChannelMessage = (channel, data) => {
        if (this.apiBroadcastChannel) {
            if (this.channels[channel] === null) {
                this.channels[channel] = new BroadcastChannel(this.apiBroadcastChannelName + '.' + channel);
            }

            return this.channels[channel].postMessage(data);
        } else if (this.tunnelingPort) {
            return this.tunnelingPort.postMessage({
                action: 'channel-tunneled',
                channel: channel,
                data: data,
            })
        } else {
            return false;
        }
    };

    this.announceState = (name) => {
        this.broadcastApiMessage({
            action: 'state',
            name: name,
        });
    };

    this.setLatestTunnelingPort = (tunnelingPort) => {
        this.tunnelingPort = tunnelingPort;
    };

    this.notifyNewWindow = () => {
        if (this.isOpen()) {
            this.announceState('connection_open');
        }
    }

    // API functionality
    this.addChannels = (channels) => {
        var newChannels = [];

        for (var i in channels) {
            if (this.channels[channels[i]] == undefined) {
                newChannels.push(channels[i]);
                this.channels[channels[i]] = null;
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

    this.readdChannels = () => {
        this.send('add-channels', {
            channels: Object.keys(this.channels),
        });
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

    // WebSocket handling
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
                            this.log('wsredisClient: connection opened');
                            resolve();
                        });

                        this.handle.addEventListener('close', (event) => {
                            this.connectionPromise = null;
                            this.announceState('connection_closed');
                            this.log('wsredisClient: connection closed');
                        });

                        this.handle.addEventListener('message', (event) => {
                            var message = JSON.parse(event.data);

                            if (message.channel !== undefined && message.data !== undefined && message.channel in this.channels) {
                                this.broadcastChannelMessage(message.channel, message.data);
                            }
                        });
                    });

                    this.tokenTimeout = setTimeout(() => {
                        this.refreshToken()
                    }, this.tokenExpirationTime * 0.8);
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

    this.isClosed = () => {
        return this.handle == null || this.handle.readyState === WebSocket.CLOSED;
    };

    this.send = (action, data) => {
        this.connect().then(() => {
            var object = { action: action, data: data };
            this.handle.send(JSON.stringify(object));
        });
    };

    // token handling
    this.fetchUserToken = () => {
        return new Promise((resolve, reject) => {
            fetch('./xmlhttp.php?action=wsredis_get_user_token', {
                credentials: 'same-origin',
            }).then((response) => {
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

        this.tokenTimeout = setTimeout(() => {
            this.refreshToken()
        }, this.tokenExpirationTime * 0.8);
    };

    this.sendToken = () => {
        this.send('refresh-token', {
            token: this.userToken,
        });
    };

    // common
    this.init = (initParameters) => {
        if (this.isClosed()) {
            this.apiBroadcastChannelName = initParameters.apiBroadcastChannelName;
            this.uri = initParameters.uri;
            this.userToken = initParameters.userToken;
            this.userTokenTimestamp = initParameters.userTokenTimestamp;
            this.tokenExpirationTime = initParameters.tokenExpirationTime * 1000;
        }
    };

    this.restore = (initParameters, tunnelingPort) => {
        this.init(initParameters);
        this.setLatestTunnelingPort(tunnelingPort);

        if (Object.keys(this.channels).length != 0 && !this.connectionPromise) {
            this.connect().then(() => {
                this.readdChannels();
            });
        }
    };

    this.log = (message) => {
        console.log(message);
    };

    this.init(initParameters);

    // set up listening for API requests
    if (typeof BroadcastChannel != 'undefined') {
        this.apiBroadcastChannel = new BroadcastChannel(this.apiBroadcastChannelName);
        this.apiBroadcastChannel.addEventListener('message', this.processApiMessage);
    } else {
        if (tunnelingPort) {
            this.tunnelingPort = tunnelingPort;
        }

        this.announceState('broadcast_channel_tunneling');
    }

    this.announceState('client_initialized');
}

var client = null;

var messageHandler = (event) => {
    if (event.data.action == 'wsredisClient.init') {
        if (event.ports != null) {
            var tunnelingPort = event.ports[0];
        } else {
            var tunnelingPort = null;
        }

        if (!client) {
            client = new wsredisClient(event.data.initParameters, tunnelingPort);
        } else {
            client.restore(event.data.initParameters, tunnelingPort);
        }

        client.notifyNewWindow();
    } else {
        if (client) {
            client.processApiMessage(event);
        }
    }
};

if (typeof window != 'undefined') {
    self.addEventListener('message', messageHandler);
} else {
    if (typeof SharedWorkerGlobalScope != 'undefined') {
        self.addEventListener('connect', (event) => {
            event.ports[0].addEventListener('message', messageHandler);
            event.ports[0].start();
        });
    } else {
        self.addEventListener('message', messageHandler);
    }
}
