import test from "node:test";
import assert from "node:assert/strict";
import {
  Duel,
  hits,
  validNumber,
} from "../apps/api/src/games/guess-number/engine.js";

function setup(rolls = [6, 1]) {
  let time = 100000;
  let index = 0;
  const room = new Duel(
    "123456",
    "a",
    30,
    () => time,
    () => rolls[index++],
  );
  room.join("b");
  room.prepare("a", true);
  room.prepare("b", true);
  room.secret("a", "1234");
  room.secret("b", "9999");
  return {
    room,
    advance: (ms) => {
      time += ms;
    },
  };
}
test("exact positions only, repeated digits and numeric bounds", () => {
  assert.equal(hits("1234", "3333"), 1);
  assert.equal(hits("1234", "4321"), 0);
  assert.equal(hits("1111", "1111"), 4);
  for (const s of ["0000", "0001", "0123", "0999", "1000", "9999", "3333"])
    assert.equal(validNumber(s), true);
  for (const s of ["10000", "123", "1e03", "１２３４", 1234, " 1234"])
    assert.equal(validNumber(s), false);
});
test("two ready players required and immutable secret; third player rejected", () => {
  const r = new Duel("654321", "a");
  r.prepare("a", true);
  assert.equal(r.phase, "waiting");
  r.join("b");
  assert.throws(() => r.join("c"));
  assert.throws(() => r.secret("a", "1234"));
  r.prepare("b", true);
  assert.equal(r.phase, "secrets");
  r.secret("a", "1234");
  assert.throws(() => r.secret("a", "9999"));
  assert.equal(r.phase, "secrets");
  const view = r.view(
    "b",
    (x) => x,
    () => true,
  );
  assert.equal(view.ownSecret, null);
  assert.equal(view.revealed, undefined);
  assert.equal(JSON.stringify(view).includes("1234"), false);
});
test("dice tie retries both rolls, then high roll starts", () => {
  const { room: r } = setup([3, 3, 2, 5]);
  r.throwDice("a");
  assert.throws(() => r.throwDice("a"));
  r.throwDice("b");
  assert.equal(r.phase, "dice");
  assert.equal(r.diceRound, 2);
  assert.deepEqual(r.dice, {});
  r.throwDice("a");
  r.throwDice("b");
  assert.equal(r.turn, "b");
  assert.equal(r.phase, "playing");
});
test("turn enforcement, valid guesses and complete victory", () => {
  const { room: r } = setup();
  r.throwDice("a");
  r.throwDice("b");
  assert.throws(() => r.guess("b", "1234"));
  assert.throws(() => r.guess("a", "123"));
  r.guess("a", "3333");
  assert.equal(r.history[0].hits, 0);
  assert.equal(r.turn, "b");
  r.guess("b", "3333");
  assert.equal(r.history[1].hits, 1);
  r.guess("a", "9999");
  assert.equal(r.winner, "a");
  assert.equal(r.phase, "finished");
  assert.throws(() => r.guess("a", "9999"));
  assert.deepEqual(
    r.view(
      "b",
      (x) => x,
      () => true,
    ).revealed,
    { a: "1234", b: "9999" },
  );
});
test("late guess cannot win; timeout consumes one turn", () => {
  const { room: r, advance } = setup();
  r.throwDice("a");
  r.throwDice("b");
  advance(30000);
  assert.throws(() => r.guess("a", "9999"));
  assert.equal(r.turn, "b");
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].timeout, true);
  assert.equal(r.expire(), false);
});
test("disconnect pauses, reconnect preserves remaining time, 60s grace ends game", () => {
  const { room: r, advance } = setup();
  r.throwDice("a");
  r.throwDice("b");
  advance(10000);
  r.disconnect("b");
  advance(15000);
  assert.equal(r.expire(), false);
  assert.throws(() => r.guess("a", "9999"));
  r.reconnect("b");
  assert.equal(r.deadline - r.now(), 20000);
  r.disconnect("b");
  advance(60000);
  r.tick();
  assert.equal(r.winner, "a");
  assert.equal(r.reason, "disconnect");
});
test("both offline draw, settings reset readiness, rematch resets secrets and dice", () => {
  const { room: r, advance } = setup();
  r.throwDice("a");
  r.throwDice("b");
  r.disconnect("a");
  r.disconnect("b");
  advance(60000);
  r.tick();
  assert.equal(r.winner, null);
  r.reset();
  assert.deepEqual(r.secrets, {});
  assert.deepEqual(r.dice, {});
  assert.equal(r.lastTie, null);
  r.prepare("a", true);
  r.configure("a", 60);
  assert.deepEqual(r.ready, {});
  assert.throws(() => r.configure("b", 30));
});

test("memory mode hides history and exposes only latest opponent guess, while giving current feedback", () => {
  const { room: r } = setup();
  r.disableHistory = true;
  r.throwDice("a");
  r.throwDice("b");
  assert.equal(r.guess("a", "3333"), 0);
  assert.equal(r.guess("b", "3333"), 1);
  for (const id of ["a", "b"]) {
    const view = r.view(
      id,
      (x) => x,
      () => true,
    );
    assert.deepEqual(view.history, []);
    assert.equal(view.turnCount, 2);
    assert.equal(view.disableHistory, true);
    assert.equal(view.lastOpponentGuess.value, "3333");
    assert.equal(view.lastOpponentGuess.hits, id === "a" ? 1 : 0);
  }
  r.guess("a", "9999");
  for (const id of ["a", "b"])
    assert.deepEqual(
      r.view(
        id,
        (x) => x,
        () => true,
      ).history,
      r.history,
    );
  r.reset();
  assert.equal(r.disableHistory, true);
  assert.equal(r.startedAt, null);
  r.configure("a", 30, false);
  assert.equal(r.disableHistory, false);
  assert.throws(() => r.configure("a", 30, "true"));
});

test("zero-prefixed secrets and memory mode expose only latest opponent guess", () => {
  const r = new Duel(
    "654321",
    "a",
    30,
    () => 100000,
    (() => {
      let i = 0;
      return () => [6, 1][i++];
    })(),
  );
  r.disableHistory = true;
  r.join("b");
  r.prepare("a", true);
  r.prepare("b", true);
  r.secret("a", "0000");
  r.secret("b", "0123");
  r.throwDice("a");
  r.throwDice("b");
  assert.equal(
    r.view(
      "a",
      (x) => x,
      () => true,
    ).ownSecret,
    "0000",
  );
  assert.equal(
    r.view(
      "a",
      (x) => x,
      () => true,
    ).lastOpponentGuess,
    null,
  );
  r.guess("a", "0111");
  r.guess("b", "1000");
  assert.equal(
    r.view(
      "a",
      (x) => x,
      () => true,
    ).lastOpponentGuess.hits,
    3,
  );
  r.guess("a", "0222");
  r.guess("b", "2000");
  const a = r.view(
      "a",
      (x) => x,
      () => true,
    ),
    b = r.view(
      "b",
      (x) => x,
      () => true,
    );
  assert.deepEqual(a.history, []);
  assert.equal(a.lastOpponentGuess.value, "2000");
  assert.notEqual(a.lastOpponentGuess.value, "1000");
  assert.deepEqual(b.history, []);
  assert.equal(b.lastOpponentGuess.value, "0222");
  assert.notEqual(b.lastOpponentGuess.value, "0111");
  r.guess("a", "0123");
  assert.equal(r.winner, "a");
  assert.equal(
    r.view(
      "a",
      (x) => x,
      () => true,
    ).revealed.b,
    "0123",
  );
  r.reset();
  assert.equal(
    r.view(
      "a",
      (x) => x,
      () => true,
    ).lastOpponentGuess,
    null,
  );
});

test("finished games reveal full review to both players in either mode and clear it on rematch", () => {
  for (const disableHistory of [false, true])
    for (const reason of ["guessed", "left", "disconnect"]) {
      const { room: r, advance } = setup();
      r.disableHistory = disableHistory;
      r.throwDice("a");
      r.throwDice("b");
      r.guess("a", "3333");
      r.guess("b", "3333");
      advance(30000);
      r.expire();
      r.guess("b", "0000");
      for (const id of ["a", "b"])
        assert.equal(
          r.view(
            id,
            (x) => x,
            () => true,
          ).history.length,
          disableHistory ? 0 : 4,
        );
      if (reason === "guessed") r.guess("a", "9999");
      else if (reason === "disconnect") {
        r.disconnect("b");
        advance(60000);
        r.tick();
      } else r.finish("a", "left");
      assert.equal(r.phase, "finished");
      assert.equal(r.reason, reason);
      for (const id of ["a", "b"]) {
        const view = r.view(
          id,
          (x) => x,
          () => true,
        );
        assert.deepEqual(view.history, r.history);
        assert.equal(view.history[0].value, "3333");
        assert.equal(view.history[0].hits, 0);
        assert.equal(view.history[1].player, "b");
        assert.equal(view.history[1].hits, 1);
        assert.equal(view.history[2].timeout, true);
        assert.equal(view.history[3].value, "0000");
        if (reason === "guessed") assert.equal(view.history.at(-1).hits, 4);
      }
      r.reset();
      for (const id of ["a", "b"]) {
        const view = r.view(
          id,
          (x) => x,
          () => true,
        );
        assert.deepEqual(view.history, []);
        assert.equal(view.lastOpponentGuess, null);
        assert.equal(view.revealed, undefined);
      }
    }
});
