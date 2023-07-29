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

var playbacker;
var lyrun;

function handleOrientationType(type) {
	lyrun.style.width = window.innerWidth+"px";
	lyrun.style.minWidth = window.innerWidth+"px";
}

window.addEventListener("resize", function() {
	lyrun.style.width = window.innerWidth+"px";
	lyrun.style.minWidth = window.innerWidth+"px";
});

document.addEventListener("DOMContentLoaded", function () {
	playbacker = $("#playbacker");
	lyrun = $("#lyrics-under");

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
		handleOrientationType((typeof (screen.orientation) != "string") ? screen.orientation?.type : screen.orientation);
		$("#primary-showcase").style.display = "flex";
		$("audio").play();
		this.style.display = "none";
		this.onclick = null;
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

	setTimeout(function() {
		var s = document.createElement("style");
		s.innerHTML = "#primary-showcase>#logo>#logo-border{background:#FFF!important;}";
		document.head.appendChild(s);
	}, 1000);
});