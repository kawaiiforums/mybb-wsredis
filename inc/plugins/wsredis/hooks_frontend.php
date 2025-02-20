<?php

namespace wsredis\hooks;

function global_end()
{
    \wsredis\setGlobalInitHtml();
}

function xmlhttp()
{
    global $mybb, $charset;

    if ($mybb->get_input('action') == 'wsredis_get_user_token') {
        header('Content-type: text/plain; charset=' . $charset);
        header('Cache-Control: no-store');

        echo json_encode([
            'userToken' => \wsredis\getEncodedUserToken($mybb->user),
            'userTokenTimestamp' => TIME_NOW,
        ]);

        exit;
    }
}
