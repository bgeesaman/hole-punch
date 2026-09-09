// One-time "how to play" card, shown before the first level's Ready / Go while the player has
// no progress yet. Play (or a click anywhere on the backdrop) captures the mouse and starts.
export function createHowto({ onPlay }) {
  const el = document.createElement('div');
  el.id = 'howto';
  el.className = 'overlay panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="card howto-card">
      <h1>How to play</h1>
      <p class="subtitle">You are a hole in a paper board.</p>
      <ul class="howto-list">
        <li><b>Move the mouse</b> to steer the hole. Anything that fits falls in.</li>
        <li><b>Collect all the paper fruit</b> before the clock runs out. Bigger fruit and crates
          are worth more and need a bigger hole.</li>
        <li><b>The hole grows</b> as you score. The green arc on the lip shows progress to the
          next size.</li>
        <li><b>Avoid the bombs.</b> Swallowing one shrinks the hole for a while; the red arc
          counts it down.</li>
        <li><b>Mind the edge.</b> Fruit knocked off the board is lost. Clear the board with
          nothing lost for a perfect bonus, and time left on the clock pays too.</li>
        <li><b>Click or press Escape</b> to release the mouse and pause.</li>
      </ul>
      <div class="buttons"><button id="howto-play">Let's go</button></div>
    </div>`;
  document.body.appendChild(el);
  const play = () => { el.hidden = true; onPlay(); };
  el.querySelector('#howto-play').addEventListener('click', (e) => { e.stopPropagation(); play(); });
  el.addEventListener('click', (e) => { if (e.target === el) play(); });
  return { show() { el.hidden = false; }, hide() { el.hidden = true; }, get open() { return !el.hidden; }, el };
}
