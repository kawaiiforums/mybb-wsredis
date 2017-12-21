<?php

namespace wsredis\Redis;

function pub(string $channel, string $message)
{
    if (class_exists('Redis')) {
        try {
            $redisHandle = new \Redis();

            @$redisHandle->pconnect(
                \wsredis\getRedisServerHostname(),
                \wsredis\getRedisServerPort()
            );

            $numClients = $redisHandle->publish($channel, $message);

            $redisHandle->close();

            return $numClients;
        } catch (\RedisException $e) {
            return false;
        }
    }
}
