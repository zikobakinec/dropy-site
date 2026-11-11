// dropy.az/a/ links on a phone without Dropy.az (2026-11-12): send it to its
// store. A personal invite code (?r=XXXXXX, added by the app) is counted first
// and rides along in Google Play's install referrer, so the new install can
// report who invited it (record_referral_install). The key below is the same
// public key the app ships with; it can only call the counting functions.
(function () {
  var API = "https://lzsanyxptvziidujidgi.supabase.co/rest/v1/rpc/record_referral_click";
  var KEY = "sb_publishable_XeQS3qdmUqrkuvFtN9CRyQ_oaA2jM2l";
  var PLAY = "https://play.google.com/store/apps/details?id=az.endirim.aqreqatoru";
  var IOS = "https://apps.apple.com/az/app/id6819821532";

  window.dropyGo = function (kind) {
    var r = (new URLSearchParams(location.search).get("r") || "").toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(r)) r = "";
    var ua = navigator.userAgent || "";
    var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/i.test(ua);
    var ref = "utm_source=share&utm_medium=app&utm_campaign=" + kind + (r ? "&r=" + r : "");
    var play = PLAY + "&referrer=" + encodeURIComponent(ref);

    function links() {
      var p = document.getElementById("play");
      if (p) p.href = play;
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", links);
    else links();

    var target = isAndroid ? play : isIOS ? IOS : null;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      if (target) location.replace(target);
    }
    if (!r) return go();
    try {
      fetch(API, {
        method: "POST",
        keepalive: true,
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: r, p_platform: isAndroid ? "android" : isIOS ? "ios" : "other" }),
      }).then(go, go);
    } catch (e) {
      go();
    }
    setTimeout(go, 800);
  };
})();
