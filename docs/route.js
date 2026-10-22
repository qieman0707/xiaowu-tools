// 路线图：量出每个印章的中心，用弯路连起来；走过的路描成朱砂色，正在赶路的地方有一盏灯在走。
// 站点怎么摆归 CSS 管（宽屏横着错落、窄屏竖着错落），这里只负责照着站点画路。

const reduce = matchMedia('(prefers-reduced-motion: reduce)');

export function makeRoute(map) {
  const svg = map.querySelector('.road');
  const base = svg.querySelector('.road-base');
  const done = svg.querySelector('.road-done');
  const rider = svg.querySelector('.rider');
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  probe.setAttribute('fill', 'none');
  svg.append(probe);
  const seals = [...map.querySelectorAll('.seal')];
  let at = [0];
  let reached = -1;
  let heading = -1;
  let frame = 0;

  function draw() {
    const box = map.getBoundingClientRect();
    if (!box.width) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const pts = seals.map((s) => {
      const r = s.getBoundingClientRect();
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
    });
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    at = [0];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      // 横着走就横向 S 弯，竖着走就竖向 S 弯
      d += Math.abs(x1 - x0) > Math.abs(y1 - y0)
        ? ` C ${(x0 + x1) / 2} ${y0}, ${(x0 + x1) / 2} ${y1}, ${x1} ${y1}`
        : ` C ${x0} ${(y0 + y1) / 2}, ${x1} ${(y0 + y1) / 2}, ${x1} ${y1}`;
      probe.setAttribute('d', d);
      at.push(probe.getTotalLength());
    }
    base.setAttribute('d', d);
    done.setAttribute('d', d);
    const total = at[at.length - 1];
    done.style.transition = 'none';
    done.style.strokeDasharray = `${total} ${total}`;
    paint();
    done.getBoundingClientRect();
    done.style.transition = '';
  }

  function paint() {
    const total = at[at.length - 1];
    done.style.strokeDashoffset = total - (reached < 0 ? 0 : at[reached]);
  }

  function stopTravel() {
    cancelAnimationFrame(frame);
    map.classList.remove('running');
    heading = -1;
  }

  new ResizeObserver(draw).observe(map);

  return {
    reset() { stopTravel(); reached = -1; paint(); },
    // 盖到第 i 站
    reach(i) { reached = Math.max(reached, i); if (heading <= i) stopTravel(); paint(); },
    // 灯往第 i 站走：越走越慢，永远差一点，等结果回来再盖章
    go(i) {
      stopTravel();
      heading = i;
      map.classList.add('running');
      const t0 = performance.now();
      const tick = (t) => {
        // 刚切到这个 tab、路还没量出来时先等一帧
        if (!base.getAttribute('d')) { frame = requestAnimationFrame(tick); return; }
        const a = at[i - 1] ?? 0;
        const b = at[i] ?? a;
        const k = reduce.matches ? 0.5 : Math.min(0.9, 1 - Math.exp(-(t - t0) / 12000));
        const p = base.getPointAtLength(a + (b - a) * k);
        rider.setAttribute('cx', p.x);
        rider.setAttribute('cy', p.y);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    },
    idle: stopTravel,
  };
}
