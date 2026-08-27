(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    setupHero();
    setupGrid();
  });

  function setupHero() {
    var hero = document.querySelector("[data-hero]");
    if (!hero) return;

    var stage = hero.querySelector(".hero-stage");
    var flare = hero.querySelector("[data-hero-flare]");
    if (!stage) return;

    requestAnimationFrame(function () {
      hero.classList.add("is-ready");
    });

    if (reduce) return;

    var targetX = 0;
    var targetY = 0;
    var x = 0;
    var y = 0;
    var scrollY = window.scrollY || 0;
    var start = performance.now();
    var ticking = false;

    function onMove(event) {
      var rect = hero.getBoundingClientRect();
      if (rect.height === 0) return;
      var px = (event.clientX - rect.left) / rect.width - 0.5;
      var py = (event.clientY - rect.top) / rect.height - 0.5;
      targetX = Math.max(-0.5, Math.min(0.5, px));
      targetY = Math.max(-0.5, Math.min(0.5, py));
      requestTick();
    }

    function onScroll() {
      scrollY = window.scrollY || 0;
      requestTick();
    }

    function requestTick() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(draw);
    }

    function draw(now) {
      ticking = false;
      x += (targetX - x) * 0.08;
      y += (targetY - y) * 0.08;

      var t = Math.min(1, ((now || performance.now()) - start) / 2200);
      var settle = 1 - Math.pow(1 - t, 3);
      var scale = 1.12 - 0.06 * settle;
      var mx = x * 22;
      var my = y * 14 + scrollY * 0.18;

      stage.style.transform =
        "translate3d(" + mx + "px," + my + "px,0) scale(" + scale + ")";

      if (flare) {
        var fx = 58 + x * 10;
        var fy = 28 + y * 8;
        flare.style.left = fx + "%";
        flare.style.top = fy + "%";
      }
    }

    if (fine) {
      hero.addEventListener("pointermove", onMove, { passive: true });
      hero.addEventListener(
        "pointerleave",
        function () {
          targetX = 0;
          targetY = 0;
          requestTick();
        },
        { passive: true }
      );
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    requestTick();
  }

  function setupGrid() {
    var items = document.querySelectorAll(".photo-grid li");
    if (!items.length) return;

    if (reduce) {
      items.forEach(function (item) {
        item.classList.add("is-in");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );

    items.forEach(function (item, i) {
      item.style.setProperty("--i", String(i));
      observer.observe(item);
    });

    if (!fine) return;

    document.querySelectorAll(".photo-grid a").forEach(function (card) {
      card.addEventListener(
        "pointermove",
        function (event) {
          var rect = card.getBoundingClientRect();
          var px = (event.clientX - rect.left) / rect.width;
          var py = (event.clientY - rect.top) / rect.height;
          var rx = ((py - 0.5) * -8).toFixed(2);
          var ry = ((px - 0.5) * 10).toFixed(2);
          card.style.setProperty("--rx", rx + "deg");
          card.style.setProperty("--ry", ry + "deg");
          card.style.setProperty("--sx", (px * 100).toFixed(1) + "%");
          card.style.setProperty("--sy", (py * 100).toFixed(1) + "%");
        },
        { passive: true }
      );

      card.addEventListener(
        "pointerleave",
        function () {
          card.style.setProperty("--rx", "0deg");
          card.style.setProperty("--ry", "0deg");
        },
        { passive: true }
      );
    });
  }
})();
