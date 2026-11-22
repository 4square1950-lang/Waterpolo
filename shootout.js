(function (root, factory) {
  const rules = factory();
  if (typeof module === 'object') module.exports = rules;
  else root.Shootout = rules;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const SHOTS = Object.freeze(['skip', 'lob', 'power']);
  const ATTEMPTS_PER_PLAYER = 5;
  const validShot = (shot, aim) => SHOTS.includes(shot) && Number.isInteger(aim) && aim >= -1 && aim <= 1;

  function start(players, seed = Math.floor(Math.random() * 2147483647)) {
    return { players, seed, scores: [0, 0], turn: 0, attempts: [], lastShot: null, complete: false, winner: null };
  }

  function number(seed, turn, salt) {
    let x = (seed ^ Math.imul(turn + 1, 0x9e3779b1) ^ salt) | 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    return (x >>> 0) / 4294967296;
  }

  function keeperLane(game) {
    return Math.floor(number(game.seed, game.turn, 1337) * 3) - 1;
  }

  function shoot(game, seat, shot, aim) {
    if (game.complete || seat !== game.turn % 2 || !validShot(shot, aim)) return null;
    const keeper = keeperLane(game);
    const reaction = number(game.seed, game.turn, 487);
    const timing = number(game.seed, game.turn, 769);
    const dive = reaction < .24 ? keeper - Math.sign(keeper - aim) : keeper;
    const onTarget = timing >= (shot === 'power' ? .12 : shot === 'lob' ? .07 : .05);
    const distance = Math.abs(aim - dive);
    const saved = distance === 0 && (shot !== 'lob' || timing < .72);
    const result = !onTarget ? 'miss' : saved ? 'saved' : 'goal';
    const scores = [...game.scores];
    if (result === 'goal') scores[seat]++;
    const turn = game.turn + 1;
    const complete = turn === ATTEMPTS_PER_PLAYER * 2;
    const winner = complete && scores[0] !== scores[1] ? (scores[0] > scores[1] ? 0 : 1) : null;
    const lastShot = { seat, shot, aim, dive, result, turn };
    return { ...game, scores, turn, complete, winner, lastShot, attempts: [...game.attempts, lastShot] };
  }
  return { ATTEMPTS_PER_PLAYER, start, shoot, keeperLane, validShot };
});
