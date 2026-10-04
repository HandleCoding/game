import { defineAsyncComponent } from "vue";
export const gameViews: Record<
  string,
  ReturnType<typeof defineAsyncComponent>
> = {
  "guess-number": defineAsyncComponent(
    () => import("./guess-number/GuessNumber.vue"),
  ),
};

export const persistentViews: Record<
  string,
  ReturnType<typeof defineAsyncComponent>
> = {
  "animal-ranch": defineAsyncComponent(
    () => import("./animal-ranch/RanchGame.vue"),
  ),
};
