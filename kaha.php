<?php

$json = file_get_contents('https://api.tibiadata.com/v2/characters/kaha.json');

$data = json_decode($json, true);

echo "Kana é um " . $data['characters']['data']['vocation'] . " level " . $data['characters']['data']['level'] . " que reside em " . $data['characters']['data']['residence'] . " no servidor " . $data['characters']['data']['world'] . " e tem " . $data['characters']['data']['achievement_points'] . " pontos de conquistas. O motivo de sua última morte foi " . $data['characters']['deaths'][0]['reason'] . "."; 

?>