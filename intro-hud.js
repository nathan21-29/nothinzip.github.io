/* WhiteCat gameplay HUD, driven by the same clock as the intro's hit objects. */
(() => {
  'use strict';
  const skin = 'assets/whitecat/';
  window.IntroHUD = {
    create(host, timeline, width, height) {
      const hud = document.createElement('div');
      hud.className = 'intro-hud';
      hud.setAttribute('aria-hidden', 'true');
      const scale = Math.min(1.35, height / 768, width / 800);
      hud.style.setProperty('--hud-scale', scale);
      host.append(hud);
      const element = (tag, className, parent) => {
        const node = document.createElement(tag);
        node.className = className;
        parent.append(node);
        return node;
      };
      const sprite = (file, className, parent) => {
        const image = element('img', className, parent);
        image.src = `${skin}${file}@2x.png`;
        image.alt = '';
        image.draggable = false;
        return image;
      };
      const boards = [];
      const styles = new WeakMap();
      const style = (node, name, value) => {
        const previous = styles.get(node) ?? {};
        if (previous[name] === value) return;
        previous[name] = value;
        styles.set(node, previous);
        if (name.startsWith('--')) node.style.setProperty(name, value);
        else node.style[name] = value;
      };
      const board = (name, delay, edge) => {
        const node = element('div', `intro-hud-board intro-hud-${name}`, hud);
        const content = element('div', 'intro-hud-content', node);
        boards.push({ node, delay, edge });
        return content;
      };
      const number = (parent, length, className) => {
        const row = element('div', `intro-hud-number ${className}`, parent);
        // One decoded texture for every score/combo glyph; changing a digit never
        // changes an image URL or introduces a first-use decode during a hit.
        const digits = Array.from({ length }, () => element('span', 'intro-hud-digit', row));
        let previous;
        return value => {
          if (value === previous) return;
          const before = previous;
          previous = value;
          row.setAttribute('data-value', value);
          for (let index = 0; index < digits.length; index++) {
            const char = value[index];
            if (before !== undefined && char === before[index]) continue;
            digits[index].style.display = char === undefined ? 'none' : '';
            if (char !== undefined) {
              const glyph = char === '.' ? 10 : char === '%' ? 11 : char === 'x' ? 12 : Number(char);
              digits[index].style.backgroundPosition = `${-30 * glyph}px 0`;
              digits[index].style.width = char === '.' ? '20px' : '30px';
            }
          }
        };
      };

      const score = board('score', 35, 'top');
      const setScore = number(score, 8, 'intro-hud-score-value');
      const statistics = element('div', 'intro-hud-statistics', score);
      const setAccuracy = number(statistics, 7, 'intro-hud-accuracy');
      const svgNS = 'http://www.w3.org/2000/svg';
      const progress = document.createElementNS(svgNS, 'svg');
      progress.setAttribute('class', 'intro-hud-progress');
      progress.setAttribute('viewBox', '0 0 36 36');
      statistics.append(progress);
      const circle = (className, attributes) => {
        const node = document.createElementNS(svgNS, 'circle');
        node.setAttribute('class', className);
        for (const [key, value] of Object.entries({ cx: 18, cy: 18, r: 14, ...attributes })) node.setAttribute(key, value);
        progress.append(node);
        return node;
      };
      circle('intro-hud-progress-track', {});
      const progressFill = document.createElementNS(svgNS, 'path');
      progressFill.setAttribute('class', 'intro-hud-progress-fill');
      progress.append(progressFill);
      const combo = board('combo', 65, 'bottom');
      const setCombo = number(combo, 4, 'intro-hud-combo-value');
      const keys = board('keys', 90, 'right');
      sprite('inputoverlay-background', 'intro-hud-keys-bg', keys);
      const keyRows = ['K1', 'K2', 'M1', 'M2'].map((label, index) => {
        const row = element('div', 'intro-hud-key', keys);
        row.style.top = `${index * 45}px`;
        sprite('inputoverlay-key', 'intro-hud-key-sprite', row);
        element('span', 'intro-hud-key-tint', row);
        const labelNode = element('span', 'intro-hud-key-label', row);
        labelNode.textContent = label;
        const count = element('span', 'intro-hud-key-count', row);
        count.textContent = '0';
        return { row, count, presses: 0, down: null };
      });
      const events = [
        ...timeline.circles.map((point, index) => ({ time: point.hit, score: [300, 624, 972][index], key: index % 2 })),
        { time: timeline.slider.start, score: 1002, key: 1 },
        { time: (timeline.slider.start + timeline.slider.end) / 2, score: 1012 },
        { time: timeline.slider.end, score: 1042 },
        { time: timeline.final.hit, score: 1558, key: 0 }
      ];
      setAccuracy('100.00%');
      let finished = false;
      let previousProgress;
      const dispose = () => { finished = true; hud.remove(); };
      return {
        dispose,
        draw(time) {
          if (finished) return;
          let hitCount = 0;
          while (hitCount < events.length && events[hitCount].time <= time) hitCount++;
          const last = events[hitCount - 1];
          const age = last ? time - last.time : Infinity;
          const hitPulse = 1 - timeline.clamp(age / 170);
          const lastScore = events[hitCount - 2]?.score ?? 0;
          const animatedScore = Math.round(timeline.mix(lastScore, last?.score ?? 0, timeline.ease(age / 100)));
          setScore(String(animatedScore).padStart(8, '0'));
          setCombo(`${hitCount}x`);
          style(combo, '--hud-combo-pulse', 1 + .12 * hitPulse);
          const songProgress = timeline.clamp(time / timeline.final.hit);
          const angle = Math.PI * 2 * songProgress;
          if (songProgress !== previousProgress) progressFill.setAttribute('d', songProgress === 1
            ? 'M32 18 A14 14 0 1 1 4 18 A14 14 0 1 1 32 18 Z'
            : `M18 18 L32 18 A14 14 0 ${songProgress > .5 ? 1 : 0} 1 ${18 + 14 * Math.cos(angle)} ${18 + 14 * Math.sin(angle)} Z`);
          previousProgress = songProgress;
          keyRows.forEach((key, index) => {
            const { row, count } = key;
            let presses = 0, lastPress;
            for (let hit = 0; hit < hitCount; hit++) {
              if (events[hit].key !== index) continue;
              presses++;
              lastPress = events[hit];
            }
            if (key.presses !== presses) count.textContent = String(presses);
            key.presses = presses;
            const held = index === 1 && time >= timeline.slider.start && time < timeline.slider.end;
            const down = held || !!lastPress && time - lastPress.time < 95;
            if (key.down !== down) {
              row.setAttribute('data-down', down ? 'true' : 'false');
              style(row, 'transform', `scale(${down ? .94 : 1})`);
              key.down = down;
            }
          });
          for (const { node, delay, edge } of boards) {
            const fall = timeline.clamp((time - timeline.final.hit - delay) / 480);
            // The screen edge is the fixed hinge; the free edge swings backward toward it.
            const angle = 104 * fall ** 1.6;
            const rotation = edge === 'right' ? `rotateY(${-angle}deg)` : `rotateX(${edge === 'top' ? -angle : angle}deg)`;
            style(node, 'transform', `perspective(700px) ${rotation}`);
            style(node, 'opacity', String(timeline.clamp(time / 180) * (1 - timeline.clamp((fall - .65) / .35))));
          }
          if (time >= timeline.final.hit + 570) dispose();
        }
      };
    }
  };
})();
