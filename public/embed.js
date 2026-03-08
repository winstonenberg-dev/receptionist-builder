(function () {
  var script = document.currentScript;
  var src = script ? script.src : "";
  var id = new URLSearchParams(src.split("?")[1] || "").get("id");
  if (!id) return;

  var BASE = src.split("/embed.js")[0];
  var SIZES    = { small: "340px", medium: "400px", large: "480px" };
  var BTN_SIZE = { small: "52px",  medium: "62px",  large: "72px"  };
  var ICO_SIZE = { small: "20px",  medium: "24px",  large: "28px"  };

  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function buildWidget(accent, size, icon) {
    accent = accent || "#a855f7";
    size = size || "medium";
    var width = SIZES[size] || "400px";
    var btnW  = BTN_SIZE[size] || "62px";
    var icoSz = ICO_SIZE[size] || "24px";
    var shadow = hexToRgba(accent, 0.5);
    var shadowHover = hexToRgba(accent, 0.7);

    // Bubbla-knapp
    var btn = document.createElement("button");
    btn.setAttribute("aria-label", "Öppna chatt");
    btn.style.cssText = [
      "position:fixed", "bottom:24px", "right:24px", "z-index:2147483647",
      "width:" + btnW, "height:" + btnW, "border-radius:50%", "border:none",
      "background:" + accent,
      "color:white", "font-size:" + icoSz, "cursor:pointer",
      "box-shadow:0 4px 24px " + shadow,
      "transition:transform 0.2s,box-shadow 0.2s",
      "display:flex", "align-items:center", "justify-content:center",
      "overflow:hidden",
    ].join(";");
    btn.innerHTML = icon
      ? '<img src="' + icon + '" style="width:100%;height:100%;object-fit:cover;" />'
      : "💬";

    btn.onmouseenter = function () {
      btn.style.transform = "scale(1.1)";
      btn.style.boxShadow = "0 6px 30px " + shadowHover;
    };
    btn.onmouseleave = function () {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 4px 24px " + shadow;
    };

    // Chat-container med iframe
    var container = document.createElement("div");
    container.style.cssText = [
      "position:fixed", "bottom:92px", "right:24px", "z-index:2147483646",
      "width:" + width, "height:580px", "border-radius:16px",
      "box-shadow:0 8px 48px rgba(0,0,0,0.3)",
      "overflow:hidden", "display:none",
      "transition:opacity 0.2s,transform 0.2s",
      "opacity:0", "transform:translateY(8px)",
    ].join(";");

    var iframe = document.createElement("iframe");
    iframe.src = BASE + "/embed/" + id;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "microphone";
    container.appendChild(iframe);

    var open = false;

    btn.onclick = function () {
      open = !open;
      if (open) {
        container.style.display = "block";
        setTimeout(function () {
          container.style.opacity = "1";
          container.style.transform = "translateY(0)";
        }, 10);
        btn.innerHTML = "✕";
      } else {
        container.style.opacity = "0";
        container.style.transform = "translateY(8px)";
        setTimeout(function () { container.style.display = "none"; }, 200);
        btn.innerHTML = "💬";
      }
    };

    // Responsiv: smalare på mobil
    function resize() {
      if (window.innerWidth < 440) {
        container.style.width = (window.innerWidth - 32) + "px";
        container.style.right = "16px";
        btn.style.right = "16px";
      } else {
        container.style.width = width;
        container.style.right = "24px";
        btn.style.right = "24px";
      }
    }
    window.addEventListener("resize", resize);
    resize();

    document.body.appendChild(container);
    document.body.appendChild(btn);
  }

  fetch(BASE + "/api/embed/" + id)
    .then(function (r) { return r.json(); })
    .then(function (d) { buildWidget(d.accent, d.size, d.icon); })
    .catch(function () { buildWidget(null, null); });
})();
