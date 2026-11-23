/* Cached star sprites on one bounded canvas; the intro owns the only animation clock. */
(() => {
  'use strict';
  const emissionDuration = 500;
  const rotationFrames = 24;
  const tile = 48;
  const variation = (index, salt) => ((index * salt + 17) % 101) / 100;

  function create(parent, T, width, height) {
    const canvas = document.createElement('canvas');
    canvas.className = 'intro-star-burst';
    canvas.setAttribute('aria-hidden', 'true');
    const context = canvas.getContext('2d');
    const atlas = document.createElement('canvas');
    const sprite = atlas.getContext('2d');
    const end = T.final.hit + 2500;
    // An unavailable canvas lets the owner immediately restore the usable menu.
    if (!context || !sprite) return { context: null, dispose() { canvas.width = canvas.height = atlas.width = atlas.height = 0; }, end };

    // Fivefold symmetry means a 72-degree atlas covers every orientation.
    // Rasterize the paths once, rather than rotating/repainting SVG polygons each frame.
    atlas.width = rotationFrames * tile;
    atlas.height = tile;
    sprite.fillStyle = '#fff';
    for (let frame = 0; frame < rotationFrames; frame++) {
      const rotation = frame / rotationFrames * Math.PI * 2 / 5;
      sprite.beginPath();
      for (let point = 0; point < 10; point++) {
        const angle = rotation + point * Math.PI / 5 - Math.PI / 2;
        const radius = point % 2 ? 9.68 : 22;
        const x = frame * tile + tile / 2 + Math.cos(angle) * radius;
        const y = tile / 2 + Math.sin(angle) * radius;
        if (point === 0) sprite.moveTo(x, y);
        else sprite.lineTo(x, y);
      }
      sprite.closePath();
      sprite.fill();
    }
    parent.prepend(canvas);

    const hardware = window.navigator;
    let lean = hardware?.hardwareConcurrency <= 4 || hardware?.deviceMemory <= 4;
    let stars;
    let previousTime;
    let frameAverage = 1000 / 60;
    let frameSamples = 0;
    let started = false;
    let finished = false;
    let flashFinished = false;

    function configure() {
      // Cap both DPR and total pixels: a 4K/retina screen must not multiply the work.
      const pixelBudget = lean ? 1000000 : 2000000;
      const ratio = Math.min(window.devicePixelRatio || 1, lean ? 1 : 1.5, Math.sqrt(pixelBudget / (width * height)));
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      context.fillStyle = '#fff';
      const mobile = width < 600;
      const starsPerSide = lean ? (mobile ? 16 : 24) : (mobile ? 24 : 40);
      const edgeStarsPerSide = lean ? (mobile ? 8 : 12) : (mobile ? 12 : 20);
      stars = [];
      for (const side of [-1, 1]) {
        const count = starsPerSide + edgeStarsPerSide;
        for (let index = 0; index < count; index++) {
          const seed = index + (side === 1 ? 47 : 0);
          const nearEdge = index >= starsPerSide;
          // Shuffle emission times across angles so the entire fan has a soft edge.
          const emissionRank = (index * 17 + (side === 1 ? 11 : 0)) % count;
          const delay = emissionDuration * (1 - Math.sqrt(1 - (emissionRank + .5) / count));
          const fanPosition = ((nearEdge ? index - starsPerSide : index) + .5) / (nearEdge ? edgeStarsPerSide : starsPerSide);
          stars.push({
            side, inset: nearEdge ? 3 : -12, delay,
            lifetime: Math.min(1800 + variation(seed, 29) * 500, end - T.final.hit - delay),
            y: height * (.74 + variation(seed, 43) * .24),
            travel: width * (nearEdge ? .002 + fanPosition * .24 : .22 + fanPosition * .26),
            launchSpeed: height * (.8 + variation(seed, 53) * .5),
            size: (3 + variation(seed, 19) ** 1.7 * 12) * Math.min(1, width / 700),
            brightness: .2 + variation(seed, 71) * .8,
            rotation: variation(seed, 31) * 360,
            spin: (variation(seed, 67) - .5) * 220
          });
        }
      }
    }
    configure();

    function beginFrame() {
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#fff';
    }

    function draw(time) {
      if (finished) return;
      const hitAge = time - T.final.hit;
      if (!started) {
        // Use actual gameplay frame cadence as well as optional hardware hints.
        // Ignore one-off tab/loading stalls; choose once so stars never pop away.
        const elapsed = time - previousTime;
        if (elapsed > 0 && elapsed < 120) {
          frameAverage += (elapsed - frameAverage) * .1;
          frameSamples++;
        }
        previousTime = time;
        if (hitAge < 0) return;
        if (!lean && frameSamples >= 12 && frameAverage > 23) {
          lean = true;
          configure();
        }
        started = true;
      }
      if (time >= end) { dispose(); return; }
      // The owner clears once for both gameplay and stars before drawing either.
      if (!flashFinished) {
        const opacity = .22 * T.clamp(hitAge / 45) * (1 - T.ease((hitAge - 45) / 420));
        if (opacity > 0) {
          context.globalAlpha = opacity;
          context.fillRect(0, 0, width, height);
        }
        if (hitAge >= 465) flashFinished = true;
      }
      for (const star of stars) {
        const age = hitAge - star.delay;
        if (age < 0 || age >= star.lifetime) continue;
        const p = age / star.lifetime;
        const travel = p * (2 - p);
        const x = (star.side === -1 ? star.inset : width - star.inset) - star.side * star.travel * travel;
        const seconds = age / 1000;
        const y = star.y - star.launchSpeed * seconds + .5 * height * 1.15 * seconds * seconds;
        const size = star.size * (1 - .35 * p);
        // Skip offscreen sprites, including stars that have already fallen out.
        if (x + size < 0 || x - size > width || y + size < 0 || y - size > height) continue;
        const opacity = star.brightness * T.clamp(age / 55) * (1 - T.clamp((p - .72) / .28));
        if (opacity <= 0) continue;
        const angle = ((star.rotation + star.spin * p) % 72 + 72) % 72;
        const frame = Math.round(angle / 72 * rotationFrames) % rotationFrames;
        // Atlas padding needs the same scale as its 22px star radius.
        const extent = size * tile / 22;
        context.globalAlpha = opacity;
        context.drawImage(atlas, frame * tile, 0, tile, tile, x - extent / 2, y - extent / 2, extent, extent);
      }
    }

    function dispose() {
      if (finished) return;
      finished = true;
      canvas.remove();
      // Release backing stores promptly, including when playback is skipped.
      canvas.width = canvas.height = atlas.width = atlas.height = 0;
      stars.length = 0;
    }
    return { context, beginFrame, draw, dispose, end };
  }
  window.IntroStars = { create };
})();
