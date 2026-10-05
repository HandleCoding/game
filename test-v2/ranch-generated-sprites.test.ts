import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { visualSprite } from "../apps/web/src/games/animal-ranch/visual-sprites";
import { generatedAtlasMetadata } from "../apps/web/src/games/animal-ranch/generated-atlas-metadata";
import {
  spriteGroups,
  spriteLocation,
} from "../apps/web/src/games/animal-ranch/sprites";
const attrs = ["lightning", "fire", "water", "gold", "dream"];
test("All 36 species have independent juvenile/adult generated five-attribute walking art", () => {
  assert.equal(Object.keys(generatedAtlasMetadata).length, 40);
  let frames = 0;
  for (const group of spriteGroups)
    for (const species of group)
      for (const baby of [false, true])
        for (const attribute of attrs) {
          for (let col = 0; col < 4; col++) {
            const sprite = visualSprite(species, baby, [attribute], col);
            assert.equal(
              sprite.generated,
              true,
              `${species}/${baby}/${attribute}`,
            );
            assert.equal(sprite.primary, attribute);
            assert.ok(existsSync("apps/web/public" + sprite.url), sprite.url);
            const f = sprite.frame;
            assert.ok(f.x >= 0 && f.y >= 0 && f.width > 0 && f.height > 0);
            assert.ok(
              f.x + f.width <= sprite.meta.width &&
                f.y + f.height <= sprite.meta.height,
            );
            assert.ok(
              f.bodyWidth > 0 &&
                f.bodyWidth <= f.width &&
                f.bodyHeight > 0 &&
                f.bodyHeight <= f.height,
            );
            assert.ok(
              f.centerX > 0 &&
                f.centerX < f.width &&
                f.ground > 0 &&
                f.ground <= f.height,
            );
            frames++;
          }
        }
  assert.equal(frames, 1440);
});
test("Ordinary sprites retain original art; lop rabbit stage and dual-attribute identity are preserved", () => {
  for (const group of spriteGroups)
    for (const species of group)
      for (const baby of [false, true]) {
        assert.equal(
          visualSprite(species, baby).url,
          spriteLocation(species, baby).url,
        );
        assert.equal(visualSprite(species, baby).generated, false);
      }
  for (const baby of [false, true]) {
    const s = visualSprite("rabbit", baby, ["water"]);
    assert.equal(
      s.meta,
      generatedAtlasMetadata[`${baby ? "baby" : "adult"}-water-0-v1`],
    );
    assert.equal(s.frame, s.meta.rows[1].frames[0]);
  }
  const attributes = ["fire", "water"];
  const duo = visualSprite("chicken", false, attributes);
  assert.equal(duo.primary, "fire");
  assert.deepEqual(attributes, ["fire", "water"]);
});
