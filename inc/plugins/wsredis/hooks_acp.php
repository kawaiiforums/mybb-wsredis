<?php

namespace wsredis\hooks;

function admin_tools_system_health_begin()
{
    global $mybb, $lang, $page, $sub_tabs, $wsredisScript;

    $lang->load('wsredis');

    $moduleName = 'wsredis_health_check';

    $sub_tabs[$moduleName] = array(
        'title' => $lang->$moduleName,
        'link' => 'index.php?module=tools-system_health&amp;action=' . $moduleName,
        'description' => $lang->{$moduleName . '_description'},
    );

    if ($mybb->input['action'] == $moduleName) {
        if ($mybb->input['ajax'] == 1) {
            header('Content-type: application/json; charset=' . $lang->settings['charset']);

            if (!verify_post_check($mybb->get_input('my_post_key'), true)) {
                xmlhttp_error($lang->invalid_post_code);
            }

            $result = \wsredis\push('ping', ['ping'], []);

            echo json_encode([
                'result' => (int)$result,
            ]);

            exit;
        } else {
            $page->extra_header .= <<<HTML
    <link rel="stylesheet" href="jscripts/wsredis/health_check.css" />

HTML;

            $page->output_header($lang->$moduleName);
            $page->output_nav_tabs($sub_tabs, $moduleName);

            \wsredis\setGlobalInitHtml();

            echo <<<HTML
<svg id="wsredis_health_check" viewBox="0 0 102 30" xmlns="http://www.w3.org/2000/svg">
    <g class="object" data-id="browser">
        <rect x="1" y="1" class="symbol" width="20" height="10" rx="1" ry="1" />
        <text x="11" y="6.5">Browser</text>
    </g>
    <g class="object" data-id="mybb" transform="translate(40,0)">
        <rect x="1" y="1" class="symbol" width="20" height="10" rx="1" ry="1" />
        <text x="11" y="6.5">MyBB</text>
    </g>
    <g class="object" data-id="redis" transform="translate(80,0)">
        <rect x="1" y="1" class="symbol" width="20" height="10" rx="1" ry="1" />
        <text x="11" y="6.5">Redis</text>
    </g>
    <g class="object" data-id="websocket-server" transform="translate(40,14)">
        <rect x="1" y="1" class="symbol" width="20" height="10" rx="1" ry="1" />
        <text x="11" y="6.5">WebSocket server</text>
    </g>

    <g class="relationship" data-id="browser-mybb">
        <path d="M 22,6 l 18,0" />
        <text x="31" y="4">{$lang->wsredis_health_check_status_waiting}</text>
    </g>
    <g class="relationship" data-id="mybb-redis">
        <path class="relationship" d="M 62,6 l 18,0" />
        <text x="71" y="4">{$lang->wsredis_health_check_status_waiting}</text>
    </g>
    <g class="relationship" data-id="redis-websocket-server">
        <path class="relationship" d="M 90,12 q 0,8 -28,8" stroke="black" fill="transparent" />
        <text x="80" y="22">{$lang->wsredis_health_check_status_waiting}</text>
    </g>
    <g class="relationship" data-id="websocket-server-browser">
        <path class="relationship" d="M 40,20 q -30,0 -30,-8" stroke="black" fill="transparent" />
        <text x="20" y="22">{$lang->wsredis_health_check_status_waiting}</text>
    </g>
</svg>

<script>
var rootpath = "{$mybb->settings['bburl']}";
var my_post_key = "{$mybb->post_code}";
lang.wsredis_health_check_status_unknown = "{$lang->wsredis_health_check_status_unknown}";
lang.wsredis_health_check_status_up = "{$lang->wsredis_health_check_status_up}";
lang.wsredis_health_check_status_down = "{$lang->wsredis_health_check_status_down}";
</script>
{$wsredisScript}
<script src="jscripts/wsredis/health_check.js" defer></script>
HTML;

            $page->output_footer();
        }
    }
}
