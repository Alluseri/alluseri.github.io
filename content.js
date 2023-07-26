// jshint esversion: 2020

const $ = document.querySelector.bind(document);
const $$ = s => Array.from(document.querySelectorAll(s));

var pushInProgress = false;

function pushNotification(content) {
	$("#notification-content").innerText = content;
	$("#notification-content").animate({
		opacity: [1, 1, 1, 0]
	}, {
		duration: 2000,
		iterations: 1,
	});
}

var lyricsItem;
var playbacker;
var trueLyrics;
var willStale = false;

function handleOrientationType(type) {
	if (type && !type.startsWith("landscape")) {
		lyricsItem.innerText = "Please rotate your device into landscape orientation for a better experience...";
		if (willStale) lyricsItem.id = "stale-lyrics";
		playbacker.innerText = "Please rotate your device into landscape orientation before entering...";
		return false;
	} else {
		lyricsItem.innerText = trueLyrics;
		playbacker.innerText = "Tap anywhere on the screen to enter...";
		return true;
	}
}

document.addEventListener("DOMContentLoaded", function () {
	playbacker = $("#playbacker");
	lyricsItem = $("#lyrics");
	trueLyrics = lyricsItem.innerText;

	var latestAPI = typeof (screen.orientation) != "string";
	handleOrientationType(latestAPI ? screen.orientation?.type : screen.orientation);
	if (latestAPI && screen.orientation)
		screen.orientation.onchange = function () {
			handleOrientationType(screen.orientation?.type);
		};
	else window.onorientationchange = function () {
		handleOrientationType(screen.orientation);
	};

	playbacker.onclick = function () {
		if (handleOrientationType((typeof (screen.orientation) != "string") ? screen.orientation?.type : screen.orientation)) {
			$("#primary-showcase").style.display = "flex";
			$("audio").play();
			this.style.display = "none";
			this.onclick = null;
			willStale = true;
		}
	};

	$$(".i-copyable").forEach(e => {
		e.onclick = async function () {
			await navigator.clipboard.writeText(e.attributes["i-md"].value);
			pushNotification("Copied to clipboard!");
		};
	});
	$$(".i-openable").forEach(e => {
		e.onclick = function () {
			window.open(e.attributes["i-md"].value);
		};
	});
});