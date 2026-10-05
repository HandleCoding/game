import type { RanchSpecies } from "../../../../../packages/contracts/src/ranch";
import { spriteLocation, spriteGroups } from "./sprites";
import { softAtlasMetadata } from "./soft-atlas-metadata";
import { generatedAtlasMetadata } from "./generated-atlas-metadata";

export interface GeneratedFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  bodyWidth: number;
  bodyHeight: number;
  centerX: number;
  ground: number;
}
export interface GeneratedAtlas {
  url: string;
  width: number;
  height: number;
  rows: { frames: GeneratedFrame[] }[];
}
/** First saved attribute supplies generated body art. A second remains independently visible. */
export function visualSprite(
  species: RanchSpecies,
  baby = false,
  attributes: readonly string[] = [],
  col = 0,
) {
  const group = spriteGroups.findIndex((list) => list.includes(species));
  const primary = attributes.find(
    (a) =>
      generatedAtlasMetadata[`${baby ? "baby" : "adult"}-${a}-${group}-v1`],
  );
  const generated = primary
    ? generatedAtlasMetadata[
        `${baby ? "baby" : "adult"}-${primary}-${group}-v1`
      ]
    : undefined;
  if (generated) {
    const frame =
      generated.rows[spriteGroups[group].indexOf(species)]!.frames[col]!;
    return {
      url: generated.url,
      meta: generated,
      frame,
      generated: true,
      primary,
    };
  }
  const location = spriteLocation(species, baby);
  const meta = softAtlasMetadata[location.group],
    row = meta.rows[location.row];
  const frame: GeneratedFrame = {
    x: (col * meta.width) / 4 + row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    bodyWidth: row.width,
    bodyHeight: row.height,
    centerX: row.width / 2,
    ground: row.ground[col] - row.y,
  };
  return {
    url: location.url,
    meta,
    frame,
    generated: false,
    primary: undefined,
  };
}
