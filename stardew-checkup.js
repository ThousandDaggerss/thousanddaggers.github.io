/* stardew-checkup.js
 * https://thousanddaggerss.github.io/
 */

/*jslint indent: 4, maxerr: 50, passfail: false, browser: true, regexp: true, plusplus: true */
/*global $, FileReader */

window.onload = function () {
	"use strict";

	// Checa o arquivo requerido para suporte ao API.
	if (!(window.File && window.FileReader)) {
		document.getElementById("out").innerHTML =
			'<span class="error">Erro Fatal: Não pode ler o arquivo e os APIs</span>';
		return;
	}

	// Mostra o campo input imediatamente
	$(document.getElementById("input-container")).show();

	// Funcões Utéis
	function addCommas(x) {
		// Jamie Taylor @ https://stackoverflow.com/questions/3883342/add-commas-to-a-number-in-jquery
		return x.toString().replace(/\B(?=(?:\d{3})+(?!\d))/g, ",");
	}

	function capitalize(s) {
		// joelvh @ https://stackoverflow.com/questions/1026069/how-do-i-make-the-first-letter-of-a-string-uppercase-in-javascript
		return s && s[0].toUpperCase() + s.slice(1);
	}

	function compareSemVer(a, b) {
		// semver-compare by James Halliday ("substack") @ https://github.com/substack/semver-compare
		var pa = a.split(".");
		var pb = b.split(".");
		for (var i = 0; i < 3; i++) {
			var na = Number(pa[i]);
			var nb = Number(pb[i]);
			if (na > nb) return 1;
			if (nb > na) return -1;
			if (!isNaN(na) && isNaN(nb)) return 1;
			if (isNaN(na) && !isNaN(nb)) return -1;
		}
		return 0;
	}

	function getAchieveString(name, desc, yes) {
		if (desc.length > 0) {
			desc = "(" + desc + ") ";
		}
		return yes
			? '<span class="ach_yes"><span class="ach">' +
			name +
			"</span> " +
			desc +
			" concluído</span>"
			: '<span class="ach_no"><span class="ach">' +
			name +
			"</span> " +
			desc +
			"</span> -- falta ";
	}

	function getAchieveImpossibleString(name, desc) {
		if (desc.length > 0) {
			desc = "(" + desc + ") ";
		}
		return (
			'<span class="ach_imp"><span class="ach">' +
			name +
			"</span> " +
			desc +
			" impossível</span>"
		);
	}

	function getMilestoneString(desc, yes) {
		return yes
			? '<span class="ms_yes">' + desc + "</span>"
			: '<span class="ms_no">' + desc + "</span> -- falta ";
	}

	function getPointString(pts, desc, cum, yes) {
		var c = cum ? "+" : "";
		return yes
			? '<span class="pt_yes"><span class="pts">+' +
			pts +
			c +
			"</span> conseguiu (" +
			desc +
			")</span>"
			: '<span class="pt_no"><span class="pts"> (' +
			pts +
			c +
			")</span> possível (" +
			desc +
			")</span>";
	}

	function getPointImpossibleString(pts, desc) {
		return (
			'<span class="pt_imp"><span class="pts">+' +
			pts +
			"</span> impossível (" +
			desc +
			")</span>"
		);
	}

	function wikify(item, page) {
		// removendo cores e mudando espaços para underscore
		var trimmed = item.replace(" (White)", "");
		trimmed = trimmed.replace(" (Brown)", "");
		trimmed = trimmed.replace(/ /g, "_");
		return page
			? '<a href="https://pt.stardewvalleywiki.com/' +
			page +
			"#" +
			trimmed +
			'">' +
			item +
			"</a>"
			: '<a href="https://pt.stardewvalleywiki.com/' +
			trimmed +
			'">' +
			item +
			"</a>";
	}

	function wikimap(item, index, arr) {
		// Wrapper permite wikify seja usado dentro de um mapa array sem falha de leitura ou segundos e terceiros argumentos.
		return wikify(item);
	}

	function printTranspose(table) {
		var output = '<table class="output">',
			id;
		for (var r = 0; r < table[0].length; r++) {
			output += "<tr>";
			for (var c = 0; c < table.length; c++) {
				id = "PL_" + (c + 1);
				output += '<td class="' + id + '">' + table[c][r] + "</td>";
			}
			output += "</tr>";
		}
		output += "</table>";
		return output;
	}

	function isValidFarmhand(player) {
		// deve ser usado um userID em branco para determinar que o espaço farmhand está vazio
		// até que um usuário envie um arquivo salvo válido farmhand não tem ID. Usando ambos um userID
		// em branco e o nome campo já é suficiente.
		if (
			$(player).children("userID").text() === "" &&
			$(player).children("name").text() === ""
		) {
			return false;
		}
		return true;
	}

	// Partes individuais do save para fazer parsing.
	// Cada objeto xmlDoc recebido para parse e as estruturas de informações saveInfo retorna HTML.
	function parseSummary(xmlDoc, saveInfo) {
		var output = "<h3>Visão Geral</h3>\n",
			farmTypes = [
				"Fazenda Padrão",
				"Fazenda entre Riachos",
				"Fazenda na Floresta",
				"Fazenda na Colina",
				"Fazenda Remota",
				"Fazenda Quatro Cantos",
			],
			playTime = Number($(xmlDoc).find("player > millisecondsPlayed").text()),
			playHr = Math.floor(playTime / 36e5),
			playMin = Math.floor((playTime % 36e5) / 6e4),
			id = "0",
			name = $(xmlDoc).find("player > name").html(),
			farmer = name,
			farmhands = [];

		// Mudança de versão para bools e para numeros, agora uma string semver.
		saveInfo.version = $(xmlDoc).find("gameVersion").first().text();
		if (saveInfo.version === "") {
			saveInfo.version = "1.2";
			if ($(xmlDoc).find("hasApplied1_4_UpdateChanges").text() === "true") {
				saveInfo.version = "1.4";
			} else if (
				$(xmlDoc).find("hasApplied1_3_UpdateChanges").text() === "true"
			) {
				saveInfo.version = "1.3";
			}
		}

		// Prefixos Namespace variados por plataforma; saves em iOS saves parecem usar 'p3' e PC saves usa 'xsi'.
		saveInfo.ns_prefix =
			$(xmlDoc).find("SaveGame[xmlns\\:xsi]").length > 0 ? "xsi" : "p3";
		// Fazendeiro, Fazenda, e Nome dos Filhos são lidos como html() porque eles vem de uma ação input executada pelo usuário e pode conter caracteres que deve ser usados em escapes.
		saveInfo.players = {};
		saveInfo.children = {};
		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			id = $(xmlDoc).find("player > UniqueMultiplayerID").text();
		}
		saveInfo.players[id] = name;
		saveInfo.children[id] = [];
		$(xmlDoc)
			.find(
				"[" +
				saveInfo.ns_prefix +
				"\\:type='FarmHouse'] NPC[" +
				saveInfo.ns_prefix +
				"\\:type='Child']"
			)
			.each(function () {
				saveInfo.children[id].push($(this).find("name").html());
			});
		saveInfo.numPlayers = 1;
		output +=
			'<span class="result">' +
			"Fazenda: " +
			$(xmlDoc).find("player > farmName").html() +
			" (" +
			farmTypes[$(xmlDoc).find("whichFarm").text()] +
			")</span><br />";
		output += '<span class="result">Fazendeiro: ' + name;
		$(xmlDoc)
			.find("farmhand")
			.each(function () {
				if (isValidFarmhand(this)) {
					saveInfo.numPlayers++;
					id = $(this).children("UniqueMultiplayerID").text();
					name = $(this).children("name").html();
					farmhands.push(name);
					saveInfo.players[id] = name;
					saveInfo.children[id] = [];
					$(this)
						.parent("indoors[" + saveInfo.ns_prefix + '\\:type="Cabin"]')
						.find("NPC[" + saveInfo.ns_prefix + "\\:type='Child']")
						.each(function () {
							saveInfo.children[id].push($(this).find("name").html());
						});
				}
			});
		if (saveInfo.numPlayers > 1) {
			output += " and Farmhand(s) " + farmhands.join(", ");
			createPlayerList(saveInfo.numPlayers, farmer, farmhands);
		}
		output += "</span><br />";
		// Procudando por casamentos entre os jogadores e seus filhos
		saveInfo.partners = {};
		$(xmlDoc)
			.find("farmerFriendships > item")
			.each(function () {
				var item = this;
				if ($(this).find("value > Friendship > Status").text() === "Married") {
					var id1 = $(item).find("key > FarmerPair > Farmer1").text();
					var id2 = $(item).find("key > FarmerPair > Farmer2").text();
					saveInfo.partners[id1] = id2;
					saveInfo.partners[id2] = id1;
				}
			});
		// Data originalmente usa elementos XXForSaveGame, mas eles nem sempre estão presentes em saves carregados da upload.farm
		output +=
			'<span class="result">Dia ' +
			Number($(xmlDoc).find("dayOfMonth").text()) +
			" - " +
			capitalize($(xmlDoc).find("currentSeason").html()) +
			" - Ano " +
			Number($(xmlDoc).find("year").text()) +
			"</span><br />";
		output += '<span class="result">Tempo de Jogo: ';
		if (playHr === 0 && playMin === 0) {
			output += "menos de um minuto";
		} else {
			if (playHr > 0) {
				output += playHr + " hr ";
			}
			if (playMin > 0) {
				output += playMin + " min ";
			}
		}
		output += "</span><br />";
		var version_num = saveInfo.version;
		output +=
			'<span class="result">Versão do Arquivo Salvo: ' +
			version_num +
			"</span><br />";
		return output;
	}

	function parseMoney(xmlDoc, saveInfo) {
		var output = "<h3>Ouro</h3>\n",
			table = [];
		// Isso é um pouco impreciso com gold compartilhado em multiplayer, mas aqui ta separado tudo pra cada jogador...
		table[0] = parsePlayerMoney($(xmlDoc).find("SaveGame > player"), saveInfo);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerMoney(this, saveInfo));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerMoney(player, saveInfo) {
		var output = "",
			money = Number($(player).children("totalMoneyEarned").text());

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" arrecadou " +
			addCommas(money) +
			" ouro no total.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			money >= 15e3
				? getAchieveString("Greenhorn", "ganhe 15,000 ouro", 1)
				: getAchieveString("Greenhorn", "ganhe 15,000 ouro", 0) +
				addCommas(15e3 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 5e4
				? getAchieveString("Cowpoke", "ganhe 50,000 ouro", 1)
				: getAchieveString("Cowpoke", "ganhe 50,000 ouro", 0) +
				addCommas(5e4 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 25e4
				? getAchieveString("Homesteader", "ganhe 250,000 ouro", 1)
				: getAchieveString("Homesteader", "ganhe 250,000 ouro", 0) +
				addCommas(25e4 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 1e6
				? getAchieveString("Millionaire", "ganhe 1,000,000 ouro", 1)
				: getAchieveString("Millionaire", "ganhe 1,000,000 ouro", 0) +
				addCommas(1e6 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 1e7
				? getAchieveString("Legend", "ganhe 10,000,000 ouro", 1)
				: getAchieveString("Legend", "ganhe 10,000,000 ouro", 0) +
				addCommas(1e7 - money) +
				" ouro";
		output += "</li></ul>\n";
		return [output];
	}

	function parseSocial(xmlDoc, saveInfo) {
		var output = "<h3>Social</h3>\n",
			table = [],
			countdown = Number($(xmlDoc).find("countdownToWedding").text()),
			daysPlayed = Number($(xmlDoc).find("stats > daysPlayed").first().text()),
			spouse = $(xmlDoc).find("player > spouse").text(), // only used for 1.2 engagement checking
			// NPCs and NPC Types we are ignoring either in location data or friendship data
			ignore = {
				Horse: 1,
				Cat: 1,
				Dog: 1,
				Fly: 1,
				Grub: 1,
				GreenSlime: 1,
				Gunther: 1,
				Marlon: 1,
				Bouncer: 1,
				"Mister Qi": 1,
				Henchman: 1,
			},
			npc = {},
			// <NPC>: [ [<numHearts>, <id>], ... ]
			eventList = {
				Abigail: [
					[2, 1],
					[4, 2],
					[6, 4],
					[8, 3],
					[10, 901756],
				],
				Alex: [
					[2, 20],
					[4, 2481135],
					[5, 21],
					[6, 2119820],
					[8, 288847],
					[10, 911526],
				],
				Elliott: [
					[2, 39],
					[4, 40],
					[6, 423502],
					[8, 1848481],
					[10, 43],
				],
				Emily: [
					[2, 471942],
					[4, 463391],
					[6, 917409],
					[8, 2123243],
					[10, 2123343],
				],
				Haley: [
					[2, 11],
					[4, 12],
					[6, 13],
					[8, 14],
					[10, 15],
				],
				Harvey: [
					[2, 56],
					[4, 57],
					[6, 58],
					[8, 571102],
					[10, 528052],
				],
				Leah: [
					[2, 50],
					[4, 51],
					[6, 52],
					[8, "53|584059"],
					[10, 54],
				], // 53 art show, 584059 online
				Maru: [
					[2, 6],
					[4, 7],
					[6, 8],
					[8, 9],
					[10, 10],
				],
				Penny: [
					[2, 34],
					[4, 35],
					[6, 36],
					[8, 181928],
					[10, 38],
				],
				Sam: [
					[2, 44],
					[3, 733330],
					[4, 46],
					[6, 45],
					[8, 4081148],
					[10, 233104],
				],
				Sebastian: [
					[2, 2794460],
					[4, 384883],
					[6, 27],
					[8, 29],
					[10, 384882],
				],
				Shane: [
					[2, 611944],
					[4, 3910674],
					[6, 3910975],
					["6.8", 3910974],
					[7, 831125],
					[8, 3900074],
					[10, 9581348],
				],
				Caroline: [[6, 17]],
				Clint: [
					[3, 97],
					[6, 101],
				],
				Demetrius: [[6, 25]],
				Dwarf: [["0.2", 691039]],
				Evelyn: [[4, 19]],
				George: [[6, 18]],
				Gus: [[4, 96]],
				Jas: [],
				Jodi: [[4, "94|95"]], // 94 y1, 95 y2
				Kent: [[3, 100]],
				Krobus: [],
				Lewis: [[6, 639373]],
				Linus: [
					["0.2", 502969],
					[4, 26],
				],
				Marnie: [[6, 639373]],
				Pam: [],
				Pierre: [[6, 16]],
				Robin: [[6, 33]],
				Vincent: [],
				Willy: [],
			};
		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			eventList.Jas.push([8, 3910979]);
			eventList.Vincent.push([8, 3910979]);
			eventList.Linus.push([8, 371652]);
			eventList.Pam.push([9, 503180]);
			eventList.Willy.push([6, 711130]);
		}
		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			eventList.Gus.push([5, 980558]);
			// This event does not require 2 hearts, but getting into the room does
			eventList.Caroline.push([2, 719926]);
			// 14-Heart spouse events. Many have multiple parts; to preserve their proper order,
			//  we will use 14.2, 14.3, etc. even though it the requirements are exactly 14
			eventList.Abigail.push([14, 6963327]);
			eventList.Emily.push([14.1, 3917600], [14.2, 3917601]);
			eventList.Haley.push([14.1, 6184643], [14.2, 8675611], [14.3, 6184644]);
			eventList.Leah.push([14.1, 3911124], [14.2, 3091462]);
			eventList.Maru.push([14.1, 3917666], [14.2, 5183338]);
			eventList.Penny.push([14.1, 4325434], [14.2, 4324303]);
			eventList.Alex.push([14.1, 3917587], [14.2, 3917589], [14.3, 3917590]);
			eventList.Elliott.push([14.1, 3912125], [14.2, 3912132]);
			eventList.Harvey.push([14, 3917626]);
			eventList.Sam.push(
				[14.1, 3918600],
				[14.2, 3918601],
				[14.3, 3918602],
				[14.4, 3918603]
			);
			eventList.Sebastian.push([14.1, 9333219], [14.2, 9333220]);
			eventList.Shane.push([14.1, 3917584], [14.2, 3917585], [14.3, 3917586]);
			eventList.Krobus.push([14, 7771191]);
		}

		// Search locations for NPCs. They could be hardcoded, but this is somewhat more mod-friendly and it also
		// lets us to grab children and search out relationship status for version 1.2 saves.
		$(xmlDoc)
			.find("locations > GameLocation")
			.each(function () {
				$(this)
					.find("characters > NPC")
					.each(function () {
						var type = $(this).attr(saveInfo.ns_prefix + ":type");
						var who = $(this).find("name").html();
						// Filter out animals and monsters
						if (ignore.hasOwnProperty(type) || ignore.hasOwnProperty(who)) {
							return;
						}
						npc[who] = {};
						npc[who].isDatable = $(this).find("datable").text() === "true";
						npc[who].isGirl = $(this).find("gender").text() === "1";
						npc[who].isChild = type === "Child";
						if (compareSemVer(saveInfo.version, "1.3") < 0) {
							if ($(this).find("divorcedFromFarmer").text() === "true") {
								npc[who].relStatus = "Divorciado(a)";
							} else if (countdown > 0 && who === spouse.slice(0, -7)) {
								npc[who].relStatus = "Noivado";
							} else if ($(this).find("daysMarried").text() > 0) {
								npc[who].relStatus = "Casado(a)";
							} else if ($(this).find("datingFarmer").text() === "true") {
								npc[who].relStatus = "Namorando";
							} else {
								npc[who].relStatus = "Amigo(a)";
							}
						}
					});
			});
		table[0] = parsePlayerSocial(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			ignore,
			npc,
			eventList,
			countdown,
			daysPlayed
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(
							parsePlayerSocial(
								this,
								saveInfo,
								ignore,
								npc,
								eventList,
								countdown,
								daysPlayed
							)
						);
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerSocial(
		player,
		saveInfo,
		ignore,
		npc,
		eventList,
		countdown,
		daysPlayed
	) {
		var output = "",
			table = [],
			count_5h = 0,
			count_10h = 0,
			points = {},
			list_fam = [],
			list_bach = [],
			list_other = [],
			list_poly = [],
			farmer = $(player).children("name").html(),
			spouse = $(player).children("spouse").html(),
			dumped_Girls = 0,
			dumped_Guys = 0,
			hasSpouseStardrop = false,
			eventsSeen = {},
			hasNPCSpouse = false,
			hasPamHouse = false,
			hasCompletedIntroductions = true,
			list_intro = [],
			polyamory = {
				"All Bachelors": [195013, 195099],
				"All Bachelorettes": [195012, 195019],
			};
		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			$(player)
				.find("activeDialogueEvents > item")
				.each(function () {
					var which = $(this).find("key > string").text();
					var num = Number($(this).find("value > int").text());
					if (which === "dumped_Girls") {
						dumped_Girls = num;
					} else if (which === "dumped_Guys") {
						dumped_Guys = num;
					}
				});
			$(player)
				.find("friendshipData > item")
				.each(function () {
					var who = $(this).find("key > string").html();
					if (ignore.hasOwnProperty(who)) {
						return;
					}
					var num = Number($(this).find("value > Friendship > Points").text());
					if (num >= 2500) {
						count_10h++;
					}
					if (num >= 1250) {
						count_5h++;
					}
					points[who] = num;
					if (!npc.hasOwnProperty(who)) {
						// This shouldn't happen
						npc[who] = { isDatable: false, isGirl: false, isChild: false };
					}
					npc[who].relStatus = $(this)
						.find("value > Friendship > Status")
						.html();
					var isRoommate =
						$(this).find("value > Friendship > RoommateMarriage").text() ===
						"true";
					if (npc[who].relStatus === "Married" && isRoommate) {
						npc[who].relStatus = "Roommate";
					}
				});
		} else {
			$(player)
				.find("friendships > item")
				.each(function () {
					var who = $(this).find("key > string").html();
					var num = Number(
						$(this).find("value > ArrayOfInt > int").first().text()
					);
					if (num >= 2500) {
						count_10h++;
					}
					if (num >= 1250) {
						count_5h++;
					}
					points[who] = num;
				});
			if (countdown > 0) {
				spouse = spouse.slice(0, -7);
			}
		}

		$(player)
			.find("eventsSeen > int")
			.each(function () {
				eventsSeen[$(this).text()] = 1;
			});
		$(player)
			.find("mailReceived > string")
			.each(function () {
				if ($(this).text() === "CF_Spouse") {
					hasSpouseStardrop = true;
				}
				if ($(this).text() === "pamHouseUpgrade") {
					hasPamHouse = true;
				}
			});
		var eventCheck = function (arr, who) {
			var seen = false;
			var neg = "no";
			// Note we are altering eventInfo from parent function
			String(arr[1])
				.split("|")
				.forEach(function (e) {
					if (eventsSeen.hasOwnProperty(e)) {
						seen = true;
					}
				});
			// checando por eventos que podem ser perdidos permanentemente; primeiro é Clint 6H, segundo é Sam 3H
			// Penny 4H e 6H adicionados se houve upgrade na casa da Pam.
			if (
				(arr[1] === 101 &&
					(eventsSeen.hasOwnProperty(2123243) ||
						eventsSeen.hasOwnProperty(2123343))) ||
				(arr[1] === 733330 && daysPlayed > 84) ||
				(arr[1] === 35 && hasPamHouse) ||
				(arr[1] === 36 && hasPamHouse)
			) {
				neg = "imp";
			}
			// 10-heart events will be tagged impossible if there is no bouquet.
			if (
				arr[0] == 10 &&
				npc[who].isDatable &&
				npc[who].relStatus == "Amigável"
			) {
				neg = "imp";
			}
			// 14-heart events will be tagged impossible if the player is married to someone else.
			if (arr[0] >= 14 && who !== spouse) {
				neg = "imp";
			}
			// Now we are hardcoding 2 events that involve multiple NPCs too.
			var extra = "";
			if (arr[1] === 3910979) {
				extra = " (Jas &amp; Vincent)";
			} else if (arr[1] === 639373) {
				extra = " (Lewis &amp; Marnie)";
			}
			eventInfo +=
				' [<span class="ms_' +
				(seen ? "yes" : neg) +
				'">' +
				arr[0] +
				"&#x2665;" +
				extra +
				"</span>]";
		};
		for (var who in npc) {
			// Overriding status for the confrontation events
			if (dumped_Girls > 0 && npc[who].isDatable && npc[who].isGirl) {
				npc[who].relStatus = "Angry (" + dumped_Girls + " more day(s))";
			} else if (dumped_Guys > 0 && npc[who].isDatable && !npc[who].isGirl) {
				npc[who].relStatus = "Angry (" + dumped_Guys + " more day(s))";
			}
			var pts = 0;
			if (points.hasOwnProperty(who)) {
				pts = points[who];
			} else {
				npc[who].relStatus = "não encontrado";
			}
			var hearts = Math.floor(pts / 250);
			var entry = "<li>";
			entry += npc[who].isChild
				? who + " (" + wikify("Filho", "Crianças") + ")"
				: wikify(who);
			entry +=
				": " +
				npc[who].relStatus +
				", " +
				hearts +
				"&#x2665; (" +
				pts +
				" pontos) -- ";

			// Check events
			// We want to only make an Event list item if there are actually events for this NPC.
			var eventInfo = "";
			if (eventList.hasOwnProperty(who)) {
				if (eventList[who].length > 0) {
					eventInfo += '<ul class="compact"><li>Evento(s): ';
					eventList[who].sort(function (a, b) {
						return a[0] - b[0];
					});
					eventList[who].forEach(function (a) {
						eventCheck(a, who);
					});
					eventInfo += "</li></ul>";
				}
			}
			var max;
			if (who === spouse) {
				// Spouse Stardrop threshold is 3375 from StardewValley.NPC.checkAction(); 3500 (14 hearts) in 1.4
				max = hasSpouseStardrop ? 3250 : 3375;
				if (compareSemVer(saveInfo.version, "1.4") >= 0) {
					max = 3500;
				}
				entry +=
					pts >= max
						? '<span class="ms_yes">MAX (ainda pode diminuir)</span></li>'
						: '<span class="ms_no">precisa mais ' +
						(max - pts) +
						" </span></li>";
				hasNPCSpouse = true;
				list_fam.push(entry + eventInfo);
			} else if (npc[who].isDatable) {
				max = 2000;
				if (npc[who].relStatus === "Dating") {
					max = 2500;
				}
				entry +=
					pts >= max
						? '<span class="ms_yes">MAX</span></li>'
						: '<span class="ms_no">precisa mais ' +
						(max - pts) +
						" </span></li>";
				list_bach.push(entry + eventInfo);
			} else {
				entry +=
					pts >= 2500
						? '<span class="ms_yes">MAX</span></li>'
						: '<span class="ms_no">precisa mais ' +
						(2500 - pts) +
						" </span></li>";
				if (npc[who].isChild) {
					list_fam.push(entry + eventInfo);
				} else {
					list_other.push(entry + eventInfo);
				}
			}
		}
		if (saveInfo.version >= 1.3) {
			for (var who in polyamory) {
				// Rather than trying to force these to work in the eventCheck function, we make a new checker.
				var seen = false;
				var span = "não";
				var entry = "<li>" + who;
				for (var id = 0; id < polyamory[who].length; id++) {
					if (eventsSeen.hasOwnProperty(polyamory[who][id])) {
						seen = true;
					}
				}
				if (seen) {
					span = "sim";
				} else if (hasNPCSpouse) {
					span = "imp";
				}
				entry += ': [<span class="ms_' + span + '">10&#x2665;</span>]</li>';
				list_poly.push(entry);
			}
		}
		$(player)
			.find(
				"questLog > [" +
				saveInfo.ns_prefix +
				"\\:type='SocializeQuest'] > whoToGreet > string"
			)
			.each(function () {
				list_intro.push($(this).text());
				hasCompletedIntroductions = false;
			});

		output +=
			'<span class="result">' +
			farmer +
			" tem " +
			count_5h +
			' relacionamento de 5+ corações.</span><ul class="ach_list">\n';
		output += "<li>";
		output +=
			count_5h >= 1
				? getAchieveString("A New Friend", "5 &#x2665; com uma pessoa", 1)
				: getAchieveString("A New Friend", "5 &#x2665; com uma pessoa", 0) +
				(1 - count_5h) +
				" ";
		output += "</li>\n<li>";
		output +=
			count_5h >= 4
				? getAchieveString("Cliques", "5 &#x2665; com 4 pessoas", 1)
				: getAchieveString("Cliques", "5 &#x2665; com 4 pessoas", 0) +
				(4 - count_5h) +
				" \n";
		output += "</li>\n<li>";
		output +=
			count_5h >= 10
				? getAchieveString("Networking", "5 &#x2665; com 10 pessoas", 1)
				: getAchieveString("Networking", "5 &#x2665; com 10 pessoas", 0) +
				(10 - count_5h) +
				" ";
		output += "</li>\n<li>";
		output +=
			count_5h >= 20
				? getAchieveString("Popular", "5 &#x2665; com 20 pessoas", 1)
				: getAchieveString("Popular", "5 &#x2665; com 20 pessoas", 0) +
				(20 - count_5h) +
				" ";
		output += "</li></ul>\n";
		table.push(output);
		output =
			'<span class="result">' +
			farmer +
			" tem " +
			count_10h +
			' relacionamento de 10+ corações.</span><ul class="ach_list">\n';
		output += "<li>";
		output +=
			count_10h >= 1
				? getAchieveString("Best Friends", "10 &#x2665; com uma pessoa", 1)
				: getAchieveString("Best Friends", "10 &#x2665; com uma pessoa", 0) +
				(1 - count_10h) +
				" ";
		output += "</li>\n<li>";
		output +=
			count_10h >= 8
				? getAchieveString("The Beloved Farmer", "10 &#x2665; com 8 pessoas", 1)
				: getAchieveString(
					"The Beloved Farmer",
					"10 &#x2665; com 8 pessoas",
					0
				) +
				(8 - count_10h) +
				" ";
		output += "</li></ul>\n";
		table.push(output);
		//HERE getMilestoneString('House fully upgraded', 1 <ul class="outer">
		output =
			'<span class="result">' +
			farmer +
			" tem " +
			(hasCompletedIntroductions ? "" : "não ") +
			'encontrado todos na cidade.</span><ul class="ach_list">\n';
		output += "<li>";
		output +=
			list_intro.length == 0
				? getMilestoneString(
					'Complete a missão <span class="ach">Apresentações</span>',
					1
				)
				: getMilestoneString(
					'Complete a missão <span class="ach">Apresentações</span>',
					0
				) +
				list_intro.length +
				" encontrar ainda";
		output += "</li></ul>\n";
		if (list_intro.length > 0) {
			output +=
				'<span class="need">Pessoas que faltam encontrar<ol><li>' +
				list_intro.sort().join("</li><li>") +
				"</li></ol></span>\n";
		}
		table.push(output);
		output =
			'<span class="result">Nível de amizade conquistado por ' +
			farmer +
			' com cada pessoa até o momento.</span><ul class="outer">';
		if (list_fam.length > 0) {
			output +=
				'<li>Família (inclui todos os filhos dos jogadores)<ol class="compact">' +
				list_fam.sort().join("") +
				"</ol></li>\n";
		}
		if (list_bach.length > 0) {
			output +=
				'<li>Possíveis de Casar<ol class="compact">' +
				list_bach.sort().join("") +
				"</ol></li>\n";
		}
		if (list_poly.length > 0) {
			output +=
				'<li>Eventos Poliamorosos<ol class="compact">' +
				list_poly.sort().join("") +
				"</ol></li>\n";
		}
		if (list_other.length > 0) {
			output +=
				'<li>Outras Pessoas<ol class="compact">' +
				list_other.sort().join("") +
				"</ol></li>\n";
		}
		output += "</ul>\n";
		table.push(output);
		return table;
	}

	function parseFamily(xmlDoc, saveInfo) {
		var output = "<h3>Casa e Família</h3>\n",
			table = [],
			wedding = Number($(xmlDoc).find("countdownToWedding").text());

		table[0] = parsePlayerFamily(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			wedding,
			true
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerFamily(this, saveInfo, wedding, false));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerFamily(player, saveInfo, wedding, isHost) {
		var output = "",
			table = [],
			needs = [],
			count = 0,
			maxUpgrades = isHost ? 3 : 2,
			houseType = isHost ? "Casa" : "Cabana",
			farmer = $(player).children("name").html(),
			spouse = $(player).children("spouse").html(),
			id = $(player).children("UniqueMultiplayerID").text(),
			children = "(Nenhum(a))",
			child_name = [],
			houseUpgrades = Number($(player).children("houseUpgradeLevel").text());
		if (typeof id === "undefined" || id === "") {
			id = "0";
		}
		if (typeof spouse !== "undefined" && spouse.length > 0) {
			if (wedding > 0 && compareSemVer(saveInfo.version, "1.3") < 0) {
				spouse = spouse.slice(0, -7);
			}
			count++;
		} else if (saveInfo.partners.hasOwnProperty(id)) {
			spouse = saveInfo.players[saveInfo.partners[id]];
			count++;
		} else {
			spouse = "(Nenhum(a))";
			needs.push("esposo(a)");
		}
		// Technically, we should be searching the Friendship data for RoommateMarriage here, but for now we are hardcoding
		var title = "esposo(a)";
		if (spouse === "Krobus") {
			title = "Colega de Quarto";
		}
		output +=
			'<span class="result">' +
			farmer +
			" é " +
			title +
			" de " +
			spouse +
			(wedding ? " -- casamento em " + wedding + " dia(s)" : "") +
			"</span><br />\n";
		if (
			saveInfo.children.hasOwnProperty(id) &&
			saveInfo.children[id].length > 0
		) {
			child_name = saveInfo.children[id];
			count += child_name.length;
		} else if (
			saveInfo.partners.hasOwnProperty(id) &&
			saveInfo.children.hasOwnProperty(saveInfo.partners[id]) &&
			saveInfo.children[saveInfo.partners[id]].length > 0
		) {
			child_name = saveInfo.children[saveInfo.partners[id]];
			count += child_name.length;
		} else {
			$(player)
				.parent()
				.find(
					"[" +
					saveInfo.ns_prefix +
					"\\:type='" +
					houseType +
					"'] NPC[" +
					saveInfo.ns_prefix +
					"\\:type='Child']"
				)
				.each(function () {
					count++;
					child_name.push($(this).find("name").html());
				});
		}
		if (child_name.length) {
			children = child_name.join(", ");
			if (child_name.length === 1) {
				needs.push("1 filho(a)");
			}
		} else {
			needs.push("2 filhos");
		}
		output +=
			'<span class="result">' +
			farmer +
			" é mãe/pai de " +
			children +
			'</span><ul class="ach_list"><li>\n';
		output +=
			count >= 3
				? getAchieveString("Full House", "Casado(a) + 2 Filhos", 1)
				: getAchieveString("Full House", "Casado(a) + 2 Filhos", 0) +
				needs.join(" e ");
		output += "</li></ul>\n";
		table.push(output);
		output =
			'<span class="result">' +
			houseType +
			" melhorada " +
			houseUpgrades +
			" vez(es) de ";
		output +=
			maxUpgrades + ' possível(eis).</span><br /><ul class="ach_list">\n';
		output += "<li>";
		output +=
			houseUpgrades >= 1
				? getAchieveString("Moving Up", "1 melhoria", 1)
				: getAchieveString("Moving Up", "1 melhoria", 0) +
				(1 - houseUpgrades) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			houseUpgrades >= 2
				? getAchieveString("Living Large", "2 melhorias", 1)
				: getAchieveString("Living Large", "2 melhorias", 0) +
				(2 - houseUpgrades) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			houseUpgrades >= maxUpgrades
				? getMilestoneString("Todas as melhorias", 1)
				: getMilestoneString("Todas as melhorias", 0) +
				(maxUpgrades - houseUpgrades) +
				" ainda";
		output += "</li></ul>\n";
		table.push(output);
		return table;
	}

	function parseCooking(xmlDoc, saveInfo) {
		var output = "<h3>Cozinhando</h3>\n",
			table = [],
			recipes = {
				194: "Fried Egg",
				195: "Omelet",
				196: "Salad",
				197: "Cheese Cauliflower",
				198: "Baked Fish",
				199: "Parsnip Soup",
				200: "Vegetable Medley",
				201: "Complete Breakfast",
				202: "Fried Calamari",
				203: "Strange Bun",
				204: "Lucky Lunch",
				205: "Fried Mushroom",
				206: "Pizza",
				207: "Bean Hotpot",
				208: "Glazed Yams",
				209: "Carp Surprise",
				210: "Hashbrowns",
				211: "Pancakes",
				212: "Salmon Dinner",
				213: "Fish Taco",
				214: "Crispy Bass",
				215: "Pepper Poppers",
				216: "Bread",
				218: "Tom Kha Soup",
				219: "Trout Soup",
				220: "Chocolate Cake",
				221: "Pink Cake",
				222: "Rhubarb Pie",
				223: "Cookie",
				224: "Spaghetti",
				225: "Fried Eel",
				226: "Spicy Eel",
				227: "Sashimi",
				228: "Maki Roll",
				229: "Tortilla",
				230: "Red Plate",
				231: "Eggplant Parmesan",
				232: "Rice Pudding",
				233: "Ice Cream",
				234: "Blueberry Tart",
				235: "Autumn's Bounty",
				236: "Pumpkin Soup",
				237: "Super Meal",
				238: "Cranberry Sauce",
				239: "Stuffing",
				240: "Farmer's Lunch",
				241: "Survival Burger",
				242: "Dish O' The Sea",
				243: "Miner's Treat",
				244: "Roots Platter",
				456: "Algae Soup",
				457: "Pale Broth",
				604: "Plum Pudding",
				605: "Artichoke Dip",
				606: "Stir Fry",
				607: "Roasted Hazelnuts",
				608: "Pumpkin Pie",
				609: "Radish Salad",
				610: "Fruit Salad",
				611: "Blackberry Cobbler",
				612: "Cranberry Candy",
				618: "Bruschetta",
				648: "Coleslaw",
				649: "Fiddlehead Risotto",
				651: "Poppyseed Muffin",
				727: "Chowder",
				728: "Fish Stew",
				729: "Escargot",
				730: "Lobster Bisque",
				731: "Maple Bar",
				732: "Crab Cakes"
			},
			recipeTranslate = {
				"Cheese Cauli.": "Cheese Cauliflower",
				Cookies: "Cookie",
				"Cran. Sauce": "Cranberry Sauce",
				"Dish o' The Sea": "Dish O' The Sea",
				"Eggplant Parm.": "Eggplant Parmesan",
				"Vegetable Stew": "Vegetable Medley",
			},
			id,
			recipeReverse = {};

		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			recipes[733] = "Shrimp Cocktail";
			recipes[253] = "Triple Shot Espresso";
			recipes[265] = "Seafoam Pudding";
		}
		for (id in recipes) {
			if (recipes.hasOwnProperty(id)) {
				recipeReverse[recipes[id]] = id;
			}
		}

		table[0] = parsePlayerCooking(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			recipes,
			recipeTranslate,
			recipeReverse
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(
							parsePlayerCooking(
								this,
								saveInfo,
								recipes,
								recipeTranslate,
								recipeReverse
							)
						);
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerCooking(
		player,
		saveInfo,
		recipes,
		recipeTranslate,
		recipeReverse
	) {
		/* cookingRecipes is keyed by name, but recipesCooked is keyed by ObjectInformation ID.
		 * Also, some cookingRecipes names are different from the names in ObjectInformation (e.g. Cookies vs Cookie) */
		var output = "",
			recipe_count = Object.keys(recipes).length,
			known = {},
			known_count = 0,
			crafted = {},
			craft_count = 0,
			need_k = [],
			need_c = [],
			mod_known = 0,
			mod_craft = 0,
			id,
			r;

		$(player)
			.find("cookingRecipes > item")
			.each(function () {
				var id = $(this).find("key > string").text(),
					num = Number($(this).find("value > int").text());
				if (recipeTranslate.hasOwnProperty(id)) {
					id = recipeTranslate[id];
				}
				if (recipeReverse.hasOwnProperty(id)) {
					known[id] = num;
					known_count++;
				} else {
					mod_known++;
				}
			});
		$(player)
			.find("recipesCooked > item")
			.each(function () {
				var id = $(this).find("key > int").text(),
					num = Number($(this).find("value > int").text());
				if (recipes.hasOwnProperty(id)) {
					if (num > 0) {
						crafted[recipes[id]] = num;
						craft_count++;
					}
				} else {
					if (num > 0) {
						mod_craft++;
					}
				}
			});

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" cozinhou " +
			craft_count +
			" e conhece " +
			known_count +
			" de " +
			recipe_count +
			(mod_known > 0 ? " básica" : "") +
			" receita.</span>\n";
		if (mod_known > 0) {
			output +=
				'<br /><span class="result"><span class="note">' +
				$(player).children("name").html() +
				" também cozinhou " +
				mod_craft +
				" e conhece " +
				mod_known +
				" receitas (total indisponível).</span></span>\n";
		}
		output += '<ul class="ach_list"><li>';
		output +=
			craft_count + mod_craft >= 10
				? getAchieveString("Cook", "cozinhe 10 receitas diferentes", 1)
				: getAchieveString("Cook", "cozinhe 10 receitas diferentes", 0) +
				(10 - craft_count - mod_craft) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			craft_count + mod_craft >= 25
				? getAchieveString("Sous Chef", "cozinhe 25 receitas diferentes", 1)
				: getAchieveString("Sous Chef", "cozinhe 25 receitas diferentes", 0) +
				(25 - craft_count - mod_craft) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			craft_count + mod_craft >= recipe_count + mod_known
				? getAchieveString("Gourmet Chef", "cozinhe todas as receitas", 1)
				: getAchieveString("Gourmet Chef", "cozinhe todas as receitas", 0) +
				(mod_known > 0 ? "ainda " : "") +
				(recipe_count + mod_known - craft_count - mod_craft) +
				" ";
		output += "</li></ul>\n";
		// We are assuming it is impossible to craft something without knowing the recipe.
		if (craft_count + mod_craft < recipe_count + mod_known) {
			for (id in recipes) {
				if (recipes.hasOwnProperty(id)) {
					r = recipes[id];
					if (!known.hasOwnProperty(r)) {
						need_k.push("<li>" + wikify(r) + "</li>");
					} else if (!crafted.hasOwnProperty(r)) {
						need_c.push("<li>" + wikify(r) + "</li>");
					}
				}
			}
			output += '<span class="need">Falta cozinhar:<ul>';
			if (need_c.length > 0) {
				output +=
					"<li>Receitas Conhecidas<ol>" +
					need_c.sort().join("") +
					"</ol></li>\n";
			}
			if (need_k.length > 0) {
				output +=
					"<li>Receitas Desconhecidas<ol>" +
					need_k.sort().join("") +
					"</ol></li>\n";
			}
			if (mod_known > 0) {
				if (mod_craft >= mod_known) {
					output += "<li>Possivelmente receitas adicionais de mods</li>";
				} else {
					output +=
						"<li>Mais ao menos " +
						(mod_known - mod_craft) +
						" receita de mod</li>";
				}
			}
			output += "</ul></span>\n";
		}
		return [output];
	}

	function parseCrafting(xmlDoc, saveInfo) {
		/* Manually listing all crafting recipes in the order they appear on http://stardewvalleywiki.com/Crafting
		 * A translation is needed again because of text mismatch. */
		var output = "<h3>Artesanato</h3>\n",
			table = [],
			recipes = [
				"Cherry Bomb", "Bomb", "Mega Bomb",
				"Gate", "Wood Fence", "Stone Fence", "Iron Fence", "Hardwood Fence",
				"Sprinkler", "Quality Sprinkler", "Iridium Sprinkler",
				"Mayonnaise Machine", "Bee House", "Preserves Jar", "Cheese Press", "Loom", "Keg", "Oil Maker", "Cask",
				"Basic Fertilizer", "Quality Fertilizer", "Speed-Gro", "Deluxe Speed-Gro",
				"Basic Retaining Soil", "Quality Retaining Soil",
				"Wild Seeds (Sp)", "Wild Seeds (Su)", "Wild Seeds (Fa)", "Wild Seeds (Wi)", "Ancient Seeds",
				"Wood Floor", "Straw Floor", "Weathered Floor", "Crystal Floor", "Stone Floor",
				"Wood Path", "Gravel Path", "Cobblestone Path", "Stepping Stone Path", "Crystal Path",
				"Spinner", "Trap Bobber", "Cork Bobber", "Treasure Hunter", "Dressed Spinner", "Barbed Hook",
				"Magnet", "Bait", "Wild Bait", "Crab Pot",
				"Sturdy Ring", "Warrior Ring", "Ring of Yoba", "Iridium Band",
				"Field Snack", "Life Elixir", "Oil of Garlic",
				"Torch", "Campfire", "Wooden Brazier", "Stone Brazier", "Gold Brazier", "Carved Brazier", "Stump Brazier",
				"Barrel Brazier", "Skull Brazier", "Marble Brazier", "Wood Lamp-post", "Iron Lamp-post", "Jack-O-Lantern",
				"Chest", "Furnace", "Scarecrow", "Seed Maker", "Staircase", "Explosive Ammo", "Transmute (Fe)", "Transmute (Au)",
				"Crystalarium", "Charcoal Kiln", "Lightning Rod", "Recycling Machine", "Tapper", "Worm Bin",
				"Slime Egg-Press", "Slime Incubator", "Warp Totem: Beach", "Warp Totem: Mountains", "Warp Totem: Farm",
				"Rain Totem", "Tub o' Flowers", "Wicked Statue", "Flute Block", "Drum Block"
			],
			recipeTranslate = {
				"Oil Of Garlic": "Oil of Garlic",
			};

		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			// Wedding Ring is specifically excluded in StardewValley.Stats.checkForCraftingAchievments() so it is not listed here.
			recipes.push('Wood Sign', 'Stone Sign', 'Garden Pot');
		}

		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			recipes.push('Brick Floor', 'Grass Starter', 'Deluxe Scarecrow', 'Mini-Jukebox', 'Tree Fertilizer', 'Tea Sapling', 'Warp Totem: Desert'
			);
		}
		table[0] = parsePlayerCrafting(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			recipes,
			recipeTranslate
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(
							parsePlayerCrafting(this, saveInfo, recipes, recipeTranslate)
						);
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerCrafting(player, saveInfo, recipes, recipeTranslate) {
		var output = "",
			recipe_count,
			known = {},
			known_count = 0,
			craft_count = 0,
			need_k = [],
			need_c = [],
			mod_known = 0,
			mod_craft = 0,
			id,
			r;

		recipe_count = recipes.length;
		$(player)
			.find("craftingRecipes > item")
			.each(function () {
				var id = $(this).find("key > string").text(),
					num = Number($(this).find("value > int").text());
				if (recipeTranslate.hasOwnProperty(id)) {
					id = recipeTranslate[id];
				}
				if (id === "Wedding Ring") {
					return true;
				}
				if (recipes.indexOf(id) === -1) {
					mod_known++;
					if (num > 0) {
						mod_craft++;
					}
					return true;
				}
				known[id] = num;
				known_count++;
				if (num > 0) {
					craft_count++;
				} else {
					need_c.push("<li>" + wikify(id) + "</li>");
				}
			});

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" craftou " +
			craft_count +
			" e conhece " +
			known_count +
			" de " +
			recipe_count +
			" receitas.</span>\n";
		if (mod_known > 0) {
			output +=
				'<br /><span class="result"><span class="note">' +
				$(player).children("name").html() +
				" também já craftou " +
				mod_craft +
				" e conhece " +
				mod_known +
				" receitas mod (total indisponível).</span></span>\n";
		}
		output += '<ul class="ach_list"><li>';
		output +=
			craft_count + mod_craft >= 15
				? getAchieveString("D.I.Y.", "craftar 15 items diferentes", 1)
				: getAchieveString("D.I.Y.", "craftar 15 items diferentes", 0) +
				(15 - craft_count - mod_craft) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			craft_count + mod_craft >= 30
				? getAchieveString("Artisan", "craftar 30 items diferentes", 1)
				: getAchieveString("Artisan", "craftar 30 items diferentes", 0) +
				(30 - craft_count - mod_craft) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			craft_count + mod_craft >= recipe_count + mod_known
				? getAchieveString("Craft Master", "craftar todos os items", 1)
				: getAchieveString("Craft Master", "craftar todos os items", 0) +
				(mod_known > 0 ? "ainda " : "") +
				(recipe_count + mod_known - craft_count - mod_craft) +
				" ";
		output += "</li></ul>\n";
		if (craft_count + mod_craft < recipe_count + mod_known) {
			output += '<span class="need">Falta Craftar:<ul>';

			if (need_c.length > 0) {
				output +=
					"<li>Receitas Conhecidas<ol>" +
					need_c.sort().join("") +
					"</ol></li>\n";
			}

			if (known_count < recipe_count) {
				need_k = [];
				for (id in recipes) {
					if (recipes.hasOwnProperty(id)) {
						r = recipes[id];
						if (!known.hasOwnProperty(r)) {
							need_k.push("<li>" + wikify(r) + "</li>");
						}
					}
				}
				output +=
					"<li>Receitas Desconhecidas<ol>" +
					need_k.sort().join("") +
					"</ol></li>";
			}
			if (mod_known > 0) {
				if (mod_craft >= mod_known) {
					output += "<li>Possivelmente receita adicional de mods</li>";
				} else {
					output +=
						"<li>Mais ao menos " +
						(mod_known - mod_craft) +
						" receitas mod</li>";
				}
			}
			output += "</ul></span>\n";
		}
		return [output];
	}

	function parseFishing(xmlDoc, saveInfo) {
		var output = "<h3>Pescando</h3>\n",
			table = [],
			recipes = {
				// "Fish" category
				152: "Algas marinhas",
				153: "Algas verdes",
				157: "Algas brancas",
				// "Fish -4" category
				128: "Baiacu",
				129: "Anchova",
				130: "Atum",
				131: "Sardinha",
				132: "Brema",
				136: "Achigã",
				137: "Achigã-pequeno",
				138: "Truta arco-íris",
				139: "Salmão",
				140: "Picão-verde",
				141: "Perca",
				142: "Carpa",
				143: "Bagre",
				144: "Lúcio",
				145: "Peixe-sol",
				146: "Salmonete",
				147: "Arenque",
				148: "Enguia",
				149: "Polvo",
				150: "Cioba",
				151: "Lula",
				154: "Pepino-do-mar",
				155: "Superpepino",
				156: "Peixe-fantasma",
				158: "Peixe-pedra",
				159: "Peixe-carmim",
				160: "Tamboril",
				161: "Chione",
				162: "Enguia de lava",
				163: "Lenda",
				164: "Areinha",
				165: "Carpa escorpiônica",
				682: "Carpa mutante",
				698: "Esturjão",
				699: "Salmão híbrido",
				700: "Peixe-gato",
				701: "Tilápia",
				702: "Esquálio",
				704: "Dourado",
				705: "Albacora",
				706: "Alocine",
				707: "Ófis",
				708: "Halibute",
				715: "Lagosta",
				716: "Lagostim",
				717: "Caranguejo",
				718: "Berbigão",
				719: "Mexilhão",
				720: "Camarão",
				721: "Lesma",
				722: "Caramujo",
				723: "Ostra",
				734: "Madeirão",
				775: "Peixe-gelo",
				795: "Salmão nulo",
				796: "Salmão mutante",
			};
		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			recipes[798] = "Lula da Meia-noite";
			recipes[799] = "Peixe Assustador";
			recipes[800] = "Peixe-bolha";
		}
		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			recipes[269] = "Carpa da meia-noite";
			recipes[267] = "Linguado";
		}
		table[0] = parsePlayerFishing(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			recipes
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerFishing(this, saveInfo, recipes));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerFishing(player, saveInfo, recipes) {
		// Much of the logic was ported from the crafting function which is why the variables are weirdly named
		var output = "",
			recipe_count = Object.keys(recipes).length,
			count = 0,
			craft_count = 0, // for fish types
			known = [],
			need = [],
			ignore = {
				// Things you can catch that aren't counted in fishing achieve
				372: 1, // Clam is category "Basic -23"
				308: 1, // Void Mayo can be caught in Witch's Swamp during "Goblin Problems"
				79: 1, // Secret Notes can be caught directly
				797: 1, // Pearl can be caught directly in Night Market Submarine
				191: 1, // Ornate necklace, from secret note quest added in 1.4
				103: 1, // Ancient doll, can be caught on 4 corners once after viewing the "doving" TV easter egg
			},
			id,
			r;

		$(player)
			.find("fishCaught > item")
			.each(function () {
				var id = $(this).find("key > int").text(),
					num = Number($(this).find("value > ArrayOfInt > int").first().text());
				if (!ignore.hasOwnProperty(id) && num > 0) {
					craft_count++;
					// We are adding up the count ourselves, but the total is also stored in (stats > fishCaught) and (stats > FishCaught)
					count += num;
					known[recipes[id]] = num;
				}
			});

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" pescou " +
			craft_count +
			" de " +
			recipe_count +
			" peixes diferentes (" +
			count +
			' total)</span><ul class="ach_list">\n';
		output += "<li>";
		output +=
			count >= 100
				? getAchieveString("Mother Catch", "pesque 100 peixes no total", 1)
				: getAchieveString("Mother Catch", "pesque 100 peixes no total", 0) +
				(100 - count) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			craft_count >= 10
				? getAchieveString("Fisherman", "pesque 10 peixes diferentes", 1)
				: getAchieveString("Fisherman", "pesque 10 peixes diferentes", 0) +
				(10 - craft_count) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			craft_count >= 24
				? getAchieveString("Ol' Mariner", "pesque 24 peixes diferentes", 1)
				: getAchieveString("Ol' Mariner", "pesque 24 peixes diferentes", 0) +
				(24 - craft_count) +
				" ainda";
		output += "</li>\n<li>";
		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			output +=
				craft_count >= recipe_count
					? getAchieveString(
						"Master Angler",
						"pesque todos os tipos de peixes",
						1
					)
					: getAchieveString(
						"Master Angler",
						"pesque todos os tipos de peixes",
						0
					) +
					(recipe_count - craft_count) +
					" ainda";
		} else {
			output +=
				craft_count >= Math.min(59, recipe_count)
					? getAchieveString("Master Angler", "catch 59 different fish", 1)
					: getAchieveString("Master Angler", "catch 59 different fish", 0) +
					(Math.min(59, recipe_count) - craft_count) +
					" more";
			if (compareSemVer(saveInfo.version, "1.3") === 0) {
				output += "</li>\n<li>";
				output +=
					craft_count >= recipe_count
						? getMilestoneString("pesque todos os tipos de peixes", 1)
						: getMilestoneString("pesque todos os tipos de peixes", 0) +
						(recipe_count - craft_count) +
						" ainda";
			}
		}
		output += "</li></ul>\n";
		if (craft_count < recipe_count) {
			need = [];
			for (id in recipes) {
				if (recipes.hasOwnProperty(id)) {
					r = recipes[id];
					if (!known.hasOwnProperty(r)) {
						need.push("<li>" + wikify(r) + "</li>");
					}
				}
			}
			output +=
				'<span class="need">Falta Pescar:<ol>' +
				need.sort().join("") +
				"</ol></span>\n";
		}
		return [output];
	}

	function parseBasicShipping(xmlDoc, saveInfo) {
		/* Basic shipping achieve details are not easy to pull from decompiled source -- lots of filtering of
		 * ObjectInformation in StardewValley.Utility.hasFarmerShippedAllItems() with additional calls to
		 * StardewValley.Object.isPotentialBasicShippedCategory().
		 * For now, we will simply assume it matches the Collections page and hardcode everything there
		 * using wiki page http://stardewvalleywiki.com/Collections as a guideline. */
		var output = "<h3>Remessas Básicas</h3>\n",
			table = [],
			recipes = {
				16: "Raiz-forte",
				18: "Narciso",
				20: "Alho-poró",
				22: "Dente-de-leão",
				24: "Chirívia",
				78: "Cenoura subterrânea",
				88: "Coco",
				90: "Fruto do cacto",
				92: "Seiva",
				174: "Ovo grande",
				176: "Ovo",
				180: "Ovo",
				182: "Ovo grande",
				184: "Leite",
				186: "Leite grande",
				188: "Vagem",
				190: "Couve-flor",
				192: "Batata",
				248: "Alho",
				250: "Couve",
				252: "Ruibarbo",
				254: "Melão",
				256: "Tomate",
				257: "Morel",
				258: "Mirtilo",
				259: "Broto de samambaia",
				260: "Pimenta quente",
				262: "Trigo",
				264: "Rabanete",
				266: "Repolho roxo",
				268: "Carambola",
				270: "Milho",
				272: "Berinjela",
				274: "Alcachofra",
				276: "Abóbora",
				278: "Couve chinesa",
				280: "Inhame",
				281: "Cantarelo",
				282: "Oxicoco",
				283: "Azevinho",
				284: "Beterraba",
				296: "Amora silvestre",
				300: "Amaranto",
				303: "Pale Ale",
				304: "Lúpulo",
				305: "Ovo nulo",
				306: "Maionese",
				307: "Maionese de ovo de pato",
				308: "Maionese nula",
				330: "Argila",
				334: "Barra de cobre",
				335: "Barra de ferro",
				336: "Barra de ouro",
				337: "Barra de irídio",
				338: "Quartzo refinado",
				340: "Mel",
				342: "Geléias e Picles",
				344: "Geléias e Picles",
				346: "Cerveja",
				348: "Vinho",
				350: "Suco",
				372: "Concha",
				376: "Papoula",
				378: "Minério de cobre",
				380: "Minério de ferro",
				382: "Carvão",
				384: "Minério de ouro",
				386: "Minério de irídio",
				388: "Madeira",
				390: "Pedra",
				392: "Concha de náutilo",
				393: "Coral",
				394: "Concha arco-íris",
				396: "Café de jardim",
				397: "Ouriço-do-mar",
				398: "Uva",
				399: "Cebolinha",
				400: "Morango",
				402: "Ervilha-de-cheiro",
				404: "Cogumelo comum",
				406: "Ameixa selvagem",
				408: "Avelã",
				410: "Amora",
				412: "Raiz de inverno",
				414: "Fruta de cristal",
				416: "Inhame de neve",
				417: "Cereja de Joia Doce",
				418: "Flor de açafrão",
				420: "Cogumelo vermelho",
				421: "Girassol",
				422: "Cogumelo roxo",
				424: "Queijo",
				426: "Queijo de cabra",
				428: "Tecido",
				430: "Trufa",
				432: "Óleo de trufas",
				433: "Grão de café",
				436: "Leite de cabra",
				438: "Leite grande de cabra",
				440: "Lã",
				442: "Ovo de pata",
				444: "Pena de pato",
				446: "Pé de coelho",
				454: "Fruta antiga",
				459: "Hidromel",
				591: "Tulipa",
				593: "Flor-Miçanga",
				595: "Rosa-de-fada",
				597: "Jasmim-azul",
				613: "Maçã",
				634: "Damasco",
				635: "Laranja",
				636: "Pêssego",
				637: "Romã",
				638: "Cereja",
				684: "Carne de inseto",
				709: "Madeira de lei",
				724: "Xarope de ácer",
				725: "Resina de carvalho",
				726: "Alcatrão de pinho",
				766: "Gosma",
				767: "Asa de morcego",
				768: "Essência solar",
				769: "Essência nula",
				771: "Fibra",
				787: "Conjunto de pilhas",
			};

		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			recipes[807] = "Maionese de Dinossauro";
			recipes[812] = "Ovas";
			recipes[445] = "Caviar";
			recipes[814] = "Tinta de Lula";
			recipes[815] = "Folhas de Chá";
			recipes[447] = "Ovas Maturadas";
			recipes[614] = "Chá Verde";
			recipes[271] = "Arroz não moído";
		}
		table[0] = parsePlayerBasicShipping(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			recipes
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerBasicShipping(this, saveInfo, recipes));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerBasicShipping(player, saveInfo, recipes) {
		// Much of the logic was ported from the crafting function which is why the variables are weirdly named
		var output = "",
			recipe_count = Object.keys(recipes).length,
			crafted = {},
			craft_count = 0,
			need = [],
			id,
			r;

		$(player)
			.find("basicShipped > item")
			.each(function () {
				var id = $(this).find("key > int").text(),
					num = Number($(this).find("value > int").text());
				if (recipes.hasOwnProperty(id) && num > 0) {
					crafted[recipes[id]] = num;
					craft_count++;
				}
			});

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" enviou " +
			craft_count +
			" de " +
			recipe_count +
			' items básicos.</span><ul class="ach_list">\n';
		output += "<li>";
		output +=
			craft_count >= recipe_count
				? getAchieveString("Full Shipment", "envie todos os items", 1)
				: getAchieveString("Full Shipment", "envie todos os items", 0) +
				(recipe_count - craft_count) +
				" ainda";
		output += "</li></ul>\n";
		if (craft_count < recipe_count) {
			need = [];
			for (id in recipes) {
				if (recipes.hasOwnProperty(id)) {
					r = recipes[id];
					if (!crafted.hasOwnProperty(r)) {
						need.push("<li>" + wikify(r) + "</li>");
					}
				}
			}
			output +=
				'<span class="need">Falta Enviar:<ol>' +
				need.sort().join("") +
				"</ol></span>\n";
		}
		return [output];
	}

	function parseCropShipping(xmlDoc, saveInfo) {
		// Relevant IDs were pulled from decompiled source - StardewValley.Stats.checkForShippingAchievments()
		// Note that there are 5 more "crops" for Monoculture than there are for Polyculture
		var output = "<h3>Items Enviados</h3>\n",
			table = [],
			poly_crops = {
				// Some, but not all of "Basic -75" category (All veg except fiddlehead)
				24: "Raiz-forte",
				188: "Vagem",
				190: "Couve-flor",
				192: "Batata",
				248: "Alho",
				250: "Couve",
				256: "Tomate",
				262: "Trigo",
				264: "Rabanete",
				266: "Repolho roxo",
				270: "Milho",
				272: "Berinjela",
				274: "Alcachofra",
				276: "Abóbora",
				278: "Couve chinesa",
				280: "Inhame",
				284: "Beterraba",
				300: "Amaranto",
				304: "Lúpulo",
				// Some, but not all of "Basic -79" category (All fruit except Ancient, tree & forageables)
				252: "Ruibarbo",
				254: "Melão",
				258: "Mirtilo",
				260: "Pimenta quente",
				268: "Carambola",
				282: "Oxicoco",
				398: "Uva",
				400: "Morango",
				// Others
				433: "Grão de café",
			},
			mono_extras = {
				// Ancient Fruit and 4 of the "Basic -80" flowers
				454: "Fruta antiga",
				591: "Tulipa",
				593: "Flor-Miçanga",
				595: "Rosa-de-fada",
				597: "Jasmim-azul",
			};

		table[0] = parsePlayerCropShipping(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			poly_crops,
			mono_extras
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(
							parsePlayerCropShipping(this, saveInfo, poly_crops, mono_extras)
						);
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerCropShipping(player, saveInfo, poly_crops, mono_extras) {
		// Much of the logic was ported from the crafting function which is why the variables are weirdly named
		var output = "",
			recipe_count = Object.keys(poly_crops).length,
			crafted = {},
			craft_count = 0,
			max_ship = 0,
			max_crop = "de algum produto",
			need = [],
			id,
			r,
			n,
			farmer = $(player).children("name").html();

		$(player)
			.find("basicShipped > item")
			.each(function () {
				var id = $(this).find("key > int").text(),
					num = Number($(this).find("value > int").text());
				if (poly_crops.hasOwnProperty(id)) {
					crafted[poly_crops[id]] = num;
					if (num >= 15) {
						craft_count++;
					}
					if (num > max_ship) {
						max_ship = num;
						max_crop = poly_crops[id];
					}
				} else if (mono_extras.hasOwnProperty(id)) {
					if (num > max_ship) {
						max_ship = num;
						max_crop = mono_extras[id];
					}
				}
			});

		output +=
			max_ship > 0
				? '<span class="result">' +
				max_crop +
				" foi o produto mais enviado por " +
				farmer +
				" até agora. (total: " +
				max_ship +
				").</span>"
				: '<span class="result">' +
				farmer +
				" não enviou nenhum produto ainda.</span>";
		output += '<ul class="ach_list"><li>\n';
		output +=
			max_ship >= 300
				? getAchieveString("Monoculture", "envie mais de 300 de um único produto", 1)
				: getAchieveString("Monoculture", "envie mais de 300 de um único produto", 0) +
				(300 - max_ship) +
				" ainda " +
				max_crop;
		output += "</li></ul>\n";
		output +=
			'<span class="result">' +
			farmer +
			" enviou 15 items de um produto  " +
			craft_count +
			" de " +
			recipe_count +
			' produtos diferentes.</span><ul class="ach_list">\n<li>';
		output +=
			craft_count >= recipe_count
				? getAchieveString("Polyculture", "envie 15 de cada produto da lista", 1)
				: getAchieveString("Polyculture", "envie 15 de cada produto da lista", 0) +
				" mais de " +
				(recipe_count - craft_count) +
				" produtos diferentes";
		output += "</li></ul>\n";
		if (craft_count < recipe_count) {
			need = [];
			for (id in poly_crops) {
				if (poly_crops.hasOwnProperty(id)) {
					r = poly_crops[id];
					if (!crafted.hasOwnProperty(r)) {
						need.push("<li>" + wikify(r) + " -- 15 items</li>");
					} else {
						n = Number(crafted[r]);
						if (n < 15) {
							need.push("<li>" + wikify(r) + " --" + (15 - n) + " </li>");
						}
					}
				}
			}
			output +=
				'<span class="need">Falta enviar:<ol>' +
				need.sort().join("") +
				"</ol></span>\n";
		}
		return [output];
	}

	function parseSkills(xmlDoc, saveInfo) {
		var output = "<h3>Habilidades</h3>\n",
			table = [],
			skills = ["Cultivo", "Pesca", "Coleta", "Mineração", "Combate"],
			next_level = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];

		table[0] = parsePlayerSkills(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			skills,
			next_level
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerSkills(this, saveInfo, skills, next_level));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerSkills(player, saveInfo, skills, next_level) {
		var output = "",
			xp = {},
			i = 0,
			j,
			level = 10,
			num,
			count = 0,
			need = [];

		$(player)
			.find("experiencePoints > int")
			.each(function () {
				// We need to skip the unused 6th entry (Luck)
				if (i < 5) {
					num = Number($(this).text());
					xp[skills[i]] = num;
					// The current skill levels are also stored separately in 'player > fishingLevel' (and similar)
					if (num < 15000) {
						for (j = 0; j < 10; j++) {
							if (next_level[j] > num) {
								level = j;
								break;
							}
						}
						need.push(
							"<li>" +
							wikify(skills[i]) +
							" (level " +
							level +
							") -- precisa " +
							addCommas(next_level[level] - num) +
							" xp para o próximo nível e " +
							addCommas(15000 - num) +
							" xp para o nível máximo.</li>\n"
						);
					} else {
						count++;
					}
					i++;
				}
			});

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" chegou ao nível 10 em " +
			count +
			" de 5 habilidades.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			count >= 1
				? getAchieveString("Singular Talent", "nível 10 em uma habilidade.", 1)
				: getAchieveString(
					"Singular Talent",
					"nível 10 em uma habilidade.",
					0
				) +
				(1 - count) +
				" habilidade. ";
		output += "</li>\n<li>";
		output +=
			count >= 5
				? getAchieveString(
					"Master of the Five Ways",
					"nível 10 em todas as habilidades.",
					1
				)
				: getAchieveString(
					"Master of the Five Ways",
					"nível 10 em todas as habilidades.",
					0
				) +
				(5 - count) +
				" habilidades.";
		output += "</li></ul>\n";

		if (need.length > 0) {
			output +=
				'<span class="need">Quais habilidades faltam:<ol>' +
				need.sort().join("") +
				"</ol></span>\n";
		}
		return [output];
	}

	function parseMuseum(xmlDoc, saveInfo) {
		var output = "<h3>Coleção do Museu</h3>\n",
			table = [],
			artifacts = {
				96: "Pergaminho dos anões I",
				97: "Pergaminho dos anões II",
				98: "Pergaminho dos anões III",
				99: "Pergaminho dos anões IV",
				100: "Ânfora quebrada",
				101: "Ponta de flecha",
				103: "Boneco antigo",
				104: "Joias Élficas",
				105: "Palha para mastigar",
				106: "Leque ornamental",
				107: "Ovo de dinossauro",
				108: "Disco raro",
				109: "Espada antiga",
				110: "Colher enferrujada",
				111: "Esporão enferrujado",
				112: "Engrenagem velha",
				113: "Estátua de galinha",
				114: "Semente antiga",
				115: "Ferramenta pré-histórica",
				116: "Estrela-do-mar ressecada",
				117: "Âncora",
				118: "Cacos de vidro",
				119: "Flauta de ossos",
				120: "Biface pré-histórico",
				121: "Elmo anão",
				122: "Dispositivo de anão",
				123: "Tambor antigo",
				124: "Máscara dourada",
				125: "Relíquia dourada",
				126: "Boneco estranho (verde)",
				127: "Boneco estranho (amarelo)",
				579: "Escápula pré-histórica",
				580: "Tíbia pré-histórica",
				581: "Caveira pré-histórica",
				582: "Mão de esqueleto",
				583: "Costela pré-histórica",
				584: "Vértebra pré-histórica",
				585: "Esqueleto de cauda",
				586: "Fóssil de náutilo",
				587: "Fóssil de anfíbio",
				588: "Fóssil de Palma",
				589: "Trilobita",
			},
			minerals = {
				60: "Esmeralda",
				62: "Água-marinha",
				64: "Rubi",
				66: "Ametista",
				68: "Topázio",
				70: "Jade",
				72: "Diamante",
				74: "Fragmento prismático",
				80: "Quartzo",
				82: "Quartzo de fogo",
				84: "Lágrima congelada",
				86: "Cristal de terra",
				538: "Alamita",
				539: "Quatrônio",
				540: "Barita",
				541: "Aerinita",
				542: "Calcita",
				543: "Dolomita",
				544: "Esperita",
				545: "Fluorapatita",
				546: "Geminita",
				547: "Helvita",
				548: "Jamborita",
				549: "Jagoíta",
				550: "Cianita",
				551: "Lunarita",
				552: "Malachita",
				553: "Netunita",
				554: "Pedra de limão",
				555: "Necoíta",
				556: "Auripigmento",
				557: "Gosma petrificada",
				558: "Ovo-trovão",
				559: "Pirita",
				560: "Pedra do Oceano",
				561: "Cristal-fantasma",
				562: "Olho de tigre",
				563: "Jaspe",
				564: "Opala",
				565: "Opala de fogo",
				566: "Celestina",
				567: "Mármore",
				568: "Arenito",
				569: "Granito",
				570: "Basalto",
				571: "Calcário",
				572: "Pedra-sabão",
				573: "Hematita",
				574: "Lamito",
				575: "Obsidiana",
				576: "Ardósia",
				577: "Pedra de fada",
				578: "Fragmentos de estrela",
			},
			donated = {},
			artifact_count = Object.keys(artifacts).length,
			mineral_count = Object.keys(minerals).length,
			museum_count = artifact_count + mineral_count,
			donated_count = 0,
			museum = $(xmlDoc).find(
				"locations > GameLocation[" +
				saveInfo.ns_prefix +
				"\\:type='LibraryMuseum']"
			),
			farmName = $(xmlDoc).find("player > farmName").html();

		$(museum)
			.find("museumPieces > item")
			.each(function () {
				var id = Number($(this).find("value > int").text());
				if (artifacts.hasOwnProperty(id) || minerals.hasOwnProperty(id)) {
					donated[id] = 1;
				}
			});
		donated_count = Object.keys(donated).length;
		output +=
			'<span class="result">Habitantes da fazenda ' +
			farmName +
			" doaram " +
			donated_count +
			" de " +
			museum_count +
			' items para o museu.</span><ul class="ach_list">\n';
		output += "<li>";
		output +=
			donated_count >= 40
				? getAchieveString("Treasure Trove", "doar 40 items", 1)
				: getAchieveString("Treasure Trove", "doar 40 items", 0) +
				(40 - donated_count) +
				" ainda.";
		output += "</li>\n<li>";
		output +=
			donated_count >= 60
				? getMilestoneString(
					"Doar ao menos 60 items para conseguir a Chave Enferrujada",
					1
				)
				: getMilestoneString(
					"Doar ao menos 60 items para conseguir a Chave Enferrujada",
					0
				) +
				(60 - donated_count) +
				" ainda.";
		output += "</li>\n<li>";
		output +=
			donated_count >= museum_count
				? getAchieveString("A Complete Collection", "doar todos os items", 1)
				: getAchieveString("A Complete Collection", "doar todos os items", 0) +
				(museum_count - donated_count) +
				" ainda.";
		output += "</li></ul>\n";
		if (donated_count < museum_count) {
			output +=
				'<span class="need">Veja abaixo os items que faltam serem doados.</span><br /><br />\n';
		}

		table[0] = parsePlayerMuseum(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			donated,
			artifacts,
			minerals
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(
							parsePlayerMuseum(this, saveInfo, donated, artifacts, minerals)
						);
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerMuseum(player, saveInfo, donated, artifacts, minerals) {
		var output = "",
			donated_count = Object.keys(donated).length,
			artifact_count = Object.keys(artifacts).length,
			mineral_count = Object.keys(minerals).length,
			museum_count = artifact_count + mineral_count,
			found = {},
			found_art = 0,
			found_min = 0,
			need_art = [],
			need_min = [],
			need = [],
			id,
			r,
			farmer = $(player).children("name").html();

		$(player)
			.find("archaeologyFound > item")
			.each(function () {
				var id = $(this).find("key > int").text(),
					num = Number($(this).find("value > ArrayOfInt > int").first().text());
				if (artifacts.hasOwnProperty(id) && num > 0) {
					found[id] = num;
					found_art++;
				}
			});
		$(player)
			.find("mineralsFound > item")
			.each(function () {
				var id = $(this).find("key > int").text(),
					num = Number($(this).find("value > int").text());
				if (minerals.hasOwnProperty(id) && num > 0) {
					found[id] = num;
					found_min++;
				}
			});

		output +=
			'<span class="result">' +
			farmer +
			" doou " +
			found_art +
			" de " +
			artifact_count +
			" artefatos.</span><br />\n";
		output +=
			'<span class="result">' +
			farmer +
			" doou " +
			found_min +
			" de " +
			mineral_count +
			' minerais.</span><ul class="ach_list">\n';
		output += "<li>";
		output += "</li>\n<li>";
		output +=
			found_art >= artifact_count
				? getMilestoneString("Todos os artefatos foram doados.", 1)
				: getMilestoneString("Todos os artefatos doados", 0) +
				(artifact_count - found_art) +
				" ainda.";
		output += "</li>\n<li>";
		output +=
			found_min >= mineral_count
				? getMilestoneString("Todos os minerais foram doados.", 1)
				: getMilestoneString("Todos os minerais doados", 0) +
				(mineral_count - found_min) +
				" ainda.";
		output += "</li></ul>\n";

		if (donated_count < museum_count || found_art + found_min < museum_count) {
			for (id in artifacts) {
				if (artifacts.hasOwnProperty(id)) {
					r = artifacts[id];
					need = [];
					if (!found.hasOwnProperty(id)) {
						need.push("encontrado");
					}
					if (!donated.hasOwnProperty(id)) {
						need.push("doado");
					}
					if (need.length > 0) {
						need_art.push(
							"<li>" + wikify(r) + " -- Não foi " + need.join(" ou ") + "</li>"
						);
					}
				}
			}
			for (id in minerals) {
				if (minerals.hasOwnProperty(id)) {
					r = minerals[id];
					need = [];
					if (!found.hasOwnProperty(id)) {
						need.push("encontrado");
					}
					if (!donated.hasOwnProperty(id)) {
						need.push("doado");
					}
					if (need.length > 0) {
						need_min.push(
							"<li>" + wikify(r) + " -- Não foi " + need.join(" ou ") + "</li>"
						);
					}
				}
			}
			output += '<span class="need">Items que faltam:<ul>';
			if (need_art.length > 0) {
				output +=
					"<li><h3>Artefatos</h3><ol>" +
					need_art.sort().join("") +
					"</ol></li>\n";
			}
			if (need_min.length > 0) {
				output +=
					"<li><h3>Minerais</h3><ol>" +
					need_min.sort().join("") +
					"</ol></li>\n";
			}
			output += "</ul></span>\n";
		}

		return [output];
	}

	function parseMonsters(xmlDoc, saveInfo) {
		/* Conditions & details from decompiled source StardewValley.Locations.AdventureGuild.gil()
		 * The game counts some monsters which are not currently available; we will count them too
		 * just in case they are in someone's save file, but not list them in the details. */
		var output = "<h3>Guilda dos Aventureiros</h3>\n",
			table = [],
			goals = {
				Slimes: 1000,
				"Void Spirits": 150,
				Bats: 200,
				Skeletons: 50,
				"Cave Insects": 125,
				Duggies: 30,
				"Dust Sprites": 500,
			},
			categories = {
				"Green Slime": "Slimes",
				"Frost Jelly": "Slimes",
				Sludge: "Slimes",
				"Shadow Brute": "Void Spirits",
				"Shadow Shaman": "Void Spirits",
				"Shadow Guy": "Void Spirits", // not in released game
				"Shadow Girl": "Void Spirits", // not in released game
				Bat: "Bats",
				"Frost Bat": "Bats",
				"Lava Bat": "Bats",
				Skeleton: "Skeletons",
				"Skeleton Mage": "Skeletons", // not in released game
				Bug: "Cave Insects",
				Fly: "Cave Insects", // wiki calls this "Cave Fly"
				Grub: "Cave Insects",
				Duggy: "Duggies",
				"Dust Spirit": "Dust Sprites",
			},
			monsters = {
				Slimes: ["Green Slime", "Frost Jelly", "Sludge"],
				"Void Spirits": ["Shadow Brute", "Shadow Shaman"],
				Bats: ["Bat", "Frost Bat", "Lava Bat"],
				Skeletons: ["Skeleton"],
				"Cave Insects": ["Bug", "Cave Fly", "Grub"],
				Duggies: ["Duggy"],
				"Dust Sprites": ["Dust Spirit"],
			};
		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			goals["Rock Crabs"] = 60;
			goals["Mummies"] = 100;
			goals["Pepper Rex"] = 50;
			goals["Serpents"] = 250;
			categories["Rock Crab"] = "Rock Crabs";
			categories["Lava Crab"] = "Rock Crabs";
			categories["Iridium Crab"] = "Rock Crabs";
			categories["Mummy"] = "Mummies";
			categories["Pepper Rex"] = "Pepper Rex";
			categories["Serpent"] = "Serpents";
			monsters["Rock Crabs"] = ["Rock Crab", "Lava Crab", "Iridium Crab"];
			monsters["Mummies"] = ["Mummy"];
			monsters["Pepper Rex"] = ["Pepper Rex"];
			monsters["Serpents"] = ["Serpent"];
		}
		table[0] = parsePlayerMonsters(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			goals,
			categories,
			monsters
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(
							parsePlayerMonsters(this, saveInfo, goals, categories, monsters)
						);
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerMonsters(player, saveInfo, goals, categories, monsters) {
		var output = "",
			table = [],
			goal_count = Object.keys(goals).length,
			killed = [],
			completed = 0,
			need = [],
			id,
			stats,
			mineLevel = Number($(player).children("deepestMineLevel").text()),
			hasSkullKey = $(player).children("hasSkullKey").text(),
			farmer = $(player).children("name").html();

		// Have seen some inconsitencies in multiplayer, so will use presence of skull key to override the level & bump it to 120.
		if (hasSkullKey === "true") {
			mineLevel = Math.max(120, mineLevel);
		}
		if (mineLevel <= 0) {
			output +=
				'<span class="result">' +
				farmer +
				" ainda não explorou as minas.</span><br />\n";
		} else {
			output +=
				'<span class="result">' +
				farmer +
				" já chegou no andar " +
				Math.min(mineLevel, 120) +
				" da mina.</span><br />\n";
			output +=
				'<span class="result">' +
				farmer +
				(mineLevel > 120
					? " já chegou no andar " +
					(mineLevel - 120) +
					" da Caverna da Caveira"
					: " ainda não explorou as Cavernas da Caveira.");
			output += ".</span><br />";
		}
		table.push(output);
		output = '<ul class="ach_list"><li>\n';
		output +=
			mineLevel >= 120
				? getAchieveString("The Bottom", "chegar no andar 120", 1)
				: getAchieveString("The Bottom", "chegar no andar 120", 0) +
				(120 - mineLevel) +
				" andar";
		output += "</li></ul>\n";

		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			stats = $(player).find("stats > specificMonstersKilled");
		} else {
			// In 1.2, stats are under the root SaveGame so we must go back up the tree
			stats = $(player).parent().find("stats > specificMonstersKilled");
		}

		$(stats)
			.children("item")
			.each(function () {
				var id = $(this).find("key > string").text(),
					num = Number($(this).find("value > int").text()),
					old = 0;
				if (categories.hasOwnProperty(id) && num > 0) {
					if (killed.hasOwnProperty(categories[id])) {
						old = killed[categories[id]];
					}
					killed[categories[id]] = old + num;
				}
			});
		for (id in goals) {
			if (goals.hasOwnProperty(id)) {
				if (killed.hasOwnProperty(id)) {
					if (killed[id] >= goals[id]) {
						completed++;
					} else {
						need.push(
							"<li>" +
							id +
							" -- mate mais " +
							(goals[id] - killed[id]) +
							" " +
							monsters[id].map(wikimap).join(", ") +
							"</li>"
						);
					}
				} else {
					need.push(
						"<li>" +
						id +
						" -- mate mais " +
						goals[id] +
						"  " +
						monsters[id].map(wikimap).join(", ") +
						"</li>"
					);
				}
			}
		}

		output +=
			'<span class="result">' +
			farmer +
			" completou " +
			completed +
			" de " +
			goal_count +
			' objetivos da Guilda dos Aventureiros.</span><ul class="ach_list">\n';
		output += "<li>";
		output +=
			completed >= goal_count
				? getAchieveString(
					"Protector of the Valley",
					"completar todos os objetivos",
					1
				)
				: getAchieveString(
					"Protector of the Valley",
					"completar todos os objetivos",
					0
				) +
				(goal_count - completed) +
				" ainda.";
		output += "</li></ul>\n";
		if (need.length > 0) {
			output +=
				'<span class="need">Objetivos que faltam:<ol>' +
				need.sort().join("") +
				"</ol></span>\n";
		}
		table.push(output);
		return table;
	}

	function parseQuests(xmlDoc, saveInfo) {
		var output = "<h3>Missões</h3>\n",
			table = [];

		table[0] = parsePlayerQuests($(xmlDoc).find("SaveGame > player"), saveInfo);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerQuests(this, saveInfo));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerQuests(player, saveInfo) {
		var output = "",
			count;

		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			count = Number($(player).find("stats > questsCompleted").text());
		} else {
			// In 1.2, stats are under the root SaveGame so we must go back up the tree
			count = Number($(player).parent().find("stats > questsCompleted").text());
		}

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" completou " +
			count +
			' missões "Precisa-se de Ajuda".</span><br />\n';
		output += '<ul class="ach_list"><li>';
		output +=
			count >= 10
				? getAchieveString("Gofer", "complete 10 missões", 1)
				: getAchieveString("Gofer", "complete 10 missões", 0) +
				(10 - count) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			count >= 40
				? getAchieveString("A Big Help", "complete 40 missões", 1)
				: getAchieveString("A Big Help", "complete 40 missões", 0) +
				(40 - count) +
				" ainda";
		output += "</li></ul>\n";
		return [output];
	}

	function parseStardrops(xmlDoc, saveInfo) {
		/* mailReceived identifiers from decompiled source of StardewValley.Utility.foundAllStardrops()
		 * descriptions are not from anywhere else and are just made up. */
		var output = "<h3>Frutas Estrelas</h3>\n",
			table = [],
			stardrops = {
				CF_Fair:
					"Comprado na feira Stardew Valley (16/Outono) por 2000&#9734; Fichas Estrelas.",
				CF_Mines: "Encontrada em um baú no piso 100 da mina.",
				CF_Spouse:
					"Entregue a você por seu esposo(a) com 13.5 &#x2665; coração de amizade. (3375 pontos).",
				CF_Sewer: "Comprado de Krobus nos esgotos por 20,000 ouro.",
				CF_Statue: "Recebido do velho mestre Cannoli no bosque secreto.",
				CF_Fish:
					"Enviado via email por Willy depois de conseguir a conquista Velho Pescador.",
				museumComplete: "Recompensa por completar a coleção do museu.",
			};

		table[0] = parsePlayerStardrops(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			stardrops
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerStardrops(this, saveInfo, stardrops));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerStardrops(player, saveInfo, stardrops) {
		var output = "",
			count = 0,
			id,
			need = [],
			received = {},
			stardrop_count = Object.keys(stardrops).length;

		$(player)
			.find("mailReceived > string")
			.each(function () {
				var id = $(this).text();
				if (stardrops.hasOwnProperty(id)) {
					count++;
					received[id] = 1;
				}
			});
		for (id in stardrops) {
			if (stardrops.hasOwnProperty(id)) {
				if (!received.hasOwnProperty(id)) {
					need.push("<li>" + stardrops[id] + "</li>");
				}
			}
		}

		output +=
			'<span class="result">' +
			$(player).children("name").html() +
			" recebeu " +
			count +
			" de " +
			stardrop_count +
			" frutas-estrelas.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			count >= stardrop_count
				? getAchieveString(
					"Mystery Of The Stardrops",
					"consiga todas as frutas-estrelas",
					1
				)
				: getAchieveString(
					"Mystery Of The Stardrops",
					"consiga todas as frutas-estrelas",
					0
				) +
				(stardrop_count - count) +
				" ainda.";
		output += "</li></ul>\n";
		if (need.length > 0) {
			output +=
				'<span class="need">Frutas-estrelas que faltam:<ol>' +
				need.sort().join("") +
				"</ol></span>\n";
		}
		return [output];
	}

	function parseGrandpa(xmlDoc, saveInfo) {
		// Scoring details from StardewValley.Utility.getGradpaScore() & getGrandpaCandlesFromScore()
		var output = "<h3>Avaliação da Fazenda</h3>\n",
			farmer = $(xmlDoc).find("player > name").html(),
			count = 0,
			max_count = 21,
			candles = 1,
			max_candles = 4,
			currentCandles = Number(
				$(xmlDoc)
					.find(
						"locations > GameLocation[" +
						saveInfo.ns_prefix +
						"\\:type='Farm'] > grandpaScore"
					)
					.text()
			),
			need = "",
			money = Number($(xmlDoc).find("player > totalMoneyEarned").text()),
			achieves = {
				5: "A Complete Collection",
				26: "Master Angler",
				34: "Full Shipment",
			},
			ach_count = 3,
			ach_have = {},
			cc_done = 0,
			ccRooms = {
				ccBoilerRoom: "Sala da Caldeira",
				ccCraftsRoom: "Crafts Room",
				ccPantry: "Pantry",
				ccFishTank: "Fish Tank",
				ccVault: "Vault",
				ccBulletin: "Bulletin Board",
			},
			cc_have = 0,
			cc_count = 6,
			isJojaMember = 0,
			spouse = $(xmlDoc).find("player > spouse"), // will trigger during 3 day engagement too
			houseUpgrades = Number(
				$(xmlDoc).find("player > houseUpgradeLevel").text()
			),
			hasRustyKey = $(xmlDoc).find("player > hasRustyKey").text(),
			hasSkullKey = $(xmlDoc).find("player > hasSkullKey").text(),
			hasKeys = [],
			heart_count = 0,
			hasPet = 0,
			petLove = 0,
			realPlayerLevel =
				Number($(xmlDoc).find("player > farmingLevel").text()) +
				Number($(xmlDoc).find("player > miningLevel").text()) +
				Number($(xmlDoc).find("player > combatLevel").text()) +
				Number($(xmlDoc).find("player > foragingLevel").text()) +
				Number($(xmlDoc).find("player > fishingLevel").text()) +
				Number($(xmlDoc).find("player > luckLevel").text()),
			playerLevel = realPlayerLevel / 2;

		// Pre-calculating totals to put summary info up top.
		if (money >= 1e6) {
			count += 7;
		} else if (money >= 5e5) {
			count += 5;
		} else if (money >= 3e5) {
			count += 4;
		} else if (money >= 2e5) {
			count += 3;
		} else if (money >= 1e5) {
			count += 2;
		} else if (money >= 5e4) {
			count += 1;
		}
		$(xmlDoc)
			.find("player > achievements > int")
			.each(function () {
				var id = $(this).text();
				if (achieves.hasOwnProperty(id)) {
					count++;
					ach_have[id] = 1;
				}
			});
		$(xmlDoc)
			.find("player > eventsSeen > int")
			.each(function () {
				if ($(this).text() === "191393") {
					cc_done = 1;
				}
			});
		if (cc_done) {
			count += 3;
		} else {
			$(xmlDoc)
				.find("player > mailReceived > string")
				.each(function () {
					var id = $(this).text();
					if (id === "JojaMember") {
						isJojaMember = 1;
					} else if (ccRooms.hasOwnProperty(id)) {
						cc_have++;
					}
				});
			if (cc_have >= cc_count) {
				count++;
			}
		}
		if (hasRustyKey === "true") {
			count++;
			hasKeys.push("Chave enferrujada");
		}
		if (hasSkullKey === "true") {
			count++;
			hasKeys.push("Chave de caveira");
		}
		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			var uid = $(xmlDoc).find("player").children("UniqueMultiplayerID").text();
			if (saveInfo.partners.hasOwnProperty(uid)) {
				spouse = saveInfo.players[saveInfo.partners[uid]];
			}
		}
		if (spouse.length > 0 && houseUpgrades >= 2) {
			count++;
		}
		if (compareSemVer(saveInfo.version, "1.3") >= 0) {
			$(xmlDoc)
				.find("player> friendshipData > item")
				.each(function () {
					var num = Number($(this).find("value > Friendship > Points").text());
					if (num >= 1975) {
						heart_count++;
					}
				});
		} else {
			$(xmlDoc)
				.find("player> friendships > item")
				.each(function () {
					var num = Number(
						$(this).find("value > ArrayOfInt > int").first().text()
					);
					if (num >= 1975) {
						heart_count++;
					}
				});
		}
		if (heart_count >= 10) {
			count += 2;
		} else if (heart_count >= 5) {
			count += 1;
		}
		if (playerLevel >= 25) {
			count += 2;
		} else if (playerLevel >= 15) {
			count += 1;
		}
		$(xmlDoc)
			.find("locations > GameLocation > Characters > NPC")
			.each(function () {
				if (
					$(this).attr(saveInfo.ns_prefix + ":type") === "Cat" ||
					$(this).attr(saveInfo.ns_prefix + ":type") === "Dog"
				) {
					hasPet = 1;
					petLove = Number($(this).find("friendshipTowardFarmer").text());
				}
			});
		if (petLove >= 999) {
			count++;
		}
		if (count >= 12) {
			candles = 4;
		} else if (count >= 8) {
			candles = 3;
		} else if (count >= 4) {
			candles = 2;
		}
		output +=
			'<span class="result">' +
			farmer +
			" conseguiu até agora o total de " +
			count +
			" ponto(s) conforme detalhes abaixo. O máximo possível é " +
			max_count +
			" pontos.</span><br />\n";
		output +=
			'<span class="result">O Santuário do vovô tem ' +
			currentCandles +
			" velas acesas. A próxima avaliação irá acender " +
			candles +
			" vela(s).</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			candles >= max_candles
				? getMilestoneString("Avaliação 4 velas", 1)
				: getMilestoneString("Avaliação 4 velas", 0) +
				(12 - count) +
				" pontos.";
		output += "</li></ul>\n";

		output +=
			'<span class="result">' +
			farmer +
			" conseguiu um total de " +
			addCommas(money) +
			" ouro.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			money >= 5e4
				? getPointString(1, "ao menos 50,000 ouro conseguido", 0, 1)
				: getPointString(1, "ao menos 50,000 ouro conseguido", 0, 0) +
				" -- falta " +
				addCommas(5e4 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 1e5
				? getPointString(1, "ao menos 100,000 ouro conseguido", 1, 1)
				: getPointString(1, "ao menos 100,000 ouro conseguido", 1, 0) +
				" -- falta " +
				addCommas(1e5 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 2e5
				? getPointString(1, "ao menos 200,000 ouro conseguido", 1, 1)
				: getPointString(1, "ao menos 200,000 ouro conseguido", 1, 0) +
				" -- falta " +
				addCommas(2e5 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 3e5
				? getPointString(1, "ao menos 300,000 ouro conseguido", 1, 1)
				: getPointString(1, "ao menos 300,000 ouro conseguido", 1, 0) +
				" -- falta " +
				addCommas(3e5 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 5e5
				? getPointString(1, "ao menos 500,000 ouro conseguido", 1, 1)
				: getPointString(1, "ao menos 500,000 ouro conseguido", 1, 0) +
				" -- falta " +
				addCommas(5e5 - money) +
				" ouro";
		output += "</li>\n<li>";
		output +=
			money >= 1e6
				? getPointString(2, "ao menos 1,000,000 ouro conseguido", 1, 1)
				: getPointString(2, "ao menos 1,000,000 ouro conseguido", 1, 0) +
				" -- falta " +
				addCommas(1e6 - money) +
				" ouro";
		output += "</li></ul>\n";

		output +=
			'<span class="result">' +
			farmer +
			" conseguiu " +
			Object.keys(ach_have).length +
			" de " +
			ach_count +
			" conquistas relevantes.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output += ach_have.hasOwnProperty(5)
			? getPointString(
				1,
				'Conquista: <span class="ach">A Complete Collection</span>',
				0,
				1
			)
			: getPointString(
				1,
				'Conquista: <span class="ach">A Complete Collection</span>',
				0,
				0
			);
		output += "</li>\n<li>";
		output += ach_have.hasOwnProperty(26)
			? getPointString(
				1,
				'Conquista: <span class="ach">Master Angler</span>',
				0,
				1
			)
			: getPointString(
				1,
				'Conquista: <span class="ach">Master Angler</span>',
				0,
				0
			);
		output += "</li>\n<li>";
		output += ach_have.hasOwnProperty(34)
			? getPointString(
				1,
				'Conquista: <span class="ach">Full Shipment</span>',
				0,
				1
			)
			: getPointString(
				1,
				'Conquista: <span class="ach">Full Shipment</span>',
				0,
				0
			);
		output += "</li></ul>\n";

		if (isJojaMember) {
			output +=
				'<span class="result">' +
				farmer +
				" comprou o passe de membro do mercado Joja e não pode restaurar o Centro Comunitário";
			output += '<ul class="ach_list"><li>';
			output += getPointImpossibleString(1, "Completar o Centro Comunitário");
			output += "</li>\n<li>";
			output += getPointImpossibleString(
				2,
				"Participar da reabertura do Centro Comunitário"
			);
			output += "</li></ul>\n";
		} else {
			if (cc_done || cc_have >= cc_count) {
				output +=
					'<span class="result">' +
					farmer +
					" has completed the Community Center restoration";
				output += cc_done
					? " and attended the re-opening ceremony."
					: " but has not yet attended the re-opening ceremony.";
				output += "</span><br />\n";
			} else {
				output +=
					'<span class="result">' +
					farmer +
					" não completou a restauração do Centro Comunitário.";
			}
			output += '<ul class="ach_list"><li>';
			output +=
				cc_done || cc_have >= cc_count
					? getPointString(1, "Completar o Centro Comunitário", 0, 1)
					: getPointString(1, "Completar o Centro Comunitário", 0, 0);
			output += "</li>\n<li>";
			output += cc_done
				? getPointString(
					2,
					"Participar da reabertura do Centro Comunitário",
					0,
					1
				)
				: getPointString(
					2,
					"Participar da reabertura do Centro Comunitário",
					0,
					0
				);
			output += "</li></ul>\n";
		}

		output +=
			'<span class="result">' +
			farmer +
			" tem um total de " +
			realPlayerLevel +
			" níveis de habilidades.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			playerLevel >= 15
				? getPointString(1, "Some 30 níveis de habilidade", 0, 1)
				: getPointString(1, "Some 30 níveis de habilidade", 0, 0) +
				" -- falta " +
				(30 - realPlayerLevel) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			playerLevel >= 25
				? getPointString(1, "Some 50 níveis de habilidade", 1, 1)
				: getPointString(1, "Some 50 níveis de habilidade", 1, 0) +
				" -- falta " +
				(50 - realPlayerLevel) +
				" ainda";
		output += "</li></ul>\n";

		output +=
			'<span class="result">' +
			farmer +
			" tem " +
			heart_count +
			" amizade com mais de 1975+ pontos de amizade (~8 &#x2665;.)</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			heart_count >= 5
				? getPointString(1, "~8 &#x2665; com 5 pessoas", 0, 1)
				: getPointString(1, "~8 &#x2665; com 5 pessoas", 0, 0) +
				" -- falta " +
				(5 - heart_count) +
				" ainda";
		output += "</li>\n<li>";
		output +=
			heart_count >= 10
				? getPointString(1, "~8 &#x2665; com 10 pessoas", 1, 1)
				: getPointString(1, "~8 &#x2665; com 10 pessoas", 1, 0) +
				" -- falta " +
				(10 - heart_count) +
				" ainda";
		output += "</li></ul>\n";

		if (hasPet) {
			output +=
				'<span class="result">' +
				farmer +
				" tem um animal de estimação com " +
				petLove +
				" pontos de amizade.</span><br />\n";
		} else {
			need = " um animal de estimação e ";
			output +=
				'<span class="result">' +
				farmer +
				" não tem um animal de estimação.</span><br />\n";
		}
		output += '<ul class="ach_list"><li>';
		output +=
			petLove >= 999
				? getPointString(
					1,
					"animal de estimação com pelo menos 999 pontos de amizade com ele.",
					0,
					1
				)
				: getPointString(
					1,
					"animal de estimação com pelo menos 999 pontos de amizade com ele.",
					0,
					0
				) +
				" -- precisa de " +
				need +
				(999 - petLove) +
				" pontos de amizade com ele.";
		output += "</li></ul>\n";

		output +=
			'<span class="result">' +
			farmer +
			(spouse.length > 0 ? " é" : " não é") +
			" casado(a) e aumentou o tamanho da casa " +
			houseUpgrades +
			" vez(es).</span><br />\n";
		output += '<ul class="ach_list"><li>';
		need = [];
		if (spouse.length === 0) {
			need.push("um esposo(a)");
		}
		if (houseUpgrades < 2) {
			need.push(2 - houseUpgrades + " mais melhorias.");
		}
		output +=
			need.length === 0
				? getPointString(1, "casado e tem duas melhorias na casa", 0, 1)
				: getPointString(1, "casado e tem duas melhorias na casa", 0, 0) +
				" -- precisa " +
				need.join(" e ");
		output += "</li></ul>\n";

		if (hasKeys.length > 0) {
			output +=
				'<span class="result">' +
				farmer +
				" adquiriu " +
				hasKeys.join(" e ") +
				".</span><br />\n";
		} else {
			output +=
				'<span class="result">' +
				farmer +
				" não adquiriu a Chave enferrujada nem a Chave da caveira.</span><br />\n";
		}
		output += '<ul class="ach_list"><li>';
		output +=
			hasRustyKey === "true"
				? getPointString(1, "tem a Chave enferrujada", 0, 1)
				: getPointString(1, "Consiga a Chave enferrujada", 0, 0) +
				" -- conquistada depois de 60 doações no museu.";
		output += "</li>\n<li>";
		output +=
			hasSkullKey === "true"
				? getPointString(1, "tem a Chave da caveira", 0, 1)
				: getPointString(1, "Consiga a Chave da caveira", 0, 0) +
				" -- conquistada no nível 120 da mina.";
		output += "</li></ul>\n";

		return output;
	}

	function parseBundles(xmlDoc, saveInfo) {
		// Bundle info from Data\Bundles.xnb & StardewValley.Locations.CommunityCenter class
		var output = "<h3>Centro Comunitário / Mercado Joja</h3>\n",
			farmer = $(xmlDoc).find("player > name").html(),
			isJojaMember = 0,
			room = {
				0: {
					name: "Copa",
					bundles: {
						0: "Plantações de Primavera",
						1: "Plantações de Verão",
						2: "Plantações de Outono",
						3: "Plantações de Qualidade",
						4: "Animal",
						5: "Artesão",
					},
				},
				1: {
					name: "Sala de Artesanato",
					bundles: {
						13: "Recursos de Primavera",
						14: "Recursos de Verão",
						15: "Recursos de Outono",
						16: "Recursos de Inverno",
						17: "Construção",
						19: "Recursos Exóticos",
					},
				},
				2: {
					name: "Aqu&#225;rio",
					bundles: {
						6: "Peixes de Rio",
						7: "Peixes de Lago",
						8: "Peixes de Oceano",
						9: "Pesca Noturna",
						10: "Peixes Especializados",
						11: "Covo",
					},
				},
				3: {
					name: "Sala da Caldeira",
					bundles: {
						20: "Ferreiro",
						21: "Geólogo",
						22: "Aventureiro",
					},
				},
				4: {
					name: "Cofre",
					bundles: {
						23: " 2,500 ouro",
						24: " 5,000 ouro",
						25: "10,000 ouro",
						26: "25,000 ouro",
					},
				},
				5: {
					name: "Mural de Recados",
					bundles: {
						31: "Cozinheiro",
						32: "Pesquisa de Campo",
						33: "Encantador",
						34: "Tinta",
						35: "Forragem",
					},
				},
			},
			bundleHave = {},
			bundleCount = {
				// number of items in each bundle
				0: 4,
				1: 4,
				2: 4,
				3: 3,
				4: 5,
				5: 6,
				6: 4,
				7: 4,
				8: 4,
				9: 3,
				10: 4,
				11: 5,
				13: 4,
				14: 3,
				15: 4,
				16: 4,
				17: 4,
				19: 5,
				20: 3,
				21: 4,
				22: 2,
				23: 1,
				24: 1,
				25: 1,
				26: 1,
				31: 6,
				32: 4,
				33: 4,
				34: 6,
				35: 3,
			},
			ccMail = {
				ccBoilerRoom: 3,
				ccCraftsRoom: 1,
				ccPantry: 0,
				ccFishTank: 2,
				ccVault: 4,
				ccBulletin: 5,
			},
			ccCount = 6,
			ccHave = 0,
			ccEvent = "191393",
			project = ["Greenhouse", "Bridge", "Panning", "Minecarts", "Bus"],
			price = ["35,000g", "25,000g", "20,000g", "15,000g", "40,000g"],
			jojaMail = {
				jojaBoilerRoom: 3,
				jojaCraftsRoom: 1,
				jojaPantry: 0,
				jojaFishTank: 2,
				jojaVault: 4,
			},
			jojaCount = 5,
			jojaHave = 0,
			jojaEvent = "502261",
			eventToCheck = "",
			hasSeenCeremony = 0,
			done = {},
			hybrid = 0,
			hybridLeft = 0,
			id,
			r,
			b,
			temp,
			bundleNeed = [],
			need = [],
			ccLoc = $(xmlDoc).find(
				"locations > GameLocation[" +
				saveInfo.ns_prefix +
				"\\:type='CommunityCenter']"
			);

		// First check basic completion
		r = 0;
		$(ccLoc)
			.find("areasComplete > boolean")
			.each(function () {
				if ($(this).text() === "true") {
					ccHave++;
					done[r] = 1;
				}
				r++;
			});
		// Now look at bundles. Getting an item count but not which items are placed
		$(ccLoc)
			.find("bundles > item")
			.each(function () {
				id = $(this).find("key > int").text();
				bundleHave[id] = 0;
				$(this)
					.find("ArrayOfBoolean > boolean")
					.each(function () {
						if ($(this).text() === "true") {
							bundleHave[id]++;
						}
					});
			});
		$(xmlDoc)
			.find("player > mailReceived > string")
			.each(function () {
				var id = $(this).text();
				if (id === "JojaMember") {
					isJojaMember = 1;
				} else if (jojaMail.hasOwnProperty(id)) {
					jojaHave++;
					done[jojaMail[id]] = 1;
				}
			});
		if (ccHave > 0 && isJojaMember) {
			hybrid = 1;
		}
		hybridLeft = jojaCount - ccHave;
		if (done.hasOwnProperty(ccMail.ccBulletin)) {
			hybridLeft++;
		}
		eventToCheck = isJojaMember ? jojaEvent : ccEvent;
		$(xmlDoc)
			.find("player > eventsSeen > int")
			.each(function () {
				if ($(this).text() === eventToCheck) {
					hasSeenCeremony = 1;
				}
			});

		// New information from Gigafreak#4754 on Discord confirms that the Joja achieve does trigger even if
		// most of the CC was completed through bundles. So warnings are removed and Joja will not be marked
		// impossible unless the CC is actually done.
		if (isJojaMember) {
			if (hybrid) {
				output +=
					'<span class="result">' +
					farmer +
					" completed " +
					ccHave +
					" Community Center room(s) and then became a Joja member.</span><br />\n";
				output +=
					'<span class="result">' +
					farmer +
					" has since completed " +
					jojaHave +
					" of the remaining " +
					hybridLeft +
					" projects on the Community Development Form.</span><br />\n";
			} else {
				output +=
					'<span class="result">' +
					farmer +
					" is a Joja member and has completed " +
					jojaHave +
					" of the " +
					jojaCount +
					" projects on the Community Development Form.</span><br />\n";
			}
			hybridLeft -= jojaHave;
			output +=
				'<span class="result">' +
				farmer +
				(hasSeenCeremony ? " has" : " has not") +
				' attended the completion ceremony</span><br />\n<ul class="ach_list"><li>';
			output += getAchieveImpossibleString(
				"Local Legend",
				"restaure o Centro Comunitário da Vila Pelicano"
			);
			output += "</li><li>\n";
			if (!hasSeenCeremony) {
				if (hybridLeft > 0) {
					temp = hybridLeft + " mais projeto(s) e a cerimônia";
					// Since we are supporting hybrid playthrough, we check the CC versions of mail, not joja
					for (id in ccMail) {
						if (ccMail.hasOwnProperty(id) && id !== "ccBulletin") {
							if (!done.hasOwnProperty(ccMail[id])) {
								need.push(
									"<li> Purchase " +
									project[ccMail[id]] +
									" project for " +
									price[ccMail[id]] +
									"</li>"
								);
							}
						}
					}
				} else {
					temp = " to attend the ceremony";
				}
				need.push(
					"<li>Attend the completion ceremony at the Joja Warehouse</li>"
				);
			}
			output += hasSeenCeremony
				? getAchieveString("Joja Co. Member Of The Year", "", 1)
				: getAchieveString("Joja Co. Member Of The Year", "", 0) + temp;
			output += "</li></ul>\n";
		} else {
			output +=
				'<span class="result">' +
				farmer +
				" não é um membro Joja e completou " +
				ccHave +
				" de " +
				ccCount +
				" sala(s) do Centro Comunitário.</span><br />\n";
			output +=
				'<span class="result">' +
				farmer +
				(hasSeenCeremony ? " participou" : " não participou") +
				' da cerimônia do Centro Comunitário completo.</span><br />\n<ul class="ach_list"><li>';
			if (ccHave === 0) {
				output +=
					getAchieveString("Joja Co. Member Of The Year", "", 0) +
					"se tornar um membro Joja e comprar todas as melhorias da comunidade";
			} else if (ccHave < ccCount) {
				output +=
					getAchieveString("Joja Co. Member Of The Year", "", 0) +
					"se tornar um membro Joja e comprar qualquer melhoria que falte ainda (" +
					hybridLeft +
					" falta)";
			} else {
				output += getAchieveImpossibleString(
					"Joja Co. Member Of The Year",
					"se tornar um membro Joja e comprar todas as melhorias da comunidade"
				);
			}
			output += "</li><li>\n";
			if (!hasSeenCeremony) {
				if (ccHave < ccCount) {
					temp = ccCount - ccHave + " sala(s) e a cerimônia.";
					for (id in ccMail) {
						if (ccMail.hasOwnProperty(id)) {
							r = ccMail[id];
							if (!done.hasOwnProperty(r)) {
								bundleNeed = [];
								if (room.hasOwnProperty(r)) {
									for (b in room[r].bundles) {
										if (room[r].bundles.hasOwnProperty(b)) {
											if (bundleHave[b] < bundleCount[b]) {
												bundleNeed.push(
													"<li>" +
													room[r].bundles[b] +
													" -- " +
													(bundleCount[b] - bundleHave[b]) +
													" item(s)</li>"
												);
											}
										}
									}
								}
								need.push(
									"<li> " +
									wikify(room[r].name, "Conjuntos") +
									"<ol>" +
									bundleNeed.sort().join("") +
									"</ol></li>"
								);
							}
						}
					}
				} else {
					temp = " to attend the ceremony";
				}
				need.push(
					"<li>Participe da cerimônia de reabertura do Centro Comunitário</li>"
				);
			}
			output +=
				ccHave >= ccCount && hasSeenCeremony
					? getAchieveString("Local Legend", "", 1)
					: getAchieveString("Local Legend", "", 0) + temp;
			output += "</li></ul>\n";
		}
		if (need.length > 0) {
			output +=
				'<span class="need">Conjuntos que faltam completar:<ol>' +
				need.sort().join("") +
				"</ol></span>\n";
		}

		return output;
	}

	function parseSecretNotes(xmlDoc, saveInfo) {
		var output = "<h3>Recados Secretos</h3>\n",
			table = [],
			hasStoneJunimo = false;

		if (compareSemVer(saveInfo.version, "1.3") < 0) {
			return "";
		}

		// Stone Junimo is a giant pain in the ass. It seems to not have any confirmation so we have to search
		// the entire save for it. Worse, the buried one may reappear later so we need to ignore that one when
		// searching. The buried one is at (57, 16) on the Town map.
		// It also should not be obtainable if the players went the Joja route, but we will deal with that later.
		$(xmlDoc)
			.find("Item > name")
			.each(function () {
				if ($(this).text() === "Stone Junimo") {
					// Found one in storage somewhere. We good.
					hasStoneJunimo = true;
					return false;
				}
			});
		if (!hasStoneJunimo) {
			$(xmlDoc)
				.find("Object > name")
				.each(function () {
					if ($(this).text() === "Stone Junimo") {
						var loc = $(this).parents("GameLocation").children("name").text();
						if (loc === "Town") {
							var x = $(this).parents("item").find("key > Vector2 > X").text();
							var y = $(this).parents("item").find("key > Vector2 > Y").text();
							if (x !== "57" || y !== "16") {
								hasStoneJunimo = true;
								return false;
							}
						} else {
							hasStoneJunimo = true;
							return false;
						}
					}
				});
		}

		table[0] = parsePlayerSecretNotes(
			$(xmlDoc).find("SaveGame > player"),
			saveInfo,
			hasStoneJunimo
		);
		if (saveInfo.numPlayers > 1) {
			$(xmlDoc)
				.find("farmhand")
				.each(function () {
					if (isValidFarmhand(this)) {
						table.push(parsePlayerSecretNotes(this, saveInfo, hasStoneJunimo));
					}
				});
		}
		output += printTranspose(table);
		return output;
	}

	function parsePlayerSecretNotes(player, saveInfo, hasStoneJunimo) {
		var output = "",
			table = [],
			farmer = $(player).children("name").html(),
			hasSeenKrobus = false,
			hasMagnifyingGlass =
				$(player).children("hasMagnifyingGlass").text() === "true",
			isJojaMember = false,
			notes = {},
			need = [],
			rewards = {},
			reward_skip = {},
			found_notes = 0,
			found_rewards = 0,
			note_count = 23,
			reward_start = 13,
			reward_count = note_count - reward_start + 1,
			reward_re,
			i;

		if (compareSemVer(saveInfo.version, "1.4") >= 0) {
			note_count = 25;
			reward_count = 12;
			reward_skip[24] = true;
		}
		// Check Krobus event, then check for magnifier, then check number of notes
		// Also checking for one of the reward events here, so don't use "return false" to end early.
		$(player)
			.find("eventsSeen > int")
			.each(function () {
				if ($(this).text() === "520702") {
					hasSeenKrobus = true;
				} else if ($(this).text() === "2120303") {
					rewards[23] = true;
					found_rewards++;
				}
			});
		output +=
			'<span class="result">' +
			farmer +
			" " +
			(hasSeenKrobus ? "" : "não ") +
			" viu Krobus no ponto de ônibus.</span><br />\n";
		output +=
			'<span class="result">' +
			farmer +
			" " +
			(hasMagnifyingGlass ? "" : "não ") +
			" encontrou a lupa.</span><br />\n";
		$(player)
			.find("secretNotesSeen > int")
			.each(function () {
				notes[$(this).text()] = true;
				found_notes++;
			});
		output +=
			'<span class="result">' +
			farmer +
			" leu " +
			found_notes +
			" de " +
			note_count +
			" recados secretos.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			found_notes >= note_count
				? getMilestoneString("Leu todos os recados secretos", 1)
				: getMilestoneString("Leu todos os recados secretos", 0) +
				(note_count - found_notes) +
				" ainda";
		output += "</li></ul>\n";
		if (found_notes < note_count) {
			for (i = 1; i <= note_count; i++) {
				if (!notes.hasOwnProperty(i)) {
					need.push(
						"<li>" + wikify("Recados Secretos " + i, "Recados Secretos") + "</li>"
					);
				}
			}
			if (need.length > 0) {
				output +=
					'<span class="need">Falta os recados:<ol>' +
					need.join("") +
					"</ol></span>\n";
			}
		}
		table.push(output);
		// Most rewards are noted by SecretNoteXX_done mail items. The one for note 21 starts with lower-case s though.
		reward_re = new RegExp("[Ss]ecretNote(\\d+)_done");
		$(player)
			.find("mailReceived > string")
			.each(function () {
				var match = reward_re.exec($(this).text());
				if (match !== null) {
					rewards[match[1]] = true;
					found_rewards++;
				} else if ($(this).text() === "gotPearl") {
					rewards[15] = true;
					found_rewards++;
				} else if ($(this).text() === "junimoPlush") {
					rewards[13] = true;
					found_rewards++;
				} else if ($(this).text() === "TH_Tunnel") {
					// Qi quest we just check for the start. Full completion is 'TH_Lumberpile'
					rewards[22] = true;
					found_rewards++;
				} else if ($(this).text() === "carolinesNecklace") {
					rewards[25] = true;
					found_rewards++;
				} else if ($(this).text() === "JojaMember") {
					isJojaMember = true;
				}
			});
		// Stone Junimo not available for Joja route. We silently remove it from the list, which isn't optimal
		if (isJojaMember) {
			reward_count--;
			reward_skip[14] = true;
		} else if (hasStoneJunimo) {
			rewards[14] = true;
			found_rewards++;
		}

		output =
			'<span class="result">' +
			farmer +
			" encontrou " +
			found_rewards +
			" de " +
			reward_count +
			" recompensas dos recados secretos.</span><br />\n";
		output += '<ul class="ach_list"><li>';
		output +=
			found_rewards >= reward_count
				? getMilestoneString("Encontre todas as recompensas dos recados secretos", 1)
				: getMilestoneString("Encontre todas as recompensas dos recados secretos", 0) +
				(reward_count - found_rewards) +
				" ainda";
		output += "</li></ul>\n";
		if (found_rewards < reward_count) {
			need = [];
			for (i = reward_start; i <= note_count; i++) {
				if (!reward_skip.hasOwnProperty(i) && !rewards.hasOwnProperty(i)) {
					need.push(
						"<li> Recompensa do " +
						wikify("Recados Secretos " + i, "Recados Secretos") +
						"</li>"
					);
				}
			}
			if (need.length > 0) {
				output +=
					'<span class="need">Falta encontrar:<ol>' +
					need.join("") +
					"</ol></span>\n";
			}
		}
		table.push(output);
		return table;
	}

	function createTOC() {
		var text,
			id,
			list = "<ul>";
		$("h2, h3").each(function () {
			if ($(this).is(":visible")) {
				text = $(this).text();
				id = "sec_" + text.toLowerCase();
				id = id.replace(/[^\w*]/g, "_");
				$(this).attr("id", id);
				list += '<li><a href="#' + id + '">' + text + "</a></li>\n";
			}
		});
		list += "</ul>";
		document.getElementById("TOC-details").innerHTML = list;
	}

	function togglePlayer(e) {
		console.log(
			"Somebody clicked on " +
			$(e.currentTarget).attr("id") +
			" which has a class of " +
			$(e.currentTarget).attr("class")
		);
		// Adjust PlayerList entry to reflect status of this player
		var isOn = $(e.currentTarget).attr("class") === "on",
			match = "td." + $(e.currentTarget).attr("id").substring(5);
		$(e.currentTarget).attr("class", isOn ? "off" : "on");
		// Go find all the entries for this player and toggle them.
		$(match).each(function () {
			if ($(this).is(":visible")) {
				$(this).hide();
			} else {
				$(this).show();
			}
		});
	}

	function createPlayerList(numPlayers, farmer, farmhands) {
		var width = Math.floor(100 / (1 + numPlayers)),
			i,
			text =
				"<table><tr><th>Toggle Player Display:</th>" +
				'<td id="List_PL_1" class="on">' +
				farmer +
				"</td>";
		for (i = 2; i <= numPlayers; i++) {
			text +=
				' <td id="List_PL_' + i + '" class="on">' + farmhands[i - 2] + "</td>";
		}
		text += "</tr></table>";
		$("#PlayerList").html(text);
		$("#PlayerList").show();
		// Add click handlers
		for (i = 1; i <= numPlayers; i++) {
			var ID = "#List_PL_" + i;
			$(ID).click(togglePlayer);
		}
	}

	function handleFileSelect(evt) {
		var file = evt.target.files[0],
			reader = new FileReader(),
			prog = document.getElementById("progress");

		prog.value = 0;
		$("#output-container").hide();
		$("#progress-container").show();
		$("#changelog").hide();
		$("#PlayerList").hide();
		reader.onloadstart = function (e) {
			prog.value = 20;
		};
		reader.onprogress = function (e) {
			if (e.lengthComputable) {
				var p = 20 + (e.loaded / e.total) * 60;
				prog.value = p;
			}
		};
		reader.onload = function (e) {
			var output = "",
				xmlDoc = $.parseXML(e.target.result),
				saveInfo = {};

			output += parseSummary(xmlDoc, saveInfo);
			output += parseMoney(xmlDoc, saveInfo);
			output += parseSkills(xmlDoc, saveInfo);
			output += parseQuests(xmlDoc, saveInfo);
			output += parseMonsters(xmlDoc, saveInfo);
			output += parseStardrops(xmlDoc, saveInfo);
			output += parseFamily(xmlDoc, saveInfo);
			output += parseSocial(xmlDoc, saveInfo);
			output += parseCooking(xmlDoc, saveInfo);
			output += parseCrafting(xmlDoc, saveInfo);
			output += parseFishing(xmlDoc, saveInfo);
			output += parseBasicShipping(xmlDoc, saveInfo);
			output += parseCropShipping(xmlDoc, saveInfo);
			output += parseMuseum(xmlDoc, saveInfo);
			output += parseSecretNotes(xmlDoc, saveInfo);
			output += parseBundles(xmlDoc, saveInfo);
			output += parseGrandpa(xmlDoc, saveInfo);

			// End of checks
			prog.value = 100;
			document.getElementById("out").innerHTML = output;
			$("#output-container").show();
			$("#progress-container").hide();
			createTOC();
			$("#TOC").show();
		};
		reader.readAsText(file);
	}
	document
		.getElementById("file_select")
		.addEventListener("change", handleFileSelect, false);

	function toggleVisible(evt) {
		var t = evt.target;
		if ($(t).next().is(":visible")) {
			$(t).next().hide();
			$(t).html("Show");
		} else {
			$(t).next().show();
			$(t).html("Hide");
		}
	}

	$(".collapsible").each(function () {
		$(this).children("button").click(toggleVisible);
	});
};
