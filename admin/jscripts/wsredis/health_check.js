var wsredisGraph = function (element) {
    this.element = element;

    this.setRelationshipStatus = (id, status, text) => {
        if (typeof id === 'object') {
            for (let key in id) {
                this.setRelationshipStatus(id[key], status, text);
            }
        } else {
            let element = this.element.querySelector('.relationship[data-id="' + id + '"]');
            let pathlement = element.querySelector('.relationship[data-id="' + id + '"]');
            let textElement = element.querySelector('text');

            element.classList.replace(/status-[a-z]+/, null);
            element.classList.add('status-' + status);

            if (typeof text !== 'undefined') {
                textElement.innerHTML = text;
            }
        }
    };
};

function sendPingBroadcastRequest(graph)
{
    $.get('index.php', {
        module: 'tools-system_health',
        action: 'wsredis_health_check',
        ajax: 1,
        my_post_key: my_post_key,
    }).done(function (data) {
        graph.setRelationshipStatus('browser-mybb', 'up', lang.wsredis_health_check_status_up);

        if (data.result === true) {
            graph.setRelationshipStatus('mybb-redis', 'up', lang.wsredis_health_check_status_up);

            if (data.clients == 0) {
                graph.setRelationshipStatus('redis-websocket-server', 'down', lang.wsredis_health_check_status_down);
            }
        } else {
            graph.setRelationshipStatus('mybb-redis', 'down', lang.wsredis_health_check_status_down);
        }

        setTimeout(() => {
            if (data.result === 1 & !pingReceived) {
                graph.setRelationshipStatus('redis-websocket-server', 'down', lang.wsredis_health_check_status_down);
            }
        }, 5000);
    }).fail(function () {
        graph.setRelationshipStatus('browser-mybb', 'down', lang.wsredis_health_check_status_down);
        graph.setRelationshipStatus([
            'mybb-redis',
            'redis-websocket-server',
            'websocket-server-browser',
        ], 'unknown', lang.wsredis_health_check_status_unknown);
    });
}

var pingReceived = false;

$(function () {
    var graph = new wsredisGraph(document.querySelector('#wsredis_health_check'));

    var moduleBroadcastChannel = new BroadcastChannel('wsredis.ping');

    var pingBroadcastRequested = false;

    moduleBroadcastChannel.addEventListener('message', (event) => {
        pingReceived = true;
        graph.setRelationshipStatus('redis-websocket-server', 'up', lang.wsredis_health_check_status_up);
    });

    wsredis.apiMessage({
        action: 'addChannel',
        name: 'ping',
    });

    wsredis.onceConnected(() => {
        graph.setRelationshipStatus('websocket-server-browser', 'up', lang.wsredis_health_check_status_up);

        pingBroadcastRequested = true;
        sendPingBroadcastRequest(graph);
    });

    setTimeout(() => {
        if (!wsredis.connected) {
            graph.setRelationshipStatus('redis-websocket-server', 'unknown', lang.wsredis_health_check_status_unknown);
            graph.setRelationshipStatus('websocket-server-browser', 'down', lang.wsredis_health_check_status_down);
        }
    }, 5000);

    setTimeout(() => {
        pingBroadcastRequested = true;
        sendPingBroadcastRequest(graph);
    }, 5000);
});
